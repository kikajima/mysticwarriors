// =====================================================================
// TALENTOS DE ÍMPETO — ASCENSÃO Z, Cap. 7 (v0.9.15)
// ---------------------------------------------------------------------
// O Cap. 7 define a tabela de gastos de Ímpeto. Três entradas já vivem
// no motor desde a v0.9.13: Estender Combo (1), Defesa Heroica (2) e
// Quebra de Limite (Cap. 29, 3). As duas entradas RESTANTES de 1 Ímpeto
// chegam agora como TALENTOS COMPRÁVEIS — privilégios de combate que o
// guerreiro desbloqueia na Loja com Zeni (o livro os trata como opções
// abertas a todos; aqui a progressão econômica os distribui):
//
//   • REPETIÇÃO DO DESTINO ("Repetir um d10"): quando seu golpe é
//     esquivado, gaste 1 Ímpeto para repetir o teste de acerto.
//     1×/rodada, nunca em golpes extras de combo.
//   • REPOSICIONAMENTO DRAMÁTICO: quando um golpe PODEROSO te alcança,
//     gaste 1 Ímpeto para sumir do ponto de impacto — uma nova tentativa
//     de esquiva com bônus. Se falhar, o golpe segue (e a Defesa
//     Heroica ainda pode agir em seguida). 1×/rodada.
//
// v0.9.17 — o TERCEIRO talento fecha o ciclo do Cap. 29:
//   • SEGUNDO VENTO: quando o efeito da Quebra de Limite expira e a
//     Exaustão ia entrar, você gasta 2 Ímpetos para superar a fadiga —
//     o milagre COMPLETO. Automático (1×/combate, pois a Quebra é
//     1×/combate); dispara só com Ímpeto em caixa — senão a fadiga cobra.
//
// AMBOS consomem rng apenas quando possuídos E disparados — batalhas sem
// talentos seguem byte a byte a mesma sequência aleatória de sempre
// (determinismo dos testes preservado).
// =====================================================================

export interface TalentDef {
  id: string;
  name: string;
  icon: string;
  /** O que o talento faz (regra do livro, adaptada ao motor). */
  description: string;
  /** Resumo curto do gatilho (UI: badge do card de batalha). */
  effect: string;
  /** Custo em Zeni (Loja). */
  price: number;
  /** Nível mínimo do guerreiro. */
  minLevel: number;
  /** Ímpetos gastos por disparo (tabela do Cap. 7: 1). */
  impetoCost: number;
}

export const TALENTS: TalentDef[] = [
  {
    id: 'repeticao-destino',
    name: 'Repetição do Destino',
    icon: '🎯',
    description:
      '"Repetir um d10" (Cap. 7). Quando o adversário desvia do seu golpe, você gasta 1 Ímpeto para repetir o teste de acerto — o destino merece uma segunda chance.',
    effect: 'Golpe esquivado → repete o acerto por 1 Ímpeto (1×/rodada)',
    price: 2400,
    minLevel: 4,
    impetoCost: 1,
  },
  {
    id: 'reposicionamento',
    name: 'Reposicionamento Dramático',
    icon: '🌀',
    description:
      'Cap. 7. No instante em que um golpe poderoso te alcança, você gasta 1 Ímpeto para desaparecer do ponto de impacto — uma esquiva extra com bônus. Se o instante escapar, o golpe segue.',
    effect: 'Golpe poderoso recebido → esquiva extra por 1 Ímpeto (1×/rodada)',
    price: 3600,
    minLevel: 6,
    impetoCost: 1,
  },
  {
    id: 'segundo-vento',
    name: 'Segundo Vento',
    icon: '🌬️',
    description:
      'Cap. 29 — o contragolpe à Exaustão. Quando o efeito da Quebra de Limite expira e a fadiga ia te alcançar, você gasta 2 Ímpetos para superá-la na hora — o milagre completo, sem preço a pagar depois.',
    effect: 'Exaustão pós-Quebra → cancelada por 2 Ímpetos (automático)',
    price: 5200,
    minLevel: 8,
    impetoCost: 2,
  },
];

const TALENT_IDS = new Set(TALENTS.map((t) => t.id));

export function getTalent(id: string): TalentDef | null {
  return TALENTS.find((t) => t.id === id) ?? null;
}

/** Parse defensivo do JSON do banco — lixo vira lista vazia. */
export function parseTalents(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw ?? '[]');
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === 'string' && TALENT_IDS.has(x));
  } catch {
    return [];
  }
}

/**
 * Validação PURA de compra (testável sem banco) — a action usa isto e
 * devolve os dados prontos para persistir.
 */
export function validateTalentPurchase(
  level: number,
  zeni: number,
  owned: string[],
  talentId: string
): { ok: true; talent: TalentDef; ownedAfter: string[]; zeniAfter: number } | { ok: false; reason: string } {
  const talent = getTalent(talentId);
  if (!talent) return { ok: false, reason: 'Talento inválido.' };
  if (owned.includes(talentId)) return { ok: false, reason: `${talent.name} já foi dominado.` };
  if (level < talent.minLevel) {
    return { ok: false, reason: `Nível ${talent.minLevel} necessário para dominar ${talent.name}.` };
  }
  if (zeni < talent.price) {
    return { ok: false, reason: `Zeni insuficiente — ${talent.name} custa ${talent.price.toLocaleString('pt-BR')} Zeni.` };
  }
  return {
    ok: true,
    talent,
    ownedAfter: [...owned, talentId],
    zeniAfter: zeni - talent.price,
  };
}
