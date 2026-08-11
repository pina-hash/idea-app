/**
 * Server-side link preview: fetch a URL's own metadata (title, site name,
 * image) so a link on a classroom item can render as a card.
 *
 * WHY THE SERVER DOES IT. A browser cannot read another origin's <head> --
 * CORS forbids it -- so a client-side attempt would either fail on every real
 * link or require routing through a third-party unfurling service, which would
 * hand that service the URL of everything a class is reading. Fetching here
 * means the request comes from the app, once, and is shared by every student
 * who looks at the item.
 *
 * FAILURE IS AN ORDINARY OUTCOME, NEVER AN ERROR. A slow host, a 404, a page
 * that carries no metadata and a blocked address all resolve to
 * `{ ok: false }`, and the UI renders a plain link. Nothing here throws.
 *
 * CACHING is in-memory and per-instance, deliberately rather than a table: a
 * preview is derived data with no owner, and a database cache writable by
 * anything a signed-in user can reach is a cache anyone can poison. A cold
 * serverless instance re-fetches, which costs one request and is the whole
 * downside.
 */

export interface LinkPreviewResult {
	url: string;
	ok: boolean;
	title?: string | null;
	site_name?: string | null;
	image_url?: string | null;
	description?: string | null;
}

/** Long enough for a slow CMS, short enough that a hung host is not a hung page. */
const TIMEOUT_MS = 4000;
/** Metadata lives in <head>; there is no reason to read a whole article. */
const MAX_BYTES = 256 * 1024;
const OK_TTL_MS = 6 * 60 * 60 * 1000;
/** A failure is retried sooner: the host may simply have been down. */
const FAIL_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { at: number; ttl: number; value: LinkPreviewResult }>();

function cacheGet(url: string): LinkPreviewResult | null {
	const hit = cache.get(url);
	if (!hit) return null;
	if (Date.now() - hit.at > hit.ttl) {
		cache.delete(url);
		return null;
	}
	return hit.value;
}

function cacheSet(url: string, value: LinkPreviewResult): void {
	if (cache.size >= MAX_ENTRIES) {
		// Oldest insertion first -- Map preserves it, so this is one shift, not a
		// sort. A preview cache does not need an LRU.
		const oldest = cache.keys().next();
		if (!oldest.done) cache.delete(oldest.value);
	}
	cache.set(url, { at: Date.now(), ttl: value.ok ? OK_TTL_MS : FAIL_TTL_MS, value });
}

/**
 * Blocks the addresses a link preview has no business reaching. The URL comes
 * from a teacher rather than an anonymous stranger, so this is not the primary
 * defence -- but "the server will fetch any URL you type" is still a request
 * forgery primitive, and refusing loopback and private ranges costs nothing.
 * Hostnames are not resolved here (a DNS answer can change between the check
 * and the fetch); this catches the literal forms, which is what a mistyped or
 * pasted internal link actually looks like.
 */
function isBlockedHost(hostname: string): boolean {
	const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
	if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
	if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true;
	if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
	if (/^169\.254\./.test(h)) return true;
	if (h === '0.0.0.0') return true;
	return false;
}

function decodeEntities(text: string): string {
	return text
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.trim();
}

function trimTo(value: string | null | undefined, max: number): string | null {
	if (!value) return null;
	const clean = decodeEntities(value).replace(/\s+/g, ' ').trim();
	if (!clean) return null;
	return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

/**
 * Pulls one meta value. Deliberately a regex rather than an HTML parser: the
 * only thing wanted is a handful of <meta> attributes from the head of a
 * document that is never rendered, so a parser dependency would buy nothing.
 * Attribute order varies in the wild, hence the two passes.
 */
function metaContent(html: string, key: string): string | null {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const patterns = [
		new RegExp(
			`<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["']`,
			'i'
		),
		new RegExp(
			`<meta[^>]+\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`,
			'i'
		)
	];
	for (const re of patterns) {
		const m = re.exec(html);
		if (m?.[1]) return m[1];
	}
	return null;
}

export function parseLinkMetadata(html: string, pageUrl: string): LinkPreviewResult {
	const head = html.slice(0, 200_000);
	const title =
		trimTo(metaContent(head, 'og:title'), 160) ??
		trimTo(metaContent(head, 'twitter:title'), 160) ??
		trimTo(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1], 160);
	const siteName = trimTo(metaContent(head, 'og:site_name'), 80);
	const description =
		trimTo(metaContent(head, 'og:description'), 200) ??
		trimTo(metaContent(head, 'description'), 200);

	let image = metaContent(head, 'og:image') ?? metaContent(head, 'twitter:image');
	if (image) {
		try {
			// og:image is routinely relative; a relative src on our own origin
			// would silently request a page of ours instead of the picture.
			const resolved = new URL(decodeEntities(image), pageUrl);
			image = resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.toString() : null;
		} catch {
			image = null;
		}
	}

	return {
		url: pageUrl,
		// A card with nothing on it but the URL is worse than a plain link, so
		// "no metadata at all" counts as a failure and degrades.
		ok: Boolean(title || image || description),
		title,
		site_name: siteName,
		image_url: image,
		description
	};
}

export interface FetchLinkPreviewOptions {
	/**
	 * TEST SEAM ONLY, and the one thing in this module a caller can loosen. A
	 * suite that proves the fetch/parse/cache path works has to point it at a
	 * server it started, and every address it can start one on is loopback --
	 * which is exactly what isBlockedHost refuses. The route never passes this,
	 * so production always runs with the guard on; the blocking behaviour itself
	 * is asserted separately with the flag off.
	 */
	allowPrivateHosts?: boolean;
}

export async function fetchLinkPreview(
	rawUrl: string,
	options: FetchLinkPreviewOptions = {}
): Promise<LinkPreviewResult> {
	const failed = (url: string): LinkPreviewResult => ({ url, ok: false });

	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return failed(rawUrl);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return failed(rawUrl);
	if (!options.allowPrivateHosts && isBlockedHost(parsed.hostname)) {
		return failed(parsed.toString());
	}

	const key = parsed.toString();
	const hit = cacheGet(key);
	if (hit) return hit;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(key, {
			signal: controller.signal,
			redirect: 'follow',
			headers: {
				// Some hosts serve a stub to an unknown agent; naming the app is
				// honest and gets the real <head>.
				'user-agent': 'Mozilla/5.0 (compatible; IDEAClassroomLinkPreview/1.0; +https://ideabosco.com)',
				accept: 'text/html,application/xhtml+xml'
			}
		});
		if (!res.ok || !res.body) {
			const value = failed(key);
			cacheSet(key, value);
			return value;
		}
		const type = (res.headers.get('content-type') ?? '').toLowerCase();
		if (type && !type.includes('html')) {
			const value = failed(key);
			cacheSet(key, value);
			return value;
		}

		// Read only the first chunk-run: a 40 MB page is not worth downloading
		// for a <title>, and streaming lets us stop as soon as we have enough.
		const reader = res.body.getReader();
		const decoder = new TextDecoder('utf-8', { fatal: false });
		let html = '';
		let bytes = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			html += decoder.decode(value, { stream: true });
			if (bytes >= MAX_BYTES || /<\/head>/i.test(html)) break;
		}
		await reader.cancel().catch(() => {});

		// The final URL after redirects is what a relative og:image resolves
		// against, and what the card should link to.
		const value = parseLinkMetadata(html, res.url || key);
		cacheSet(key, value);
		return value;
	} catch {
		const value = failed(key);
		cacheSet(key, value);
		return value;
	} finally {
		clearTimeout(timer);
	}
}

/** Test seam: the cache is process-wide, so a suite has to be able to clear it. */
export function clearLinkPreviewCache(): void {
	cache.clear();
}
