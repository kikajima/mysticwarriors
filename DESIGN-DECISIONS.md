# Atualização vigente — 16/09/2026 (prevalece sobre notas históricas abaixo)

- Energia de ações: máximo fixo de 100, independente de Ki. Ki de combate continua escalando normalmente.
- Trabalho permite treino, guilda, conquistas, chefe global e PvP. PvE comum e torneio continuam bloqueados durante trabalho.
- Alvo de PvP pode trabalhar ou estar offline; não adicionar imunidade por esses estados.
- Resultado visual de combate somente depois de todas as rodadas; uma atividade não deve abrir duas vezes.
- WorldBoss/WorldBossDamage são registros do SQLite do servidor, não snapshots individuais do Supabase. Preservar o volume persistente em qualquer deploy.

# Guerreiros Místicos — Registro de Decisões de Design

> **⚠️ NOTA DE INCIDENTE (2026-09-15, ~19:27):** a plataforma restaurou o
> ambiente para o checkpoint de 14/set 17:24 no MEIO da sessão v0.14. Todo o
> trabalho não-commitado de 15/set (v0.10 sistema completo de guildas →
> v0.13.1 verificação de reset) foi PERDIDO do disco — este arquivo incluso.
> O estado reconstruído aqui registra as decisões da v0.14 sobre a base que
> sobreviveu (v0.9.24/25). As decisões das versões perdidas estão
> resumidas no worklog (fonte: contexto da conversa); a reconstrução
> delas é decisão do dono.

## ⛔ GUILDA DE SISTEMA — EXTINTA PARA SEMPRE (v0.15, DECISÃO FINAL DO DONO)

- **"Guilda de sistema/semente automática NÃO EXISTE MAIS. O mundo começa
  com ZERO guildas — guildas só passam a existir quando jogadores as
  criarem. Nenhum agent futuro reimplanta seed de guilda por iniciativa
  própria."** (2026-09-15 — registrada por ordem direta do dono)
- **O mecanismo morreu no código E na cadeia de dados:** `ensureSystemGuild`
  foi DELETADO (src/lib/game/systemGuild.ts não existe mais), nenhuma rota
  garante guilda, e a migration `20260915210000_v015_kill_system_guild`
  apaga QUALQUER instância restante (membros → sem guilda, doações limpas
  na mão — sem FK nesta base —, linha morta) e **DROPA a coluna
  `Guild.isSystem`**: o conceito deixa de existir no banco. A produção não
  pode "nascer" com ela — nada na cadeia cria guilda (a criação era
  runtime, agora extinta).
- **A proteção "Tropa da Tartaruga não é excluível" foi REMOVIDA do painel
  admin** (obsoleta): TODA guilda listada é de jogador e TODA é excluível.
  O nome "Tropa da Tartaruga" está LIBERADO — qualquer jogador pode fundar
  a própria guilda com esse nome, sem conflito.
- **Mestre Kame** (líder bot da guilda extinta): volta a ser bot sem guilda
  (sparring do mundo, sem relação com guildas). Não faz parte do roster
  canônico de bots (`BOTS` em content/names.ts) — em bases novas ele não
  nasce; a ficção dele (loja, técnicas, itens da Escola da Tartaruga) é
  lore de mundo, não mecanismo de guilda.
- **Saída de guilda pelo último membro DISSOLVE a guilda e LIMPA AS DOAÇÕES
  na mesma transação** (v0.15 — mesma regra de erasure do painel:
  GuildDonation.guildId não tem FK nesta base; sem a limpeza manual nasceriam
  órfãs lógicas vigiadas pela matriz anti-órfã).

## Painel Admin — Exclusões Destrutivas (v0.14 · v0.15)

- **ADMIN ÚNICO por e-mail HARDCODED (v1 do sistema de permissão):**
  `ADMIN_EMAIL = 'alicomprasbbbb@gmail.com'` em `src/lib/adminIdentity.ts`
  — constante ÚNICA central, nunca espalhada. O MESMO valor vive na tabela
  `admins` do Supabase (`supabase-admin.sql` — fonte do `is_admin()`).
  Camadas em ordem: TRANSPORTE (Bearer token + RPC `is_admin`, modelo v0.9
  intacto) → AUTORIZAÇÃO (e-mail da sessão autenticada === `ADMIN_EMAIL`,
  resolvido server-side via `/auth/v1/user`). O front usa a MESMA constante
  para ESCONDER botões — o backend é a segurança real.
- **Semântica de status das rotas destrutivas:** sem token/token inválido →
  **404** (rota invisível, fail-safe das demais /api/admin); autenticado que
  não é o admin (is_admin false OU e-mail ≠ ADMIN_EMAIL) → **403**.
- **Exclusão de personagem — NUVEM PRIMEIRO, local depois:** se a nuvem
  falha, NADA morre (aborta limpo); se a nuvem morre e o local falha,
  'partial' reportado ALTO e o estado se auto-cura (a linha local re-espelha
  no próximo sync do dono). O caminho inverso deixaria o personagem
  ressuscitável pelo cloud-restore — o pior modo de falha.
- **RPC `admin_delete_personagem`** (`supabase-admin-delete.sql`): apaga SÓ o
  alvo (nunca a nuvem inteira), backup em `personagens_backup_reset` (a
  MESMA tabela do `admin_reset_cloud`), revalida o nome digitado NA PONTA,
  probe com confirmação ausente → 22023 (o padrão do pré-cheque do reset).
- **Líder de guilda excluído → AUTO-DISSOLUÇÃO com AVISO EXPLÍCITO** (decisão
  de UX): a guilda não pode ficar órfã; morre com o líder pela regra de
  erasure total, com o inventário completo avisado ANTES (na seção E no
  modal). Alternativa considerada e descartada: bloquear e exigir
  transferência prévia (dois passos, guilda headless no intervalo).
- **Erasure de guilda nesta base — limpeza MANUAL de doações:**
  `GuildDonation.guildId` NÃO tem FK (tabela da era v0.9.20 — a exata classe
  de bug que a FK Cascade da v0.12 matava, perdida no rollback). A exclusão
  limpa as doações NA MESMA transação, e a matriz anti-órfã as vigia com um
  check LÓGICO (LEFT JOIN igual, sem constraint).
- **PROTEÇÕES (server-side, todas auditadas como 'blocked'):** bots
  (conteúdo de sistema — tarefa de dev) · próprio personagem do admin
  (mensagem clara) · nome digitado ≠ nome do alvo (a confirmação dupla é
  validada no cliente, no servidor E na nuvem). *(v0.15: a proteção "líder
  da guilda do sistema" foi REMOVIDA — guilda de sistema não existe mais;
  líder de guilda comum segue disparando auto-dissolução avisada.)*
- **Personagem SÓ-NUVEM (v0.15):** a exclusão apaga a linha na nuvem E
  LIMPA a conta auth local ÓRFÃ quando ela é inerte (0 personagens locais E
  0 transações de carteira — ledger é accountability e preserva a linha;
  sessões caem pelo FK Cascade; o próximo login recria a conta sob demanda).
  O relatório e a auditoria registram o que aconteceu com a conta.
- **Verificação anti-órfã AUTOMÁTICA pós-exclusão:** a MESMA matriz da suíte
  (`src/lib/game/orphanCheck.ts` — fonte única, 17 FKs do DDL vivo + 1 check
  lógico de doações) roda DENTRO da operação. Órfão = operação reportada
  como FALHA (nunca silencia) — inclusive órfão PRÉ-EXISTENTE que não seja
  da operação (conservador e alto).
- **Auditoria (`AdminActionLog`):** tabela SEM FK NENHUMA por projeto —
  registro HISTÓRICO que sobrevive à morte do que registra E ao reset geral
  (accountability não morre com o mundo). Registra toda tentativa
  (ok/partial/failed/blocked) com timestamp, e-mail do admin, alvo, camadas
  (local/nuvem), resultado e detalhes (inventário do que morreu, gatilho,
  erros). Visível no painel (aba "Ações admin", `GET /api/admin/audit-log`).
  A guilda auto-dissolvida pela exclusão do líder ganha LINHA PRÓPRIA com
  `triggeredBy`.
- **Guildas NÃO são espelhadas na nuvem** (verificado: snapshots de
  personagem não carregam guildId) → camada cloud da exclusão de guilda =
  "not-mirrored" (registrado assim no log).
- **Online = atividade nos últimos 10 min** (heuristic por `updatedAt`):
  aviso na confirmação, NUNCA bloqueio ("permitir, mas avisar").
- **E2E contra mock de Supabase** (`mini-services/supabase-mock`, porta
  4010): o sandbox não tem credenciais do admin real — o dev server é
  apontado temporariamente ao mock (`NEXT_PUBLIC_SUPABASE_URL`), provando o
  fluxo COMPLETO no navegador (login real → painel → exclusão nas duas
  camadas → ranking → auditoria → mobile 390px) e devolvido à URL real em
  seguida. Tokens do mock são DETERMINÍSTICOS (sobrevivem a hot-reload) e o
  CORS ecoa os headers pedidos (`content-profile` do supabase-js travava a
  lista fechada).

## Painel Admin (v0.9 — contexto preservado)

- Painel existe SOMENTE para a conta confirmada pela RPC `is_admin()`
  (security definer, tabela `admins` sem políticas de RLS). Atalho F2.
- Todas as ações operam sobre PERSONAGENS (não contas); o e-mail do dono é
  metadado informativo.
- Reset geral (v0.9.10): servidor + nuvem num clique, com pré-cheque da RPC
  `admin_reset_cloud` (412 se faltar — nada é apagado pela metade).

## ~~Guilda pública do sistema (v0.9.24)~~ — REVERTIDA pela v0.15

- ~~"Tropa da Tartaruga": bootstrap do mundo (`ensureSystemGuild` na primeira
  visita à tela de guildas), sempre presente, sem vantagens especiais.~~
  **DECISÃO REVERTIDA EM 2026-09-15 (v0.15):** a guilda de sistema foi
  EXTINTA por decisão final do dono (ver a seção ⛔ no topo). O
  playtest que motivou a v0.9.24 (0 guildas no early game) deixou de ser
  resolvido por seed automática — o estado natural do mundo agora É começar
  com zero guildas, e a tela de guildas trata isso como estado válido
  (empty state convidativo).

## 🚫 GÊNERO DO JOGADOR — REMOVIDO DEFINITIVAMENTE (v0.16, 3ª ordem)

- **"Gênero não existe mais como mecânica do jogador. A criação de
  personagem é nome + raça. Bots NPC mantêm identidade de lore (nomes
  femininos/masculinos do mundo continuam) — só o campo mecânico do
  jogador sai. Nenhum agent futuro reintroduz campo de gênero na criação,
  no schema, na view, no snapshot de nuvem ou na UI."** (2026-09-16 —
  3ª ordem do dono; a 1ª tentativa v0.11 morreu no rollback de plataforma
  de 15/set e foi REFEITA agora com blindagem anti-desaparecimento)
- **Camada por camada, tudo extirpado:** schema Prisma (migration
  `20260916110000_v016_remove_gender` DROPA a coluna `Player.gender`);
  rota de criação (zod sem o campo — corpo legado com `gender` é aceito e
  ignorado, cliente antigo não quebra); `PlayerView` sem o campo;
  `CharacterIdentity` = id+nome+raça; snapshot de nuvem v3 SEM gender
  (leitura TOLERANTE: snapshots legados no `estado` JSONB que ainda têm o
  campo são simplesmente ignorados; o próximo save sobrescreve sem ele —
  `supabase-remove-gender.sql` higieniza a produção); `CloudCharacterSnapshot`
  sem o campo; `initialCloudCharacterState` sem o campo; erros
  `GENDER_REQUIRED`/`GENDER_INVALID` removidos do mapa de erros; evento
  analytics `gender_set` removido dos tipos (histórico gravado permanece
  intocado — decisão de dados); UI: passo 3 da criação, `GenderBadge`,
  `RACE_EMOJI_GENDER`, `GENDER_LABEL/SYMBOL`, selo ♂/♀ no Dashboard,
  CharacterSelect e AvatarDialog — tudo removido.
- **A nuvem `personagens` NUNCA teve coluna gender** (gênero vivia só no
  JSONB `estado`) — a produção nasce sem a coluna por construção; o script
  SQL remove o campo dos snapshots existentes (higiene, não bloqueante).
- **Texto voltado ao JOGADOR neutralizado** (wiki, políticas, UI) — nomes
  de lore do mundo (bots) seguem como são.
- **TESTE ANTI-DRIFT PERMANENTE** (`tests/occupation-matrix.test.ts`):
  criação SEM campo de gênero + `PlayerView` sem a propriedade + zod da
  rota de criação não menciona gender — falha vermelha se o campo voltar.

## 🎁 COLETA DE RECOMPENSA — NUNCA BLOQUEADA POR OCUPAÇÃO (v0.16, 3ª ordem)

- **"Coleta de recompensa de QUALQUER tipo (conquista, diária, missão,
  torneio disponível) é NUNCA bloqueada por ocupação — nem trabalho, nem
  treino, nem batalha pendente. Coleta não entra no slot de atividade e
  não perturba atividade em curso. Nenhum agent futuro reintroduz bloqueio
  de coleta por estado de ocupação."** (2026-09-16 — 3ª ordem do dono)
- **Implementação:** as ações `claim_mission`, `claim_quest`,
  `claim_achievement` NÃO constam em `MISSION_BLOCKED_ACTIONS` nem em
  `ACTIVITY_BLOCKED_ACTIONS` (por design — é exatamente o que as libera em
  TODOS os estados). Idempotência vigente mantida (double-click = 1 coleta
  — atomicidade server-side + guarda otimista da UI). Caso especial
  coberto: conquista de critério de treino desbloqueando DURANTE o treino
  pode ser coletada no meio (o treino é instantâneo desde a v0.9, e coleta
  durante atividade de batalha segue liberada).
- **UI:** botões de coleta (conquistas no AchievementsPanel, quests no
  ProfessionsPanel, missão no ProfessionsPanel) não têm mais `disabled` por
  `onMission`/atividade — só por busy de requisição em voo e estado já
  coletado.

## 📋 MATRIZ DE OCUPAÇÃO DEFINITIVA (v0.16, 3ª ordem)

- **"TRABALHANDO bloqueia APENAS: combate PvE contra inimigos
  (EXCETO Chefe Global) · torneio. Tudo mais LIBERADO: PvP · Chefe Global ·
  loja (comprar/usar) · gestão completa de guilda · coletar recompensas ·
  equipamento/inventário · perfil e visualizações. Mensagem
  de bloqueio clara SÓ nos 3 casos negados. Vítima/alvo JAMAIS é bloqueado
  por estado (regra permanente). Nenhum agent futuro restringe ações
  liberadas desta matriz."** (2026-09-16 — 3ª ordem do dono)
- **Antes (v0.9.3–v0.9.25):** allowlist `MISSION_ALLOWED_ACTIONS` de 4
  ações (world_boss_attack, select_player, claim_mission, cancel_mission)
  — TUDO mais negado durante o trabalho: loja, guilda, hospital, PvP,
  coletas, equipamento, Shenron, cosméticos, talentos… (deny-by-default).
- **Agora (v0.16):** blocklist `MISSION_BLOCKED_ACTIONS` com EXATAMENTE 3
  ações (`battle`, `tournament_fight`, `search_dragon_ball`) — allow-by-default. O
  handler de trabalho em si mantém o próprio erro `MISSION_IN_PROGRESS`
  ("Você já está em um trabalho!") para NÃO começar um segundo turno —
  invariante de slot único de trabalho, não matriz de ação.
- **Estado "EM LUTA" (atividade com duração) é invariante de sistema, não
  matriz:** uma atividade POR VEZ (`ACTIVITY_BLOCKED_ACTIONS`: train,
  battle, attack_player, mission, tournament_fight — não pode iniciar
  outra luta/trabalho no meio de um replay). Loja, guilda, perfil e TODAS as coletas seguem liberadas durante a luta.
- **Atacante vs vítima (invariante permanente, desde v0.9.20):** o
  ATACANTE é quem se sujeita às checagens de ocupação; o ALVO é sempre
  atacável esteja trabalhando/treinando/lutando. A v0.16 só AUMENTOU a
  liberdade do atacante (agora pode atacar durante o próprio trabalho).
- **UI espelha a matriz:** botões de loja/guilda/PvP/coleta/Shenron/cosméticos/talentos perderam o `disabled={… || onMission}`;
  PvE/torneio mantêm o bloqueio com MENSAGEM CLARA que lista o que
  segue liberado.
- **TESTES ANTI-DRIFT PERMANENTES** (`tests/occupation-matrix.test.ts`):
  trabalhando → comprar ok · doar ok · coletar ok · atacar boss ok ·
  atacar jogador ok · desejar ok; trabalhando → treinar
  NEGADO · PvE NEGADO · torneio NEGADO; em luta → coletar ok; + teste de
  contrato dos SETS (exatamente 3 bloqueios de missão; claim_* ausentes
  dos dois sets). A WIKI publica a tabela consolidada ação × estado
  (seção "Ações, Custos e Ocupação") e o teste de contrato da wiki vigia.


- **HOSPITAL DO DR. BRIEF REMOVIDO:** não existe mais ação manual de cura total por Zeni. Um nocaute ainda resgata o guerreiro com 1 HP, mas a volta ao combate depende de regeneração natural ou itens de cura. A decisão elimina o ciclo de cura instantânea que permitia lutar sem intervalo. (2026-09-20)

## 💬 CHAT PERSISTENTE — HISTÓRICO FORA DAS CASCATAS (2026-09-19)

- **Canais permanentes:** Global, Guilda e Privado. Mensagens privadas são
  assíncronas: o destinatário pode estar offline e lê o histórico quando
  voltar.
- **Fonte de verdade:** tabelas `game."ChatMessage"` e `game."ChatMute"`
  no PostgreSQL autoritativo. O Render não guarda histórico em memória ou
  disco efêmero.
- **Histórico deliberadamente SEM FK destrutiva para Player/Guild:** nomes e
  ids de remetente/destinatário/guilda são snapshots históricos. Excluir um
  personagem, dissolver uma guilda, resetar o mundo ou publicar um deploy
  NÃO apaga mensagens antigas.
- **Regra de exclusão:** `ChatMessage` só pode ser limpo pelo comando
  administrativo explícito do painel, mediante confirmação literal
  `LIMPAR CHAT`. A limpeza é registrada em `AdminActionLog`.
- **Silenciamento é unilateral:** cada personagem mantém sua própria lista
  em `ChatMute`; silenciar oculta mensagens daquele remetente para quem o
  silenciou, sem apagar o histórico e sem afetar outros jogadores. Remover
  o silêncio torna o histórico visível novamente.
- **UI minimizável apenas dentro do jogo:** o widget fica no canto inferior
  esquerdo quando existe um personagem ativo. Login, criação e seleção de
  personagem NÃO montam o chat e não fazem polling.
- **Troca de personagem sem espera:** o widget recebe o personagem ativo
  diretamente da tela do jogo e toda chamada de chat envia `playerId`
  explicitamente; o servidor revalida que ele pertence à conta. Assim o chat
  troca junto com a UI, sem aguardar o polling de `Account.activePlayerId`.
- **Polling silencioso:** a atualização de 4s nunca liga o estado visual
  "Carregando…"; esse indicador só aparece no carregamento inicial real de
  um canal vazio.
- **Diretório privado:** ao focar a busca, a lista de guerreiros já está
  disponível e o filtro acontece localmente conforme o nome é digitado.
- **Blindagem:** `tests/chat.test.ts` vigia persistência, unicidade do mute,
  ausência do chat no layout público, montagem somente no jogo, sincronização
  por `playerId`, diretório privado e o comando admin de limpeza.


## ⚡ LATÊNCIA DE AÇÕES + REGEN AO VIVO (2026-09-19)

- **PostgreSQL nunca usa fila global de ações do processo.** A antiga
  `actionChain` global existia exclusivamente para o SQLite single-writer.
  Em produção PostgreSQL, serialização é somente por `playerId`: ações do
  mesmo guerreiro continuam ordenadas; guerreiros diferentes podem agir em
  paralelo. Testes SQLite preservam a fila global para continuar cobrindo
  contenção/P1008.
- **Caminho quente não faz manutenção redundante:** criação/verificação das
  quests do período é cacheada por personagem+período no processo e
  `ensureBalanceVersion` não bloqueia mais a resposta da ação.
- **Regen sem write vazio:** `Player` só recebe UPDATE de HP/energia/relógios
  quando `applyRegen()` realmente alterou algum valor.
- **Estado pessoal paraleliza leituras independentes** de ranking, total de
  jogadores, quests, atividade/guilda e convites, evitando somar várias
  latências de rede sequenciais contra o PostgreSQL remoto.
- **Energia e vida aparecem ao vivo no cliente:** a UI projeta a regeneração
  a cada 1s usando exclusivamente `lastRegenAt`, `lastRegenHpAt` e os
  intervalos enviados pelo servidor. Isso é apenas apresentação; toda ação
  segue recalculando/validando a regeneração no servidor autoritativo.
- **Sem banco de tempo ao gastar a partir de 100%:** o delta otimista reinicia
  o relógio local de energia quando o jogador gasta partindo do máximo,
  espelhando a regra do servidor.
- **Observabilidade:** respostas de `/api/game/action` expõem
  `Server-Timing` (total/fila/execução) e ações acima de 1s geram log
  `[perf][action]` no Render para diagnóstico objetivo.


## 🚀 ROUND-TRIPS REMOTOS — CAMINHO QUENTE (2026-09-19)

Medições reais em produção após a primeira rodada de otimização ainda mostraram
~1,7–2,5s para iniciar PvE, ~3s para treino, ~2s para equipar técnica e
~2,5s para abrir a Ameaça Universal. O PostgreSQL executava as queries em
poucos milissegundos; a parcela dominante era o número de viagens
Render↔Supabase.

Decisões permanentes desta rodada:

- **RequestDedup não faz SELECT antes do INSERT em request novo.** UUID novo é
  o caso normal. O INSERT único é a primeira operação; replay é detectado por
  P2002 e só então lê o resultado armazenado.
- **Higiene de dedup não bloqueia clique.** DELETE probabilístico de linhas
  expiradas roda fora do caminho crítico.
- **Pós-commit em paralelo:** cache do resultado idempotente e releitura fresca
  do Player acontecem simultaneamente.
- **Treino instantâneo não relê o Player** dentro da mesma transação quando o
  executor acabou de carregá-lo.
- **Ameaça Universal tem fast path somente leitura.** Boss ativo com `endsAt`
  futuro não executa manutenção/ensure em cada abertura/ataque.
- **Contagem de participantes do boss vem em `_count`** junto do boss, sem
  query separada.
- **Ataque ao boss reutiliza a guilda já carregada em `requirePlayer`** e
  atualiza energia + desgaste de HP no mesmo UPDATE.
- **Boss e temporada carregam em paralelo**, e a temporada também possui
  fast path de leitura quando já existe uma temporada ativa válida.

A regra de segurança permanece: otimizações não removem atomicidade,
idempotência, cooldown condicional ou autoridade do servidor.


## 🔧 OFICINA / CRAFTING COMPLETO (2026-09-20)

- **Sete slots reais de equipamento:** Cabeça, Punhos, Torso, Acessório,
  Arma, Pernas e Botas. O slot salvo precisa coincidir com a categoria do
  item; parser local e restauração da nuvem descartam combinações inválidas.
  Todos os sete slots entram no cálculo autoritativo de combate.
- **Progressão craftável completa:** cada slot possui uma linha de
  equipamentos Tier 1–5. Tier 1 é entrada livre; T2/T3/T4/T5 usam a escada
  profissional Nv. 2/4/6/8 e receitas avançadas combinam duas ou mais
  profissões.
- **Materiais também têm progressão:** T1/T2/T3/T4/T5 passam a integrar o
  pool de drop apenas nos níveis profissionais 1/2/4/6/8. Um personagem não
  encontra material endgame no início da carreira.
- **Blueprints acadêmicos são parte da cadeia, não decoração:** itens
  principais Tier 3+ consomem projeto acadêmico; o Acadêmico também reduz o
  tempo de fabricação em 1% por nível, limitado a 10%.
- **Uma fabricação por personagem:** a fila continua deliberadamente com um
  único trabalho. Ela avança offline e em paralelo a trabalho, loja, guilda
  e outras ações liberadas pela matriz de ocupação.
- **Lotes são explícitos e server-authoritative:** somente receitas que
  declaram `maxBatch` aceitam quantidade maior que 1. Custo, ingredientes,
  saída e duração escalam pela quantidade e são revalidados no servidor.
- **Itens permanentes são únicos:** equipamentos e itens passivos de treino
  feitos na Oficina não podem ser fabricados em duplicata. Consumíveis e
  projetos continuam empilháveis.
- **Cancelamento é reversível antes do término:** cancelar uma fabricação em
  andamento devolve integralmente os ingredientes e o Zeni consumidos. Job
  já concluído não pode ser cancelado; deve ser coletado. O reembolso passa
  pelo ledger da economia (`type=refund`, `source=craft_cancel`).
- **Coleta é exatamente uma vez:** a quantidade armazenada no `CraftJob`
  precisa ser compatível com o catálogo e com o limite de lote antes de a
  saída ser concedida; o job é reivindicado atomicamente antes do grant.
- **Persistência integral:** estoque relacional, lote em andamento, timestamps
  e os sete slots sobrevivem ao snapshot/restore da nuvem. Nenhuma migration
  adicional é necessária para os slots porque eles vivem no JSON de itens.
- **Itens fabricados não entram na loja NPC:** `price=0` significa origem
  exclusiva da Oficina, não compra grátis. A interface do Inventário é o
  lugar para equipar/usar os resultados.


## 🔔 NOTIFICAÇÕES PERSISTENTES E SUPORTE ADMIN (2026-09-20)

- **Roubo de Esfera é um evento persistente:** quando uma estrela muda de dono
  por vitória PvP, atacante e vítima recebem uma `PlayerNotification`.
  O atacante vê o pop-up somente depois do replay terminar; a vítima recebe
  o aviso no próximo acesso mesmo se estava offline no momento do duelo.
- **Entrega confirmada pelo cliente:** ler uma notificação não a consome.
  Ela só recebe `deliveredAt` depois que o navegador exibiu o pop-up e
  confirmou via endpoint autenticado. Isso evita perder avisos por queda de rede.
- **Esferas continuam globais:** o admin escolhe a estrela exata (1–7), mas
  só pode conceder uma estrela livre. O painel mostra o dono atual de cada
  estrela e não transforma snapshot de nuvem em fonte de posse.
- **Acelerar atividade substitui "Completar profissão/treino":** a ação
  encurta trabalho, fabricação e qualquer `Activity` temporizada
  (PvE/PvP/torneio/Busca pelas Esferas). Atividades server-side são
  resolvidas imediatamente; trabalho e crafting ficam prontos para a coleta
  normal, sem inventar recompensa administrativa.
- **Suporte de crafting:** o admin pode conceder materiais profissionais,
  projetos/blueprints e itens exclusivos da Oficina, sempre validados contra
  os catálogos reais. Itens permanentes continuam únicos e consumíveis
  respeitam os limites de pilha.
- **Ferramenta adicional de suporte:** restaurar vida total foi adicionada
  ao lado de restaurar energia, útil para recuperar personagens presos em
  estados de teste/suporte sem alterar progressão.


## Progressão sem teto e Busca pelas Esferas sem energia — 2026-09-20

- **ATRIBUTOS SEM TETO DE GAMEPLAY:** Força, Defesa, Velocidade e Ki não param mais em 999. `addStat` apenas normaliza para inteiro não-negativo. O banco autoritativo usa `DOUBLE PRECISION` para atributos, HP e energia, evitando o antigo limite de `INTEGER` conforme a progressão cresce.
- **BUSCA PELAS ESFERAS CUSTA 0 ENERGIA:** a duração de 1h/2h/4h/8h/12h continua sendo o custo temporal e a chance continua limitada a 50%, mas iniciar ou cancelar uma busca não debita energia e não progride quests de energia gasta.
- **TRANSFORMAÇÕES EXPLICAM O EFEITO:** além do texto de lore, o card mostra os multiplicadores ativos de combate e os bônus permanentes concedidos ao desbloquear, seguindo o mesmo princípio de clareza usado nos Talentos.
