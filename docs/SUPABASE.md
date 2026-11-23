# Configuração do Supabase

Passo a passo para colocar o banco no ar. Tudo funciona no **plano gratuito**.
Leia antes o item R2 de `docs/ARCHITECTURE.md` (aprovação corporativa para uso
de serviços externos com dados da empresa).

## 1. Criar o projeto

1. Acesse <https://supabase.com/dashboard> e crie um projeto.
2. **Região:** `South America (São Paulo) — sa-east-1`.
3. Guarde a senha do banco em um gerenciador de senhas (não coloque no repositório).

## 2. Aplicar as migrações

Opção A — **Supabase CLI** (recomendada; mantém o histórico de migrações):

```bash
npx supabase login
npx supabase init            # cria supabase/config.toml (as migrações já existem)
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push         # aplica supabase/migrations/*.sql em ordem
```

Opção B — **SQL Editor** do painel: execute cada arquivo de `supabase/migrations/`
na ordem do nome. **Não** execute `supabase/tests/supabase_stubs.sql` no Supabase
real; ele só emula o Supabase nos testes.

A migração `…0700_storage_and_cron.sql` cria o bucket privado `attachments` e
agenda as automações (pg_cron, de hora em hora, idempotentes). Confira em
*Database → Extensions* que `pg_cron` ficou ativo e em *Integrations → Cron* que
o job `safra-adm-jobs` existe.

## 3. Autenticação (Authentication)

Em **Authentication → Sign In / Providers**:

- **Allow new users to sign up:** **desligado** (acesso só por convite).
- **Email** provider: ligado. **Confirm email:** pode ficar ligado.

Em **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000` em desenvolvimento; a URL da Vercel em produção.
- **Redirect URLs:** adicione `http://localhost:3000/**` e `https://SEU-DOMINIO/**`.

Em **Authentication → Emails → Templates**, ajuste os modelos para o fluxo com
`token_hash` (verificado no servidor por `/auth/confirm`):

- **Invite user:**
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha`
- **Reset password:**
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/definir-senha`

> **Limitação do plano gratuito:** o SMTP embutido do Supabase só entrega e-mails
> para membros da organização no Supabase e com limite baixo por hora. Por isso o
> app gera um **link de convite copiável** em *Configurações → Integrantes*, que
> funciona sem SMTP. Para e-mails de redefinição de senha confiáveis, configure
> um SMTP próprio em *Authentication → Emails → SMTP Settings* (ex.: Resend, que
> tem plano gratuito) — exige domínio verificado.

A validade dos links é definida em *Authentication → Emails → Email OTP Expiration*
(padrão 1 hora; máximo 24 horas).

## 4. Primeiro acesso (você, como administrador)

1. *Authentication → Users → Add user → Create new user*: informe seu e-mail e
   uma senha, marque **Auto Confirm User**.
2. Rode o app e entre com esse e-mail e senha.
3. Na tela **Crie seu workspace**, informe o nome. Você recebe automaticamente as
   permissões de administrar integrantes, alterar o workspace e **validar ganhos**.
4. Em *Configurações → Integrantes*, convide o estagiário e envie o link gerado.

## 5. Chaves e variáveis de ambiente

Em *Project Settings → API Keys*:

| Variável | Onde | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) ou a "anon" legada | pública; a RLS protege os dados |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`) ou "service_role" legada | **somente servidor**; nunca no navegador nem no GitHub |
| `NEXT_PUBLIC_SITE_URL` | URL do app | usada nos links de convite |

## 6. Realtime

A migração `…0600_rls.sql` adiciona `tasks`, `comments` e `notifications` à
publicação `supabase_realtime`. Em *Database → Publications* confirme que as três
tabelas aparecem. O Realtime respeita a RLS: cada usuário só recebe eventos do
próprio workspace.

## 7. Tipos TypeScript (opcional)

```bash
SUPABASE_PROJECT_ID=SEU_PROJECT_REF npm run db:types
```

Gera `src/types/database.generated.ts`. O código atual usa tipos de domínio
escritos à mão (`src/types/domain.ts`); os tipos gerados podem substituí-los aos
poucos.

## 8. Backup

O plano gratuito não oferece backups acessíveis. Exporte periodicamente:

```bash
npx supabase db dump --linked -f backup-$(date +%F).sql          # schema
npx supabase db dump --linked --data-only -f dados-$(date +%F).sql  # dados
```

Guarde os arquivos fora do repositório (contêm dados da empresa).
