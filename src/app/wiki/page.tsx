import type { Metadata } from 'next';
import { WikiView } from '@/components/wiki/WikiView';

// =====================================================================
// /wiki — página PÚBLICA de mecânicas (v0.9.22)
// ---------------------------------------------------------------------
// Acessível SEM login (nenhum dado sensível de jogador aqui — só
// constantes e fórmulas do jogo). Aberta sempre em nova aba a partir
// do Login e da Visão Geral para preservar o estado do jogo (energia,
// timers, luta em andamento) na aba original.
// =====================================================================

export const metadata: Metadata = {
  title: 'Wiki de Mecânicas',
  description:
    'Manual completo de Myst Ki Warriors: combate com Ímpeto, Escalas de Poder, desempate por Decisão, atributos e fórmulas, raças, técnicas, transformações, torneio, profissões, PvP, conquistas e Chaves do Horizonte — com os números reais do jogo.',
  alternates: { canonical: '/wiki' },
  openGraph: {
    title: 'Wiki de Mecânicas — Myst Ki Warriors',
    description:
      'Todas as mecânicas do jogo documentadas com transparência total: fórmulas, custos, recompensas e probabilidades reais.',
    images: ['/images/banner-mystki.svg'],
  },
  robots: { index: true, follow: true },
};

export default function WikiPage() {
  return <WikiView />;
}
