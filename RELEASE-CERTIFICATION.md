# Certificação de Produção — Myst Ki Warriors 1.0.0-rc.1

Data da certificação: 23/09/2026  
Release: `1.0.0-rc.1`  
Commit certificado: `1eaabae80ab6a4ff32e2a8a602eef6a5f939bfd3`  
Branch implantada: `master`  
Host certificado: `https://mysticwarriors-ohio.onrender.com`

## Resultado

**RC tecnicamente aprovado para produção.**  
**Go-live público condicionado a 1 pendência operacional de Auth no Supabase: habilitar Leaked Password Protection.**

## Evidências de produção

### Identidade do deploy

O endpoint `/api/health` confirmou em produção:

- `ok: true`
- `service: myst-ki-warriors`
- `release: 1.0.0-rc.1`
- `releaseStage: 16`
- `deployment.commit: 1eaabae80ab6a4ff32e2a8a602eef6a5f939bfd3`
- `deployment.branch: master`
- `deployment.serviceName: mysticwarriors-ohio`
- `deployment.externalUrl: https://mysticwarriors-ohio.onrender.com`
- `cloudAuthority: server`
- `database: ok`

Isso comprova que o Render está servindo exatamente o RC esperado, sem drift de commit.

### Rotas públicas

Validado em produção:

- `/` — landing page carregando com branding Myst Ki Warriors.
- `/jogar` — tela de acesso carregando e identificando Supabase Auth.
- `/ranking` — ranking público carregando dados ao vivo.
- `/como-jogar` — redirecionamento funcional para a Wiki.
- `/wiki` — documentação pública carregando.
- `/robots.txt` — sitemap apontando para o host canônico.
- `/sitemap.xml` — URLs canônicas do host de produção.

### Headers de segurança

Scan externo realizado em 23/09/2026 retornou nota **A+** e confirmou:

- HSTS: `max-age=31536000; includeSubDomains`
- CSP com `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` e `form-action 'self'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Permitted-Cross-Domain-Policies: none`

### CI do commit certificado

O commit `1eaabae8` concluiu o CI com sucesso.

O primeiro E2E do push no `master` encontrou o flake conhecido do Prisma/Bun (`Response from the Engine was empty`) durante uma leitura de saldo. O mesmo job foi reexecutado sem qualquer mudança de código e passou completamente.

Resultado final:

- Unitários e contratos ✅
- TypeScript ✅
- ESLint ✅
- Build de produção ✅
- Auditoria E2E principal ✅
- Loja e inventário E2E ✅
- Ameaça Universal / cooldown E2E ✅

## Supabase

O banco de produção permanece com o hardening das Etapas 12 e 13 aplicado.

O Advisor de segurança, consultado em 23/09/2026, ainda informa:

- **Leaked Password Protection Disabled** — pendência de go-live.
- Avisos de funções `SECURITY DEFINER` públicas/autenticadas já revisados nas etapas anteriores e mantidos somente onde fazem parte do contrato atual (ranking, snapshot público do World Boss e RPCs administrativas com checagem interna).
- Tabelas `admins` e `world_boss_snapshots` com RLS sem policy aparecem apenas como INFO; acesso direto segue fechado pelos grants aplicados.

## Única pendência antes do lançamento público

No painel do Supabase, habilitar **Leaked Password Protection** para Auth.

O painel exige autenticação interativa e não havia sessão/credenciais disponíveis durante esta certificação, portanto a configuração não foi alterada automaticamente.

Depois de habilitar:

1. Reexecutar o Supabase Security Advisor.
2. Confirmar que `auth_leaked_password_protection` não aparece mais.
3. Reexecutar o Production smoke contra o host público.
4. Com ambos verdes, o RC pode ser promovido de `1.0.0-rc.1` para o release público final.

## Status

**RC 1.0.0-rc.1: CERTIFICADO TECNICAMENTE**  
**GO-LIVE PÚBLICO: PENDENTE DE LEAKED PASSWORD PROTECTION**
