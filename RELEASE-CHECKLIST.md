# Checklist de lançamento

Este arquivo reúne apenas os itens operacionais que não devem depender de memória ou de configuração local.

## Automatizado no repositório

- CI de pull request e `master`: testes unitários/contratos, TypeScript, ESLint e build de produção.
- Gate funcional: auditoria E2E principal, loja/inventário e cooldown da Ameaça Universal.
- Varredura de secrets e contratos de hardening das Etapas 12 e 13.
- Repositório sem gitlinks/submódulos órfãos; o CI falha se um ponteiro `160000` reaparecer.
- Health check da aplicação: `/api/health` valida também a conexão com o banco.
- Smoke remoto manual: `bun run smoke:production -- https://SEU-HOST` ou workflow **Production smoke** no GitHub Actions.

## Supabase de produção

- `supabase-security-stage12.sql` aplicado.
- `supabase-security-stage13.sql` aplicado.
- `public.personagens`: cliente autenticado com SELECT apenas; INSERT/UPDATE/DELETE diretos proibidos.
- Bucket `avatars`: até 5 MB e somente JPEG/PNG/WebP.
- Escrita de snapshot do world boss bloqueada para `anon` e `authenticated`.
- RPCs administrativas legadas por conta removidas.
- `Leaked Password Protection` não está disponível no plano Free atual; o aviso do Advisor é aceito e compensado por política forte de senha e hardening do backend.

## Release Oficial — Etapa 18

- Versão promovida de `1.0.0-rc.1` para `1.0.0` sem alteração de gameplay.
- `package.json`, `src/lib/release.ts`, Production smoke e contratos apontam para `1.0.0`.
- `releaseStage` oficial: `18`.
- Notas do release: `RELEASE-1.0.0.md`.
- Após o merge, criar referência estável `release/v1.0.0`.
- **Publicação efetiva:** somente depois que o Render expuser `release: 1.0.0`, `releaseStage: 18`, branch `master`, SHA esperado e `database: ok`.

## Certificação de Produção — Etapa 17

- RC `1.0.0-rc.1` implantado no Render com SHA exato `1eaabae80ab6a4ff32e2a8a602eef6a5f939bfd3`.
- `/api/health`: release/branch/SHA corretos, `database: ok`, `cloudAuthority: server`.
- Home, login, ranking, wiki, robots e sitemap validados em produção.
- Headers de segurança validados externamente com nota A+.
- CI do commit certificado verde após repetição do flake conhecido do Prisma/Bun, sem mudança de código.
- **Go-live liberado no plano Free atual:** Leaked Password Protection permanece indisponível por limitação do plano e está registrado como risco aceito.
- Evidência completa: `RELEASE-CERTIFICATION.md`.

## Release Candidate — Etapa 16

- RC atual: `1.0.0-rc.1`.
- O `/api/health` expõe `release`, `releaseStage` e a identidade do deploy (`commit`, `branch`, `serviceName`, `externalUrl`).
- No Render, esses campos usam as variáveis nativas `RENDER_GIT_COMMIT`, `RENDER_GIT_BRANCH`, `RENDER_SERVICE_NAME` e `RENDER_EXTERNAL_URL`.
- O workflow **Production smoke** falha se o SHA implantado não for exatamente o esperado.
- O deploy manual deve partir da branch `master`; após o deploy, executar o Production smoke contra o host público.

## Estado observado na Etapa 15

- Em 23/09/2026, o host entrou em cold start e inicialmente respondeu HTTP 503; poucos minutos depois voltou a HTTP 200.
- A instância pública que voltou a responder ainda estava em código antigo (`securityStage: 12`), confirmando que o `master` mais recente ainda não havia sido implantado.
- O painel privado do Render exige autenticação e não havia sessão/credenciais conectadas nesta execução; por isso o deploy manual não foi iniciado automaticamente.

## Render

Confirmar no painel do serviço de produção os valores reais, sem copiá-los para issues, logs ou commits:

- `DATABASE_URL` — Session Pooler do Supabase, porta 5432, com `schema=game&sslmode=require`.
- `NEXT_PUBLIC_SUPABASE_URL`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `NEXT_PUBLIC_SITE_URL` — URL pública canônica.
- `GM_ADMIN_EXPORT_SECRET` — segredo server-side forte para a exportação administrativa.

O `render.yaml` mantém `autoDeployTrigger: off`; portanto um merge no `master` não deve ser tratado como prova de que a versão já foi implantada no Render.

## GitHub

A hospedagem oficial do jogo é Render. Se GitHub Pages continuar habilitado nas configurações do repositório, desabilitá-lo em **Settings → Pages** para evitar builds/deploys paralelos e checks sem relação com produção.
