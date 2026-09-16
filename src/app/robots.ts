import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://guerreiros-misticos.exemplo.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'], // APIs não são indexáveis
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
