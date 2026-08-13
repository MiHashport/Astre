import type { MetadataRoute } from 'next';

// Set NEXT_PUBLIC_SITE_URL once a custom domain exists; falls back to the
// Vercel-assigned deployment URL in the meantime.
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
