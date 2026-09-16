# Correções sobre o arquivo atualizado (3).tar

Substitua somente os arquivos deste ZIP, preservando suas pastas. Publique o código pelo fluxo normal da hospedagem. Não importe esses arquivos no SQLite. Não há migração de banco nem atualização de SQL do Supabase neste pacote.

## Alterações

- Energia máxima de ações fixada em 100 (valor inicial já adotado pelo projeto). Ki continua aumentando poder de combate. Valores legados acima do máximo são limitados no processamento de regeneração; não há reposição de energia gasta.
- Treino permitido durante o trabalho no servidor e na tela. Guilda, recompensas, chefe e PvP continuam permitidos. O alvo de PvP já podia trabalhar/estar offline; essa regra foi preservada.
- Identificador de atividade impede abrir novamente o combate recebido por ação/polling. Trava síncrona impede duplo clique antes da atualização do estado React. Estado do jogador é adiado antes de abrir a animação, e o resultado só aparece após revelar todas as rodadas e terminar o prazo do servidor.
- Painel do chefe atualiza após ataque bem-sucedido, periodicamente e ao retornar à aba. Respostas antigas não substituem respostas mais recentes. Consulta pessoal sem sessão válida informa erro em vez de mostrar dano zero como se fosse uma consulta pública.
- Textos e regras documentadas atualizados para evitar reintroduzir bloqueio de treino ou energia por Ki.

## Chefe global: limite desta correção

WorldBoss/WorldBossDamage continuam no SQLite do servidor. O código já faz a gravação em transação; este trabalho não demonstrou perda nessa transação nem migrou o mundo para o Supabase. Sem acesso ao ambiente publicado, não foi possível verificar reinício/deploy ou a configuração do volume persistente.

Se o dano desaparece após reinício/deploy, verificar no servidor o DATABASE_URL e o caminho retornado por resolveDbFilePath(). Ambos devem continuar apontando para o mesmo banco em volume persistente. O projeto atual tem fallbacks para cópias db/custom.db e .next/standalone/db/custom.db; uma cópia antiga pode conter mundo/dano antigos. Não substituir o banco ativo por um banco do pacote e não iniciar instâncias independentes com bancos locais diferentes.

## Validação executada

- Sintaxe de 13 arquivos TS/TSX alterados, via TypeScript 5.9.3.
- Cálculo real de atributos com quatro valores de Ki: energia sempre 100, poder de Ki cresce.
- Onze cenários da matriz de trabalho.
- Componente React real do diálogo (filho visual substituído no teste): resultado oculto até três rodadas; segunda batalha começa com resultado oculto.
- Callback real de abertura: resposta da ação + polling + JSON duplicado abrem uma única batalha.

Testes adicionais Bun incluídos em tests/energy-work-regression.test.ts. A suíte Bun/Prisma completa e o build Next.js não foram executados. O pacote não foi publicado e nenhum dado de produção foi alterado.
