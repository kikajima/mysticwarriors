# Mystic Warriors

Jogo de navegador com Next.js, React, Bun, Prisma/SQLite e integração Supabase.

## Desenvolvimento

```sh
bun install --frozen-lockfile
bun run db:generate
```

Configure `.env` a partir de `.env.example`. Para desenvolvimento, use um caminho absoluto para seu banco SQLite local. Preserve o banco e os avatares da instalação existente; eles não são versionados. Para uma instalação realmente nova, crie a pasta do banco e execute `bun run db:deploy` com DATABASE_URL apontando para o novo arquivo.

```sh
bun run dev
```

## Produção

Configure DATABASE_URL para um banco existente em volume persistente externo ao diretório do app. Configure ADMIN_EMAIL e as variáveis públicas do Supabase antes do build. Não inclua credenciais privadas nem dados dos jogadores no Git.

```sh
bun run build
bun run start
```

O GitHub armazena o código. Para disponibilizar o jogo na internet é necessário hospedar o servidor e o volume persistente. GitHub Pages não executa este backend.

Consulte [CORRECOES-E-INSTALACAO.md](CORRECOES-E-INSTALACAO.md) para aplicação das correções, configuração, testes realizados e limitações.
