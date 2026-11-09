# Backend em PostgreSQL (Azure)

O app deixou de depender do Supabase hospedado. O front continua usando o `supabase-js`, mas
ele fala com a **própria aplicação**, que expõe o mesmo protocolo (PostgREST / GoTrue / Storage)
sobre um banco PostgreSQL no Azure:

```
navegador ──supabase-js──▶ /rest/v1 /auth/v1 /storage/v1 /functions/v1
                              │  (vercel.json reescreve para api/gateway.ts)
                              ▼
                        server/*.ts ──pg──▶ Azure PostgreSQL (banco gestao_obras)
```

* `server/rest.ts` – subconjunto do PostgREST (select com embeds, filtros, order, count, insert/upsert/update/delete).
  Cada requisição roda numa transação com `SET LOCAL ROLE obras_anon|obras_authenticated` e as claims do JWT,
  então as **políticas RLS** de `02_schema.sql` continuam sendo a barreira de acesso.
* `server/auth.ts` – login, cadastro, refresh, `getUser`, troca de senha. Senhas em bcrypt, JWT HS256.
* `server/storage.ts` – arquivos no próprio Postgres (`storage.objects.data`), com upload em pedaços para > 4 MB.
* `server/functions.ts` – `generate-composition` e `parse-receipt` (usam `OPENAI_API_KEY` se existir).

## Variáveis de ambiente (nunca vão para o git)

| Variável | Onde | Para quê |
| --- | --- | --- |
| `DATABASE_URL` | Vercel + `.env.local` | `postgres://usuario:senha@host:5432/gestao_obras` (senha com `%`-encoding) |
| `JWT_SECRET` | Vercel + `.env.local` | 32+ caracteres aleatórios; assina os tokens de login |
| `OPENAI_API_KEY` | Vercel (opcional) | IA de composição e leitura de nota fiscal |
| `ALLOW_SIGNUP` | Vercel (opcional) | `false` fecha o cadastro aberto |
| `VITE_SUPABASE_ANON_KEY` | `.env` (público) | gerada por `node server/gen-anon-key.mjs` |

## Preparar um banco novo

```bash
psql "$ADMIN_URL/postgres" -f db/azure/00_roles.sql      # uma vez por servidor
psql "$ADMIN_URL/postgres" -c "CREATE DATABASE gestao_obras"
psql "$ADMIN_URL/gestao_obras" -f db/azure/01_shim.sql   # schemas auth e storage
psql "$ADMIN_URL/gestao_obras" -f db/azure/02_schema.sql # tabelas, triggers, RLS (gerado de supabase_schema.sql)
psql "$ADMIN_URL/gestao_obras" -f db/azure/03_grants.sql
psql "$ADMIN_URL/gestao_obras" -f db/azure/04_planner_progress.sql  # só em bancos criados antes da coluna de progresso
psql "$ADMIN_URL/gestao_obras" -f db/azure/05_cronograma_planner_sync.sql  # Cronograma <-> Planner (gatilhos); teste: node db/azure/test-cronograma-sync.mjs
psql "$ADMIN_URL/gestao_obras" -f db/azure/06_work_rented_materials.sql  # materiais locados por obra
psql "$ADMIN_URL/gestao_obras" -f db/azure/07_planner_status_delayed.sql  # status Em Atraso nas tarefas
psql "$ADMIN_URL/gestao_obras" -f db/azure/08_permissoes_prestador.sql  # permissões do Prestador; teste: node db/azure/test-permissoes.mjs
psql "$ADMIN_URL/gestao_obras" -f db/azure/09_planner_so_vinculados.sql  # só Admin vê todos os cards do Planner
psql "$ADMIN_URL/gestao_obras" -f db/azure/10_responsavel_usuario.sql  # Pessoa Responsável = usuário do sistema
psql "$ADMIN_URL/gestao_obras" -f db/azure/11_perdas_metas_financeiro.sql  # perdas de materiais, metas/premiação e financeiro fechado ao Prestador; teste: node db/azure/test-perdas-metas.mjs
psql "$ADMIN_URL/gestao_obras" -f db/azure/12_materiais_alocados_valores.sql  # materiais alocados com valores (R$), valores fechados ao Prestador; teste: node db/azure/test-materiais-valores.mjs
```

## Desenvolvimento local

```bash
pnpm dev:api   # API em http://localhost:3001 (lê .env.local)
pnpm dev       # front em http://localhost:8080, com proxy para a API
pnpm smoke     # teste de ponta a ponta com o supabase-js (cria e apaga os próprios dados)
```

## Senhas

A API do Supabase não expõe o hash das senhas, então os usuários migrados ficaram **sem senha**.
Defina uma para cada um (ou gere uma aleatória):

```bash
node db/azure/set-password.mjs usuario@empresa.com
```

Recuperação de senha por e-mail e reenvio de confirmação **não estão ativos** (não há servidor de e-mail
configurado): a API responde `email_not_configured`.

## Limites conhecidos

* A Vercel limita o corpo de cada requisição a ~4,5 MB; o cliente envia arquivos maiores em pedaços
  (`src/lib/supabase/client.ts`). Evite vídeos muito grandes: tudo fica dentro do Postgres.
* O servidor Azure precisa aceitar conexões vindas da Vercel (firewall do Azure).
