// URL pública canônica do projeto.
// Mantém SEO, smoke tests e fallbacks alinhados ao mesmo host.
export const DEFAULT_SITE_URL = 'https://mysticwarriors-ohio.onrender.com';

export function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).trim();
  const url = new URL(raw);

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('NEXT_PUBLIC_SITE_URL precisa usar http:// ou https://');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_SITE_URL precisa apontar para a origem do site, sem caminho/query/hash');
  }

  return url.origin;
}
