import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, hasDatabase, type Db } from "./harness";

/**
 * Cenário: Eduardo (validador) cria o workspace e convida o estagiário.
 * Uma terceira pessoa (outsider) tem conta mas não participa do workspace.
 */
describe.skipIf(!hasDatabase)("banco: segurança, tarefas e automações", () => {
  let db: Db;
  let owner: string;
  let intern: string;
  let outsider: string;
  let ws: string;

  const task = async (user: string, fields: Record<string, unknown>) => {
    const cols = Object.keys(fields);
    const rows = await db.as<{ id: string; version: number }>(
      user,
      `insert into public.tasks (workspace_id, ${cols.join(", ")})
       values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) returning id, version`,
      [ws, ...Object.values(fields)],
    );
    return rows[0];
  };

  beforeAll(async () => {
    db = await createTestDb();
    owner = await db.createUser("owner@example.test", "Pessoa Gestora");
    outsider = await db.createUser("outsider@example.test");
    const [{ create_workspace }] = await db.as<{ create_workspace: string }>(
      owner,
      "select public.create_workspace('Custos', 'America/Sao_Paulo')",
    );
    ws = create_workspace;
    await db.as(owner, "insert into public.workspace_invitations (workspace_id, email, invited_by) values ($1, $2, $3)", [
      ws,
      "intern@example.test",
      owner,
    ]);
    // Cadastro via convite → trigger aceita automaticamente
    intern = await db.createUser("intern@example.test", "Pessoa Estagiária");
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  describe("autenticação e isolamento", () => {
    it("convite aceito no cadastro torna o usuário membro, sem permissão de validação", async () => {
      const members = await db.as(intern, "select user_id from public.workspace_members where workspace_id = $1", [ws]);
      expect(members).toHaveLength(2);
      const perms = await db.as(intern, "select permission from public.workspace_member_permissions where user_id = $1", [
        intern,
      ]);
      expect(perms).toEqual([]);
    });

    it("anon não lê nada", async () => {
      await expect(db.as(null, "select * from public.tasks")).rejects.toThrow(/permission denied/);
    });

    it("usuário de fora não vê nem escreve no workspace", async () => {
      await task(owner, { title: "Fechamento PDCA" });
      expect(await db.as(outsider, "select * from public.tasks")).toEqual([]);
      expect(await db.as(outsider, "select * from public.workspaces")).toEqual([]);
      await expect(
        db.as(outsider, "insert into public.tasks (workspace_id, title) values ($1, 'x')", [ws]),
      ).rejects.toThrow(/row-level security/);
    });

    it("perfis só são visíveis entre colegas de workspace", async () => {
      const seenByIntern = await db.as<{ id: string }>(intern, "select id from public.profiles");
      expect(seenByIntern.map((r) => r.id).sort()).toEqual([owner, intern].sort());
      const seenByOutsider = await db.as<{ id: string }>(outsider, "select id from public.profiles");
      expect(seenByOutsider.map((r) => r.id)).toEqual([outsider]);
    });

    it("membro sem permissão não convida nem altera permissões", async () => {
      await expect(
        db.as(intern, "insert into public.workspace_invitations (workspace_id, email, invited_by) values ($1, 'x@y.test', $2)", [
          ws,
          intern,
        ]),
      ).rejects.toThrow(/row-level security/);
      await expect(
        db.as(intern, "insert into public.workspace_member_permissions (workspace_id, user_id, permission) values ($1, $2, 'impacts.validate')", [
          ws,
          intern,
        ]),
      ).rejects.toThrow(/row-level security/);
    });

    it("não é possível remover o último administrador de membros", async () => {
      await expect(
        db.as(owner, "delete from public.workspace_member_permissions where user_id = $1 and permission = 'members.manage'", [
          owner,
        ]),
      ).rejects.toThrow(/ao menos um administrador/);
    });
  });

  describe("tarefas", () => {
    it("ambos criam, editam e atribuem; concorrência otimista via version", async () => {
      const t = await task(intern, { title: "Atualizar indicadores", assignee_id: owner, priority: "high" });
      expect(t.version).toBe(1);
      const updated = await db.as<{ version: number }>(
        owner,
        "update public.tasks set status = 'in_progress' where id = $1 and version = $2 returning version",
        [t.id, 1],
      );
      expect(updated[0].version).toBe(2);
      // Atualização com versão antiga não afeta linhas (conflito detectável)
      const stale = await db.as(intern, "update public.tasks set title = 'x' where id = $1 and version = 1 returning id", [t.id]);
      expect(stale).toHaveLength(0);
    });

    it("não permite atribuir tarefa a quem não é membro", async () => {
      await expect(task(owner, { title: "Inválida", assignee_id: outsider })).rejects.toThrow(/foreign key/);
    });

    it("conclusão registra data e autor; reabrir limpa", async () => {
      const t = await task(owner, { title: "Concluir" });
      const [done] = await db.as<{ completed_at: string | null; completed_by: string }>(
        intern,
        "update public.tasks set status = 'done' where id = $1 returning completed_at, completed_by",
        [t.id],
      );
      expect(done.completed_at).not.toBeNull();
      expect(done.completed_by).toBe(intern);
      const [reopened] = await db.as<{ completed_at: string | null }>(
        owner,
        "update public.tasks set status = 'todo' where id = $1 returning completed_at",
        [t.id],
      );
      expect(reopened.completed_at).toBeNull();
    });

    it("não há exclusão física de tarefas (somente arquivamento)", async () => {
      const t = await task(owner, { title: "Não apagar" });
      const deleted = await db.as(owner, "delete from public.tasks where id = $1 returning id", [t.id]);
      expect(deleted).toHaveLength(0);
    });

    it("histórico registra criação e diff das alterações", async () => {
      const t = await task(owner, { title: "Com histórico" });
      await db.as(intern, "update public.tasks set priority = 'urgent' where id = $1", [t.id]);
      const logs = await db.as<{ action: string; actor_id: string; changes: Record<string, unknown> | null }>(
        owner,
        "select action, actor_id, changes from public.activity_logs where entity_id = $1 order by id",
        [t.id],
      );
      expect(logs.map((l) => l.action)).toEqual(["created", "updated"]);
      expect(logs[1].actor_id).toBe(intern);
      expect(logs[1].changes).toEqual({ priority: { from: "medium", to: "urgent" } });
    });
  });

  describe("subtarefas e hierarquia", () => {
    it("bloqueia ciclos e herda o projeto do pai", async () => {
      const [project] = await db.as<{ id: string }>(
        owner,
        "insert into public.projects (workspace_id, name) values ($1, 'Dashboard PDCA') returning id",
        [ws],
      );
      const a = await task(owner, { title: "A", project_id: project.id });
      const b = await task(owner, { title: "B", parent_task_id: a.id });
      const c = await task(owner, { title: "C", parent_task_id: b.id });

      const [child] = await db.as<{ project_id: string }>(owner, "select project_id from public.tasks where id = $1", [c.id]);
      expect(child.project_id).toBe(project.id);

      await expect(
        db.as(owner, "update public.tasks set parent_task_id = $1 where id = $2", [c.id, a.id]),
      ).rejects.toThrow(/hierarquia circular/);
      await expect(
        db.as(owner, "update public.tasks set parent_task_id = $1 where id = $1", [a.id]),
      ).rejects.toThrow(/hierarquia circular/);

      // Mudar o projeto do pai propaga para toda a subárvore
      await db.as(owner, "update public.tasks set project_id = null where id = $1", [a.id]);
      const [after] = await db.as<{ project_id: string | null }>(owner, "select project_id from public.tasks where id = $1", [c.id]);
      expect(after.project_id).toBeNull();
    });

    it("arquivar o pai arquiva a subárvore; restaurar devolve só o que foi arquivado junto", async () => {
      const p = await task(owner, { title: "Pai" });
      const s1 = await task(owner, { title: "S1", parent_task_id: p.id });
      const s2 = await task(owner, { title: "S2", parent_task_id: p.id });
      await db.as(owner, "update public.tasks set archived_at = now() - interval '1 day' where id = $1", [s2.id]);
      await db.as(owner, "update public.tasks set archived_at = now() where id = $1", [p.id]);
      let rows = await db.as<{ id: string; archived_at: string | null }>(
        owner,
        "select id, archived_at from public.tasks where id = any($1)",
        [[s1.id, s2.id]],
      );
      expect(rows.every((r) => r.archived_at)).toBe(true);
      await db.as(owner, "update public.tasks set archived_at = null where id = $1", [p.id]);
      rows = await db.as(owner, "select id, archived_at from public.tasks where id = any($1)", [[s1.id, s2.id]]);
      expect(rows.find((r) => r.id === s1.id)?.archived_at).toBeNull();
      expect(rows.find((r) => r.id === s2.id)?.archived_at).not.toBeNull();
    });

    it("limita a profundidade da árvore", async () => {
      let parent = await task(owner, { title: "L1" });
      for (let i = 2; i <= 8; i++) parent = await task(owner, { title: `L${i}`, parent_task_id: parent.id });
      await expect(task(owner, { title: "L9", parent_task_id: parent.id })).rejects.toThrow(/profundidade/);
    });
  });

  describe("notificações", () => {
    it("atribuição notifica o responsável, nunca o autor da ação", async () => {
      const t = await task(owner, { title: "Para estagiário", assignee_id: intern });
      const mine = await db.as<{ type: string }>(intern, "select type from public.notifications where entity_id = $1", [t.id]);
      expect(mine.map((n) => n.type)).toEqual(["task_assigned"]);
      const self = await task(owner, { title: "Para mim", assignee_id: owner });
      expect(await db.as(owner, "select * from public.notifications where entity_id = $1", [self.id])).toEqual([]);
    });

    it("usuário só altera read_at das próprias notificações", async () => {
      const [n] = await db.as<{ id: string }>(intern, "select id from public.notifications limit 1");
      await db.as(intern, "update public.notifications set read_at = now() where id = $1", [n.id]);
      await expect(db.as(intern, "update public.notifications set title = 'x' where id = $1", [n.id])).rejects.toThrow(
        /permission denied/,
      );
      expect(await db.as(owner, "update public.notifications set read_at = now() where id = $1 returning id", [n.id])).toEqual([]);
    });

    it("comentário notifica responsável e criador, exceto o autor", async () => {
      const t = await task(owner, { title: "Comentada", assignee_id: intern });
      await db.as(intern, "insert into public.comments (workspace_id, task_id, author_id, body) values ($1, $2, $3, 'feito')", [
        ws,
        t.id,
        intern,
      ]);
      const forOwner = await db.as<{ type: string }>(
        owner,
        "select type from public.notifications where entity_id = $1 and type = 'task_commented'",
        [t.id],
      );
      expect(forOwner).toHaveLength(1);
      const forIntern = await db.as(intern, "select type from public.notifications where entity_id = $1 and type = 'task_commented'", [
        t.id,
      ]);
      expect(forIntern).toHaveLength(0);
    });

    it("alertas de vencimento não duplicam em execuções repetidas", async () => {
      const t = await task(owner, { title: "Vence amanhã", assignee_id: intern, due_date: "2030-01-11" });
      const first = await db.admin<{ n: number }>("select public.generate_due_notifications('2030-01-10') as n");
      const second = await db.admin<{ n: number }>("select public.generate_due_notifications('2030-01-10') as n");
      expect(first[0].n).toBeGreaterThanOrEqual(1);
      expect(second[0].n).toBe(0);
      const overdue = await db.admin<{ n: number }>("select public.generate_due_notifications('2030-01-12') as n");
      expect(overdue[0].n).toBeGreaterThanOrEqual(1);
      const types = await db.as<{ type: string }>(intern, "select type from public.notifications where entity_id = $1 order by type", [
        t.id,
      ]);
      expect(types.map((x) => x.type)).toEqual(["task_assigned", "task_due_soon", "task_overdue"]);
    });

    it("usuários comuns não executam automações", async () => {
      await expect(db.as(owner, "select public.generate_recurring_tasks()")).rejects.toThrow(/permission denied/);
    });
  });

  describe("recorrências", () => {
    it("gera ocorrências mensais ancoradas no dia inicial, sem duplicar", async () => {
      // Regra criada "no passado" para permitir datas de teste determinísticas
      const [rec] = await db.as<{ id: string; next_occurrence_date: string }>(
        owner,
        `insert into public.task_recurrences (workspace_id, title, frequency, interval_unit, start_date, lead_days, assignee_id)
         values ($1, 'Fechamento mensal', 'monthly', 'month', '2031-01-31', 0, $2) returning id, next_occurrence_date`,
        [ws, intern],
      );
      await db.admin("update public.task_recurrences set created_at = '2031-01-01' where id = $1", [rec.id]);

      const r1 = await db.admin<{ n: number }>("select public.generate_recurring_tasks('2031-04-30') as n");
      const r2 = await db.admin<{ n: number }>("select public.generate_recurring_tasks('2031-04-30') as n");
      expect(r1[0].n).toBe(4); // inclui 30/04 (lead_days = 0)
      expect(r2[0].n).toBe(0);

      const dates = await db.as<{ d: string }>(
        owner,
        "select to_char(occurrence_date, 'YYYY-MM-DD') as d from public.tasks where recurrence_id = $1 order by 1",
        [rec.id],
      );
      expect(dates.map((x) => x.d)).toEqual(["2031-01-31", "2031-02-28", "2031-03-31", "2031-04-30"]);

      const [state] = await db.as<{ next: string }>(
        owner,
        "select to_char(next_occurrence_date, 'YYYY-MM-DD') as next from public.task_recurrences where id = $1",
        [rec.id],
      );
      expect(state.next).toBe("2031-05-31");

      const occurrences = await db.as<{ type: string; assignee_id: string }>(
        owner,
        "select type, assignee_id from public.tasks where recurrence_id = $1",
        [rec.id],
      );
      expect(occurrences.every((o) => o.type === "recurring" && o.assignee_id === intern)).toBe(true);
    });

    it("execução agendada registra sucesso em automation_runs", async () => {
      const [res] = await db.admin<{ r: Record<string, number> }>("select public.run_scheduled_jobs() as r");
      expect(res.r).toHaveProperty("recurring_tasks_created");
      const [run] = await db.admin<{ status: string }>("select status from public.automation_runs order by id desc limit 1");
      expect(run.status).toBe("succeeded");
    });
  });

  describe("ganhos do negócio", () => {
    const insertImpact = (user: string, extra: Record<string, unknown> = {}) =>
      db.as<{ id: string; status: string; version: number }>(
        user,
        `insert into public.business_impacts (workspace_id, title, category, unit, estimated_value, realized_value, periodicity, status)
         values ($1, $2, 'hours_saved', 'hours', 8, $3, 'monthly', 'approved') returning id, status, version`,
        [ws, extra.title ?? "Automação do relatório", extra.realized ?? 8],
      );

    it("novo registro sempre entra pendente (status informado é ignorado) e notifica o validador", async () => {
      const [imp] = await insertImpact(intern);
      expect(imp.status).toBe("pending");
      const notes = await db.as(owner, "select * from public.notifications where entity_id = $1 and type = 'impact_review_requested'", [
        imp.id,
      ]);
      expect(notes).toHaveLength(1);
    });

    it("sem permissão não valida; status não muda por UPDATE direto", async () => {
      const [imp] = await insertImpact(intern);
      await expect(db.as(intern, "select public.review_business_impact($1, 'approved')", [imp.id])).rejects.toThrow(
        /sem permissão/,
      );
      await expect(db.as(owner, "update public.business_impacts set status = 'approved' where id = $1", [imp.id])).rejects.toThrow(
        /fluxo de validação/,
      );
    });

    it("fluxo completo: ajustes → reenvio → aprovação → imutável → histórico", async () => {
      const [imp] = await insertImpact(intern);
      await expect(db.as(owner, "select public.review_business_impact($1, 'changes_requested')", [imp.id])).rejects.toThrow(
        /motivo/,
      );
      await db.as(owner, "select public.review_business_impact($1, 'changes_requested', 'Anexe a evidência')", [imp.id]);
      const [edited] = await db.as<{ status: string }>(
        intern,
        "update public.business_impacts set evidence = 'planilha comparativa' where id = $1 returning status",
        [imp.id],
      );
      expect(edited.status).toBe("pending");

      await db.as(owner, "select public.review_business_impact($1, 'approved', 'ok')", [imp.id]);
      await expect(db.as(intern, "update public.business_impacts set title = 'x' where id = $1", [imp.id])).rejects.toThrow(
        /aprovado não pode ser editado/,
      );

      const history = await db.as<{ decision: string }>(
        owner,
        "select decision from public.business_impact_reviews where impact_id = $1 order by created_at, decision",
        [imp.id],
      );
      expect(history.map((h) => h.decision)).toEqual(["changes_requested", "resubmitted", "approved"]);
      const notify = await db.as(intern, "select type from public.notifications where entity_id = $1 and type = 'impact_approved'", [
        imp.id,
      ]);
      expect(notify).toHaveLength(1);
    });

    it("rejeição exige motivo e autovalidação é marcada no histórico", async () => {
      const [own] = await insertImpact(owner, { title: "Ganho do próprio validador" });
      await db.as(owner, "select public.review_business_impact($1, 'approved')", [own.id]);
      const [rev] = await db.as<{ self_review: boolean }>(
        owner,
        "select self_review from public.business_impact_reviews where impact_id = $1",
        [own.id],
      );
      expect(rev.self_review).toBe(true);

      const [other] = await insertImpact(intern, { title: "Rejeitável" });
      await db.as(owner, "select public.review_business_impact($1, 'rejected', 'sem base de cálculo')", [other.id]);
      const [row] = await db.as<{ status: string; validator_id: string }>(
        owner,
        "select status, validator_id from public.business_impacts where id = $1",
        [other.id],
      );
      expect(row).toEqual({ status: "rejected", validator_id: owner });
    });

    it("aprovação exige valor realizado para ganhos quantitativos", async () => {
      const [imp] = await db.as<{ id: string }>(
        intern,
        `insert into public.business_impacts (workspace_id, title, category, unit, estimated_value)
         values ($1, 'Só estimativa', 'financial_savings', 'BRL', 1000) returning id`,
        [ws],
      );
      await expect(db.as(owner, "select public.review_business_impact($1, 'approved')", [imp.id])).rejects.toThrow(
        /valor realizado/,
      );
    });

    it("unidade e categoria precisam ser coerentes", async () => {
      await expect(
        db.as(intern, "insert into public.business_impacts (workspace_id, title, category, unit, realized_value) values ($1, 'x', 'qualitative_other', 'BRL', 10)", [
          ws,
        ]),
      ).rejects.toThrow(/check constraint/);
    });
  });

  describe("metas e anexos", () => {
    it("progresso de resultado reconhece meta de redução", async () => {
      const [r] = await db.as<{ p: string }>(owner, "select public.metric_progress('decrease', 20, 15, 10, null, null) as p");
      expect(Number(r.p)).toBeCloseTo(0.5);
    });

    it("indicador de redução com alvo maior que o inicial é rejeitado", async () => {
      const [goal] = await db.as<{ id: string }>(owner, "insert into public.goals (workspace_id, title) values ($1, 'Meta') returning id", [ws]);
      await expect(
        db.as(owner, "insert into public.goal_metrics (workspace_id, goal_id, name, direction, baseline_value, target_value) values ($1, $2, 'Horas', 'decrease', 10, 20)", [
          ws,
          goal.id,
        ]),
      ).rejects.toThrow(/check constraint/);
    });

    it("storage: só membros enviam arquivos para tarefas do workspace", async () => {
      const t = await task(owner, { title: "Com anexo" });
      const path = `${ws}/${t.id}/evidencia.pdf`;
      await db.as(intern, "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [path]);
      await expect(
        db.as(outsider, "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`${ws}/${t.id}/x.pdf`]),
      ).rejects.toThrow(/row-level security/);
      expect(await db.as(outsider, "select * from storage.objects")).toEqual([]);
    });
  });
});
