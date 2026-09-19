# Mystic Warriors — operação Render Free + Supabase PostgreSQL

## Arquitetura oficial

```text
Visual Studio Code
       ↓
GitHub + CI
       ↓
Render Free (Next.js)
       ↓
Supabase PostgreSQL (schema game)
       +
Supabase Auth
       +
public.personagens (snapshot/recuperação)
```

O Render não guarda mais o banco em disco. Reinícios, deploys e cold starts
não apagam o estado autoritativo.

## Projeto Supabase

Projeto: `mysticwarriors`.

O schema autoritativo é `game`, separado de `public`.

- `game.*`: estado server-side usado pelo Prisma.
- `public.personagens`: snapshots dos personagens, mantidos durante a
  transição e usados pelo fluxo de cloud restore.
- `public.profiles`: perfil da conta Supabase.
- `public.admins`: fonte única de autorização administrativa.

## DATABASE_URL do Render

Use **Session Pooler**, porta **5432**, não a conexão direta IPv6.

Formato:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?schema=game&sslmode=require
```

A senha precisa ter caracteres reservados percent-encoded.

Nunca versione essa URL completa no GitHub.

## Render

Serviço existente: `mysticwarriors`.

Configuração:

```text
Repository: kikajima/mysticwarriors
Branch: master
Build: export MW_BUILD_PHASE=1 && export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=game&sslmode=require' && bun install --frozen-lockfile && bun run db:generate && bun run build
Start: bun run start
Health check: /api/health
Instances: 1
```

Não existe Persistent Disk nem SQLite em produção.

Durante a migração, mantenha **Auto-Deploy Off** até a troca de
`DATABASE_URL` e o smoke test estarem prontos.

## Primeiro login após a migração

O schema `game` nasce vazio de contas/personagens de propósito.

Fluxo esperado:

1. jogador entra com Supabase Auth;
2. `/api/auth/supabase` cria/vincula a `game.Account`;
3. se não houver personagens autoritativos, o cliente lê
   `public.personagens`;
4. `/api/game/cloud-restore` sanitiza e cria `game.Player`;
5. o personagem ativo volta automaticamente.

Isso preserva os IDs dos snapshots sempre que possível.

## Guildas

Na auditoria do serviço legado em 2026-09-19, o endpoint vivo retornou
`total: 0` guildas após um deploy ocorrido enquanto o banco ainda estava em
`/tmp`. Portanto não há estrutura relacional de guilda no SQLite atual para
migrar automaticamente. Guildas poderão ser recriadas no PostgreSQL.

## Backup

No PostgreSQL, `/api/game/backup` gera export lógico administrativo:

```text
manifest.json
game.json
```

O download exige a autorização `public.is_admin()` do Supabase.

## Segurança

O schema `game` não deve ser exposto pela Data API. Os privilégios de
`anon` e `authenticated` são revogados nas migrations.

O advisor do Supabase pode ainda recomendar RLS para tabelas do schema
`game`. A decisão de ativar RLS deve ser feita conscientemente; ativar sem
políticas pode bloquear acessos. O backend Prisma usa conexão PostgreSQL
server-side, nunca a chave publicável do navegador.

## Validação antes do deploy

- CI verde
- schema `game` presente no Supabase
- `DATABASE_URL` Session Pooler + `schema=game`
- Auto-Deploy ainda Off
- snapshots em `public.personagens` conferidos
- depois do deploy: login, restore, ação, reload, logout/login, guilda, ranking
