import Link from 'next/link';
import { Play } from 'lucide-react';

export const metadata = {
  title: 'Como Jogar — Guerreiros Místicos',
  description:
    'Aprenda as mecânicas de Guerreiros Místicos: energia, profissões com promoções, treino de atributos, combate físico vs Ki, técnicas, loadout, guildas, ranking PvP e as Esferas do Dragão.',
  alternates: { canonical: '/como-jogar' },
};

export default function HowToPlayPage() {
  return (
    <main className="min-h-screen bg-[#14100b] text-amber-100">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-xs text-amber-200/40 hover:text-amber-200/70">
          ← Guerreiros Místicos
        </Link>
        <h1 className="font-display text-4xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 mt-2 mb-8">
          Como Jogar
        </h1>

        <div className="space-y-6 text-[15px] leading-relaxed text-amber-200/80">
          <Section title="1. Crie seu guerreiro">
            Escolha um nome (ou role os dados) e uma das cinco raças. Cada raça tem bônus reais: Saiyajins
            batem mais forte e ganham Zenkai ao perder; Humanos treinam mais barato e regeneram energia
            rápido; Namekuseijins defendem melhor; Androides gastam menos energia em trabalhos; Majins
            devastam com Ki e absorvem vida ao vencer. Pode jogar como convidado e salvar o progresso
            depois com "Salvar meu guerreiro" — nada se perde na conversão.
          </Section>

          <Section title="2. O ciclo clássico: trabalho → treino → luta">
            Profissões rendem Zeni e XP: cada turno leva 1 hora real e consome energia. Batalhas também
            consomem energia (3 por luta), que recarrega lentamente — cerca de 5 minutos por ponto.
            Treinos aumentam atributos permanentemente gastando Zeni e energia.
            Batalhas rendem recompensas cheias sempre — sem limites diários de farm.
          </Section>

          <Section title="3. Atributos e o combate físico vs Ki">
            <b>Força</b> dimensiona ataques físicos; <b>Ki</b> dimensiona ataques de energia (que consomem a
            barra de Ki de batalha). <b>Defesa</b> reduz dano físico e compõe a resistência de energia junto
            com o Ki; <b>Velocidade</b> define quem ataca primeiro (empate = cara ou coroa) e a esquiva.
            Personagens físicos e de Ki são igualmente viáveis.
          </Section>

          <Section title="4. Técnicas, loadout e estratégia">
            Aprenda técnicas com os mestres e equipe até 4 no loadout: 3 slots comuns + 1 slot Supremo.
            Só técnicas equipadas aparecem em batalha — aprender mais nunca te enfraquece. A estratégia
            (Equilibrado, Agressivo, Defensivo, Corpo a Corpo ou Especialista em Ki) orienta as decisões
            automáticas da engine, sem garantir vitória.
          </Section>

          <Section title="5. Transformações">
            Cada raça tem uma árvore: Forma Base → Transformação I → Transformação II → três caminhos
            finais (físico, equilibrado ou energia). Desbloquear exige nível, atributos e pré-requisitos, e
            concede bônus permanentes; a forma ativa dá multiplicadores em combate.
          </Section>

          <Section title="6. PvP, guildas e ranking">
            Ataque guerreiros até 5 níveis acima ou abaixo e roube 8% do Zeni deles (perca e eles levam
            5% do seu). Funda uma guilda por 5.000 Zeni, doe para subir o nível coletivo e dispute o
            ranking geral. O Zenkai dos Saiyajins é limitado pelo risco real da derrota e pela
            recuperação no hospital — não por cotas diárias.
          </Section>

          <Section title="7. Esferas do Dragão e o boss mundial">
            Cada turno de profissão tem chance de render uma Esfera do Dragão (maior com promoções).
            Com as 7, invoque Shenlon e escolha
            um desejo. Enfrente também a Ameaça Universal: um chefe com HP global compartilhado por todos
            os jogadores — quem causar mais dano leva as melhores recompensas.
          </Section>

          <Section title="8. Missões diárias, semanais e conquistas">
            Todos os dias surgem 3 missões diárias (reset à meia-noite de Brasília) e 2 semanais (reset
            às segundas). Recompensas incluem cristais para a loja de cosméticos. Conquistas registram
            sua jornada permanente, com recompensa única.
          </Section>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/jogar"
            className="font-heading text-lg px-10 py-4 rounded-xl bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 font-bold shadow-xl shadow-amber-900/40 hover:from-yellow-300 hover:to-amber-500 transition-all inline-flex items-center gap-2"
          >
            <Play className="w-5 h-5" fill="currentColor" /> COMEÇAR A JOGAR
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#1e1710]/90 border border-amber-900/40 rounded-xl p-5">
      <h2 className="font-heading text-amber-100 text-lg mb-2">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
