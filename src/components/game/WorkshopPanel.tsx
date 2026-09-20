'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayerView } from '@/lib/game/types';
import {
  CRAFT_RECIPES,
  CRAFT_TIER_PROFESSION_LEVEL,
  getCraftStackItem,
  getCraftedItem,
} from '@/lib/game/content/crafting';
import { getProfession, getProfessionMaterial } from '@/lib/game/content/world';
import {
  academicCraftTimeMultiplier,
  professionLevel,
} from '@/lib/game/professionCareer';
import { useServerNow } from '@/lib/game/clock';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import { fetchPanelJson, LoadFail } from './PanelLoad';
import { Coins, Clock3, GraduationCap, Package, Wrench } from 'lucide-react';

interface InventoryRow {
  itemId: string;
  quantity: number;
  name: string;
  icon: string;
  tier: number | null;
  rarity: string | null;
}

interface CraftJobRow {
  id: string;
  recipeId: string;
  outputItemId: string;
  outputQuantity: number;
  outputName: string;
  outputIcon: string;
  academicLevelStart: number;
  startedAt: string;
  endsAt: string;
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function countdown(ms: number): string {
  if (ms <= 0) return 'pronto para coletar';
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function WorkshopPanel({
  player,
  onAction,
  busy,
  embedded = false,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => void | Promise<boolean>;
  busy: boolean;
  embedded?: boolean;
}) {
  const [inventory, setInventory] = useState<InventoryRow[] | null>(null);
  const [job, setJob] = useState<CraftJobRow | null>(null);
  const [batchQty, setBatchQty] = useState<Record<string, number>>({});
  const [tierFilter, setTierFilter] = useState<'all' | 1 | 2 | 3 | 4 | 5>('all');
  const [failed, setFailed] = useState(false);
  const now = useServerNow(500);

  const load = useCallback(async () => {
    setFailed(false);
    const url = `/api/game/workshop?playerId=${player.id}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // A Oficina depende de sessão + personagem + duas leituras remotas.
        // Em cold start do Render/Supabase, 8s pode ser pouco: a segunda
        // tentativa ganha uma janela maior antes de mostrar erro ao jogador.
        const res = await fetchPanelJson(url, attempt === 0 ? 8_000 : 12_000);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setInventory(Array.isArray(data.inventory) ? data.inventory : []);
        setJob(data.job ?? null);
        return;
      } catch {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          continue;
        }
      }
    }
    setFailed(true);
  }, [player.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => new Map((inventory ?? []).map((row) => [row.itemId, row.quantity])),
    [inventory]
  );

  const academic = player.professions?.academico;
  const academicLevel = academic && academic.lifetimeHours > 0 ? professionLevel(academic) : 0;
  const craftMult = academicCraftTimeMultiplier(academicLevel);

  const runAction = async (payload: Record<string, unknown>) => {
    const ok = await onAction(payload);
    if (ok !== false) await load();
  };

  const remaining = job ? new Date(job.endsAt).getTime() - now : 0;
  const totalMs = job
    ? Math.max(1, new Date(job.endsAt).getTime() - new Date(job.startedAt).getTime())
    : 1;
  const progress = job ? Math.max(0, Math.min(100, ((totalMs - Math.max(0, remaining)) / totalMs) * 100)) : 0;

  const byTierThenName = (a: (typeof CRAFT_RECIPES)[number], b: (typeof CRAFT_RECIPES)[number]) =>
    a.tier - b.tier || a.name.localeCompare(b.name, 'pt-BR');
  const matchesTier = (recipe: (typeof CRAFT_RECIPES)[number]) =>
    tierFilter === 'all' || recipe.tier === tierFilter;
  const blueprints = CRAFT_RECIPES.filter((r) => r.requiresAcademic && matchesTier(r)).sort(byTierThenName);
  const mainRecipes = CRAFT_RECIPES.filter((r) => !r.requiresAcademic && matchesTier(r)).sort(byTierThenName);

  const renderRecipe = (recipe: (typeof CRAFT_RECIPES)[number]) => {
    const output = getCraftedItem(recipe.outputItemId) ?? getCraftStackItem(recipe.outputItemId);
    const academicOk = !recipe.requiresAcademic || academicLevel > 0;
    const maxBatch = Math.max(1, recipe.maxBatch ?? 1);
    const quantity = Math.max(1, Math.min(maxBatch, batchQty[recipe.id] ?? 1));
    const totalCost = recipe.costZeni * quantity;
    const professionRequirements = (recipe.professionRequirements ?? []).map((requirement) => {
      const def = getProfession(requirement.professionId);
      const progress = player.professions?.[requirement.professionId];
      const currentLevel =
        progress && progress.lifetimeHours > 0
          ? professionLevel(progress)
          : 0;
      return {
        ...requirement,
        currentLevel,
        name: def?.name ?? requirement.professionId,
        icon: def?.icon ?? '📚',
        ok: currentLevel >= requirement.level,
      };
    });
    const professionRequirementsOk = professionRequirements.every((requirement) => requirement.ok);
    const ingredientsOk = recipe.ingredients.every(
      (i) => (counts.get(i.itemId) ?? 0) >= i.quantity * quantity
    );
    const canStart =
      !job &&
      academicOk &&
      professionRequirementsOk &&
      ingredientsOk &&
      player.zeni >= totalCost &&
      !busy;
    const effectiveMin = Math.ceil(recipe.baseDurationMin * craftMult * quantity);

    return (
      <GameCard key={recipe.id} className="p-4">
        <div className="flex items-start gap-3">
          <div className="text-3xl" aria-hidden>{recipe.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-amber-100">{recipe.name}</h3>
              <Chip className="bg-orange-950/50 text-orange-300 border-orange-800/50">Tier {recipe.tier}</Chip>
              {recipe.requiresAcademic && (
                <Chip className="bg-sky-950/50 text-sky-300 border-sky-800/50">Acadêmico</Chip>
              )}
              <Chip
                className={
                  academicOk && professionRequirementsOk
                    ? ingredientsOk && player.zeni >= totalCost
                      ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50'
                      : 'bg-yellow-950/50 text-yellow-300 border-yellow-800/50'
                    : 'bg-red-950/50 text-red-300 border-red-800/50'
                }
              >
                {academicOk && professionRequirementsOk
                  ? ingredientsOk && player.zeni >= totalCost
                    ? 'pronta'
                    : 'faltam recursos'
                  : 'bloqueada'}
              </Chip>
            </div>
            <p className="text-xs text-amber-200/55 mt-1">{recipe.description}</p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Chip className="bg-yellow-950/40 text-yellow-300 border-yellow-800/40">
                <Coins className="w-3.5 h-3.5" /> {totalCost.toLocaleString('pt-BR')} Zeni
              </Chip>
              <Chip className="bg-black/30 text-amber-200/70 border-amber-900/40">
                <Clock3 className="w-3.5 h-3.5" /> {durationLabel(effectiveMin)}
              </Chip>
              {academicLevel > 0 && (
                <Chip className="bg-sky-950/40 text-sky-300 border-sky-800/40">
                  <GraduationCap className="w-3.5 h-3.5" /> -{academicLevel}% tempo
                </Chip>
              )}
            </div>

            {professionRequirements.length > 0 && (
              <div className="mt-3 rounded-lg border border-sky-900/40 bg-sky-950/15 p-3">
                <p className="text-[11px] font-heading text-sky-200/80 mb-2">Requisitos profissionais</p>
                <div className="grid gap-1.5">
                  {professionRequirements.map((requirement) => (
                    <div
                      key={requirement.professionId}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span aria-hidden>{requirement.icon}</span>
                      <span className="text-amber-100/80">{requirement.name}</span>
                      <span className={requirement.ok ? 'text-emerald-300 ml-auto' : 'text-red-300 ml-auto'}>
                        {requirement.currentLevel > 0 ? `Nv. ${requirement.currentLevel}` : 'sem experiência'}
                        {' / '}
                        Nv. {requirement.level}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 grid gap-1.5">
              {recipe.ingredients.map((ingredient) => {
                const def = getProfessionMaterial(ingredient.itemId) ?? getCraftStackItem(ingredient.itemId);
                const have = counts.get(ingredient.itemId) ?? 0;
                const needed = ingredient.quantity * quantity;
                const ok = have >= needed;
                return (
                  <div key={ingredient.itemId} className="flex items-center gap-2 text-xs">
                    <span aria-hidden>{def?.icon ?? '📦'}</span>
                    <span className="text-amber-100/80">{def?.name ?? ingredient.itemId}</span>
                    <span className={ok ? 'text-emerald-300 ml-auto' : 'text-red-300 ml-auto'}>
                      {have}/{needed}
                    </span>
                  </div>
                );
              })}
            </div>

            {!academicOk && professionRequirements.length === 0 && (
              <p className="text-xs text-sky-300/80 mt-3">
                Esta receita exige experiência como Acadêmico.
              </p>
            )}

            {maxBatch > 1 && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-900/40 bg-black/20 p-2.5">
                <div>
                  <p className="text-[11px] font-heading text-amber-100">Quantidade do lote</p>
                  <p className="text-[10px] text-amber-200/45">Tempo, custo e materiais escalam com a quantidade.</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Diminuir lote"
                    disabled={busy || quantity <= 1}
                    onClick={() => setBatchQty((m) => ({ ...m, [recipe.id]: Math.max(1, quantity - 1) }))}
                    className="w-7 h-7 rounded-md border border-amber-800/60 bg-black/40 text-amber-200 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-heading text-sm text-amber-100 tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    aria-label="Aumentar lote"
                    disabled={busy || quantity >= maxBatch}
                    onClick={() => setBatchQty((m) => ({ ...m, [recipe.id]: Math.min(maxBatch, quantity + 1) }))}
                    className="w-7 h-7 rounded-md border border-amber-800/60 bg-black/40 text-amber-200 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            <GameButton
              className="w-full mt-4"
              disabled={!canStart}
              onClick={() => void runAction({ type: 'craft_start', recipeId: recipe.id, quantity })}
            >
              <Wrench className="w-4 h-4" />
              Fabricar {quantity > 1 ? `${quantity}× ` : ''}{output?.name ?? recipe.name}
            </GameButton>
          </div>
        </div>
      </GameCard>
    );
  };

  return (
    <div className="space-y-6">
      {!embedded && <SectionTitle icon="🔧">Oficina</SectionTitle>}

      <GameCard className="p-4">
        <p className="text-sm text-amber-100/80">
          A Oficina funciona em paralelo ao trabalho, treino, PvP, Ameaça Universal e guildas.
          Ingredientes e Zeni são consumidos ao iniciar; o item é entregue somente na coleta.
        </p>
        <p className="text-xs text-amber-200/50 mt-2">
          🎓 Mestria Acadêmica reduz o tempo de fabricação em 1% por nível, até 10%.
          Os Tiers agora têm progressão real: Tier 2 exige carreira Nv. {CRAFT_TIER_PROFESSION_LEVEL[2]},
          Tier 3 Nv. {CRAFT_TIER_PROFESSION_LEVEL[3]}, Tier 4 Nv. {CRAFT_TIER_PROFESSION_LEVEL[4]} e
          Tier 5 Nv. {CRAFT_TIER_PROFESSION_LEVEL[5]} nas profissões indicadas pela receita.
        </p>
      </GameCard>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-amber-200/55 mr-1">Filtrar receitas:</span>
        {(['all', 1, 2, 3, 4, 5] as const).map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => setTierFilter(tier)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-heading transition-colors ${
              tierFilter === tier
                ? 'border-orange-500/70 bg-orange-950/40 text-orange-200'
                : 'border-amber-900/40 bg-black/20 text-amber-200/55 hover:border-amber-700/60'
            }`}
          >
            {tier === 'all' ? 'Todos' : `Tier ${tier}`}
          </button>
        ))}
      </div>

      {job && (
        <GameCard className="p-5 border-orange-600/50" glow={remaining <= 0}>
          <div className="flex items-start gap-4">
            <div className="text-4xl" aria-hidden>{job.outputIcon}</div>
            <div className="flex-1">
              <h3 className="font-heading text-amber-100">Fabricação em andamento</h3>
              <p className="text-sm text-amber-200/70 mt-1">
                {job.outputQuantity}× {job.outputName}
              </p>
              <div className="h-2 rounded-full bg-black/50 border border-amber-900/40 overflow-hidden mt-3">
                <div className="h-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-xs text-amber-200/50 mt-1">
                <span>{countdown(remaining)}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              {remaining <= 0 && (
                <GameButton
                  className="mt-4"
                  disabled={busy}
                  onClick={() => void runAction({ type: 'craft_claim' })}
                >
                  🎁 Coletar item fabricado
                </GameButton>
              )}
            </div>
          </div>
        </GameCard>
      )}

      {failed ? (
        <LoadFail what="Oficina" onRetry={() => void load()} />
      ) : inventory === null ? (
        <GameCard className="p-4 text-sm text-amber-200/50">Carregando estoque da Oficina…</GameCard>
      ) : (
        <GameCard className="p-4">
          <h3 className="font-heading text-amber-100 flex items-center gap-2">
            <Package className="w-4 h-4" /> Estoque de materiais
          </h3>
          {inventory.length === 0 ? (
            <p className="text-xs text-amber-200/45 mt-2">Nenhum material guardado ainda.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
              {inventory.map((row) => (
                <div key={row.itemId} className="rounded-lg border border-amber-900/40 bg-black/20 px-3 py-2 flex items-center gap-2">
                  <span aria-hidden>{row.icon}</span>
                  <span className="text-xs text-amber-100/80 truncate">{row.name}</span>
                  <span className="ml-auto font-heading text-amber-300">×{row.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </GameCard>
      )}

      {inventory !== null && (
        <>
          <div>
            <h2 className="font-heading text-amber-100 mb-3">Receitas da Oficina</h2>
            {mainRecipes.length === 0 ? (
              <GameCard className="p-4 text-sm text-amber-200/45">Nenhuma receita principal neste Tier.</GameCard>
            ) : (
              <div className="grid lg:grid-cols-2 gap-4">{mainRecipes.map(renderRecipe)}</div>
            )}
          </div>

          <div>
            <h2 className="font-heading text-amber-100 mb-1">Projetos Acadêmicos</h2>
            <p className="text-xs text-amber-200/50 mb-3">
              Blueprints avançados alimentam o crafting cross-profession e entram como ingredientes dos tiers superiores.
            </p>
            {blueprints.length === 0 ? (
              <GameCard className="p-4 text-sm text-amber-200/45">Nenhum projeto acadêmico neste Tier.</GameCard>
            ) : (
              <div className="grid lg:grid-cols-2 gap-4">{blueprints.map(renderRecipe)}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
