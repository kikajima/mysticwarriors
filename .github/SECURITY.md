# Security Policy

## Supported version

O branch `master` representa a versão suportada do Mystic Warriors.

## Reporting a vulnerability

Não publique credenciais, dados pessoais, exploits reproduzíveis ou detalhes de uma falha
em uma issue pública. Use **GitHub → Security → Report a vulnerability** para abrir um
relato privado (Private Vulnerability Reporting / Security Advisory).

Inclua, quando possível:

- rota ou componente afetado;
- impacto observado;
- passos mínimos para reprodução sem acessar dados de terceiros;
- versão/commit testado.

Nunca inclua tokens de sessão, senhas, chaves de API, dumps de banco ou dados de jogadores
no relatório.

## Secrets

Credenciais de banco, chaves secretas/service-role e tokens administrativos não devem ser
versionados. A aplicação cliente usa apenas configuração Supabase publicável via variáveis
`NEXT_PUBLIC_*`; segredos de infraestrutura permanecem somente no provedor de deploy.
