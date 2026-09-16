import Link from 'next/link';
import { TECHNIQUES } from '@/lib/game/content/techniques';

export const metadata = {
  title: 'Técnicas Lendárias — Guerreiros Místicos',
  description:
    'Catálogo completo das técnicas de Guerreiros Místicos: Rogafufuken, Kamehameha, Kienzan, Final Flash, Genki Dama e mais — poder, custo de Ki e mestres que as ensinam.',
  alternates: { canonical: '/tecnicas' },
};

export default function TecnicasPage() {
  const byType = {
    physical: TECHNIQUES.filter((t) => t.type === 'physical'),
    energy: TECHNIQUES.filter((t) => t.type === 'energy'),
  };

  return (
    <main className="min-h-screen bg-[#14100b] text-amber-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/" className="text-xs text-amber-200/40 hover:text-amber-200/70">
          ← Guerreiros Místicos
        </Link>
        <h1 className="font-display text-4xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 mt-2 mb-3">
          Técnicas Lendárias
        </h1>
        <p className="text-amber-200/60 text-sm leading-relaxed mb-10 max-w-2xl">
          {TECHNIQUES.length} técnicas ensinadas pelos mestres. Técnicas físicas dimensionam de{' '}
          <b className="text-orange-300">Força</b>; técnicas de energia dimensionam de{' '}
          <b className="text-rose-300">Ki</b>. Todas consomem Ki de batalha quando usadas. Aprenda, equipe
          no seu loadout de 4 slots e domine o combate.
        </p>

        {(
          [
            { key: 'physical', label: '⚔️ Técnicas Físicas (Força)', list: byType.physical },
            { key: 'energy', label: '✨ Técnicas de Energia (Ki)', list: byType.energy },
          ] as const
        ).map((group) => (
          <section key={group.key} className="mb-10">
            <h2 className="font-heading text-xl text-amber-100 mb-4">{group.label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {group.list.map((t) => (
                <div key={t.id} className="bg-[#1e1710]/90 border border-amber-900/40 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-heading text-amber-100 flex items-center gap-2">
                      <span className="text-xl" aria-hidden>
                        {t.icon}
                      </span>
                      {t.name}
                    </h3>
                    {t.category === 'supreme' && (
                      <span className="rounded-full border border-purple-700/60 bg-purple-950/60 text-purple-300 px-2 py-0.5 text-[10px] font-bold uppercase">
                        Suprema
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-amber-200/60 leading-relaxed min-h-10">{t.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="rounded-full border border-amber-800/50 bg-black/40 text-amber-200/70 px-2 py-0.5 text-[11px]">
                      dano ×{t.power.toFixed(1)}
                    </span>
                    <span className="rounded-full border border-sky-800/50 bg-sky-950/40 text-sky-300 px-2 py-0.5 text-[11px]">
                      {t.kiCost} Ki
                    </span>
                    <span className="rounded-full border border-amber-800/50 bg-black/40 text-amber-200/60 px-2 py-0.5 text-[11px]">
                      Nv {t.minLevel}+
                    </span>
                    <span className="rounded-full border border-yellow-800/50 bg-yellow-950/40 text-yellow-300 px-2 py-0.5 text-[11px]">
                      {t.price.toLocaleString('pt-BR')} Zeni
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-12 text-center">
          <Link
            href="/jogar"
            className="font-heading text-base px-8 py-3 rounded-xl bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 font-bold shadow-lg hover:from-yellow-300 hover:to-amber-500 transition-all"
          >
            Aprenda com os mestres →
          </Link>
        </div>
      </div>
    </main>
  );
}
