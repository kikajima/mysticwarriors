# Checklist de lançamento

Este arquivo reúne apenas os itens operacionais que não devem depender de memória ou de configuração local.

## Automatizado no repositório

- CI de pull request e `master`: testes unitários/contratos, TypeScript, ESLint e build de produção.
- Gate funcional: auditoria E2E principal, loja/inventário e cooldown da Ameaça Universal.
- Varredura de secrets e contratos de hardening das Etapas 12 e 13.
- Repositório sem gitlinks/submódulos órfãos; o CI falha se um ponteiro `160000` reaparecer.
- Health check da aplicação: `/api/health`.

## Supabase de produção

- `supabase-security-stage12.sql` aplicado.
- `supabase-security-stage13.sql` aplicado.
- `public.personagens`: cliente autenticado com SELECT apenas; INSERT/UPDATE/DELETE diretos proibidos.
- Bucket `avatars`: até 5 MB e somente JPEG/PNG/WebP.
- Escrita de snapshot do world boss bloqueada para `anon` e `authenticated`.
- RPCs administrativas legadas por conta removidas.
- Antes do lançamento público, habilitar no Dashboard do Supabase a proteção contra senhas vazadas (Leaked Password Protection).

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
