// tests/foundry-telemetry-surfaces.test.ts
//
// THE CLIENT HALF OF THE PLAY-TELEMETRY GUARANTEES, and only the parts whose
// regression would be SILENT.
//
// There are two of those and they are both absences, which is exactly the kind
// of thing nothing else catches. Absence is the mechanism all over this
// feature, and an absence has no test unless somebody writes one: adding a
// transport "for consistency" to a surface that deliberately has none does not
// throw, does not fail a type check, and does not look wrong on screen. It just
// quietly changes what the numbers mean.
//
//   1. THE REVIEW QUEUE MUST NOT RECORD. A reviewer running a submitted build
//      to decide about it is not a play, and the client half of that guarantee
//      is that /foundry/review hands `AppStage` no recording transport at all.
//      (The database refuses the same case independently: `foundry_play_start`
//      accepts only the app's PUBLISHED version. Both layers are real, which is
//      why opening one in a mutation test leaves the other closed -- and why
//      this file exists rather than resting on the SQL suite.)
//
//   2. THE COVERAGE SENTENCE HAS ONE SOURCE. Every figure this feature shows
//      undercounts, because a play opened from an app's own share link has no
//      portal around it to see it. A surface that rendered a count without that
//      sentence would be presenting a number students read as "how many people
//      used my app". One constant, one renderer.
//
// Everything else about these surfaces fails the first time a person looks at
// it and belongs in a harness.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_GALLERY_SORTS,
	FOUNDRY_PLAY_COVERAGE_NOTE,
	FOUNDRY_PLAY_HEARTBEAT_MS,
	foundryPlayCountMap,
	formatPlayTime,
	formatPlayers,
	isGallerySort,
	playCountLabel,
	sortGallery
} from '../src/lib/foundry/telemetry';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

describe('the review queue records nothing', () => {
	it('hands the review surface no recording transport, and the gallery both', () => {
		const review = read('src/routes/foundry/review/+page.svelte');
		const gallery = read('src/routes/foundry/+page.svelte');

		// THE ABSENCE. Not a comment about it, not a flag set false: the
		// transports are simply not on the object, so there is nothing to call.
		// `recordPlay:` / `pingPlay:` as PROPERTIES -- the words appear in prose
		// in both files, which is why the colon is part of the pattern.
		expect(/\brecordPlay\s*[:(]/.test(review)).toBe(false);
		expect(/\bpingPlay\s*[:(]/.test(review)).toBe(false);

		// THE POSITIVE CONTROL, without which the two assertions above would pass
		// just as happily on a codebase where nothing records anywhere.
		expect(/\brecordPlay\s*[:(]/.test(gallery)).toBe(true);
		expect(/\bpingPlay\s*[:(]/.test(gallery)).toBe(true);
	});

	it('leaves AppStage as the only caller, so there is one recording path', () => {
		const stage = read('src/lib/foundry/AppStage.svelte');
		expect(stage).toContain('transports.recordPlay');
		expect(stage).toContain('transports.pingPlay');

		// Nothing else in the Foundry tree calls them. A second caller would be a
		// second idea of when a session starts and ends.
		const dir = join(REPO, 'src/lib/foundry');
		const callers = readdirSync(dir)
			.filter((f) => f.endsWith('.svelte'))
			.filter((f) => /transports\.(recordPlay|pingPlay)/.test(read(`src/lib/foundry/${f}`)));
		expect(callers).toEqual(['AppStage.svelte']);
	});

	it('beats well inside the database resume window, so a running app never ages out', () => {
		// `_foundry_play_window()` is thirty minutes. Read from the migration
		// rather than retyped, so the day somebody changes it this assertion is
		// what notices the heartbeat no longer fits inside it.
		const sql = read('supabase/migrations/0139_foundry_telemetry.sql');
		const match = sql.match(/select interval '(\d+) minutes'/);
		expect(match).not.toBeNull();
		const windowMs = Number(match![1]) * 60_000;
		expect(FOUNDRY_PLAY_HEARTBEAT_MS).toBeLessThan(windowMs / 2);
	});
});

describe('the coverage sentence travels with the figures', () => {
	it('is written once and rendered by the one component that shows counts', () => {
		const stats = read('src/lib/foundry/FoundryPlayStats.svelte');
		expect(stats).toContain('FOUNDRY_PLAY_COVERAGE_NOTE');
		// It says the thing it has to say: that the share-link route is not
		// counted. Asserted by MEANING rather than by exact bytes, so rewording
		// the sentence is allowed and dropping the fact is not.
		expect(FOUNDRY_PLAY_COVERAGE_NOTE.toLowerCase()).toContain('share link');
		expect(FOUNDRY_PLAY_COVERAGE_NOTE.toLowerCase()).toContain('not counted');
	});

	it('is not restated anywhere else, so there is nothing to drift', () => {
		const dir = join(REPO, 'src/lib/foundry');
		const literal = readdirSync(dir)
			.filter((f) => f.endsWith('.svelte'))
			.filter((f) => read(`src/lib/foundry/${f}`).includes('share link is not counted'));
		expect(literal).toEqual([]);
	});
});

describe('the ordering arithmetic', () => {
	const apps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
	const counts = {
		a: { plays: 2, plays7d: 9 },
		b: { plays: 7, plays7d: 0 },
		c: { plays: 7, plays7d: 4 }
	};

	it('orders by each window and never mutates the list it was given', () => {
		const original = [...apps];
		expect(sortGallery(apps, counts, 'played').map((a) => a.id)).toEqual(['b', 'c', 'a']);
		expect(sortGallery(apps, counts, 'played7d').map((a) => a.id)).toEqual(['a', 'c', 'b']);
		expect(sortGallery(apps, counts, 'recent').map((a) => a.id)).toEqual(['a', 'b', 'c']);
		// The route's own array is reused across renders; a sort in place would
		// reorder the payload underneath every other reader of it.
		expect(apps).toEqual(original);
	});

	it('breaks a tie on the incoming order, which is what makes an unplayed gallery stable', () => {
		// b and c are both on 7. b came first in the list and stays first.
		expect(sortGallery(apps, counts, 'played').map((a) => a.id)).toEqual(['b', 'c', 'a']);
		// And with NO counts at all every app ties, so the popularity orders are
		// the Recent order rather than an arbitrary shuffle. This is the state a
		// gallery is in before anybody has played anything.
		expect(sortGallery(apps, {}, 'played').map((a) => a.id)).toEqual(['a', 'b', 'c']);
		expect(sortGallery(apps, {}, 'played7d').map((a) => a.id)).toEqual(['a', 'b', 'c']);
	});

	it('takes an unknown sort id for what it is', () => {
		for (const s of FOUNDRY_GALLERY_SORTS) expect(isGallerySort(s.id)).toBe(true);
		expect(isGallerySort('mostPlayedEver')).toBe(false);
		expect(isGallerySort(null)).toBe(false);
	});

	it('coerces the bigint strings PostgREST actually returns', () => {
		// A bigint arrives as a STRING. Compared as strings, "9" sorts above
		// "10", which is a wrong ranking that looks entirely plausible.
		const map = foundryPlayCountMap([
			{ app_id: 'x', plays: '10' as unknown as number, plays_7d: '9' as unknown as number }
		]);
		expect(map.x).toEqual({ plays: 10, plays7d: 9 });
		expect(foundryPlayCountMap(null)).toEqual({});
	});
});

describe('the figures in words', () => {
	it('says nothing at all for zero plays', () => {
		expect(playCountLabel(0)).toBeNull();
		expect(playCountLabel(-1)).toBeNull();
		expect(playCountLabel(Number.NaN)).toBeNull();
		expect(playCountLabel(1)).toBe('1 play');
		expect(playCountLabel(12)).toBe('12 plays');
	});

	it('gives a duration a person can read without doing arithmetic', () => {
		expect(formatPlayTime(0)).toBe('0s');
		expect(formatPlayTime(45)).toBe('45s');
		expect(formatPlayTime(60)).toBe('1m');
		expect(formatPlayTime(3599)).toBe('59m');
		expect(formatPlayTime(3600)).toBe('1h');
		expect(formatPlayTime(7500)).toBe('2h 5m');
		// Never negative, whatever a clock did.
		expect(formatPlayTime(-10)).toBe('0s');
	});

	it('counts people without naming any', () => {
		expect(formatPlayers(0)).toBe('0 people');
		expect(formatPlayers(1)).toBe('1 person');
		expect(formatPlayers(4)).toBe('4 people');
	});
});
