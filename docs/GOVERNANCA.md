# Governança — Seed Production Task Tracker

Aplicação do **Prompt para padronização de aplicações da SLC Sementes** a este projeto. Este documento é público: não contém nomes, e-mails, senhas nem dados de negócio. A Especificação Funcional e o Memorial de Cálculos completos ficam em documento interno.

Versão documentada: branch `governanca` (protótipo publicado no GitHub Pages). Data: 27/11/2026.

## 1. Diagnóstico e escopo

| Item do padrão | Situação antes | Situação agora | Pendência |
|---|---|---|---|
| Identidade SLC (Figtree, #26332E, #70AC62) | Figtree com verde próprio | Paleta institucional nos dois temas; menu lateral em #26332E | Comparar com o brandbook oficial |
| Menu lateral recolhível | Fixo; barra inferior no celular | Recolhe/expande no desktop; painel temporário no celular, que fecha após a escolha | — |
| Abas em grupos | Lista única | Visão geral primeiro; grupos Execução, Resultados, Integrações e Administração | — |
| Tema claro/escuro persistido | Não guardava a escolha | Preferência guardada no navegador | — |
| Módulos por perfil | Todos viam tudo | Matriz de perfis com acesso negado por padrão | Aplicar no servidor (RLS/API) na versão com servidor |
| Gestão de usuários | Lista em Configurações | Área "Usuários e acessos": perfil, escopo, método, ativar/desativar, auditoria | Persistência e auditoria gravada exigem servidor |
| Login | Senha única compartilhada | Senha individual, bloqueio após tentativas, mensagens que não revelam cadastro | SSO Microsoft Entra ID e recuperação de senha exigem servidor |
| Sessão | Durava até fechar a aba | Sair, expiração por 30 min sem uso, duração máxima de 8 h | — |
| Cabeçalhos de segurança | Nenhum | CSP e `referrer` por meta tag | GitHub Pages não permite cabeçalhos HTTP próprios (HSTS, frame-ancestors) |
| Homologação | Roteiros manuais e automatizados | Roteiro de governança com 40 verificações | — |
| Especificação Funcional e Memorial | Não existiam | Documento interno nas 14 seções do modelo | Aprovação do responsável de negócio |

## 2. Classificação dos dados e fluxos

| Dado | Classificação | Onde fica | Proteção |
|---|---|---|---|
| Nomes, e-mails e perfis do time | Interno | Dentro do conteúdo cifrado | AES-256-GCM; chave liberada só por senha individual |
| Tarefas, projetos, prazos | Interno | Dentro do conteúdo cifrado | Idem |
| Valores do PDCA (orçado × realizado) | Confidencial | Lidos na hora, no navegador; nunca gravados no repositório | Acesso do próprio PDCA (login dele) |
| Senhas | Secreto | Arquivo fora do repositório, com o administrador | Nunca versionado; entregue por canal privado |
| Preferências visuais e contador de tentativas | Público | Armazenamento do navegador | Sem dado pessoal |

**Fluxos e integrações**
- **Login:** o navegador baixa a página cifrada, a pessoa informa e-mail e senha, e a chave é derivada no próprio navegador. Nada é enviado a um servidor.
- **PDCA:** leitura no mesmo endereço do GitHub Pages (relatório carregado no PDCA ou página do PDCA com o login dele) ou carga manual do CSV do SAC.
- **E-mail de pendências:** abre o programa de e-mail da pessoa ou copia o texto. Não há envio automático.

**Riscos e tratamentos**

| Risco | Tratamento atual | Tratamento na versão com servidor |
|---|---|---|
| Senha fraca descoberta por tentativa offline | Senhas aleatórias de 14 caracteres; PBKDF2 com 600.000 iterações | Senha com hash no servidor, MFA, SSO corporativo |
| Pessoa desligada mantém acesso | Desativar e publicar de novo; trocar as senhas | Revogação imediata de sessões |
| Bloqueio de tentativas contornável (é local ao navegador) | Atraso pelo custo do PBKDF2 | Limite de taxa no servidor |
| Ninguém grava o que se faz no app | Aviso fixo no topo: "Nada é salvo" | Banco com backup diário |
| Dados em conversa ou documento público | Varredura antes de cada publicação; mensagens de commit sem dados | Idem |

## 3. Matriz de permissões

Acesso negado por padrão. Cada perfil só vê os módulos e só executa as ações marcadas, sempre dentro das áreas do seu escopo.

| Módulo | Administrador | Gestor | Colaborador | Leitura |
|---|:-:|:-:|:-:|:-:|
| Visão geral | ✓ | ✓ | ✓ | ✓ |
| Tarefas | ✓ | ✓ | ✓ | ✓ |
| Projetos | ✓ | ✓ | ✓ | ✓ |
| Ganhos | ✓ | ✓ | ✓ | ✓ |
| Sugestões do PDCA | ✓ | ✓ | ✓ | — |
| Usuários e acessos | ✓ | — | — | — |
| Configurações | ✓ | ✓ | ✓ | ✓ |

| Ação | Administrador | Gestor | Colaborador | Leitura |
|---|:-:|:-:|:-:|:-:|
| Criar tarefas | ✓ | ✓ | ✓ | — |
| Editar, mover e comentar tarefas | ✓ | ✓ | ✓ | — |
| Arquivar e restaurar tarefas | ✓ | ✓ | — | — |
| Criar projetos | ✓ | ✓ | — | — |
| Registrar ganhos | ✓ | ✓ | ✓ | — |
| Validar ganhos | ✓ | ✓ | (concessão individual) | — |
| Rodar a integração com o PDCA | ✓ | ✓ | ✓ | — |
| Aceitar ou descartar sugestões | ✓ | ✓ | ✓ | — |
| Enviar pendências por e-mail | ✓ | ✓ | ✓ | — |
| Gerenciar usuários e acessos | ✓ | — | — | — |
| Alterar configurações do espaço | ✓ | — | — | — |

**Regras de administração:**
- Ninguém altera o próprio perfil, escopo ou status.
- Sempre existe ao menos um administrador ativo.
- O cadastro aceita só e-mail corporativo.
- Toda mudança de acesso entra no registro de auditoria.
- "Simular perfil" aparece só para administradores e serve para homologar permissões.

**Métodos de acesso:** senha individual (hoje) e Microsoft Entra ID (SSO), este dependente da versão com servidor.

## 4. Login e sessão

| Controle | Como funciona |
|---|---|
| Senha individual | Uma chave por pessoa ativa; a senha de uma pessoa não abre o acesso de outra |
| Conta desativada | Não recebe chave na publicação; o login falha |
| Mensagem de erro | Igual para e-mail inexistente, conta inativa ou senha errada; tempo de resposta igual |
| Bloqueio | 5 erros seguidos travam por 5 minutos no navegador |
| Expiração | 30 minutos sem uso; duração máxima de 8 horas |
| Sair | Volta à tela de login sem nada decifrado na memória da página |
| Recuperação de senha | O administrador gera uma nova senha provisória e publica (sem servidor, não há token por e-mail) |

## 5. Plano para a versão com servidor (para a TI)

O código da versão com servidor está em `src/` e `supabase/` (Next.js + PostgreSQL com RLS). Antes de escolher a hospedagem, validar com a TI se o projeto (e os próximos apps) devem rodar no ambiente Microsoft da empresa.

**Parâmetros do SSO Microsoft Entra ID, por ambiente (desenvolvimento, homologação, produção):**
- Tenant ID da SLC Agrícola.
- Registro de aplicativo: Application (client) ID e certificado ou segredo, guardado no cofre da TI.
- URIs de retorno: `https://<endereço do ambiente>/auth/callback`.
- Grupos do Entra ID mapeados para os perfis Administrador, Gestor, Colaborador e Leitura.
- MFA obrigatório para Administrador.
- Dono do registro na TI e quem renova as credenciais.

**Controles que passam a valer no servidor:**
- Autenticação e autorização verificadas em cada rota, API e registro (RLS por área).
- Cookies `Secure`, `HttpOnly` e `SameSite=Lax`, proteção CSRF e rotação de sessão após o login.
- Limite de taxa no login.
- Cabeçalhos HSTS, CSP e `frame-ancestors`.
- Logs protegidos de login, falhas de autorização e mudanças de acesso.
- Backups diários com restauração testada.

**Proposta de metas de continuidade (a validar):**
- RPO de 24 horas (backup diário).
- RTO de 4 horas.
- Retenção de backups de 7 dias no início.

## 6. Homologação

Roteiros automatizados em navegador real (Chrome), executados em 27/11/2026 sobre a página publicada localmente com os mesmos arquivos do GitHub Pages:

| Roteiro | Verificações | Resultado |
|---|---|---|
| Governança: login, bloqueio, sessão, perfis, escopo, menu, tema, CSP, janela anônima | 40 | 40 aprovadas |
| Regressão: dados, datas das rotinas, trava de prazo e urgência, marca | 26 | 26 aprovadas |
| Regressão: e-mail de pendências | 8 | 8 aprovadas |
| Regressão: integração com o PDCA (página real do PDCA) | 15 | 15 aprovadas |

Contraste (WCAG AA, mínimo 4,50:1) nos dois temas e no menu: menor valor medido de 5,20:1.

Os roteiros usam dados reais e por isso não estão neste repositório público.

## 7. Publicação e reversão

- **Publicação:** só após o PR ser aprovado pelo responsável do projeto. O GitHub Pages publica a branch `main`.
- **Reversão:** reverter o merge do PR no GitHub ("Revert"). A versão anterior volta a ser publicada em 1 a 2 minutos.
- **Senhas:** como mudaram de senha única para senhas individuais, a senha antiga deixa de funcionar quando esta versão for publicada.
