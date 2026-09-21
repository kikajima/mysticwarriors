# Política de Segurança — Mystic Warriors

## Segredos e variáveis

Valores com prefixo `NEXT_PUBLIC_` são enviados ao navegador e **não podem ser tratados como segredo**. No projeto, isso inclui somente a URL e a chave publicável/anon do Supabase e a URL pública do site.

Segredos server-side devem existir apenas no ambiente de produção (Render/Supabase) e nunca no Git:

- `DATABASE_URL`
- `GM_ADMIN_EXPORT_SECRET`
- qualquer chave futura de IA, e-mail transacional, observabilidade ou outro provedor privado.

O projeto **não deve usar** chaves `service_role` do Supabase no aplicativo.

## Chaves de IA

Nenhuma chave de OpenAI, Anthropic, Gemini/Google AI ou Hugging Face deve ser adicionada ao bundle ou aos arquivos versionados. Caso uma integração futura precise de IA, a chave deve ficar em variável server-side sem prefixo `NEXT_PUBLIC_`, acessada apenas por uma rota backend.

## Em caso de exposição

1. Revogue/rotacione a credencial no provedor imediatamente.
2. Atualize o segredo no ambiente de produção.
3. Remova a credencial do código atual.
4. Considere a credencial comprometida mesmo após removê-la do último commit, pois o histórico Git pode continuar contendo o valor.
5. Execute a suíte de segurança antes do próximo deploy.

## Relato de vulnerabilidade

Não publique detalhes exploráveis em issue pública antes da correção. Use um canal privado do mantenedor para relatar vulnerabilidades que permitam acesso indevido, alteração de progresso, vazamento de dados ou elevação administrativa.
