import Link from 'next/link';
import { RACE_LIST } from '@/lib/game/content/races';
import { TRANSFORMATIONS } from '@/lib/game/content/transformations';

export const metadata = {
  title: 'Transformações — Myst Ki Warriors',
  description:
    'As árvores de transformação de Myst Ki Warriors: Fera Lupina, Ascensão Prateada, Ascensão Silvestre, Sobrecarga, Caos Desencadeado e três caminhos finais por linhagem.',
  alternates: { canonical: '/transformacoes' },
};

export default function TransformacoesPage() {
  return (
    <main className="min-h-screen bg-[#14100b] text-amber-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/" className="text-xs text-amber-200/40 hover:text-amber-200/70">
          ← Myst Ki Warriors
        </Link>
        <h1 className="font-display text-4xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 mt-2 mb-3">
          Árvores de Transformação
        </h1>
        <p className="text-amber-200/60 text-sm leading-relaxed mb-10 max-w-2xl">
          Cada raça evolui em árvore: <b className="text-amber-100">Forma Base → Transformação I →
          Transformação II → três caminhos finais</b> (físico, equilibrado ou energia). Desbloquear exige
          requisitos e concede <b className="text-emerald-300">bônus permanentes</b>; a forma ativa aplica
          multiplicadores em combate.
        </p>

        {RACE_LIST.map((race) => {
          const forms = TRANSFORMATIONS.filter((t) => t.race === race.id).sort((a, b) => a.order - b.order);
          const tier1 = forms.filter((f) => f.order === 1);
          const tier2 = forms.filter((f) => f.order === 2);
          const tier3 = forms.filter((f) => f.order === 3);
          return (
            <section key={race.id} className="mb-12">
              <h2 className="font-heading text-2xl text-amber-100 mb-5 flex items-center gap-2">
                <img src={race.avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-amber-600/40" width={32} height={32} />
                {race.name}
              </h2>

              <div className="space-y-2">
                {/* base */}
                <TreeRow label="Forma Base" icon="🧍" level="—" desc="Todo guerreiro começa daqui." />

                {tier1.map((f) => (
                  <TreeRow key={f.id} label={f.name} icon={f.icon} level={`Nv ${f.minLevel}+`} desc={f.description} req={reqText(f)} />
                ))}
                {tier2.map((f) => (
                  <TreeRow key={f.id} label={f.name} icon={f.icon} level={`Nv ${f.minLevel}+`} desc={f.description} req={reqText(f)} />
                ))}

                {/* ramos finais */}
                <div className="relative pl-5 border-l-2 border-amber-900/40 ml-5 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-amber-200/30 font-heading -ml-5">
                    três caminhos finais
                  </p>
                  {tier3.map((f) => (
                    <TreeRow key={f.id} label={f.name} icon={f.icon} level={`Nv ${f.minLevel}+`} desc={f.description} req={reqText(f)} />
                  ))}
                </div>
              </div>
            </section>
          );
        })}

        <div className="mt-12 text-center">
          <Link
            href="/jogar"
            className="font-heading text-base px-8 py-3 rounded-xl bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 font-bold shadow-lg hover:from-yellow-300 hover:to-amber-500 transition-all"
          >
            Desbloqueie sua primeira forma →
          </Link>
        </div>
      </div>
    </main>
  );
}

function reqText(f: (typeof TRANSFORMATIONS)[number]): string {
  const parts: string[] = [];
  if (f.requiredStats) {
    const map: Record<string, string> = { strength: 'Força', defense: 'Defesa', speed: 'Velocidade', ki: 'Ki' };
    for (const [k, v] of Object.entries(f.requiredStats)) {
      if (v) parts.push(`${map[k]} ${v}`);
    }
  }
  if (f.requiresTransformation) parts.push('forma anterior');
  if (f.requiredTechnique) parts.push('técnica específica');
  if (f.requiredMission) parts.push('missão específica');
  return parts.length > 0 ? `Requisitos: ${parts.join(' · ')}` : '';
}

function TreeRow({
  label,
  icon,
  level,
  desc,
  req,
}: {
  label: string;
  icon: string;
  level: string;
  desc: string;
  req?: string;
}) {
  return (
    <div className="relative pl-5 border-l-2 border-amber-900/40 ml-5">
      <div className="bg-[#1e1710]/90 border border-amber-900/40 rounded-xl p-4 flex items-start gap-3">
        <div className="text-2xl shrink-0" aria-hidden>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-amber-100 text-sm flex items-center gap-2 flex-wrap">
            {label}
            <span className="text-[10px] text-amber-200/40 font-normal">{level}</span>
          </h3>
          <p className="text-[11px] text-amber-200/50 leading-snug mt-0.5">{desc}</p>
          {req && <p className="text-[10px] text-amber-200/30 mt-1">{req}</p>}
        </div>
      </div>
    </div>
  );
}
