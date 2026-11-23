# Seed Production Task Tracker

<img src="prototype/assets/slc-sementes-verde.svg" alt="SLC Sementes" width="220">

O **Seed Production Task Tracker** é a ferramenta de gestão de demandas da Administração de Produção de Sementes da SLC Sementes. Em um só lugar, o time organiza as rotinas recorrentes (como o PDCA e o Comitê SLC Sementes), os projetos e as demandas pontuais, separados por área. Hoje estão ativas **Custos e Despesas** e **Inteligência de Mercado**. BI e Visualização, Expedição, SAP e Operação, Compras e Sistemas estão cadastradas, mas inativas por ora.

Cada tarefa tem responsável, prazo, urgência e subtarefas. **Nenhuma tarefa é criada sem prazo e urgência** (subtarefas herdam os da tarefa principal). O andamento aparece em quadro, lista ou calendário. O diferencial é ligar o trabalho ao resultado: cada melhoria entregue pode ser registrada como ganho para o negócio (economia em reais, custos evitados, horas poupadas ou melhoria de processo) e só entra nos indicadores depois de validada.

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

- Entram apenas os e-mails dos integrantes **ativos** do protótipo. Quem está inativo por ora não entra.
- A senha **não** está em nenhum arquivo deste repositório. Ela é combinada com o time fora do GitHub.
- Para abrir: baixe `prototype/index.html` e abra no navegador.

Para regerar a página depois de alterar o protótipo:

```bash
PROTOTYPE_PASSWORD='<senha>' node prototype/build-locked.mjs prototype/app.private.html prototype/index.html
```

`prototype/app.private.html` é a versão em texto aberto e **nunca** é versionada (`.gitignore`).

> **Limite:** a proteção vale enquanto a senha for conhecida só pelo time. Uma senha curta e compartilhada pode ser descoberta por tentativa. Se ela vazar, troque a senha e regere a página. Os dados do protótipo são o estado de 23/11/2026.

## Integração com o PDCA (aba Sugestões)

O protótipo lê o [PDCA 26/27](https://eduardorsantos-byte.github.io/PDCA-Seeds-Production/) e transforma desvios em sugestões de tarefa.

- **Botão "Rodar integração com o PDCA":** lê o orçado × realizado com a mesma regra do PDCA: grupos MT dos CCs 0226 e 0540, acumulado de Set/26 até o último mês com realizado.
- **Grupos acima do orçado:** viram "Plano de ação" (desvio a partir de R$ 10.000,00 ou de 15%) ou "Analisar desvio". Grupos com realizado sem orçamento viram "Verificar realizado sem orçamento". O desvio mínimo para sugerir pode ser ajustado na tela (padrão: R$ 1.000,00 e 5%).
- **Cada sugestão** pode ser aceita (vira tarefa em Custos e Despesas, com checklist, responsável e prazo da próxima justificativa do PDCA) ou descartada.
- **Sem duplicar:** cada sugestão é identificada por grupo + mês do realizado. Rodar de novo só traz o que é novo. Quando o PDCA é atualizado com um novo mês, surgem novas sugestões, e as que se repetem avisam se já existe tarefa aberta.

**De onde vêm os dados, nesta ordem:**
1. Relatório do SAC carregado no próprio PDCA neste navegador (os dois sites estão no mesmo endereço do GitHub Pages).
2. Página do PDCA aberta com a sessão desta aba ou com o e-mail e a senha do PDCA. A senha só é usada na leitura e não fica guardada.
3. Botão "Carregar CSV do SAC", para quando o PDCA não está acessível.

Os valores do PDCA nunca são gravados neste repositório: são lidos no navegador, na hora.

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
