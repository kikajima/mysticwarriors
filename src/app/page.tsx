import Link from 'next/link';
import { Play, Swords, Dumbbell, Sparkles, Users, Trophy, Map, Sparkles as DragonIcon, ShieldCheck, Gem } from 'lucide-react';
import { RACE_LIST } from '@/lib/game/content/races';
import { TECHNIQUES, TRAINING_MASTERS } from '@/lib/game/content/techniques';
import { TRANSFORMATIONS } from '@/lib/game/content/transformations';
import { PROFESSIONS } from '@/lib/game/content/world';

// =====================================================================
// LANDING PAGE PÚBLICA — Server Component (SSR, indexável, sem cliente)
// O jogo em si vive em /jogar. Aqui: apresentação + CTA.
// =====================================================================

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#14100b] text-amber-100">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/images/banner.png"
            alt="Guerreiros místicos carregando energia ao pôr do sol"
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-[#14100b]/60 to-[#14100b]" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 pt-24 pb-20 text-center">
          <p className="font-heading text-orange-300/80 tracking-[0.35em] text-xs sm:text-sm uppercase mb-4">
            O RPG de gerenciamento dos clássicos browser games
          </p>
          <h1 className="font-display text-6xl sm:text-8xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-orange-400 to-amber-600 drop-shadow-[0_6px_20px_rgba(0,0,0,0.6)] tracking-wide leading-none">
            Guerreiros<br />Místicos
          </h1>
          <p className="font-heading text-amber-200/90 text-base sm:text-xl mt-6 max-w-2xl mx-auto leading-relaxed">
            Treine. Lute. Trabalhe. Colete as <span className="text-yellow-300">7 Esferas do Dragão</span> e
            torne-se o guerreiro mais poderoso do universo — direto do navegador, de graça.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/jogar"
              className="font-heading text-lg sm:text-xl px-10 py-4 rounded-xl bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 font-bold shadow-xl shadow-amber-900/40 hover:from-yellow-300 hover:to-amber-500 hover:scale-[1.03] transition-all active:scale-95 inline-flex items-center gap-2"
            >
              <Play className="w-6 h-6" fill="currentColor" />
              JOGAR GRÁTIS
            </Link>
            <Link
              href="/como-jogar"
              className="font-heading text-sm px-6 py-3 rounded-xl bg-white/5 border border-amber-800/50 text-amber-200 hover:bg-white/10 hover:border-amber-600/50 transition-all"
            >
              Como jogar
            </Link>
          </div>
          <p className="text-amber-200/40 text-xs mt-4">
            Sem download · jogue como convidado em 10 segundos · salve seu progresso quando quiser
          </p>
        </div>
      </section>

      {/* ===== RAÇAS ===== */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="font-display text-3xl sm:text-4xl text-center text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-orange-500 mb-3">
          Escolha sua raça
        </h2>
        <p className="text-center text-amber-200/50 text-sm mb-10 max-w-xl mx-auto">
          Cinco povos, cinco estilos de jogo — cada raça com bônus reais em combate e economia.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {RACE_LIST.map((race) => (
            <div
              key={race.id}
              className="bg-[#1e1710]/90 border border-amber-900/40 rounded-xl p-5 hover:border-amber-600/60 transition-all"
            >
              <img
                src={race.avatar}
                alt={`Guerreiro ${race.name}`}
                className="w-16 h-16 rounded-full object-cover border-2 border-amber-500/40 mx-auto mb-3"
                width={64}
                height={64}
              />
              <h3 className="font-heading text-amber-100 text-center">{race.name}</h3>
              <p className="text-amber-200/50 text-xs italic text-center mb-3">{race.tagline}</p>
              <ul className="space-y-1.5">
                {race.perks.map((perk, i) => (
                  <li key={i} className="text-[11px] text-amber-200/70 leading-snug flex gap-1.5">
                    <span className="text-emerald-400 shrink-0">✔</span> {perk}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center mt-6">
          <Link href="/universo" className="text-orange-300 hover:text-orange-200 text-sm underline">
            Conheça o universo completo →
          </Link>
        </p>
      </section>

      {/* ===== CARACTERÍSTICAS ===== */}
      <section className="bg-black/30 border-y border-amber-900/30">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="font-display text-3xl sm:text-4xl text-center text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-orange-500 mb-10">
            Um universo inteiro para conquistar
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Feature
              icon={<Dumbbell className="w-6 h-6" />}
              title="Progressão de guerreiro"
              text="Treine Força, Defesa, Velocidade e Ki. Compre equipamentos que rendem pontos extras por treino e desbloqueie transformações em árvore — da forma base ao poder supremo da sua raça."
            />
            <Feature
              icon={<Swords className="w-6 h-6" />}
              title="Combate tático por turnos"
              text="Ataques físicos escalam de Força; ondas de energia escalam de Ki e consomem a barra de batalha. Monte seu loadout de 4 técnicas, adote uma estratégia e enfrente vilões, rivais e chefes mundiais."
            />
            <Feature
              icon={<Sparkles className="w-6 h-6" />}
              title={`${TECHNIQUES.length} técnicas lendárias`}
              text={`Aprenda com ${TRAINING_MASTERS.length} mestres icônicos — do Punho do Lobo à Genki Dama. Técnicas supremas ocupam um slot exclusivo do loadout.`}
            />
            <Feature
              icon={<Map className="w-6 h-6" />}
              title="Profissões com promoções"
              text={`${PROFESSIONS.length} profissões com turnos de 1 hora — Agricultor, Cientista, Acadêmico, Policial e Atleta. Cada promoção aumenta o salário em até 5x e paga bônus de até 30.000 Zeni.`}
            />
            <Feature
              icon={<Users className="w-6 h-6" />}
              title="Guildas e ranking ao vivo"
              text="Funde sua guilda por 5.000 Zeni, receba doações, suba o nível coletivo e dispute o ranking dos guerreiros com PvP por faixa de nível."
            />
            <Feature
              icon={<Trophy className="w-6 h-6" />}
              title={`${TRANSFORMATIONS.length} transformações`}
              text="Árvores de evolução exclusivas por raça, com três caminhos finais: físico, equilibrado ou energia. Bônus permanentes ao desbloquear."
            />
          </div>
        </div>
      </section>

      {/* ===== ECONOMIA / ANTI PAY-TO-WIN ===== */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-[#1e1710]/90 border border-amber-900/40 rounded-2xl p-8">
          <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-4" />
          <h3 className="font-heading text-xl text-amber-100 mb-2">Zero pay-to-win. Para sempre.</h3>
          <p className="text-sm text-amber-200/60 leading-relaxed max-w-2xl mx-auto">
            Todo o conteúdo é conquistado jogando: Zeni vem de profissões e batalhas, e{' '}
            <span className="text-sky-300">cristais</span> — a moeda dos cosméticos — caem das missões
            diárias, conquistas e do Ameaça Universal. Cosméticos nunca alteram atributos. VIP e Passe de
            Temporada trarão apenas conveniência e estilo quando chegarem.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 text-amber-200/40 text-xs">
            <Gem className="w-4 h-4 text-sky-400" /> cristais conquistados jogando
          </div>
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section className="relative overflow-hidden border-t border-amber-900/30">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 110%, rgba(180,83,9,0.4), transparent)',
          }}
          aria-hidden
        />
        <div className="relative max-w-3xl mx-auto px-4 py-20 text-center">
          <DragonIcon className="w-12 h-12 text-orange-400 mx-auto mb-6" />
          <h2 className="font-display text-4xl sm:text-5xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 mb-4">
            Seu treino começa agora
          </h2>
          <p className="text-amber-200/60 mb-8">
            Crie seu guerreiro em segundos — sem cadastro. Junte as Esferas do Dragão, invoque Shenlon e
            desafie o universo.
          </p>
          <Link
            href="/jogar"
            className="font-heading text-lg px-10 py-4 rounded-xl bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 font-bold shadow-xl shadow-amber-900/40 hover:from-yellow-300 hover:to-amber-500 hover:scale-[1.03] transition-all active:scale-95 inline-flex items-center gap-2"
          >
            <Play className="w-5 h-5" fill="currentColor" />
            JOGAR GRÁTIS AGORA
          </Link>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-amber-900/30 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-amber-200/40">
          <p>Guerreiros Místicos — jogo de fã inspirado nos clássicos browser games de gerenciamento.</p>
          <nav className="flex flex-wrap gap-4" aria-label="Links do site">
            <Link href="/jogar" className="hover:text-amber-200/70">Jogar</Link>
            <Link href="/ranking" className="hover:text-amber-200/70">Ranking</Link>
            <Link href="/como-jogar" className="hover:text-amber-200/70">Como jogar</Link>
            <Link href="/wiki" className="hover:text-amber-200/70">Wiki de mecânicas</Link>
            <Link href="/universo" className="hover:text-amber-200/70">Universo</Link>
            <Link href="/tecnicas" className="hover:text-amber-200/70">Técnicas</Link>
            <Link href="/transformacoes" className="hover:text-amber-200/70">Transformações</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="bg-[#1e1710]/90 border border-amber-900/40 rounded-xl p-5">
      <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-orange-500/30 to-amber-700/20 border border-amber-700/40 flex items-center justify-center text-orange-400 mb-3">
        {icon}
      </div>
      <h3 className="font-heading text-amber-100 mb-1.5">{title}</h3>
      <p className="text-[13px] text-amber-200/60 leading-relaxed">{text}</p>
    </div>
  );
}
