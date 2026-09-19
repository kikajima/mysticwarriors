# Mystic Warriors

Jogo de navegador com Next.js, React, Bun, Prisma/SQLite e Supabase.

## Stack oficial

- **Desenvolvimento:** Visual Studio Code + Bun
- **Código e CI:** GitHub
- **Hospedagem:** Render
- **Autenticação e espelho em nuvem:** Supabase
- **Banco autoritativo do servidor:** SQLite em Persistent Disk do Render

O projeto não depende da Z.ai para build, preview ou deploy.

## Desenvolvimento local

```sh
bun install --frozen-lockfile
bun run db:generate
```

Copie `.env.example` para `.env` e use um caminho local para o SQLite.

```sh
bun run dev
```

## Produção no Render

O filesystem comum do Render é efêmero. O SQLite precisa ficar em um
**Persistent Disk**, que exige uma instância paga do Render. O plano Free não
é adequado para este banco autoritativo porque não preserva o filesystem entre
redeploys/restarts. O Blueprint de referência está em `render.yaml` e usa:

```text
DATABASE_URL=file:/var/data/custom.db
```

Build no Render:

```sh
mkdir -p /tmp/mystic-warriors-build && touch /tmp/mystic-warriors-build/custom.db && export DATABASE_URL=file:/tmp/mystic-warriors-build/custom.db && bun install --frozen-lockfile && bun run db:generate && bun run build
```

O SQLite acima existe somente durante o build. O banco real de produção fica em
`/var/data/custom.db` e só é acessado no runtime.

Start:

```sh
bun run start
```

Para um serviço já existente, preserve o disco e o arquivo `custom.db`.
Nunca use `prisma migrate reset` em produção.

Para uma instalação realmente nova, `scripts/start-production.mjs` só
cria um SQLite vazio quando `ALLOW_EMPTY_DB_INIT=true`. Depois do primeiro
boot bem-sucedido, remova essa variável. Migrações pendentes são aplicadas
pelo boot do aplicativo.

Variáveis necessárias:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

O health check público é `/api/health`.
