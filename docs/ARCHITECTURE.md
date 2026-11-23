# Safra ADM — Arquitetura, riscos e decisões

Documento vivo. Registra a revisão da especificação (Etapa A), as decisões
arquiteturais (ADRs) e as metodologias de cálculo que o código implementa.

---

## 1. Visão geral

```
Navegador (Next.js / React, Client Components)
   │  supabase-js (anon key + sessão do usuário)  ──► Realtime (postgres_changes, respeita RLS)
   ▼
Next.js 16 App Router na Vercel (Server Components, Server Actions, Route Handlers)
   │  @supabase/ssr — cliente com a sessão do usuário (cookies)
   │  service role SOMENTE em código server-only (convites, automações)
   ▼
Supabase: PostgreSQL + Auth + Storage (bucket privado) + pg_cron
   - RLS em todas as tabelas expostas
   - Triggers de integridade (ciclos, consistência de workspace, histórico)
   - RPCs security definer para operações privilegiadas (criar workspace, validar ganho)
```

Princípio: **o banco é a fronteira de segurança.** A interface esconde o que o
usuário não pode fazer, mas quem impede é a RLS + triggers + RPCs. Server
Actions validam entrada com Zod antes de chegar ao banco.

---

## 2. Revisão da especificação — riscos e inconsistências

| # | Tema | Risco / inconsistência | Tratamento |
|---|------|------------------------|------------|
| R1 | **Vercel Hobby** | O plano gratuito da Vercel é restrito a uso **não comercial**. Uma ferramenta interna de empresa é uso comercial pelos termos. | Desenvolvimento segue normalmente. **Decisão sua antes do deploy (Fase 6):** Vercel Pro (pago), outra hospedagem gratuita que permita uso comercial, ou infraestrutura da empresa. |
| R2 | **Aprovação corporativa** | Dados internos da empresa em Supabase/Vercel (serviços externos, fora do Brasil por padrão). LGPD e política de TI. | Criar o projeto Supabase na região `sa-east-1` (São Paulo). Validar com TI/Segurança antes de inserir dados reais. Testes nunca usam dados reais. |
| R3 | **Supabase Free** | Projeto pausa após ~7 dias sem uso; sem backups gerenciados acessíveis; limites de 500 MB de banco e 1 GB de storage. | Suficiente para 2 usuários. Documentar export periódico (`pg_dump`). Uso diário evita a pausa. |
| R4 | **E-mail do Supabase Auth** | O SMTP embutido do Supabase só envia para membros da organização Supabase e com limite muito baixo por hora. Convites para o estagiário podem não chegar. | Convite gera **link copiável** (via `auth.admin.generateLink`) que funciona sem SMTP. SMTP próprio (ex.: Resend, plano gratuito) é opcional e documentado. |
| R5 | **Agendamentos** | Cron da Vercel Hobby roda no máximo 1×/dia. | Recorrências e alertas de prazo rodam no **pg_cron** do Supabase (disponível no plano gratuito), com funções idempotentes. |
| R6 | "Tipo" × hierarquia | A especificação pede que tipo (recorrente/pontual/projeto) não se confunda com posição hierárquica. | `tasks.type` é **classificação**; `project_id` e `parent_task_id` são **vínculos** independentes. Subtarefas herdam o projeto do pai. |
| R7 | Validador × registrante | O validador (você) também registrará ganhos. Sem segregação, você aprovaria seus próprios registros. | Permitido, mas o histórico marca **autovalidação** e o dashboard pode filtrá-la. Pode virar bloqueio por configuração no futuro. |
| R8 | Progresso híbrido | Risco de somar progresso operacional e de resultado. | Dois indicadores separados; nenhuma combinação automática (ver §5). |
| R9 | Agregação de ganhos | Risco de somar horas com reais, estimado com realizado, ou de contar duas vezes benefícios recorrentes. | Agregação sempre agrupada por **unidade** e **natureza** (estimado/realizado); projeção anual exibida à parte (ver §6). |
| R10 | Concorrência | Duas pessoas editando a mesma tarefa. | Coluna `version` + atualização condicional (`... where version = esperado`). Conflito retorna mensagem clara ao usuário. |
| R11 | Fuso horário | Prazos "atrasados" dependem do dia local. | Prazos são `date` (dia civil no fuso do workspace, padrão `America/Sao_Paulo`); eventos são `timestamptz`. "Hoje" é sempre calculado no fuso do workspace. |
| R12 | Next.js 16 | `cacheComponents` vem ativo por padrão e exige padrões específicos para sessão. | Desativado (ADR-03). |

Nenhum desses itens impede o desenvolvimento agora. R1 e R2 exigem decisão sua
**antes da publicação**.

---

## 3. Decisões arquiteturais (ADRs)

**ADR-01 — Banco como fronteira de segurança.** Toda tabela em `public` tem RLS.
Funções auxiliares de autorização ficam no schema `private` (não exposto pela
API). Operações privilegiadas são RPCs `security definer` que verificam
permissão explicitamente.

**ADR-02 — Autorização por permissões, não por nomes.** `workspace_members.role`
é apenas descritivo. Autorização usa `workspace_member_permissions`
(`impacts.validate`, `members.manage`, `workspace.manage`). Quem cria o
workspace recebe todas; nada depende de e-mail fixo no código.

**ADR-03 — Renderização dinâmica, sem Cache Components.** Todas as telas são por
usuário e filtradas por RLS. Cache no servidor de dados sensíveis aumenta risco
sem ganho perceptível para 2 usuários. `cacheComponents: false`.

**ADR-04 — Integridade por workspace via chaves compostas.** Tabelas filhas
referenciam `(id, workspace_id)` do pai. Isso torna impossível, no banco,
vincular uma tarefa a um projeto ou responsável de outro workspace.

**ADR-05 — Exclusão lógica.** Tarefas são arquivadas (`archived_at`); objetivos,
metas, projetos e ganhos usam `deleted_at`. Não há política RLS de `DELETE`
nessas tabelas.

**ADR-06 — Histórico por trigger.** `activity_logs` é preenchido por triggers
(diff de colunas relevantes), não pela aplicação — não há como "esquecer" de
registrar.

**ADR-07 — Automações idempotentes.** Recorrências usam `unique (recurrence_id,
occurrence_date)` e notificações usam `dedupe_key` único. Rodar a automação duas
vezes não duplica nada.

**ADR-08 — Convites, sem cadastro público.** Cadastro público desativado no
Supabase Auth. Usuários entram por convite (link de convite). Ao autenticar,
convites pendentes para o e-mail são aceitos.

**ADR-09 — Sincronização em tempo real.** Supabase Realtime (`postgres_changes`)
sobre `tasks`, que respeita RLS. O cliente aplica a mudança e revalida a tela.

---

## 4. Modelo de dados

Migrações em `supabase/migrations/`. Resumo dos relacionamentos:

```
auth.users 1─1 profiles
workspaces 1─N workspace_members N─1 profiles
workspace_members 1─N workspace_member_permissions
workspaces 1─N workspace_invitations
workspaces 1─N categories

objectives 1─N goals 1─N goal_metrics 1─N goal_metric_history
projects N─N goals            (project_goals)
projects N─N profiles         (project_members)
projects 1─N tasks
tasks 1─N tasks               (parent_task_id — subtarefas, profundidade livre, sem ciclos)
task_recurrences 1─N tasks    (ocorrências; unique recurrence_id+occurrence_date)
tasks 1─N comments, attachments
business_impacts N─1 projects | tasks
business_impacts 1─N business_impact_reviews
notifications N─1 profiles
activity_logs  (entity_type, entity_id) — histórico genérico
automation_runs — execuções das automações
email_outbox — fila de e-mails (Fase 5)
```

Todas as tabelas de domínio têm `workspace_id`, `created_at`, `updated_at` e
UUID como chave.

---

## 5. Metodologia de progresso

### 5.1 Progresso operacional (tarefas)

Cada tarefa tem `weight` (padrão 1). Tarefas arquivadas são ignoradas.

```
p(t) = 1                                   se t está concluída
     = Σ w(c)·p(c) / Σ w(c)  (filhos c)    se t tem subtarefas
     = 0                                   caso contrário
```

Progresso de um projeto = média ponderada de `p(t)` sobre as tarefas **raiz** do
projeto (sem pai). Cada subtarefa contribui **somente através do pai**, então não
há contagem dupla: uma tarefa com 3 subtarefas ocupa um único "slot" de peso
`w(t)` no projeto, e as subtarefas dividem esse slot.

Uma tarefa-pai marcada como concluída vale 1, independentemente das subtarefas
(decisão do usuário prevalece).

Implementação: `src/features/tasks/progress.ts` (testada em `tests/unit`).

### 5.2 Progresso de resultado (indicadores)

Cada indicador tem direção:

- **increase / decrease:** `clamp((atual − inicial) / (alvo − inicial), 0, 1)`.
  A mesma fórmula serve às duas direções porque o sinal do denominador acompanha
  a direção. Ex.: inicial 20 h, alvo 10 h, atual 15 h → (15−20)/(10−20) = 50%.
  O banco exige `alvo < inicial` para redução e `alvo > inicial` para aumento.
- **range (manutenção em faixa):** 100% se `mín ≤ atual ≤ máx`, senão 0%.

Progresso de resultado da meta = média ponderada dos seus indicadores.
**Nunca** é combinado automaticamente com o progresso operacional.

---

## 6. Regras de agregação de ganhos

1. Só ganhos com status `approved` entram em "ganhos validados".
2. Estimado e realizado são colunas distintas e nunca somadas entre si.
3. Totais são sempre agrupados por **unidade** (`BRL`, `hours`, …). Horas não
   se somam a reais.
4. Ganhos recorrentes: o registro guarda o valor **por período**
   (`periodicity`). A **projeção anual** = valor estimado × períodos/ano e é
   exibida separadamente, rotulada como projeção.
5. Realizado: cada registro cobre um **período de referência**; um mesmo
   benefício recorrente realizado em meses diferentes vira registros distintos,
   cada um com seu período. O dashboard atribui o registro ao mês de
   `reference_end`.
6. Um ganho vincula-se a uma tarefa **ou** a um projeto; totais por projeto
   incluem os ganhos das tarefas do projeto, cada registro uma única vez.
