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
  hospital · equipamento/inventário · perfil e visualizações. Mensagem
  de bloqueio clara SÓ nos 3 casos negados. Vítima/alvo JAMAIS é bloqueado
  por estado (regra permanente). Nenhum agent futuro restringe ações
  liberadas desta matriz."** (2026-09-16 — 3ª ordem do dono)
- **Antes (v0.9.3–v0.9.25):** allowlist `MISSION_ALLOWED_ACTIONS` de 4
  ações (world_boss_attack, select_player, claim_mission, cancel_mission)
  — TUDO mais negado durante o trabalho: loja, guilda, hospital, PvP,
  coletas, equipamento, Shenron, cosméticos, talentos… (deny-by-default).
- **Agora (v0.16):** blocklist `MISSION_BLOCKED_ACTIONS` com EXATAMENTE 3
  ações (`battle`, `tournament_fight`) — allow-by-default. O
  handler de trabalho em si mantém o próprio erro `MISSION_IN_PROGRESS`
  ("Você já está em um trabalho!") para NÃO começar um segundo turno —
  invariante de slot único de trabalho, não matriz de ação.
- **Estado "EM LUTA" (atividade com duração) é invariante de sistema, não
  matriz:** uma atividade POR VEZ (`ACTIVITY_BLOCKED_ACTIONS`: train,
  battle, attack_player, mission, tournament_fight — não pode iniciar
  outra luta/trabalho no meio de um replay). Loja, guilda, hospital,
  perfil e TODAS as coletas seguem liberadas durante a luta.
- **Atacante vs vítima (invariante permanente, desde v0.9.20):** o
  ATACANTE é quem se sujeita às checagens de ocupação; o ALVO é sempre
  atacável esteja trabalhando/treinando/lutando. A v0.16 só AUMENTOU a
  liberdade do atacante (agora pode atacar durante o próprio trabalho).
- **UI espelha a matriz:** botões de loja/guilda/hospital/PvP/coleta/
  Shenron/cosméticos/talentos perderam o `disabled={… || onMission}`;
  PvE/torneio mantêm o bloqueio com MENSAGEM CLARA que lista o que
  segue liberado.
- **TESTES ANTI-DRIFT PERMANENTES** (`tests/occupation-matrix.test.ts`):
  trabalhando → comprar ok · doar ok · coletar ok · atacar boss ok ·
  atacar jogador ok · curar ok · desejar ok; trabalhando → treinar
  NEGADO · PvE NEGADO · torneio NEGADO; em luta → coletar ok; + teste de
  contrato dos SETS (exatamente 3 bloqueios de missão; claim_* ausentes
  dos dois sets). A WIKI publica a tabela consolidada ação × estado
  (seção "Ações, Custos e Ocupação") e o teste de contrato da wiki vigia.


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
- **UI global e minimizável:** o widget é montado no layout raiz e fica no
  canto inferior esquerdo, mas só faz polling enquanto estiver aberto.
- **Blindagem:** `tests/chat.test.ts` vigia persistência, unicidade do mute,
  presença global do widget e a existência do comando admin de limpeza.
