import type { RequestHandler } from './$types';

/**
 * XML sitemap for the public routes only (`/` and `/vanguard/`). The gated and
 * internal prefixes (`/dev`, `/api`, `/auth`, and the signed-in tiers) are
 * excluded here and in `static/robots.txt`.
 */
const SITE = 'https://ideabosco.com';

const urls = [
	{ loc: `${SITE}/`, changefreq: 'weekly', priority: '1.0' },
	{ loc: `${SITE}/vanguard/`, changefreq: 'weekly', priority: '0.8' }
];

export const GET: RequestHandler = async () => {
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(u) =>
			`\t<url>\n\t\t<loc>${u.loc}</loc>\n\t\t<changefreq>${u.changefreq}</changefreq>\n\t\t<priority>${u.priority}</priority>\n\t</url>`
	)
	.join('\n')}
</urlset>
`;

	return new Response(body, {
		headers: { 'Content-Type': 'application/xml' }
	});
};
