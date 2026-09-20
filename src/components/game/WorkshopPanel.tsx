'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayerView } from '@/lib/game/types';
import {
  CRAFT_RECIPES,
  getCraftStackItem,
  getCraftedItem,
} from '@/lib/game/content/crafting';
import { getProfessionMaterial } from '@/lib/game/content/world';
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
  const [failed, setFailed] = useState(false);
  const now = useServerNow(500);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetchPanelJson(`/api/game/workshop?playerId=${player.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setInventory(Array.isArray(data.inventory) ? data.inventory : []);
      setJob(data.job ?? null);
    } catch {
      setFailed(true);
    }
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

  const blueprints = CRAFT_RECIPES.filter((r) => r.requiresAcademic);
  const mainRecipes = CRAFT_RECIPES.filter((r) => !r.requiresAcademic);

  const renderRecipe = (recipe: (typeof CRAFT_RECIPES)[number]) => {
    const output = getCraftedItem(recipe.outputItemId) ?? getCraftStackItem(recipe.outputItemId);
    const academicOk = !recipe.requiresAcademic || academicLevel > 0;
    const ingredientsOk = recipe.ingredients.every((i) => (counts.get(i.itemId) ?? 0) >= i.quantity);
    const canStart = !job && academicOk && ingredientsOk && player.zeni >= recipe.costZeni && !busy;
    const effectiveMin = Math.ceil(recipe.baseDurationMin * craftMult);

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
            </div>
            <p className="text-xs text-amber-200/55 mt-1">{recipe.description}</p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Chip className="bg-yellow-950/40 text-yellow-300 border-yellow-800/40">
                <Coins className="w-3.5 h-3.5" /> {recipe.costZeni.toLocaleString('pt-BR')} Zeni
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

            <div className="mt-3 grid gap-1.5">
              {recipe.ingredients.map((ingredient) => {
                const def = getProfessionMaterial(ingredient.itemId) ?? getCraftStackItem(ingredient.itemId);
                const have = counts.get(ingredient.itemId) ?? 0;
                const ok = have >= ingredient.quantity;
                return (
                  <div key={ingredient.itemId} className="flex items-center gap-2 text-xs">
                    <span aria-hidden>{def?.icon ?? '📦'}</span>
                    <span className="text-amber-100/80">{def?.name ?? ingredient.itemId}</span>
                    <span className={ok ? 'text-emerald-300 ml-auto' : 'text-red-300 ml-auto'}>
                      {have}/{ingredient.quantity}
                    </span>
                  </div>
                );
              })}
            </div>

            {!academicOk && (
              <p className="text-xs text-sky-300/80 mt-3">
                Conclua ao menos 1h como Acadêmico para fabricar blueprints.
              </p>
            )}

            <GameButton
              className="w-full mt-4"
              disabled={!canStart}
              onClick={() => void runAction({ type: 'craft_start', recipeId: recipe.id })}
            >
              <Wrench className="w-4 h-4" />
              Fabricar {output?.name ?? recipe.name}
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
        </p>
      </GameCard>

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

      <div>
        <h2 className="font-heading text-amber-100 mb-3">Receitas da Oficina</h2>
        <div className="grid lg:grid-cols-2 gap-4">{mainRecipes.map(renderRecipe)}</div>
      </div>

      <div>
        <h2 className="font-heading text-amber-100 mb-1">Projetos Acadêmicos</h2>
        <p className="text-xs text-amber-200/50 mb-3">
          Blueprints avançados alimentam o crafting cross-profession e entram como ingredientes dos tiers superiores.
        </p>
        <div className="grid lg:grid-cols-2 gap-4">{blueprints.map(renderRecipe)}</div>
      </div>
    </div>
  );
}
