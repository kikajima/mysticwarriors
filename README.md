# Mystic Warriors

Jogo de navegador com Next.js, React, Bun, Prisma e Supabase PostgreSQL.

## Stack oficial

- **Desenvolvimento:** Visual Studio Code + Bun
- **Código e CI:** GitHub
- **Hospedagem:** Render Free
- **Autenticação:** Supabase Auth
- **Banco autoritativo:** Supabase PostgreSQL, schema privado `game`
- **Compatibilidade/recuperação:** snapshots em `public.personagens`

O projeto não depende da Z.ai nem de filesystem persistente no Render.

## Banco de dados

Produção usa o **Session Pooler** do Supabase (porta 5432), adequado ao backend
persistente do Render e compatível com IPv4.

A URL deve terminar com:

```text
?schema=game&sslmode=require
```

Exemplo estrutural, sem credenciais reais:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?schema=game&sslmode=require
```

O schema `game` contém as tabelas autoritativas do servidor. As tabelas
existentes em `public` continuam servindo Auth/snapshots durante a transição.

## Testes

A suíte hermética continua usando SQLite através de
`prisma/schema.sqlite.prisma`:

```sh
bun install --frozen-lockfile
bun run db:generate:test
bun run test
```

O Prisma de produção usa `prisma/schema.prisma`:

```sh
bun run db:generate
```

## Render

Build:

```sh
export MW_BUILD_PHASE=1
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=game&sslmode=require'
bun install --frozen-lockfile
bun run db:generate
bun run build
```

A URL acima é propositalmente falsa e vale somente durante o build; o build
não consulta produção.

Start:

```sh
bun run start
```

Variáveis de runtime necessárias:

- `DATABASE_URL` — Session Pooler real do Supabase com `schema=game`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

O health check público é `/api/health`.

## Migrações

DDL autoritativo do PostgreSQL é versionado em `supabase/migrations` e
aplicado ao Supabase. As migrations SQLite em `prisma/migrations` permanecem
apenas para a suíte/fixtures legadas.

Nunca execute `prisma migrate reset` em produção.
