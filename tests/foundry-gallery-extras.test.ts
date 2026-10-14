// tests/foundry-gallery-extras.test.ts
//
// THE CLIENT HALF OF 0237's GALLERY CURATION (ledger 0380): an admin's card
// overrides, collections, the featured row and votes. What would regress
// silently:
//   - an override replacing a field it should leave alone, or the app's own
//     record being the thing changed;
//   - a collection or a pick drawing an app the gallery does not hold;
//   - the featured row repeating the top of the leaderboards when nobody has
//     picked anything, or filling with apps nobody has played;
//   - a vote sum that drifts from what the server returns;
//   - "Most liked" and Trending ranking on something other than votes.

import { describe, expect, test } from 'vitest';
import {
	FOUNDRY_FEATURED_SLOTS,
	adminRefusalSentence,
	appSubject,
	applyAppOverride,
	applyHouseOverride,
	foundryCollections,
	foundryFeaturedRow,
	foundryOverrideMap,
	houseSubject,
	netAfterVote,
	nextVote,
	resolveSubjects,
	voteRefusalSentence
} from '../src/lib/foundry/gallery-extras';
import {
	FOUNDRY_GALLERY_SORTS,
	foundryMergeVotes,
	foundrySortFigure,
	foundrySortHasSignal,
	foundryTrendScore,
	isGallerySort,
	sortGallery,
	type FoundryPlayCounts
} from '../src/lib/foundry/telemetry';
import type { FoundryHouseRelease } from '../src/lib/foundry/major';

const app = (id: string) => ({ id, title: `T ${id}`, tagline: `tag ${id}`, cover_path: null as string | null });
const APPS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(app);
const HOUSES: FoundryHouseRelease[] = [
	{ id: 'greenline', title: 'IDEA GREENLINE', sub: 'Race.', href: '/greenline' },
	{ id: 'vanguard', title: 'IDEA VANGUARD', sub: 'Fly.', href: '/vanguard/' }
];

describe('overrides replace a field only where one was set', () => {
	const map = foundryOverrideMap([
		{ subject: appSubject('a'), title: 'Better', description: null, thumbnail_path: 'u/x.png' },
		{ subject: houseSubject('vanguard'), title: null, description: 'New line', thumbnail_path: null },
		{ subject: '', title: 'ignored' },
		'junk',
		null
	]);

	test('the map keeps real rows and drops junk', () => {
		expect(Object.keys(map).sort()).toEqual([appSubject('a'), houseSubject('vanguard')].sort());
		expect(foundryOverrideMap(null)).toEqual({});
		expect(foundryOverrideMap('x')).toEqual({});
	});

	test('an app: title and picture replaced, the tagline left alone', () => {
		const out = applyAppOverride(app('a'), map);
		expect(out.title).toBe('Better');
		expect(out.cover_path).toBe('u/x.png');
		expect(out.tagline).toBe('tag a');
		// And the input object was not written to: the student's record is the
		// student's.
		expect(app('a').title).toBe('T a');
	});

	test('an app with no override is the very same object', () => {
		const b = app('b');
		expect(applyAppOverride(b, map)).toBe(b);
	});

	test('a house release: description replaced, title and picture left to the repo', () => {
		const v = applyHouseOverride(HOUSES[1], map);
		expect(v.sub).toBe('New line');
		expect(v.title).toBe('IDEA VANGUARD');
		expect(v.thumb ?? null).toBeNull();
		expect(applyHouseOverride(HOUSES[0], map)).toBe(HOUSES[0]);
	});

	test('clearing a field is a null, which falls back', () => {
		const cleared = foundryOverrideMap([{ subject: appSubject('a'), title: '', description: '', thumbnail_path: '' }]);
		expect(applyAppOverride(app('a'), cleared).title).toBe('T a');
	});
});

describe('subjects resolve to what the gallery holds, in order', () => {
	test('order is the given order, duplicates drop, unknowns drop', () => {
		const out = resolveSubjects(
			[appSubject('c'), houseSubject('vanguard'), appSubject('zzz'), appSubject('a'), appSubject('c'), houseSubject('nope')],
			APPS,
			HOUSES
		);
		expect(out.map((o) => o.subject)).toEqual([appSubject('c'), houseSubject('vanguard'), appSubject('a')]);
	});

	test('collections parse defensively', () => {
		const cols = foundryCollections([
			{ id: 'x', title: 'Ported', description: 'd', published: true, members: [{ subject: appSubject('a'), live: true }, { subject: 5 }, { subject: appSubject('b'), live: false }] },
			{ title: 'no id' },
			'junk'
		]);
		expect(cols).toHaveLength(1);
		expect(cols[0].members.map((m) => [m.subject, m.live])).toEqual([[appSubject('a'), true], [appSubject('b'), false]]);
		expect(foundryCollections(undefined)).toEqual([]);
	});
});

describe('the featured row', () => {
	const counts: FoundryPlayCounts = {
		a: { plays: 50, plays7d: 5, playsPrev7d: 5 },
		b: { plays: 40, plays7d: 30, playsPrev7d: 1 },
		c: { plays: 30, plays7d: 0, playsPrev7d: 0 },
		d: { plays: 20, plays7d: 0, playsPrev7d: 0 },
		e: { plays: 0, plays7d: 0, playsPrev7d: 0 }
	};

	test('with no picks there is no row, not a copy of the leaderboards', () => {
		expect(foundryFeaturedRow([], APPS, HOUSES, counts)).toEqual([]);
		expect(foundryFeaturedRow([appSubject('zzz')], APPS, HOUSES, counts)).toEqual([]);
	});

	test('picks come first in their order, then the fill alternates played and trending', () => {
		const row = foundryFeaturedRow([appSubject('e')], APPS, HOUSES, counts);
		const ids = row.map((r) => r.subject);
		expect(ids[0]).toBe(appSubject('e'));
		// Best played is a; best climbing is b; then c and d by plays.
		expect(ids.slice(1, 5)).toEqual([appSubject('a'), appSubject('b'), appSubject('c'), appSubject('d')]);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.length).toBeLessThanOrEqual(FOUNDRY_FEATURED_SLOTS);
	});

	test('the fill never takes an app nobody has played or voted on', () => {
		const row = foundryFeaturedRow([appSubject('a')], APPS, HOUSES, counts);
		expect(row.map((r) => r.subject)).not.toContain(appSubject('f'));
		expect(row.map((r) => r.subject)).not.toContain(appSubject('e'));
	});

	test('more picks than slots are all kept, none filled', () => {
		const picks = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(appSubject);
		const row = foundryFeaturedRow(picks, APPS, HOUSES, counts);
		expect(row.map((r) => r.subject)).toEqual(picks);
	});

	test('a house pick is a card of its own kind', () => {
		const row = foundryFeaturedRow([houseSubject('greenline')], APPS, HOUSES, counts);
		expect(row[0].kind).toBe('house');
	});
});

describe('votes', () => {
	test('pressing the held direction takes it back, the other one switches', () => {
		expect(nextVote(0, 1)).toBe(1);
		expect(nextVote(1, 1)).toBe(0);
		expect(nextVote(1, -1)).toBe(-1);
		expect(nextVote(-1, -1)).toBe(0);
	});
	test('the net after a move is the server arithmetic', () => {
		expect(netAfterVote(3, 0, 1)).toBe(4);
		expect(netAfterVote(3, 1, -1)).toBe(1);
		expect(netAfterVote(3, 1, 0)).toBe(2);
		expect(netAfterVote(-2, -1, 0)).toBe(-1);
	});
	test('every refusal reads as a sentence and none leaks a reason code', () => {
		for (const r of ['own_app', 'not_votable', 'unavailable', 'value', undefined]) {
			const s = voteRefusalSentence(r);
			expect(s.length).toBeGreaterThan(10);
			expect(s).not.toMatch(/_/);
		}
	});
	test('merging gives bigint strings numbers and keeps an unplayed voted app', () => {
		const { counts, mine } = foundryMergeVotes({ a: { plays: 2, plays7d: 1 } }, [
			{ app_id: 'a', net: '3', net_7d: '1', mine: 1 },
			{ app_id: 'z', net: '-2', net_7d: '-2', mine: -1 }
		]);
		expect(counts.a).toMatchObject({ plays: 2, netVotes: 3, netVotes7d: 1 });
		expect(counts.z).toMatchObject({ plays: 0, netVotes: -2 });
		expect(mine).toEqual({ a: 1, z: -1 });
		expect(foundryMergeVotes({ a: { plays: 1, plays7d: 0 } }, null).counts.a.netVotes).toBeUndefined();
	});
});

describe('Most liked and Trending read votes', () => {
	const apps = [{ id: 'p' }, { id: 'q' }, { id: 'r' }];
	const counts: FoundryPlayCounts = {
		p: { plays: 10, plays7d: 0, playsPrev7d: 0, netVotes: 1, netVotes7d: 0 },
		q: { plays: 1, plays7d: 0, playsPrev7d: 0, netVotes: 9, netVotes7d: 4 },
		r: { plays: 5, plays7d: 2, playsPrev7d: 2, netVotes: 0, netVotes7d: 0 }
	};
	test('liked is its own order, offered by the control', () => {
		expect(isGallerySort('liked')).toBe(true);
		expect(FOUNDRY_GALLERY_SORTS.map((o) => o.id)).toContain('liked');
		expect(sortGallery(apps, counts, 'liked').map((a) => a.id)).toEqual(['q', 'p', 'r']);
	});
	test('the liked order is not a play order, so no play coverage note rides beside it', () => {
		expect(FOUNDRY_GALLERY_SORTS.find((o) => o.id === 'liked')?.ranksPlays).toBe(false);
	});
	test('trending adds this week\'s net votes to the plays rise', () => {
		expect(foundryTrendScore(counts.q)).toBe(4);
		expect(foundryTrendScore(counts.r)).toBe(0);
		expect(sortGallery(apps, counts, 'trending')[0].id).toBe('q');
	});
	test('without votes nothing changed: the old trend score', () => {
		expect(foundryTrendScore({ plays7d: 5, playsPrev7d: 2 })).toBe(3);
		expect(foundryTrendScore(undefined)).toBe(0);
	});
	test('the card figure and the flat state', () => {
		expect(foundrySortFigure('liked', apps[1], counts.q)).toBe('+9 votes');
		expect(foundrySortFigure('liked', apps[0], counts.p)).toBe('+1 vote');
		expect(foundrySortFigure('liked', apps[2], counts.r)).toBe('');
		expect(foundrySortHasSignal(apps, counts, 'liked')).toBe(true);
		expect(foundrySortHasSignal(apps, {}, 'liked')).toBe(false);
	});
});

describe('admin refusals are sentences', () => {
	test('each database reason has words and the fallback is used for the rest', () => {
		for (const r of ['title', 'title_length', 'description_length', 'thumbnail', 'member', 'member_not_found', 'too_many_members', 'too_many_collections', 'too_many']) {
			const s = adminRefusalSentence(r);
			expect(s).not.toBe('That did not go through. Try again.');
			expect(s).not.toMatch(/_/);
		}
		expect(adminRefusalSentence('mystery')).toBe('That did not go through. Try again.');
		expect(adminRefusalSentence('mystery', 'custom')).toBe('custom');
	});
});
