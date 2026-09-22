import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Jogar — Myst Ki Warriors',
  description:
    'Entre no universo dos Myst Ki Warriors: crie seu guerreiro, treine, lute e procure as Chaves do Horizonte.',
  alternates: { canonical: '/jogar' },
  robots: { index: false, follow: true }, // app cliente: o conteúdo indexável está na landing
};

export default function JogarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
