# Mystic Warriors — operação, deploy e persistência

## Stack oficial

O fluxo atual do projeto é:

**Visual Studio Code → GitHub → Render → Supabase**

- **GitHub**: código-fonte, branches, pull requests e CI.
- **Render**: aplicação Next.js e SQLite autoritativo em Persistent Disk.
- **Supabase**: autenticação e espelho dos personagens/dados previstos pelo jogo.
- **Bun 1.4.2**: instalação, testes e build.
- **Node.js**: processo do servidor standalone gerado pelo Next.js.

A infraestrutura antiga de preview/publicação não faz parte do runtime nem do deploy atual.

## Desenvolvimento local

Na raiz do projeto:

```sh
bun install --frozen-lockfile
bun run db:generate
bun run dev
```

Use um `.env` privado. Nunca versione credenciais, banco de jogadores ou arquivos de avatar.

## Serviço Render

Configuração de referência do serviço:

```text
Repositorio: kikajima/mysticwarriors
Branch: master
Build: mkdir -p /tmp/mystic-warriors-build && touch /tmp/mystic-warriors-build/custom.db && export DATABASE_URL=file:/tmp/mystic-warriors-build/custom.db && bun install --frozen-lockfile && bun run db:generate && bun run build
Start: bun run start
Health check: /api/health
Auto-deploy: After CI Checks Pass
Instâncias: 1
Persistent Disk mount: /var/data
SQLite: file:/var/data/custom.db
```

O arquivo `render.yaml` contém a configuração declarativa de referência.
O nome do serviço existente é `mysticwarriors`; não crie outro serviço para
aplicar o Blueprint.

### Persistent Disk

**Importante:** Persistent Disk só pode ser anexado a serviço Render pago.
Um Web Service Free não oferece persistência de filesystem e, portanto, não
é seguro para o SQLite autoritativo deste projeto.

O filesystem normal do Render é efêmero. Somente arquivos gravados sob o
mount do Persistent Disk sobrevivem a deploys e reinicializações.

Para este projeto:

```text
/var/data
└── custom.db
    avatars/
    backups/
```

O SQLite autoritativo deve ser:

```text
DATABASE_URL=file:/var/data/custom.db
```

O serviço deve permanecer com **uma única instância** enquanto utilizar SQLite.

## Variáveis de ambiente

Obrigatórias:

```text
NODE_ENV=production
BUN_VERSION=1.4.2
DATABASE_URL=file:/var/data/custom.db
ALLOW_EMPTY_DB_INIT=false
NEXT_PUBLIC_SUPABASE_URL=<URL do projeto Supabase>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave publicável/anon>
```

Não use `service_role` em variável `NEXT_PUBLIC_*`.

A administração é autorizada pela tabela `public.admins` do Supabase através da função `public.is_admin()`; não existe lista paralela de e-mails no Render.

`GM_ADMIN_EXPORT_SECRET` é opcional e serve apenas para habilitar a rota
administrativa de exportação do backup. Se não for configurado, essa rota
permanece recusando acesso.

## Regra crítica: nunca criar banco vazio sobre um serviço existente

Para serviço com jogadores reais:

```text
ALLOW_EMPTY_DB_INIT=false
```

Se `/var/data/custom.db` não existir, o processo deve **falhar**. Isso é
intencional: é preferível interromper o deploy a iniciar um servidor vazio.

`ALLOW_EMPTY_DB_INIT=true` só pode ser usado no primeiro boot de uma
instalação realmente nova, sem dados anteriores. Depois do primeiro boot,
volte imediatamente para `false`.

Não execute `prisma migrate reset` em produção. O atalho correspondente foi
removido do `package.json`.

## Migrações

As migrations versionadas ficam em `prisma/migrations`.

No boot, o servidor aplica apenas migrations pendentes de forma idempotente.
O fluxo normal de deploy não apaga contas, personagens, guildas ou histórico.

Para desenvolvimento de uma migration nova:

```sh
bun run db:migrate
```

Para gerar o Prisma Client:

```sh
bun run db:generate
```

## Primeiro deploy no serviço Render já existente

**Estado legado observado em 2026-09-19:** serviço `mysticwarriors` no plano
Free, banco em `file:/tmp/mystic-warriors/custom.db`, start command criando
SQLite em `/tmp`, health check vazio e auto-deploy `On Commit`. Não faça
redeploy desse estado sem exportar antes um backup do banco vivo.

Antes de publicar uma mudança de infraestrutura:

1. Confirme que o serviço Render está ligado ao repositório
   `kikajima/mysticwarriors` e à branch `master`.
2. Confirme que o serviço já foi movido para um plano que suporte Persistent
   Disk e que existe um disco montado em `/var/data`.
3. Confirme que `/var/data/custom.db` é o banco que contém os jogadores
   atuais.
4. Confirme `DATABASE_URL=file:/var/data/custom.db`.
5. Confirme `ALLOW_EMPTY_DB_INIT=false`.
6. Confirme as variáveis do Supabase.
7. Confirme auto-deploy como **After CI Checks Pass**.
8. Só então execute o deploy.

Não crie um segundo serviço ou um segundo disco se já existir um serviço de
produção com os jogadores atuais.

## Checklist pós-deploy

Após o deploy:

1. Abra `/api/health` e confirme `ok: true`.
2. Confira os logs de boot e migrations; não deve existir mensagem de banco
   ausente.
3. Faça login com uma conta existente.
4. Confirme personagens, Zeni, inventário e progresso.
5. Abra guildas e confirme membros/convites.
6. Teste convite para um guerreiro offline.
7. Faça uma ação simples e recarregue a página para confirmar persistência.
8. Verifique o ranking/nuvem do Supabase.

## Backup

Antes de alterações sensíveis no disco, prefira um backup consistente do
SQLite. Não copie somente `custom.db` enquanto houver gravações/WAL ativos.

O jogo mantém utilitários de backup e checkpoint. O Persistent Disk do Render
é a fonte autoritativa do banco local; o Supabase não deve ser tratado como
substituto irrestrito desse arquivo.

## Validação atual

Na migração para a infraestrutura Render-native foram validados:

- **491 testes automatizados**;
- TypeScript;
- ESLint;
- build de produção;
- instalação com lockfile;
- health check;
- proteção contra criação acidental de banco vazio;
- ausência de dependências operacionais da infraestrutura antiga.

O teste automatizado não substitui a confirmação do **Persistent Disk real**
no dashboard do Render antes do primeiro deploy dessa configuração.
