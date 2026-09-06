// tests/tournament-thumbs-state.test.ts
//
// 0076 B5 (the app half): the four thumbnail states, asserted on the REAL
// module both spectator components import.
//
// WHY THIS IS AUTOMATED AT ALL, given that feature correctness belongs in a
// harness: three of the four states are SILENT when they go wrong. A `refused`
// URL that leaks into an `src` attribute renders as an empty box, which is what
// an entry with no picture also renders as; a widened predicate that starts
// admitting `javascript:` throws nothing, type-checks, and looks identical on
// screen. The visible half -- that the four PAINT differently and that none of
// them moves the row -- is the browser pass's job and is not duplicated here.

import { describe, expect, test } from 'vitest';
import {
	THUMBNAIL_MARK,
	thumbnailRefused,
	thumbnailSrc,
	thumbnailState
} from '../src/lib/tournaments/thumbnail';

describe('what may reach an src attribute', () => {
	test('http and https are handed over, verbatim', () => {
		// Verbatim matters: the value the browser gets must be the value the
		// column holds, or a spectator's picture and the stored row disagree.
		const https = 'https://example-ref.supabase.co/storage/v1/object/public/tournament-thumbs/u/a.png';
		const http = 'http://127.0.0.1:54421/storage/v1/object/public/tournament-thumbs/u/a.png';
		expect(thumbnailSrc(https)).toBe(https);
		expect(thumbnailSrc(http)).toBe(http);
	});

	test('THE LOCAL STACK IS WHY http IS ALLOWED, and it is a real address', () => {
		// CLAUDE.md pins the local Supabase stack to 544xx over http, so an
		// https-only rule would have shown a fault tile for every perfectly good
		// thumbnail in every local pass. This is that case, named.
		expect(
			thumbnailState('http://127.0.0.1:54421/storage/v1/object/public/tournament-thumbs/u/a.png')
		).toBe('present');
	});

	test('every other scheme is refused, and refusal is a NULL rather than a flag', () => {
		// Null is the mechanism: a caller writing `{#if thumbnailSrc(u)}` cannot
		// emit the rejected string. A boolean beside `src={u}` eventually does.
		for (const bad of [
			'javascript:alert(1)',
			'JavaScript:alert(1)',
			'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
			'blob:https://example.com/9f0',
			'file:///etc/passwd',
			'ftp://example.com/a.png'
		]) {
			expect(thumbnailSrc(bad)).toBeNull();
			expect(thumbnailRefused(bad)).toBe(true);
			expect(thumbnailState(bad)).toBe('refused');
		}
	});

	test('a value URL() cannot parse is refused, including a relative path', () => {
		for (const bad of ['/u/a.png', 'u/a.png', 'not a url', 'https://']) {
			expect(thumbnailSrc(bad)).toBeNull();
		}
		// POSITIVE CONTROL on the same reading: the parser is not simply
		// rejecting everything handed to it.
		expect(thumbnailSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
	});

	test('A BACKSLASH FORM IS AN ORDINARY https URL, and this test asserted the opposite first', () => {
		// `https:/\evil.example/a.png` was written here as a value `URL()` would
		// reject. It does not: the URL spec NORMALIZES backslashes to forward
		// slashes for a special scheme, so the parser answers
		// `https://evil.example/a.png` and the predicate allows it. Recorded
		// rather than deleted, because the wrong intuition -- that a weird
		// spelling of a URL is a way past the check -- is the one worth having
		// written down, and because allowing it costs nothing: an external
		// https image is admitted whichever way it is spelled, by the rule
		// above.
		const odd = 'https:/\\evil.example/a.png';
		expect(new URL(odd).protocol).toBe('https:');
		expect(new URL(odd).hostname).toBe('evil.example');
		expect(thumbnailSrc(odd)).toBe(odd);
		expect(thumbnailState(odd)).toBe('present');
	});

	test('AN EXTERNAL https IMAGE IS STILL RENDERED -- 0062 says that is a designed case', () => {
		// The column comment is "Public URL or a path in the public
		// 'tournament-thumbs' bucket". A render path narrowing that to our own
		// project would be reversing a schema decision from the wrong place.
		expect(thumbnailState('https://some-other-host.example/robot.jpg')).toBe('present');
	});
});

describe('absent is not a fault, and is told apart from one', () => {
	test('null, empty and whitespace are ABSENT, never refused', () => {
		for (const nothing of [null, undefined, '', '   ', '\n\t']) {
			expect(thumbnailState(nothing)).toBe('absent');
			expect(thumbnailRefused(nothing)).toBe(false);
			expect(thumbnailSrc(nothing)).toBeNull();
		}
	});

	test('and a REFUSED value is not absent, which is the distinction that matters', () => {
		// Both render no picture. Only one of them is somebody's row being
		// declined, and a surface that collapsed them would report a walk-up
		// with no photo as a fault, forever.
		expect(thumbnailState('javascript:alert(1)')).toBe('refused');
		expect(thumbnailState(null)).toBe('absent');
	});
});

describe('failed is the element\'s answer and cannot be guessed here', () => {
	test('the load flag only ever upgrades a PRESENT url to failed', () => {
		const ok = 'https://example.com/a.png';
		expect(thumbnailState(ok, false)).toBe('present');
		expect(thumbnailState(ok, true)).toBe('failed');
	});

	test('and it cannot rescue or override the two states decided from the string', () => {
		// A component that let a stale error flag ride across an entry change
		// would otherwise report a refusal or an empty slot as a load failure.
		expect(thumbnailState(null, true)).toBe('absent');
		expect(thumbnailState('javascript:alert(1)', true)).toBe('refused');
	});
});

describe('the marks', () => {
	test('each fault state carries a glyph AND a word, and they differ', () => {
		// Colour is never the only signal, and neither is a glyph on its own:
		// the label is what an assistive reader gets, and `absent` deliberately
		// has no entry here because the caller draws the entrant initial.
		expect(THUMBNAIL_MARK.refused.glyph).not.toBe(THUMBNAIL_MARK.failed.glyph);
		expect(THUMBNAIL_MARK.refused.label).not.toBe(THUMBNAIL_MARK.failed.label);
		for (const m of Object.values(THUMBNAIL_MARK)) {
			expect(m.glyph.length).toBeGreaterThan(0);
			expect(m.label.trim().split(/\s+/).length).toBeGreaterThan(1);
			// No em dashes in user-facing copy.
			expect(m.label).not.toMatch(/—/);
		}
	});
});

describe('both spectator components use the one module', () => {
	test('neither writes `src={entry.thumbnail_url}` any more', async () => {
		// The sweep is the point: this is a rule about the render path, and a
		// third surface added later that binds the raw column reddens here
		// rather than shipping a silent hole.
		const { readFileSync, readdirSync } = await import('node:fs');
		const dir = 'src/lib/tournaments';
		const svelte = readdirSync(dir).filter((f) => f.endsWith('.svelte'));
		expect(svelte.length).toBeGreaterThan(10); // the sweep found files at all
		const offenders: string[] = [];
		let importers = 0;
		for (const f of svelte) {
			const text = readFileSync(`${dir}/${f}`, 'utf8');
			if (/src=\{[^}]*\.thumbnail_url[^}]*\}/.test(text)) offenders.push(f);
			if (text.includes("from './thumbnail'")) importers += 1;
		}
		expect(offenders).toEqual([]);
		// POSITIVE CONTROL: the two components that DO render a thumbnail import
		// the module, so "no offenders" cannot be a sweep that read nothing.
		expect(importers).toBe(2);
	});
});
