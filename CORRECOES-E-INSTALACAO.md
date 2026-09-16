# Mystic Warriors — correções e aplicação

## Aplicar no projeto atual

1. Faça uma cópia do projeto atual. Extraia `mystic-warriors-alterados.zip` na raiz, substituindo os arquivos de mesmo caminho.
2. Preserve seu `.env` e a pasta `db/`. Esses arquivos privados não acompanham os ZIPs. O arquivo completo contém o código-fonte; para abrir uma instalação local nova com seus jogadores, use o banco e os avatares do projeto original.
3. No `.env` ou nas variáveis privadas da hospedagem, adicione `ADMIN_EMAIL` com o e-mail da sua conta administradora. Ela também precisa continuar autorizada em `public.admins` no Supabase. Sem essa configuração, o painel administrativo nega acesso.
4. Na raiz: `bun install --frozen-lockfile`, `bun run db:generate` e `bun run dev` para o preview local.

## Antes de publicar

- SQLite e SQL do Supabase são bancos diferentes. Não cole arquivos TypeScript, scripts de shell ou SQL do Supabase no editor SQLite.
- Monte um volume persistente no servidor. Restaure nele um backup consistente do banco ativo e os avatares antes do início. Use backup do SQLite; não copie somente o arquivo `.db` enquanto houver gravações/WAL ativos.
- Configure `DATABASE_URL=file:/data/mystic-warriors/custom.db` (ajuste ao volume real). O arquivo deve existir fora da pasta da aplicação. Configuração ausente ou arquivo inexistente causa erro, em vez de selecionar silenciosamente outro banco.
- Configure também `ADMIN_EMAIL`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`; o modelo está em `.env.example`. As variáveis NEXT_PUBLIC devem existir no build. Nunca coloque uma service_role nelas.
- Rode `bun run build` e inicie com `bun run start`. Migrações pendentes são aplicadas pelo mecanismo de inicialização existente. Nenhum reset é necessário.
- O caminho externo não cria um volume: a hospedagem precisa preservar esse volume entre reinícios e deploys. Use uma instância de aplicação com SQLite compartilhado localmente; múltiplas réplicas independentes teriam bancos diferentes.
- O pacote de deploy não inclui mais banco, snapshots ou segredos. A restauração automática por “quantidade de contas” foi desativada em produção. Os scripts de publicação da plataforma seguem a mesma regra.
- GitHub guarda código; acesso remoto exige hospedar o servidor. Este trabalho não publica nem migra o ambiente de produção.

## O que foi corrigido

- Produção exige caminho explícito para o SQLite e não adota uma cópia antiga por fallback ou reconciliação de seed.
- Builds deixam de embutir dados e configurações privadas, inclusive nos scripts da plataforma.
- E-mail administrativo saiu do código público e passou para configuração privada. A interface consulta a autorização no servidor, que mantém a verificação de administrador do Supabase.
- Wiki e testes antigos foram alinhados à permissão de treinar enquanto trabalha e ao limite fixo de 100 de energia, independente de Ki.
- Foram adicionados testes para configuração de produção, identidade administrativa e persistência do dano após reabrir o mesmo SQLite.

## O que já estava correto no RAR e foi preservado

- Energia máxima de ações em 100; Ki não aumenta essa energia.
- Treino, PvP, chefe, guildas e coletas permitidos durante trabalho; PvE e torneio permanecem bloqueados durante o turno.
- Jogador pode ser alvo de PvP trabalhando ou offline, respeitando as demais regras de combate existentes.
- Proteções contra replay duplicado e resultado visual antecipado; controle de respostas antigas no painel do chefe.
- Remoção de gênero e guildas de sistema já presente no código e nas migrações do SQLite fornecido. Os relatórios anexos não comprovavam ausência dessas implementações.
- Exclusão administrativa limpa doações dentro da transação; snapshots legados não restauram gênero/guilda obsoletos.

## Validação realizada

- 461 testes automatizados passaram, sem falhas.
- Verificação TypeScript e build de produção concluídos sem erros.
- 53 verificações HTTP locais passaram: sessões, isolamento entre contas, economia, combate/PvP, recompensas, chefe, guildas e ledger. Servidor usado nessa auditoria: Node com o build standalone.
- A rota de capacidades administrativas sem credenciais retornou 404, conforme a política de ocultar o painel.
- Registro de dano/HP do chefe permaneceu após desconectar e reconectar ao mesmo arquivo SQLite de teste.
- Testes executados com bancos temporários, sem alteração do banco ativo de produção. O arquivo principal do banco anexado manteve o mesmo SHA-256.

Ainda depende do ambiente de destino: confirmar preservação do volume após redeploy real, autenticação administrativa com uma sessão válida do Supabase e inspeção visual do replay com latência. O teste de reabertura do SQLite não substitui esse teste de hospedagem.
