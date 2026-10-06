// tests/armory-releases.test.ts
//
// The Armory agent downloads come from a PRIVATE GitHub repository through a
// server-held token. What must hold, and would be invisible if it broke:
// the token reaches api.github.com and nowhere else (not the signed redirect
// host, not the browser), an unset token is "ask for the flash drive" rather
// than a broken link, and only files the latest release lists are served.
// The release body below is the real v0.1.0 notes' SHA-256 section.

import { beforeEach, describe, expect, test } from 'vitest';
import {
	_resetReleaseCache,
	latestArmoryRelease,
	releasesToken,
	shaFromNotes,
	streamArmoryReleaseFile
} from '../src/lib/server/armory/releases';

const TOKEN = 'github_pat_placeholder_not_real';
const NOTES =
	'## SHA-256\n- `IDEA-Armory-USB-v0.1.0.zip`: `c1f7c9e3c02cfcd06a28d0ae6c0b6da28e896271a2477ed623a16e9b7dba4163`\n' +
	'- `IDEA-Armory-Setup-v0.1.0.exe`: `65f65ac9ccb90667ec42fd298cb95fffa3e1556de68b50ff52d10201d51cbcdd`\n';
const RELEASE = {
	tag_name: 'v0.1.0',
	name: 'IDEA Armory v0.1.0',
	published_at: '2026-10-06T05:01:18Z',
	body: NOTES,
	assets: [
		{ id: 1, name: 'IDEA-Armory-Setup-v0.1.0.exe', size: 36909480 },
		{ id: 2, name: 'IDEA-Armory-Setup-v0.1.0.exe.sha256', size: 95 },
		{ id: 3, name: 'IDEA-Armory-USB-v0.1.0.zip', size: 49819497 },
		{ id: 4, name: 'IDEA-Armory-USB-v0.1.0.zip.sha256', size: 93 }
	]
};

let calls: Array<{ url: string; auth: string | null; redirect?: string }>;
const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = String(input);
	const headers = new Headers(init?.headers);
	calls.push({ url, auth: headers.get('authorization'), redirect: init?.redirect });
	if (url.endsWith('/releases/latest')) return Response.json(RELEASE);
	if (url.includes('/releases/assets/')) {
		return new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.example/signed?sig=abc' } });
	}
	if (url.startsWith('https://objects.githubusercontent.example/')) {
		return new Response('MZ-bytes', { status: 200, headers: { 'content-length': '8' } });
	}
	return new Response(null, { status: 404 });
}) as typeof fetch;

beforeEach(() => {
	calls = [];
	_resetReleaseCache();
});

describe('the release list', () => {
	test('lists the two installers with their SHA-256 from the notes, and drops the .sha256 files', async () => {
		const release = await latestArmoryRelease(fakeFetch, 0, TOKEN);
		expect(release?.tag).toBe('v0.1.0');
		expect(release?.files.map((f) => [f.name, f.kind, f.sha256])).toEqual([
			['IDEA-Armory-Setup-v0.1.0.exe', 'laptop', '65f65ac9ccb90667ec42fd298cb95fffa3e1556de68b50ff52d10201d51cbcdd'],
			['IDEA-Armory-USB-v0.1.0.zip', 'flash-drive', 'c1f7c9e3c02cfcd06a28d0ae6c0b6da28e896271a2477ed623a16e9b7dba4163']
		]);
		expect(calls).toEqual([{ url: 'https://api.github.com/repos/pina-hash/idea-armory/releases/latest', auth: `Bearer ${TOKEN}`, redirect: undefined }]);
	});
	test('no token is no release, and GitHub is never asked', async () => {
		expect(releasesToken({})).toBeNull();
		expect(releasesToken({ ARMORY_RELEASES_TOKEN: '  ' })).toBeNull();
		expect(await latestArmoryRelease(fakeFetch, 0, null)).toBeNull();
		expect(calls).toEqual([]);
	});
	test('the notes parser reads the published shape and nothing looser', () => {
		expect(shaFromNotes(NOTES).size).toBe(2);
		expect(shaFromNotes('`a.zip`: `abc`').size).toBe(0);
	});
});

describe('streaming one file', () => {
	test('streams the bytes, and the token never leaves for the signed host', async () => {
		const r = await streamArmoryReleaseFile('IDEA-Armory-USB-v0.1.0.zip', fakeFetch, 0, TOKEN);
		expect(r.status).toBe(200);
		expect(await r.text()).toBe('MZ-bytes');
		expect(r.headers.get('content-disposition')).toBe('attachment; filename="IDEA-Armory-USB-v0.1.0.zip"');
		expect(r.headers.get('content-type')).toBe('application/octet-stream');
		const signed = calls.find((c) => c.url.startsWith('https://objects.githubusercontent.example/'));
		expect(signed?.auth).toBeNull();
		const asset = calls.find((c) => c.url.includes('/releases/assets/3'));
		expect(asset?.auth).toBe(`Bearer ${TOKEN}`); // positive control: the API hop does carry it
		expect(asset?.redirect).toBe('manual');
		for (const [name, value] of r.headers) expect(`${name}: ${value}`).not.toContain(TOKEN);
	});
	test('a name the release does not list is 404, and no asset is fetched', async () => {
		const r = await streamArmoryReleaseFile('../../etc/passwd', fakeFetch, 0, TOKEN);
		expect(r.status).toBe(404);
		expect(calls.some((c) => c.url.includes('/releases/assets/'))).toBe(false);
	});
	test('no token is 503', async () => {
		expect((await streamArmoryReleaseFile('IDEA-Armory-USB-v0.1.0.zip', fakeFetch, 0, null)).status).toBe(503);
	});
});
