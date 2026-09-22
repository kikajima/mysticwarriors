'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, Search, List, X, ArrowLeft, Sparkles, ChevronRight } from 'lucide-react';
import {
  WIKI_SECTIONS,
  wikiGroups,
  sectionSearchText,
  type WikiBlock,
  type WikiSection,
  type WikiTable,
} from '@/lib/wiki/wiki-content';

// =====================================================================
// WIKI — visão pública (sem login, sem dados sensíveis)
// ---------------------------------------------------------------------
// * Índice lateral fixo no desktop; drawer colapsável no mobile (390px);
// * Busca em tempo real (acentos ignorados) com destaque e estado vazio;
// * Links cruzados [[id|texto]] entre seções;
// * Aba própria: o jogo que abriu a wiki preserva energia/timers/luta.
// =====================================================================

/** Remove acentos e normaliza para busca case-insensitive. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------
// Renderizador de rich-text: [[id|texto]], `código`, **negrito**
// ---------------------------------------------------------------------

const LINK_RE = /\[\[([a-z0-9-]+)\|([^\]]+)\]\]/;

function HighlightableText({ text, query }: { text: string; query: string }): ReactNode {
  // 1) quebra em tokens de rich-text (regex local — nada de estado compartilhado)
  const tokenRe = /(\[\[[a-z0-9-]+\|[^\]]+\]\])|(`[^`]+`)|(\*\*[^*]+\*\*)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) parts.push(<Plain key={k++} text={text.slice(last, m.index)} query={query} />);
    const token = m[0];
    if (token.startsWith('[[')) {
      const link = LINK_RE.exec(token);
      if (link) {
        parts.push(
          <a
            key={k++}
            href={`#${link[1]}`}
            className="text-orange-300 underline decoration-orange-500/40 hover:text-orange-200 hover:decoration-orange-400 transition-colors"
          >
            <Plain text={link[2]} query={query} />
          </a>
        );
      }
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={k++} className="px-1.5 py-0.5 rounded bg-black/50 border border-amber-900/40 text-[0.85em] font-mono text-amber-200">
          <Plain text={token.slice(1, -1)} query={query} />
        </code>
      );
    } else {
      parts.push(
        <strong key={k++} className="text-amber-100">
          <Plain text={token.slice(2, -2)} query={query} />
        </strong>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(<Plain key={k++} text={text.slice(last)} query={query} />);
  return <>{parts}</>;
}

/** Texto puro com destaque da busca (case/acento-insensitive). */
function Plain({ text, query }: { text: string; query: string }): ReactNode {
  if (!query) return text;
  const normText = normalize(text);
  const normQuery = normalize(query);
  const idx = normText.indexOf(normQuery);
  if (idx < 0 || !normQuery) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-500/40 text-yellow-100 rounded-sm px-0.5">{text.slice(idx, idx + normQuery.length)}</mark>
      {text.slice(idx + normQuery.length)}
    </>
  );
}

// ---------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------

function WikiTableBlock({ table, query }: { table: WikiTable; query: string }) {
  return (
    <figure className="my-4">
      {table.caption && (
        <figcaption className="text-[11px] uppercase tracking-wider text-amber-200/50 font-heading mb-1.5 leading-relaxed">
          {table.caption}
        </figcaption>
      )}
      <div className="overflow-x-auto rounded-lg border border-amber-900/40 bg-black/30">
        <table className="w-full text-[13px] text-amber-200/85 border-collapse min-w-[480px]">
          <thead>
            <tr className="bg-amber-950/60">
              {table.headers.map((h, i) => (
                <th key={i} scope="col" className="text-left font-heading font-normal text-amber-100 px-3 py-2.5 border-b border-amber-900/50 whitespace-nowrap">
                  <Plain text={h} query={query} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-transparent' : 'bg-amber-950/20'}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 align-top border-b border-amber-900/20 last:border-b-0 leading-snug">
                    <HighlightableText text={cell} query={query} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------

const CALLOUT_STYLE: Record<string, { border: string; bg: string; icon: string; title: string }> = {
  info: { border: 'border-sky-700/40', bg: 'bg-sky-950/30', icon: 'ℹ️', title: 'text-sky-200' },
  warn: { border: 'border-red-700/40', bg: 'bg-red-950/30', icon: '⚠️', title: 'text-red-200' },
  tip: { border: 'border-emerald-700/40', bg: 'bg-emerald-950/30', icon: '💡', title: 'text-emerald-200' },
};

function BlockRenderer({ block, query }: { block: WikiBlock; query: string }) {
  if (block.kind === 'text') {
    return (
      <p className="text-[15px] leading-relaxed text-amber-200/80 my-3">
        <HighlightableText text={block.text} query={query} />
      </p>
    );
  }
  if (block.kind === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul';
    return (
      <Tag className={`my-3 space-y-1.5 pl-5 text-[15px] leading-relaxed text-amber-200/80 ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-orange-400/80`}>
        {block.items.map((item, i) => (
          <li key={i}>
            <HighlightableText text={item} query={query} />
          </li>
        ))}
      </Tag>
    );
  }
  if (block.kind === 'table') {
    return <WikiTableBlock table={block.table} query={query} />;
  }
  if (block.kind === 'details') {
    // Expandível "Detalhes para curiosos" — conteúdo NATIVO no DOM (indexado
    // pela busca e presente para leitores de tela), oculto apenas visualmente.
    return (
      <details className="my-4 group rounded-lg border border-amber-900/40 bg-black/20 open:bg-black/30 transition-colors">
        <summary className="cursor-pointer select-none px-4 py-2.5 font-heading text-[13px] text-amber-200/70 hover:text-amber-100 flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="w-3.5 h-3.5 shrink-0 text-orange-400/80 transition-transform group-open:rotate-90" />
          <Plain text={block.summary} query={query} />
        </summary>
        <div className="px-4 pb-2 pt-1 border-t border-amber-900/30 mt-1">
          {block.blocks.map((b, i) => (
            <BlockRenderer key={i} block={b} query={query} />
          ))}
        </div>
      </details>
    );
  }
  const style = CALLOUT_STYLE[block.tone];
  return (
    <aside className={`my-4 rounded-lg border ${style.border} ${style.bg} px-4 py-3`}>
      <p className="text-[14px] leading-relaxed text-amber-100/90">
        {(block.title || block.tone !== 'info') && (
          <span className={`font-heading block mb-1 ${style.title}`}>
            {style.icon} {block.title ?? (block.tone === 'warn' ? 'Atenção' : block.tone === 'tip' ? 'Dica' : 'Nota')}
          </span>
        )}
        <HighlightableText text={block.text} query={query} />
      </p>
    </aside>
  );
}

// ---------------------------------------------------------------------
// Seção
// ---------------------------------------------------------------------

function SectionArticle({ section, query }: { section: WikiSection; query: string }) {
  return (
    <article id={section.id} aria-labelledby={`h-${section.id}`} className="scroll-mt-36 lg:scroll-mt-28">
      <header className="flex items-center gap-3 border-b border-amber-900/40 pb-3 mb-1">
        <span aria-hidden className="text-3xl drop-shadow-lg">
          {section.icon}
        </span>
        <div>
          <h2 id={`h-${section.id}`} className="font-display text-2xl sm:text-3xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-orange-500 tracking-wide">
            <Plain text={section.title} query={query} />
          </h2>
          <p className="text-xs text-amber-200/50 mt-0.5">{section.summary}</p>
        </div>
      </header>
      {/* "Em resumo" — leitura rápida no topo de CADA seção */}
      <div className="mt-4 mb-1 rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-950/50 via-amber-950/25 to-transparent px-4 py-3 shadow-inner shadow-orange-950/30">
        <p className="font-heading text-[11px] uppercase tracking-[0.22em] text-orange-300/90 mb-1.5 flex items-center gap-1.5">
          <Sparkles aria-hidden className="w-3 h-3" /> Em resumo
        </p>
        <ul className="space-y-1 text-[14px] leading-relaxed text-amber-100/90">
          {section.resumo.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className="mt-[7px] w-1.5 h-1.5 rounded-full bg-orange-400/90 shrink-0" />
              <span>
                <HighlightableText text={item} query={query} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      {section.blocks.map((b, i) => (
        <BlockRenderer key={i} block={b} query={query} />
      ))}
    </article>
  );
}

// ---------------------------------------------------------------------
// Índice (sidebar / drawer)
// ---------------------------------------------------------------------

function TableOfContents({
  groups,
  activeId,
  onNavigate,
  query,
}: {
  groups: Array<{ name: string; sections: WikiSection[] }>;
  activeId: string | null;
  onNavigate?: () => void;
  query: string;
}) {
  return (
    <nav aria-label="Índice da wiki" className="space-y-5">
      {groups.map((g) => (
        <div key={g.name}>
          <p className="font-heading text-[10px] uppercase tracking-[0.2em] text-amber-200/40 mb-2 px-2">{g.name}</p>
          <ul className="space-y-0.5">
            {g.sections.map((s) => {
              const isActive = activeId === s.id;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={onNavigate}
                    title={s.summary}
                    aria-current={isActive ? 'true' : undefined}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-all border ${
                      isActive
                        ? 'bg-gradient-to-r from-orange-600/30 to-amber-800/20 border-orange-500/40 text-amber-100 shadow-inner'
                        : 'border-transparent text-amber-200/60 hover:text-amber-100 hover:bg-black/40'
                    }`}
                  >
                    <span aria-hidden className="text-base leading-none w-5 text-center">
                      {s.icon}
                    </span>
                    <Plain text={s.title} query={query} />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------

export function WikiView() {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(WIKI_SECTIONS[0]?.id ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => wikiGroups(), []);

  // Busca: filtra seções pelo texto completo (título + blocos + tabelas)
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return WIKI_SECTIONS;
    const nq = normalize(q);
    return WIKI_SECTIONS.filter((s) => normalize(sectionSearchText(s)).includes(nq));
  }, [query]);

  const isSearching = query.trim().length > 0;

  // Scroll-spy: destaca a seção visível no índice
  useEffect(() => {
    const headings = Array.from(document.querySelectorAll<HTMLElement>('article[id]'));
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, []);

  // Fecha o drawer mobile ao navegar por âncora
  const onDrawerNavigate = () => setDrawerOpen(false);

  return (
    <div className="min-h-screen bg-[#14100b] text-amber-100 flex flex-col">
      {/* Fundo decorativo (mesmo tema do jogo) */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(180,83,9,0.25), transparent), radial-gradient(ellipse 60% 40% at 90% 100%, rgba(120,53,15,0.15), transparent)',
        }}
      />

      {/* ===== Header fixo ===== */}
      <header className="sticky top-0 z-30 bg-[#14100b]/95 backdrop-blur border-b border-amber-900/40">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex items-center gap-3 py-3">
            {/* Índice mobile */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir índice da wiki"
              aria-expanded={drawerOpen}
              className="lg:hidden p-2 rounded-lg bg-black/40 border border-amber-900/40 text-amber-200/80 hover:text-amber-100 transition-colors"
            >
              <List className="w-5 h-5" />
            </button>

            <Link href="/" className="shrink-0 flex items-center gap-2 group" title="Guerreiros Místicos — página inicial">
              <span className="font-display text-xl sm:text-2xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 tracking-wide">
                Guerreiros Místicos
              </span>
              <span className="hidden sm:inline font-heading text-[10px] uppercase tracking-[0.25em] text-amber-200/40 group-hover:text-amber-200/70 transition-colors">
                Wiki
              </span>
            </Link>

            <div className="flex-1" />

            {/* Busca */}
            <div className="relative w-full max-w-xs sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/40" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar mecânica… (ex.: ímpeto)"
                aria-label="Buscar na wiki"
                className="w-full bg-black/40 border border-amber-800/50 rounded-lg pl-9 pr-8 py-2 text-sm text-amber-100 placeholder:text-amber-200/30 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-900/50 font-heading"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-amber-200/40 hover:text-amber-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Migalha */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-amber-200/40 pb-2 font-heading">
            <BookOpen className="w-3.5 h-3.5" aria-hidden />
            <span className="uppercase tracking-[0.2em]">Wiki de Mecânicas — manual completo do jogo</span>
          </div>
        </div>
      </header>

      {/* ===== Corpo ===== */}
      <div className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 relative">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 py-6">
          {/* Sidebar desktop */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-thin pr-1">
              <TableOfContents groups={groups} activeId={activeId} onNavigate={onDrawerNavigate} query={query} />
            </div>
          </aside>

          {/* Conteúdo */}
          <main ref={mainRef} aria-label="Conteúdo da wiki">
            {isSearching && (
              <p className="text-xs font-heading text-amber-200/50 mb-4" role="status">
                {filtered.length} {filtered.length === 1 ? 'seção encontrada' : 'seções encontradas'} para &quot;
                <span className="text-amber-200">{query.trim()}</span>&quot;
                {' · '}
                <button type="button" onClick={() => setQuery('')} className="underline hover:text-amber-200">
                  limpar
                </button>
              </p>
            )}

            {filtered.length === 0 ? (
              <div className="rounded-xl border border-amber-900/40 bg-[#1e1710]/90 p-8 text-center">
                <span aria-hidden className="text-5xl">🐉</span>
                <h2 className="font-heading text-amber-100 text-lg mt-3">Nenhum resultado para &quot;{query.trim()}&quot;</h2>
                <p className="text-sm text-amber-200/60 mt-1.5">
                  Nem o Oráculo do Horizonte encontrou essa mecânica. Tente outro termo — ex.: <em>ímpeto</em>, <em>zenkai</em>,{' '}
                  <em>torneio</em>, <em>chaves</em> — ou{' '}
                  <button type="button" onClick={() => setQuery('')} className="underline hover:text-amber-200">
                    veja o índice completo
                  </button>
                  .
                </p>
              </div>
            ) : (
              <div className="space-y-12">
                {filtered.map((section) => (
                  <SectionArticle key={section.id} section={section} query={isSearching ? query.trim() : ''} />
                ))}
              </div>
            )}

            {/* Rodapé de conteúdo */}
            <div className="mt-14 rounded-xl border border-amber-900/40 bg-[#1e1710]/70 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
              <p className="text-xs text-amber-200/50 leading-relaxed flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-orange-400/70" aria-hidden />
                <span>
                  Todos os números desta wiki vêm direto das constantes do jogo (transparência total). Mecânica nova?
                  Ela nasce aqui junto.
                </span>
              </p>
              <Link
                href="/"
                className="shrink-0 font-heading text-xs px-4 py-2 rounded-lg bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 font-bold shadow-md shadow-amber-900/40 hover:from-yellow-300 hover:to-amber-500 transition-all inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao jogo
              </Link>
            </div>
          </main>
        </div>
      </div>

      {/* ===== Footer (empurrado para o fim em páginas curtas) ===== */}
      <footer className="mt-auto py-4 text-center text-amber-200/30 text-xs">
        Guerreiros Místicos — Wiki de Mecânicas · transparência total: números e fórmulas reais do jogo
      </footer>

      {/* ===== Drawer mobile do índice ===== */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Índice da wiki">
          <button
            type="button"
            aria-label="Fechar índice"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-xs bg-[#1e1710] border-r border-amber-900/50 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/40">
              <p className="font-heading text-amber-100 text-sm uppercase tracking-widest flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Índice
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-amber-200/60 hover:text-amber-100 hover:bg-black/40 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <TableOfContents groups={groups} activeId={activeId} onNavigate={onDrawerNavigate} query={query} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
