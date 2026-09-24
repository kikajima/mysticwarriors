# Myst Ki Warriors 1.0.0

Data de promoção: 23/09/2026

## Status

Esta é a primeira versão pública estável do Myst Ki Warriors.

A versão `1.0.0` é uma promoção direta do Release Candidate `1.0.0-rc.1` certificado na Etapa 17. Não há alteração de gameplay entre o RC certificado e esta promoção; a Etapa 18 altera apenas a identidade oficial de release, os contratos de validação e a documentação operacional.

## Base certificada

O RC utilizado como base foi certificado em produção no Render com:

- release: `1.0.0-rc.1`
- commit: `1eaabae80ab6a4ff32e2a8a602eef6a5f939bfd3`
- branch: `master`
- banco: `ok`
- cloud authority: `server`
- headers de segurança: nota A+
- CI e E2E: verdes

A evidência completa permanece em `RELEASE-CERTIFICATION.md`.

## O que entra no 1.0.0

- progressão persistente e server-authoritative;
- autenticação e persistência em nuvem via Supabase;
- PvE, PvP, torneio e Ameaça Universal;
- profissões, guildas, amizade e chat persistente;
- inventário, equipamentos, loja, Oficina e crafting;
- mercado P2P;
- ranking público;
- Chaves do Horizonte e sistemas globais;
- cosméticos;
- Wiki e documentação pública;
- hardening de segurança das Etapas 12 e 13;
- health check com identidade real de deploy;
- smoke de produção que valida versão, SHA, banco, SEO e headers.

## Segurança e plano Free

O projeto está operando no plano Free do Supabase.

`Leaked Password Protection` não está disponível nesse plano. O aviso correspondente do Security Advisor é um risco conhecido e aceito, compensado por:

- senha mínima de 8 caracteres;
- exigência de minúscula, maiúscula, número e símbolo;
- Secure password change;
- exigência da senha atual ao trocar a senha;
- rate limiting;
- RLS/grants restritos;
- backend autoritativo;
- hardening de Storage, avatar, sessões e endpoints administrativos.

Se o projeto migrar para um plano que ofereça Leaked Password Protection, o recurso deve ser habilitado.

## Critério de publicação

O release `1.0.0` só deve ser considerado efetivamente publicado quando o Render responder em `/api/health` com:

- `release: "1.0.0"`;
- `releaseStage: 18`;
- `deployment.branch: "master"`;
- `deployment.commit` igual ao commit final da promoção;
- `database: "ok"`;
- `cloudAuthority: "server"`.

Depois do deploy, executar o workflow **Production smoke** contra o host oficial.
