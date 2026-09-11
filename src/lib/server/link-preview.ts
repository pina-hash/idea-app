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
 * The IPv4 rules below are written against a dotted quad, so every host that is
 * an IPv4 address in disguise has to arrive here as one. WHATWG `URL` already
 * canonicalizes the decimal, octal and hex spellings -- `http://2130706433/` has a
 * `hostname` of `127.0.0.1` by the time this is called, measured -- so the one
 * literal form it leaves intact is IPv6, which is where the gap was.
 */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** The eight hextets of an IPv6 address, or null if it is not one. */
function expandIpv6(text: string): number[] | null {
	// A zone id is not part of the address.
	const zone = text.indexOf('%');
	let body = zone >= 0 ? text.slice(0, zone) : text;

	// A trailing dotted quad is the textual mapped form. Fold it into two
	// hextets so the whole address is one vocabulary and there is one place
	// below that decides what an embedded IPv4 address is.
	const dotted = /^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(body);
	if (dotted) {
		const m = IPV4.exec(dotted[2]);
		if (!m) return null;
		const o = m.slice(1).map(Number);
		if (o.some((n) => n > 255)) return null;
		body = `${dotted[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
	}

	const halves = body.split('::');
	if (halves.length > 2) return null;
	const hextets = (part: string): number[] | null => {
		if (!part) return [];
		const out: number[] = [];
		for (const piece of part.split(':')) {
			if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
			out.push(parseInt(piece, 16));
		}
		return out;
	};
	const head = hextets(halves[0] ?? '');
	const tail = halves.length === 2 ? hextets(halves[1] ?? '') : [];
	if (!head || !tail) return null;
	if (halves.length === 2) {
		const gap = 8 - head.length - tail.length;
		if (gap < 1) return null;
		return [...head, ...Array(gap).fill(0), ...tail];
	}
	return head.length === 8 ? head : null;
}

/**
 * The IPv4 address an IPv6 literal is carrying, if it is carrying one.
 *
 * `::ffff:a.b.c.d` is IPv4-MAPPED and `::a.b.c.d` is the deprecated
 * IPv4-COMPATIBLE form; a stack that accepts either connects to the IPv4
 * address, so both have to be read as IPv4 here or the IPv4 rules never run on
 * them. `::` and `::1` are deliberately NOT treated as embedded IPv4 --
 * they are ordinary IPv6 addresses that happen to fit the compatible shape, and
 * handing them to the IPv4 arm is how `::1` would stop being loopback.
 */
function embeddedIpv4(hextets: number[]): string | null {
	if (!hextets.slice(0, 5).every((x) => x === 0)) return null;
	if (hextets[5] !== 0xffff && hextets[5] !== 0) return null;
	if (hextets[5] === 0 && hextets[6] === 0 && hextets[7] <= 1) return null;
	const hi = hextets[6];
	const lo = hextets[7];
	return `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
}

/**
 * Blocks the addresses a link preview has no business reaching. The URL comes
 * from a teacher rather than an anonymous stranger, so this is not the primary
 * defence -- but "the server will fetch any URL you type" is still a request
 * forgery primitive, and refusing loopback and private ranges costs nothing.
 * Hostnames are not resolved here (a DNS answer can change between the check
 * and the fetch); this catches the literal forms, which is what a mistyped or
 * pasted internal link actually looks like.
 *
 * AN IPv4-MAPPED IPv6 ADDRESS IS A LITERAL FORM AND USED TO PASS EVERY BRANCH.
 * `::ffff:127.0.0.1` is loopback and answered false: it is not the string
 * `::1`, it does not start with `fc`/`fd`, and the `/^127\./` test cannot match a
 * string beginning `::ffff:`. Worse, `URL` canonicalizes it to the HEX form
 * `[::ffff:7f00:1]` before this ever sees it, so a check written against the
 * dotted spelling would not have caught it either. The address is expanded and
 * the embedded IPv4 extracted BEFORE the rules run, so there is one set of IPv4
 * rules rather than one per spelling.
 *
 * THE IPv6 TESTS APPLY ONLY TO AN IPv6 LITERAL, WHICH IS ALSO A FIX. The
 * `fc`/`fd` prefix was tested against the bare hostname, so every public
 * name beginning with those two letters was refused -- `fcc.gov` among them,
 * measured. It only ever over-blocked, so nothing was exposed by it, but a
 * teacher linking one got no card and nothing said why.
 *
 * EXPORTED AS A TEST SEAM, the way `clearLinkPreviewCache` is. A host claim made
 * through `fetchLinkPreview` is only ever inferred: a refused address and an
 * unreachable one both answer `{ ok: false }`, and the request counter can show
 * a hop was not made but cannot show that a host WOULD have been permitted. The
 * predicate answers both directions directly, which is what a policy this narrow
 * needs.
 *
 * WHAT THIS STILL DOES NOT DO is resolve a hostname, which is the third gap and
 * a design decision rather than an oversight: see
 * `docs/decisions/entries/23-link-preview-dns-pinning.md`.
 */
export function isBlockedHost(hostname: string): boolean {
	const lower = hostname.toLowerCase();

	if (lower.startsWith('[') && lower.endsWith(']')) {
		const hextets = expandIpv6(lower.slice(1, -1));
		// An unparseable bracketed host is not something to fetch from.
		if (!hextets) return true;
		const mapped = embeddedIpv4(hextets);
		if (mapped) return isBlockedIpv4(mapped);
		// Loopback (::1) and the unspecified address (::).
		if (hextets.slice(0, 7).every((x) => x === 0) && hextets[7] <= 1) return true;
		// Unique-local, fc00::/7 -- the range the old fc/fd prefix meant.
		return (hextets[0] & 0xfe00) === 0xfc00;
	}

	if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal')) {
		return true;
	}
	if (IPV4.test(lower)) return isBlockedIpv4(lower);
	return false;
}

/** The address policy itself, unchanged: one dotted quad in, one verdict out. */
function isBlockedIpv4(quad: string): boolean {
	if (/^127\./.test(quad) || /^10\./.test(quad) || /^192\.168\./.test(quad)) return true;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(quad)) return true;
	if (/^169\.254\./.test(quad)) return true;
	if (quad === '0.0.0.0') return true;
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

/**
 * How many hops a preview will follow. Five is more than any real article needs
 * (a canonical host, a locale, a trailing slash) and is a hard stop rather than
 * a budget: a redirect chain that has not arrived by then is not a page anybody
 * is reading.
 */
const MAX_REDIRECTS = 5;

/** The statuses that carry a `location` worth following. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function fetchLinkPreview(
	rawUrl: string,
	options: FetchLinkPreviewOptions = {}
): Promise<LinkPreviewResult> {
	const failed = (url: string): LinkPreviewResult => ({ url, ok: false });

	/** One place that decides whether an address may be fetched, so every hop asks it. */
	const allowed = (url: URL): boolean => {
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
		return options.allowPrivateHosts ? true : !isBlockedHost(url.hostname);
	};

	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return failed(rawUrl);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return failed(rawUrl);
	if (!allowed(parsed)) return failed(parsed.toString());

	const key = parsed.toString();
	const hit = cacheGet(key);
	if (hit) return hit;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		// REDIRECTS ARE FOLLOWED BY HAND, AND THAT IS THE WHOLE POINT.
		// `redirect: 'follow'` checks the address ONCE, at the top, and then lets
		// the runtime walk wherever the chain goes -- so a perfectly public URL
		// that 302s to `http://169.254.169.254/` was fetched, and the guard above
		// never saw the address it actually reached. Following by hand is what
		// puts every hop through the same predicate as the first one.
		//
		// The AbortController is deliberately NOT re-armed per hop: the 4s budget
		// is for the whole walk, so a chain of slow hops cannot add up to a hung
		// page.
		let current = parsed;
		let res: Response;
		for (let hop = 0; ; hop += 1) {
			res = await fetch(current.toString(), {
				signal: controller.signal,
				redirect: 'manual',
				headers: {
					// Some hosts serve a stub to an unknown agent; naming the app is
					// honest and gets the real <head>.
					'user-agent':
						'Mozilla/5.0 (compatible; IDEAClassroomLinkPreview/1.0; +https://ideabosco.com)',
					accept: 'text/html,application/xhtml+xml'
				}
			});

			const location = REDIRECT_STATUSES.has(res.status) ? res.headers.get('location') : null;
			if (!location) break;

			// The socket is finished with the moment the hop is known; a 3xx body is
			// never read, and holding one open is how a walk exhausts the pool.
			await res.body?.cancel().catch(() => {});

			if (hop >= MAX_REDIRECTS) {
				const value = failed(key);
				cacheSet(key, value);
				return value;
			}

			let nextUrl: URL;
			try {
				// Relative against the hop that issued it, which is what a browser does.
				nextUrl = new URL(location, current);
			} catch {
				const value = failed(key);
				cacheSet(key, value);
				return value;
			}
			if (!allowed(nextUrl)) {
				const value = failed(key);
				cacheSet(key, value);
				return value;
			}
			current = nextUrl;
		}

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
		// against, and what the card should link to. It is tracked here rather
		// than read off `res.url`, which under `redirect: 'manual'` reports the
		// URL that was REQUESTED and would therefore name the first hop forever.
		const value = parseLinkMetadata(html, current.toString());
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
