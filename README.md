# Task of Seeds Production — Safra ADM

**Safra ADM** é a ferramenta de gestão de demandas da Administração de Produção de Sementes. Em um só lugar, o time organiza as rotinas recorrentes (como o PDCA e o Comitê SLC Sementes), os projetos e as demandas pontuais, separados por área: Custos e Despesas, BI e Visualização, Expedição, SAP e Operação, Compras e Sistemas.

Cada tarefa tem responsável, prazo, prioridade e subtarefas, e o andamento aparece em quadro, lista ou calendário. O diferencial é ligar o trabalho ao resultado: cada melhoria entregue pode ser registrada como ganho para o negócio (economia em reais, custos evitados, horas poupadas ou melhoria de processo) e só entra nos indicadores depois de validada.

---

## O que há neste repositório

| Pasta | Conteúdo |
|---|---|
| `prototype/` | Protótipo navegável, **protegido por login** (ver abaixo). |
| `src/` | Aplicação web (Next.js 16, React 19, TypeScript, Tailwind, shadcn/ui). |
| `supabase/migrations/` | Banco de dados versionado (PostgreSQL + políticas de segurança RLS). |
| `tests/` | Testes automatizados (regras de negócio e banco). |
| `docs/` | Arquitetura, decisões e configuração do Supabase. |

## Protótipo

`prototype/index.html` abre uma tela de login. O conteúdo (time, tarefas, ganhos) está **criptografado** (AES-256-GCM, chave derivada da senha com PBKDF2-SHA256, 600.000 iterações). No repositório fica só o texto cifrado: sem a senha, nada pode ser lido, mesmo com o repositório público.

- Entram apenas os e-mails do time cadastrados no protótipo.
- A senha **não** está em nenhum arquivo deste repositório. Ela é combinada com o time fora do GitHub.
- Para abrir: baixe `prototype/index.html` e abra no navegador.

Para regerar a página depois de alterar o protótipo:

```bash
PROTOTYPE_PASSWORD='<senha>' node prototype/build-locked.mjs prototype/app.private.html prototype/index.html
```

`prototype/app.private.html` é a versão em texto aberto e **nunca** é versionada (`.gitignore`).

> **Limite:** a proteção vale enquanto a senha for conhecida só pelo time. Uma senha curta e compartilhada pode ser descoberta por tentativa. Se ela vazar, troque a senha e regere a página. Os dados do protótipo são o estado de 23/11/2026.

## Aplicação (código)

A aplicação real usa contas individuais (Supabase Auth, acesso por convite) e guarda os dados no banco, não no repositório. Instalação e configuração: [`docs/SUPABASE.md`](docs/SUPABASE.md). Arquitetura e decisões: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do Supabase
npm run dev
npm run check                # typecheck + lint + testes
```

### Situação

| Parte | Situação |
|---|---|
| Autenticação, workspace, permissões, tarefas, Kanban, lista, subtarefas, comentários, histórico, tempo real | Implementado e testado |
| Banco de ganhos e validação, recorrências, notificações | Implementado e testado no banco; telas a portar do protótipo |
| Áreas, rotinas por evento do mês ("última quinta-feira"), tela de Ganhos, calendário, novo tema | No protótipo; a portar para o código |
| Publicação (deploy) | Pendente de decisão sobre hospedagem e aprovação da TI |
