import Link from 'next/link';
import { RACE_LIST } from '@/lib/game/content/races';
import { TRAINING_MASTERS } from '@/lib/game/content/techniques';

export const metadata = {
  title: 'O Universo — Guerreiros Místicos',
  description:
    'Conheça as cinco raças de Guerreiros Místicos, seus bônus, os mestres que ensinam técnicas lendárias e a eterna busca pelas Esferas do Dragão.',
  alternates: { canonical: '/universo' },
};

export default function UniversoPage() {
  return (
    <main className="min-h-screen bg-[#14100b] text-amber-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/" className="text-xs text-amber-200/40 hover:text-amber-200/70">
          ← Guerreiros Místicos
        </Link>
        <h1 className="font-display text-4xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 mt-2 mb-3">
          O Universo
        </h1>
        <p className="text-amber-200/60 text-sm leading-relaxed mb-10 max-w-2xl">
          Um universo de guerreiros místicos onde o treino supera talento, esferas lendárias concedem
          desejos e o poder de luta define a hierarquia. Cinco povos disputam o topo — e o seu guerreiro
          pode virar a próxima lenda.
        </p>

        {/* Raças */}
        <div className="space-y-5 mb-14">
          {RACE_LIST.map((race) => (
            <section key={race.id} className="bg-[#1e1710]/90 border border-amber-900/40 rounded-xl p-5 flex flex-col sm:flex-row gap-5">
              <img
                src={race.avatar}
                alt={`Guerreiro ${race.name}`}
                className="w-24 h-24 rounded-full object-cover border-2 border-amber-500/40 shrink-0 mx-auto sm:mx-0"
                width={96}
                height={96}
              />
              <div className="flex-1">
                <h2 className="font-heading text-xl text-amber-100">
                  {race.name}
                  <span className="text-amber-200/40 text-sm font-normal italic ml-2">{race.tagline}</span>
                </h2>
                <p className="text-sm text-amber-200/60 mt-1.5 leading-relaxed">{race.description}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {race.perks.map((perk, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-800/50 bg-emerald-950/50 text-emerald-300 px-2.5 py-0.5 text-[11px]"
                    >
                      ✔ {perk}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Mestres */}
        <h2 className="font-display text-3xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-orange-500 mb-6">
          Os Mestres
        </h2>
        <p className="text-amber-200/60 text-sm mb-6 max-w-2xl leading-relaxed">
          Grandes mestres do universo ensinam técnicas que usam Força ou Ki. Procure-os na Sala de Treino,
          pague o treinamento em Zeni e domine golpes lendários.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TRAINING_MASTERS.map((m) => (
            <div key={m.id} className="bg-[#1e1710]/90 border border-amber-900/40 rounded-xl p-4 flex items-start gap-3">
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center text-2xl shrink-0 border border-amber-700/40`}
                aria-hidden
              >
                {m.emoji}
              </div>
              <div>
                <h3 className="font-heading text-amber-100">{m.name}</h3>
                <p className="text-[11px] text-amber-200/50">
                  {m.title} • 📍 {m.location}
                </p>
                <p className="text-[11px] text-amber-200/40 italic mt-1">{m.quote}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/jogar"
            className="font-heading text-base px-8 py-3 rounded-xl bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 font-bold shadow-lg hover:from-yellow-300 hover:to-amber-500 transition-all"
          >
            Escolha seu destino →
          </Link>
        </div>
      </div>
    </main>
  );
}
