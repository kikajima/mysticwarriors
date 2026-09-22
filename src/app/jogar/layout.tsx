import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Jogar — Guerreiros Místicos',
  description:
    'Entre no universo dos Guerreiros Místicos: crie seu guerreiro, treine, lute e colete as Chaves do Horizonte.',
  alternates: { canonical: '/jogar' },
  robots: { index: false, follow: true }, // app cliente: o conteúdo indexável está na landing
};

export default function JogarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
