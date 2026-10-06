/**
 * THE ARMORY AGENT DOWNLOADS, from the latest GitHub Release of
 * pina-hash/idea-armory, which is a PRIVATE repository: a browser cannot fetch
 * its assets, so the site does, with `ARMORY_RELEASES_TOKEN` (a read-only
 * token), and streams the bytes on.
 *
 * THE ONE READER OF `ARMORY_RELEASES_TOKEN`. It is read at call time through
 * `$env/dynamic/private`; unset answers null, and /armory/download says "Ask
 * Mr. Pina for the Armory flash drive" rather than showing a link that cannot
 * work. The token goes to api.github.com and nowhere else: GitHub answers an
 * asset request with a redirect to a short-lived signed URL on another host,
 * and that hop is made WITHOUT the token (`redirect: 'manual'`, then a fresh
 * request), so the credential never leaves for a host it was not issued for.
 */
import { env } from '$env/dynamic/private';

export const ARMORY_RELEASES_REPO = 'pina-hash/idea-armory';
const API = 'https://api.github.com';
const CACHE_MS = 5 * 60 * 1000;

export interface ArmoryReleaseFile {
	id: number;
	name: string;
	size: number;
	/** From the release notes' SHA-256 list; null when the notes do not name it. */
	sha256: string | null;
	kind: 'laptop' | 'flash-drive' | 'other';
}

export interface ArmoryRelease {
	tag: string;
	name: string;
	publishedAt: string | null;
	files: ArmoryReleaseFile[];
}

/** The SHA-256 lines in the notes: "- `NAME`: `64 hex`". */
export function shaFromNotes(body: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of body.matchAll(/`([^`\s]+)`\s*:\s*`([0-9a-fA-F]{64})`/g)) out.set(m[1], m[2].toLowerCase());
	return out;
}

export function fileKind(name: string): ArmoryReleaseFile['kind'] {
	if (/setup.*\.exe$/i.test(name)) return 'laptop';
	if (/usb.*\.zip$/i.test(name)) return 'flash-drive';
	return 'other';
}

export function releasesToken(source: Record<string, string | undefined> = env): string | null {
	const token = (source.ARMORY_RELEASES_TOKEN ?? '').trim();
	return token === '' ? null : token;
}

function apiHeaders(token: string, accept = 'application/vnd.github+json'): Record<string, string> {
	return {
		accept,
		authorization: `Bearer ${token}`,
		'x-github-api-version': '2022-11-28',
		'user-agent': 'ideabosco-armory'
	};
}

let cached: { at: number; token: string; release: ArmoryRelease } | null = null;

/** For tests: forget the cached release. */
export function _resetReleaseCache(): void {
	cached = null;
}

/**
 * The latest release, or null when there is no token or GitHub would not
 * answer. Cached per instance for five minutes; a student reloading the page
 * does not cost a GitHub call each time.
 */
export async function latestArmoryRelease(
	fetcher: typeof fetch = fetch,
	now: number = Date.now(),
	token: string | null = releasesToken()
): Promise<ArmoryRelease | null> {
	if (!token) return null;
	if (cached && cached.token === token && now - cached.at < CACHE_MS) return cached.release;
	let response: Response;
	try {
		response = await fetcher(`${API}/repos/${ARMORY_RELEASES_REPO}/releases/latest`, {
			headers: apiHeaders(token),
			signal: AbortSignal.timeout(8000)
		});
	} catch {
		return null;
	}
	if (!response.ok) return null;
	const data = (await response.json()) as {
		tag_name?: string;
		name?: string;
		published_at?: string | null;
		body?: string | null;
		assets?: Array<{ id: number; name: string; size: number; digest?: string | null }>;
	};
	const shas = shaFromNotes(data.body ?? '');
	const files = (data.assets ?? [])
		.filter((a) => !a.name.toLowerCase().endsWith('.sha256'))
		.map((a) => ({
			id: a.id,
			name: a.name,
			size: a.size,
			sha256: shas.get(a.name) ?? null,
			kind: fileKind(a.name)
		}));
	const release: ArmoryRelease = {
		tag: data.tag_name ?? '',
		name: data.name ?? data.tag_name ?? '',
		publishedAt: data.published_at ?? null,
		files
	};
	cached = { at: now, token, release };
	return release;
}

/**
 * The bytes of one file of the latest release, as a streaming Response, or a
 * bare status when it cannot be had. Only names the latest release lists are
 * served, so the route cannot be turned into a fetcher for anything else.
 */
export async function streamArmoryReleaseFile(
	name: string,
	fetcher: typeof fetch = fetch,
	now: number = Date.now(),
	token: string | null = releasesToken()
): Promise<Response> {
	if (!token) return new Response('Not available.', { status: 503 });
	const release = await latestArmoryRelease(fetcher, now, token);
	if (!release) return new Response('Not available.', { status: 503 });
	const file = release.files.find((f) => f.name === name);
	if (!file) return new Response('Not found.', { status: 404 });

	let upstream = await fetcher(`${API}/repos/${ARMORY_RELEASES_REPO}/releases/assets/${file.id}`, {
		headers: apiHeaders(token, 'application/octet-stream'),
		redirect: 'manual'
	});
	if (upstream.status >= 300 && upstream.status < 400) {
		const location = upstream.headers.get('location');
		if (!location || !location.startsWith('https://')) return new Response('Not available.', { status: 502 });
		// The signed URL carries its own authorization; the token stays behind.
		upstream = await fetcher(location, { headers: { 'user-agent': 'ideabosco-armory' } });
	}
	if (!upstream.ok || !upstream.body) return new Response('Not available.', { status: 502 });
	const headers: Record<string, string> = {
		'content-type': 'application/octet-stream',
		'content-disposition': `attachment; filename="${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
		'x-content-type-options': 'nosniff',
		'cache-control': 'private, no-store'
	};
	const length = upstream.headers.get('content-length');
	if (length) headers['content-length'] = length;
	return new Response(upstream.body, { status: 200, headers });
}
