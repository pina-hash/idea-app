/**
 * THE ARMORY AGENT DOWNLOADS, from the latest GitHub Release of
 * pina-hash/idea-armory.
 *
 * THREE WAYS, IN ORDER (ledger 0366), and `installerDownload` is the one
 * decision. (1) When the release answers an UNAUTHENTICATED request (the
 * repository is public, which it was on 2026-10-06), the browser is sent
 * straight to GitHub's own `browser_download_url`: one click, no bytes through
 * a Vercel function. (2) Otherwise, when the repository is private and the
 * server holds `ARMORY_RELEASES_TOKEN`, the site fetches and streams the
 * bytes. (3) Otherwise there is no link, only the flash-drive sentence. This
 * header used to say the repository IS private; it is public now, and the
 * token path stays for the day it is made private again.
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

/** Where a release was read from, which decides how its files are fetched. */
export interface SourcedRelease {
	source: 'public' | 'token';
	release: ArmoryRelease;
	/** For a public release: each file's GitHub download URL, checked to be this repository's. */
	urls: Record<string, string>;
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

let cachedPublic: { at: number; value: SourcedRelease | null } | null = null;

/** For tests: forget the cached release. */
export function _resetReleaseCache(): void {
	cached = null;
	cachedPublic = null;
}

/** The only URLs a public release may send a browser to. */
export const PUBLIC_DOWNLOAD_PREFIX = `https://github.com/${ARMORY_RELEASES_REPO}/releases/download/`;

type ReleaseJson = {
	tag_name?: string;
	name?: string;
	published_at?: string | null;
	body?: string | null;
	assets?: Array<{ id: number; name: string; size: number; browser_download_url?: string }>;
};

function toRelease(data: ReleaseJson): ArmoryRelease {
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
	return {
		tag: data.tag_name ?? '',
		name: data.name ?? data.tag_name ?? '',
		publishedAt: data.published_at ?? null,
		files
	};
}

/**
 * The latest release as anybody on the internet sees it: no token. Null when
 * GitHub answers anything but 200 (a private repository answers 404). A null
 * is cached too, for a minute, so a private repository costs one call a minute.
 */
export async function publicArmoryRelease(fetcher: typeof fetch = fetch, now: number = Date.now()): Promise<SourcedRelease | null> {
	if (cachedPublic && now - cachedPublic.at < (cachedPublic.value ? CACHE_MS : 60_000)) return cachedPublic.value;
	let value: SourcedRelease | null = null;
	try {
		const response = await fetcher(`${API}/repos/${ARMORY_RELEASES_REPO}/releases/latest`, {
			headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ideabosco-armory' },
			signal: AbortSignal.timeout(8000)
		});
		if (response.ok) {
			const data = (await response.json()) as ReleaseJson;
			const release = toRelease(data);
			const urls: Record<string, string> = {};
			for (const a of data.assets ?? []) {
				const url = a.browser_download_url ?? '';
				if (url.startsWith(PUBLIC_DOWNLOAD_PREFIX) && !url.includes('..')) urls[a.name] = url;
			}
			value = { source: 'public', release, urls };
		}
	} catch {
		value = null;
	}
	cachedPublic = { at: now, value };
	return value;
}

/** The release the download page lists: public first, then the token's. */
export async function armoryRelease(
	fetcher: typeof fetch = fetch,
	now: number = Date.now(),
	token: string | null = releasesToken()
): Promise<SourcedRelease | null> {
	const pub = await publicArmoryRelease(fetcher, now);
	if (pub) return pub;
	const release = await latestArmoryRelease(fetcher, now, token);
	return release ? { source: 'token', release, urls: {} } : null;
}

export type InstallerDownload =
	| { branch: 'public'; name: string; url: string; tag: string }
	| { branch: 'token'; name: string; tag: string }
	| { branch: 'none' };

/** "Get the Windows app": the installer for one's own computer, by the first way that works. */
export async function installerDownload(
	fetcher: typeof fetch = fetch,
	now: number = Date.now(),
	token: string | null = releasesToken()
): Promise<InstallerDownload> {
	const found = await armoryRelease(fetcher, now, token);
	const file = found?.release.files.find((f) => f.kind === 'laptop');
	if (!found || !file) return { branch: 'none' };
	if (found.source === 'public') {
		const url = found.urls[file.name];
		return url ? { branch: 'public', name: file.name, url, tag: found.release.tag } : { branch: 'none' };
	}
	return { branch: 'token', name: file.name, tag: found.release.tag };
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
