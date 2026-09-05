// tests/avatar-proxy.test.ts
//
// 0052: AN UPLOADED AVATAR IS ASKED FOR ON OUR ORIGIN, IN EXACTLY ONE PLACE.
//
// 0181 makes the `avatars` bucket private, so the Storage PUBLIC object URL
// that `avatarUploadUrl` builds -- and that every surface in this app used to
// put in its own HTML -- answers nothing. The client half is a single rewrite
// inside `Avatar.svelte`: an `upload:<key>` renders `/api/avatar/<key>`, and
// `src/routes/api/avatar/[...path]/+server.ts` mints a signed URL on the caller's
// own client and 302s.
//
// WHY THIS FILE EXISTS RATHER THAN A HARNESS PASS. Three of its claims fail
// SILENTLY and none of them is visible on screen:
//
//   1. A SECOND PLACE BUILDING THE URL. The whole design rests on there being
//      exactly one, because the surfaces this bundle could not edit -- the
//      GAUNTLET leaderboard above all -- keep working only by going through
//      that one. A second call site renders a perfectly normal-looking broken
//      image for one surface and nothing anywhere says which.
//   2. THE STORAGE URL COMING BACK. A regression that reinstates the public
//      URL renders IDENTICALLY today (the bucket is closed by a migration
//      applied by hand, so a deployment before it still serves the old URL
//      fine) and re-opens the hole the moment 0181 lands.
//   3. A TRAVERSAL REACHING THE KEY. `profiles.avatar` is free text on a row
//      its owner updates directly, so `upload:../../x` is writable today. It
//      was harmless while the URL was a dead public link; it is an input to a
//      storage key now.
//
// THE GAUNTLET LEADERBOARD IS THE CONSTRAINT AND IS PROVED HERE, not assumed:
// `src/routes/gauntlet/**` is read-only to this bundle, so the last two tests
// render the real `Avatar` against the leaderboard's OWN row shape and sweep
// the leaderboard page for any URL construction of its own.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'svelte/server';
import Avatar from '$lib/Avatar.svelte';
import {
	AVATAR_PROXY_PREFIX,
	avatarObjectKey,
	avatarProxyUrl,
	proxiedAvatarSource
} from '$lib/avatars';
import type { UserProfile } from '$lib/profile';

const UID = 'b4b40903-b1bf-4df4-90a5-7e6f0dbc4fd2';
const KEY = `${UID}/avatar-1757000000000.png`;
const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

function profile(over: Partial<UserProfile>): UserProfile {
	return {
		id: UID,
		email: 'alice@boscotech.net',
		full_name: 'Alice Alvarez',
		display_name: null,
		avatar_url: null,
		avatar: null,
		role: 'student',
		section_id: null,
		pathway: null,
		preferences: {},
		...over
	} as UserProfile;
}

// ---------------------------------------------------------------------------
// The predicate.
// ---------------------------------------------------------------------------

describe('avatarObjectKey: what counts as a storage key', () => {
	it('accepts the shape ProfileMenu actually writes', () => {
		expect(avatarObjectKey(`upload:${KEY}`)).toBe(KEY);
		// `<uid>/avatar-<Date.now()>.<ext>` is the literal template in
		// ProfileMenu's onUpload. Anything that stops matching it here is a
		// change to that template and has to move both.
		expect(avatarObjectKey(`upload:${UID}/avatar-1.jpeg`)).toBe(`${UID}/avatar-1.jpeg`);
	});

	it('answers null for everything that is not an upload', () => {
		for (const v of [null, undefined, '', 'preset:hex', 'https://lh3.example/a.jpg']) {
			expect(avatarObjectKey(v)).toBeNull();
		}
	});

	it('REFUSES A TRAVERSAL, which is a value a signed-in person can write today', () => {
		// `profiles.avatar` has no CHECK constraint and no validating RPC; 0001's
		// "update own profile" policy admits any text on your own row. So these
		// are not hypotheticals, they are values the column accepts.
		for (const bad of [
			'upload:../../etc/passwd',
			'upload:..%2f..%2fx.png',
			`upload:${UID}/../../x.png`,
			`upload:${UID}/sub/dir/x.png`,
			'upload:/absolute/x.png',
			`upload:${UID}/`,
			`upload:${UID}`,
			'upload:not-a-uuid/x.png',
			`upload:${UID}/x?y=1`,
			`upload:${UID}/x#f`,
			`upload:${UID}/a b.png`
		]) {
			expect(avatarObjectKey(bad), bad).toBeNull();
		}
	});

	it('builds a URL on OUR origin, relative, with every segment encoded', () => {
		const url = avatarProxyUrl(KEY);
		expect(url).toBe(`${AVATAR_PROXY_PREFIX}${KEY}`);
		expect(url.startsWith('/')).toBe(true);
		expect(url).not.toContain('supabase');
		expect(url).not.toContain('://');
	});
});

// ---------------------------------------------------------------------------
// The rewrite. Only the upload case moves.
// ---------------------------------------------------------------------------

describe('proxiedAvatarSource moves the upload case and nothing else', () => {
	it('rewrites an upload', () => {
		const out = proxiedAvatarSource(`upload:${KEY}`, { kind: 'image', url: 'https://x/pub' }, 'AA');
		expect(out).toEqual({ kind: 'image', url: avatarProxyUrl(KEY) });
	});

	it('LEAVES A GOOGLE PHOTO ALONE -- it is not in our store and not ours to gate', () => {
		const g = { kind: 'image', url: 'https://lh3.googleusercontent.com/a/x' } as const;
		expect(proxiedAvatarSource(null, g, 'AA')).toBe(g);
	});

	it('leaves a preset alone -- inline SVG, no request at all', () => {
		const p = { kind: 'preset', preset: { id: 'hex', label: 'Hex', fg: '#0f0', d: 'M0 0' } } as const;
		expect(proxiedAvatarSource('preset:hex', p, 'AA')).toBe(p);
	});

	it('A MALFORMED UPLOAD FALLS TO THE TILE, never to a hole and never to a raw URL', () => {
		const out = proxiedAvatarSource('upload:../../x', { kind: 'image', url: 'https://x/pub' }, 'AA');
		expect(out).toEqual({ kind: 'initials', text: 'AA' });
	});
});

// ---------------------------------------------------------------------------
// What the component actually emits.
// ---------------------------------------------------------------------------

describe('Avatar.svelte emits the proxy URL and never the storage URL', () => {
	it('an uploaded avatar renders <img src="/api/avatar/...">', () => {
		const html = strip(render(Avatar, { props: { profile: profile({ avatar: `upload:${KEY}` }) } }).body);
		expect(html).toContain(`src="${avatarProxyUrl(KEY)}"`);
		expect(html).toContain('<img');
	});

	it('AND CARRIES NO SUPABASE STORAGE URL, on the subject path either', () => {
		for (const html of [
			strip(render(Avatar, { props: { profile: profile({ avatar: `upload:${KEY}` }) } }).body),
			strip(render(Avatar, { props: { subject: { avatar: `upload:${KEY}`, display_name: 'Alice Alvarez' } } }).body)
		]) {
			expect(html).not.toContain('/storage/v1/object/public/');
			expect(html).toContain(avatarProxyUrl(KEY));
		}
	});

	it('A REFUSED-SHAPED VALUE AND NO VALUE AT ALL RENDER THE IDENTICAL TILE', () => {
		// B2's requirement, at the one place it can be asserted structurally: a
		// person whose picture the server would refuse must not be
		// distinguishable from a person who has none. The SERVER half is the
		// bodyless 404 in the route; this is the client half, and the two
		// together are what make a roster say nothing about who was refused.
		const none = strip(render(Avatar, { props: { profile: profile({}) } }).body);
		const bad = strip(render(Avatar, { props: { profile: profile({ avatar: 'upload:../../x' }) } }).body);
		expect(bad).toBe(none);
		expect(bad).not.toContain('<img');
	});

	it('a Google photo is still rendered straight, unproxied', () => {
		const url = 'https://lh3.googleusercontent.com/a/x';
		const html = strip(render(Avatar, { props: { profile: profile({ avatar_url: url }) } }).body);
		expect(html).toContain(`src="${url}"`);
	});
});

// ---------------------------------------------------------------------------
// The sweep: one place builds the URL.
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|ts)$/.test(name)) out.push(p);
	}
	return out;
}

const SRC = walk('src');

/**
 * COMMENTS ARE STRIPPED BEFORE EVERY SWEEP BELOW. Every file that has a REASON
 * to mention the old URL or the new route mentions it in PROSE -- both
 * `avatars.ts` and `Avatar.svelte` carry the whole argument in their headers,
 * naming the endpoint that was closed and the route that replaced it. A sweep
 * over raw bytes therefore reddens on the documentation and says nothing at
 * all about the code, which is the failure mode that makes a checker get
 * deleted rather than fixed.
 */
const code = (p: string) =>
	readFileSync(p, 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('the URL is built in exactly one place', () => {
	it('SWEPT SOMETHING: the positive control for every absence below', () => {
		// A sweep over an empty file list comes back clean and reads exactly like
		// a sweep that found nothing wrong.
		expect(SRC.length).toBeGreaterThan(300);
		expect(SRC.some((p) => p.endsWith(join('lib', 'Avatar.svelte')))).toBe(true);
	});

	it('NOTHING UNDER src/ CALLS avatarUploadUrl -- its result no longer reaches a screen', () => {
		// It is still EXPORTED from `$lib/profile.ts`, which this bundle does not
		// own, and `avatarSource` still calls it internally to build a source
		// `Avatar.svelte` then rewrites. What must not exist is a SECOND caller,
		// because that one would render the closed bucket's URL.
		const callers = SRC.filter(
			(p) => !p.endsWith(join('lib', 'profile.ts')) && /\bavatarUploadUrl\s*\(/.test(code(p))
		);
		expect(callers).toEqual([]);
	});

	it('NO NEW FILE BUILDS A STORAGE PUBLIC-OBJECT URL, and the survivor is named', () => {
		// PINNED ALLOWLIST RATHER THAN A BUCKET-NAME REGEX, because the bucket
		// name is INTERPOLATED at the one real call site
		// (`${MAPS_MEDIA_BUCKET}`), so a regex naming a bucket would have missed
		// it -- and would equally miss an `${AVATARS_BUCKET}` written the same
		// way tomorrow. The endpoint itself cannot be interpolated away, so the
		// sweep is on the endpoint and the list of files allowed to contain it
		// is written down.
		//
		// `maps-media` (0163) is a genuinely public bucket of photographs of a
		// TOOLBOX, uploaded by admins, and 0181 does not touch it. It is on this
		// list because it is correct, not because it is grandfathered -- and a
		// bundle that closes it removes the line.
		//
		// `profile.ts` is the RETIRED builder. `avatarUploadUrl` is still
		// exported from it and `avatarSource` still calls it internally, and it
		// is on this list rather than deleted for one reason: that file is
		// outside the ownership of the bundle that closed the bucket. What makes
		// leaving it safe is the sweep ABOVE this one -- no other file in the
		// tree calls it, so its result reaches `Avatar.svelte`, which rewrites
		// it, and reaches nothing else. Deleting it is a one-line follow-up for
		// whoever next owns `$lib/profile.ts`, and this line is the reminder.
		const ALLOWED = ['src/lib/maps/media.ts', 'src/lib/profile.ts'];
		const hits = SRC.filter((p) => /storage\/v1\/object\/public\//.test(code(p)));
		expect(hits.sort()).toEqual(ALLOWED);
	});

	it('CONTROL: that sweep really does find something, so an empty result would mean something', () => {
		// The previous assertion is an equality against a NON-EMPTY list, so it
		// already cannot pass vacuously -- this restates it as the count, which
		// is the number a reader checks.
		expect(SRC.filter((p) => /storage\/v1\/object\/public\//.test(code(p))).length).toBe(2);
	});

	it('AND THE PROXY PREFIX IS SPELLED IN ONE MODULE', () => {
		const hits = SRC.filter((p) => {
			if (p.endsWith(join('lib', 'avatars.ts'))) return false;
			return /['"`]\/avatar\//.test(code(p));
		});
		expect(hits).toEqual([]);

		// The positive control: the one module that DOES spell it.
		expect(/['"`]\/api\/avatar\//.test(code('src/lib/avatars.ts'))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// The GAUNTLET leaderboard, which this bundle may not edit.
// ---------------------------------------------------------------------------

describe('the GAUNTLET leaderboard keeps working without being edited', () => {
	const PAGE = 'src/routes/gauntlet/leaderboard/+page.svelte';

	it('mounts the shared Avatar and builds no avatar URL of its own', () => {
		const src = readFileSync(PAGE, 'utf8');
		expect(src).toContain("from '$lib/Avatar.svelte'");
		expect(src).toContain('<Avatar');
		expect(src).not.toContain('avatarUploadUrl');
		expect(src).not.toContain('/storage/v1/object/public/');
	});

	it("renders through the component for the leaderboard's OWN row shape", () => {
		// `toProfile(row)` on that page widens an `OverallRow` -- user_id,
		// display_name, full_name, avatar, avatar_url, pathway -- into a
		// UserProfile. This is that shape, rendered through the real component,
		// which is the only claim that says the closure reaches a surface the
		// bundle could not touch.
		const row = {
			id: UID,
			email: null,
			full_name: 'Alice Alvarez',
			display_name: null,
			avatar: `upload:${KEY}`,
			avatar_url: null,
			role: 'student',
			section_id: null,
			pathway: 'IDEA',
			preferences: {}
		} as unknown as UserProfile;
		const html = strip(render(Avatar, { props: { profile: row, size: 28 } }).body);
		expect(html).toContain(`src="${avatarProxyUrl(KEY)}"`);
		expect(html).not.toContain('/storage/v1/object/public/');
	});
});
