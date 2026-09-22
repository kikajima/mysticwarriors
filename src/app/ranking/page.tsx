import Link from 'next/link';
import { Crown, ChevronRight } from 'lucide-react';
import { Play } from 'lucide-react';
import { getPublicRanking } from '@/lib/supabase/ranking';
import { RankingLive } from '@/components/RankingLive';

// Ranking público — AO VIVO a partir dos dados salvos na NUVEM (Supabase).
// v0.9.5: a página NUNCA usa cache (force-dynamic) — cada abertura busca
// dados frescos; a tabela viva continua atualizando sozinha a cada 60s
// enquanto aberta. A posição NUNCA fica gravada: a RPC ranking_nuvem
// ordena TODOS os personagens de TODAS as contas salvas na hora (sem
// nenhum filtro de login/online), expondo apenas nome, raça, nível,
// poder, vitórias e derrotas. Se a nuvem não responder, cai no ranking
// do servidor (logado no console) — a página nunca quebra.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ranking dos Guerreiros — Myst Ki Warriors',
  description:
    'Veja os guerreiros mais poderosos do universo: nível, poder de luta, raça e vitórias calculados ao vivo a partir do progresso salvo na nuvem. Entre no jogo e dispute o topo.',
  alternates: { canonical: '/ranking' },
};

export default async function RankingPage() {
  // dados iniciais renderizados no servidor (SEO + pintada instantânea);
  // a tabela viva busca de novo ao abrir e a cada 60s
  const initial = await getPublicRanking(25);

  return (
    <main className="min-h-screen bg-[#14100b] text-amber-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div>
            <Link href="/" className="text-xs text-amber-200/40 hover:text-amber-200/70">
              ← Myst Ki Warriors
            </Link>
            <h1 className="font-display text-4xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 mt-2 flex items-center gap-3">
              <Crown className="w-8 h-8 text-yellow-400" /> Ranking dos Guerreiros
            </h1>
          </div>
          <Link
            href="/jogar"
            className="font-heading text-sm px-6 py-3 rounded-xl bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 font-bold shadow-lg hover:from-yellow-300 hover:to-amber-500 transition-all inline-flex items-center gap-2"
          >
            <Play className="w-4 h-4" fill="currentColor" /> Entrar na disputa
          </Link>
        </div>

        <RankingLive initial={initial} />

        <p className="text-center mt-8">
          <Link href="/jogar" className="text-orange-300 hover:text-orange-200 text-sm inline-flex items-center gap-1">
            Crie seu guerreiro e entre no ranking <ChevronRight className="w-4 h-4" />
          </Link>
        </p>
      </div>
    </main>
  );
}
