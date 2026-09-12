// tests/dom/foundry-detail-stats.test.ts
//
// THE TWO LAYERS OF DECISION 07, ON THE PAGE A STUDENT ACTUALLY LANDS ON.
//
// `0204` made three previously owner-only metrics public and added
// `foundry_my_play_stats`, a caller-scoped read of one person's own time with
// one app. The two surfaces that already had a `playStats` transport --
// `/foundry/mine` and `/foundry/review` -- carried on being the only ones, so
// the numbers were public in the database and reachable through the ADMIN
// controls alone. Mr. Pina found that by tapping a card.
//
// WHY THIS IS TESTED AND NOT LEFT TO A LOOK. Every claim here fails SILENTLY:
//
//   * a detail pane that stops being handed a transport renders a perfectly
//     correct page with no figures on it, which is the defect being fixed and
//     looked fine for as long as it stood;
//   * a personal block that started rendering for somebody who has never
//     played would show a row of zeroes under "Your time with it", which
//     throws nothing and type-checks;
//   * the personal read taking anything but the app id would be the one change
//     here capable of asking about another student, and it is a function
//     argument nothing on screen reveals;
//   * a threshold, floor or rounding quietly added to the n=1 case would look
//     like care and would silently contradict an answered decision.
//
// EVERY EXCLUSION IS PAIRED WITH A POSITIVE CONTROL ON THE SAME FIXTURE,
// because "0 personal blocks" is also what a component that rendered nothing
// at all reports.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. Structure, counts, which branch
// rendered, what a transport was called with, and the pure predicate behind
// the absence. NOT geometry, NOT contrast and NOT a tap target: happy-dom has
// no layout engine, so a box reads 0 and a colour reads '' and both pass
// vacuously (see `tests/dom/README.md`). Those are `verify:browser`'s claims
// and live in `tools/browser-verify/routes/foundry-gallery.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import FoundryGallery from '../../src/lib/foundry/FoundryGallery.svelte';
import FoundryPage from '../../src/routes/foundry/+page.svelte';
import FoundryPlayStats from '../../src/lib/foundry/FoundryPlayStats.svelte';
import {
	FOUNDRY_PLAY_COVERAGE_NOTE,
	formatPlayStamp,
	formatPlayTime,
	hasOwnPlaytime,
	type FoundryMyPlayStats,
	type FoundryPlayStats as PublicStats
} from '../../src/lib/foundry/telemetry';
import { mountInto, type Mounted } from './mount';

const APP_ID = '11111111-1111-4111-8111-111111111111';

const OWNER = {
	owner_display_name: null,
	owner_full_name: 'Ana Reyes',
	owner_class: null
};

const SUMMARY = {
	id: APP_ID,
	slug: 'brick-game',
	title: 'Brick game',
	tagline: null,
	cover_path: null,
	published_version_id: 'v-1',
	published_ordinal: 1,
	version_count: 1,
	submitted_version_id: null,
	metadata_flagged_at: null,
	hidden_at: null,
	updated_at: '2026-08-20T09:00:00Z',
	...OWNER
};

const DETAIL = {
	...SUMMARY,
	description: 'A brick game.',
	build_notes: 'Written by hand.',
	owner: '22222222-2222-4222-8222-222222222222',
	created_at: '2026-08-10T09:00:00Z',
	versions: []
};

const TOTALS: PublicStats = {
	plays: 42,
	players: 11,
	seconds_played: 5400,
	last_played_at: '2026-08-26T15:30:00Z'
};

const MINE: FoundryMyPlayStats = {
	plays: 6,
	seconds_played: 1325,
	first_played_at: '2026-08-19T08:15:00Z',
	last_played_at: '2026-08-26T15:30:00Z'
};

describe('the detail pane is handed both reads', () => {
	let live: Mounted | null = null;
	afterEach(async () => {
		await live?.stop();
		live = null;
	});

	function gallery(props: Record<string, unknown> = {}): Mounted {
		live = mountInto(FoundryGallery as never, {
			apps: [SUMMARY],
			selected: DETAIL,
			coverUrl: () => null,
			onSelect: () => {},
			appsOrigin: 'https://apps.ideabosco.com',
			...props
		});
		return live;
	}

	/**
	 * THE DEFECT, STATED AS THE PAIR IT IS. With no transports the pane is the
	 * page as it shipped -- a real app page with real content and NO figures --
	 * and with them the figures are there. Either half alone proves nothing:
	 * the first is what a broken mount reports and the second is what a mount
	 * that ignored its props would also report.
	 */
	it('no transports, no figures; with them, the totals render', async () => {
		const bare = gallery();
		expect(bare.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(0);
		// The POSITIVE CONTROL that the pane rendered at all.
		expect(bare.target.querySelectorAll('.fdy-gal-detail')).toHaveLength(1);
		await bare.stop();

		const wired = gallery({ playStats: async () => TOTALS });
		await wired.settle();
		expect(wired.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(1);
		expect(wired.one('[data-testid="fdy-plays"]').textContent).toBe('42');
		expect(wired.one('[data-testid="fdy-players"]').textContent).toBe('11 people');
	});

	/**
	 * BOTH LAYERS, WHICH IS WHAT WAS ANSWERED. The public totals and the
	 * viewer's own row are two blocks from two reads, and the page carries both.
	 */
	it('with both reads, the public totals AND the personal row render', async () => {
		const m = gallery({
			playStats: async () => TOTALS,
			myPlayStats: async () => MINE
		});
		await m.settle();
		expect(m.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(1);
		expect(m.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(1);
		expect(m.one('[data-testid="fdy-my-plays"]').textContent).toBe('6');
		expect(m.one('[data-testid="fdy-my-seconds"]').textContent).toBe(formatPlayTime(1325));
		expect(m.one('[data-testid="fdy-my-first"]').textContent).toBe(
			formatPlayStamp(MINE.first_played_at)
		);
	});

	/**
	 * THE PROMPT'S OWN RULE: "a student who has never played sees the totals and
	 * no personal row." The transport IS supplied here -- this is not the
	 * absence-of-a-door case -- and answers a real row of zeroes, which is what
	 * `foundry_my_play_stats` returns for a caller with no sessions.
	 */
	it('a viewer who has never played gets the totals and NO personal row', async () => {
		const m = gallery({
			playStats: async () => TOTALS,
			myPlayStats: async () => ({
				plays: 0,
				seconds_played: 0,
				first_played_at: null,
				last_played_at: null
			})
		});
		await m.settle();
		// The POSITIVE half, on the same mount: the totals are there.
		expect(m.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(1);
		expect(m.one('[data-testid="fdy-plays"]').textContent).toBe('42');
		// The EXCLUSION.
		expect(m.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(0);
		expect(m.target.textContent).not.toContain('Your time with it');
	});

	/**
	 * A DEPLOYMENT WITHOUT 0204, which is a real state: migrations here go on by
	 * hand, one file at a time. `foundry_my_play_stats` answers `PGRST202`, the
	 * route's transport returns null, and the page is the totals alone rather
	 * than an error or an empty panel.
	 */
	it('a null personal answer renders nothing, and takes the totals with it nowhere', async () => {
		const m = gallery({
			playStats: async () => TOTALS,
			myPlayStats: async () => null
		});
		await m.settle();
		expect(m.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(1);
		expect(m.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(0);
	});

	/**
	 * A THROWING TRANSPORT IS SILENT AND CANNOT TAKE THE OTHER BLOCK DOWN. The
	 * two reads are two effects for exactly this reason.
	 */
	it('a personal read that throws leaves the totals standing', async () => {
		const m = gallery({
			playStats: async () => TOTALS,
			myPlayStats: async () => {
				throw new Error('network');
			}
		});
		await m.settle();
		expect(m.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(1);
		expect(m.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(0);
	});

	/**
	 * THE BOUNDARY, AS THE ONLY THING THIS SIDE CAN ASSERT ABOUT IT. 0204's
	 * function takes no identity parameter, so a caller cannot name another
	 * student -- and the check available here is that the surface passes the APP
	 * and nothing else. A second argument appearing would be the one change on
	 * this side capable of asking a wider question.
	 */
	it('the personal read is called with the app id and nothing else', async () => {
		const calls: unknown[][] = [];
		const m = gallery({
			playStats: async () => TOTALS,
			myPlayStats: async (...args: unknown[]) => {
				calls.push(args);
				return MINE;
			}
		});
		await m.settle();
		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual([APP_ID]);
	});

	/**
	 * THE COVERAGE SENTENCE TRAVELS WITH THE FIGURES ON THIS SURFACE TOO, which
	 * is a CLAUDE.md rule about every surface that renders one of these numbers
	 * and not a property of the component alone -- a wrapper that clipped or
	 * replaced it would look fine.
	 */
	it('the coverage note and the who-can-see rule are both on the page', async () => {
		const m = gallery({ playStats: async () => TOTALS, myPlayStats: async () => MINE });
		await m.settle();
		expect(m.target.textContent).toContain(FOUNDRY_PLAY_COVERAGE_NOTE);
		expect(m.target.textContent).toContain('Nobody can see which students played an app');
		expect(m.target.textContent).toContain('Only you can see this row');
	});
});

describe('the component itself', () => {
	let live: Mounted | null = null;
	afterEach(async () => {
		await live?.stop();
		live = null;
	});

	/**
	 * THE GATE IS `load`, DELIBERATELY, so a mounting that hands over the
	 * personal transport alone renders NOTHING: the personal row has no heading
	 * that would be true of it on its own and no total to be read against. It is
	 * pinned rather than left to be discovered.
	 */
	it('the personal transport alone renders nothing at all', async () => {
		live = mountInto(FoundryPlayStats as never, {
			appId: APP_ID,
			loadMine: async () => MINE
		});
		await live.settle();
		expect(live.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(0);
		expect(live.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(0);
	});

	/**
	 * THE TWO SHIPPING MOUNTS THAT PASS ONLY `load` -- `/foundry/mine` and
	 * `/foundry/review` -- render precisely what they rendered before the second
	 * layer existed. This is the no-change assertion for surfaces this bundle
	 * does not own.
	 */
	it('the public transport alone renders the totals and no personal row', async () => {
		live = mountInto(FoundryPlayStats as never, {
			appId: APP_ID,
			load: async () => TOTALS
		});
		await live.settle();
		expect(live.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(1);
		expect(live.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(0);
		expect(live.one('[data-testid="fdy-last"]').textContent).toBe(
			formatPlayStamp(TOTALS.last_played_at)
		);
	});

	/**
	 * RE-READ ON A NEW APP, AND CLEAR THE OLD ONE FIRST. A personal row left
	 * standing under a different title would be a figure about one app presented
	 * as a figure about another, with nothing on screen saying so.
	 */
	it('changing the app re-reads and never shows the previous app row', async () => {
		const seen: string[] = [];
		live = mountInto(FoundryPlayStats as never, {
			appId: APP_ID,
			load: async () => TOTALS,
			loadMine: async (id: string) => {
				seen.push(id);
				return id === APP_ID ? MINE : null;
			}
		});
		await live.settle();
		expect(live.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(1);

		live.target.remove();
		await live.stop();

		live = mountInto(FoundryPlayStats as never, {
			appId: 'other-app',
			load: async () => TOTALS,
			loadMine: async (id: string) => {
				seen.push(id);
				return id === APP_ID ? MINE : null;
			}
		});
		await live.settle();
		expect(live.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(0);
		expect(seen).toEqual([APP_ID, 'other-app']);
	});
});

describe('the absence rule, as pure arithmetic', () => {
	/**
	 * `plays` AND NOT `seconds_played`. A session that started and ended inside
	 * the same second is a real play with a duration of zero; keying the rule on
	 * the duration would hide it, and the student would be told they had never
	 * opened something they had.
	 */
	it('one play of zero seconds still counts as having played', () => {
		expect(
			hasOwnPlaytime({
				plays: 1,
				seconds_played: 0,
				first_played_at: '2026-08-19T08:15:00Z',
				last_played_at: '2026-08-19T08:15:00Z'
			})
		).toBe(true);
	});

	it('zero plays, null and undefined are all "nothing to show"', () => {
		expect(
			hasOwnPlaytime({
				plays: 0,
				seconds_played: 0,
				first_played_at: null,
				last_played_at: null
			})
		).toBe(false);
		expect(hasOwnPlaytime(null)).toBe(false);
		expect(hasOwnPlaytime(undefined)).toBe(false);
	});

	/**
	 * THE n=1 CASE IS ACCEPTED AND NOTHING SUPPRESSES IT. Mr. Pina was asked
	 * precisely whether public totals that identify a single player are
	 * acceptable and said they are, so a threshold, a floor or a rounding added
	 * later would be a silent reversal of an answered decision. This is what
	 * such a change would have to break.
	 */
	it('an app one person has played renders its real numbers, unrounded', async () => {
		const one: PublicStats = {
			plays: 1,
			players: 1,
			seconds_played: 44,
			last_played_at: '2026-08-23T11:02:00Z'
		};
		const m = mountInto(FoundryPlayStats as never, {
			appId: APP_ID,
			load: async () => one
		});
		await m.settle();
		expect(m.one('[data-testid="fdy-plays"]').textContent).toBe('1');
		expect(m.one('[data-testid="fdy-players"]').textContent).toBe('1 person');
		expect(m.one('[data-testid="fdy-seconds"]').textContent).toBe('44s');
		expect(m.one('[data-testid="fdy-last"]').textContent).toBe(
			formatPlayStamp(one.last_played_at)
		);
		await m.stop();
	});

	/**
	 * THE STAMP IS ONE IMPLEMENTATION NOW. It was a private `stamp()` inside
	 * `FoundryPlayStats.svelte` while one surface showed one date; the personal
	 * layer shows two more, and a second copy of a formatter is what this
	 * repository says quietly stops matching.
	 */
	it('a null or unparseable timestamp is "not yet" rather than a broken date', () => {
		expect(formatPlayStamp(null)).toBe('not yet');
		expect(formatPlayStamp(undefined)).toBe('not yet');
		expect(formatPlayStamp('')).toBe('not yet');
		expect(formatPlayStamp('not a date')).toBe('not yet');
		expect(formatPlayStamp('2026-08-23T11:02:00Z')).not.toBe('not yet');
	});
});


/**
 * THE ROUTE ITSELF, BECAUSE THE GAP BETWEEN THE ROUTE AND THE COMPONENT IS
 * EXACTLY THE DEFECT THIS BUNDLE FIXES -- AND A MUTATION PROOF SAID SO.
 *
 * Every assertion above mounts `FoundryGallery` directly and hands it the two
 * transports. That proves the component does the right thing with them and
 * proves NOTHING about whether the route supplies them, which is the whole of
 * what was wrong: `0204` opened the figures, `/foundry/mine` and
 * `/foundry/review` had a transport, and this page did not. Deleting the two
 * props from `src/routes/foundry/+page.svelte` left every test in this file
 * green, measured -- seven of eight mutants reddened and this was the eighth.
 *
 * SO THIS MOUNTS THE REAL ROUTE COMPONENT, not a copy of it and not a grep over
 * its source. The only thing standing in is `data`, which SvelteKit's load
 * would supply -- including a `supabase` whose `rpc` RECORDS what it was
 * called with, so the two RPC NAMES are asserted here rather than being a
 * string nothing checks. A route that named `foundry_play_counts` twice, or
 * passed a player id, would be visible.
 */
describe('the route hands the detail pane its two reads', () => {
	let live: Mounted | null = null;
	afterEach(async () => {
		await live?.stop();
		live = null;
	});

	function routePage() {
		const calls: { fn: string; args: unknown }[] = [];
		live = mountInto(FoundryPage as never, {
			data: {
				apps: [SUMMARY],
				selected: DETAIL,
				playCounts: {},
				isAdmin: false,
				supabase: {
					rpc: async (fn: string, args: unknown) => {
						calls.push({ fn, args });
						if (fn === 'foundry_app_play_stats') return { data: TOTALS, error: null };
						if (fn === 'foundry_my_play_stats') return { data: MINE, error: null };
						return { data: null, error: null };
					}
				}
			}
		});
		return { live: live as Mounted, calls };
	}

	it('mounts both blocks on the real page, from the real RPC names', async () => {
		const { live: m, calls } = routePage();
		await m.settle();

		expect(m.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(1);
		expect(m.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(1);
		expect(m.one('[data-testid="fdy-plays"]').textContent).toBe('42');
		expect(m.one('[data-testid="fdy-my-plays"]').textContent).toBe('6');

		const named = calls.map((c) => c.fn).sort();
		expect(named).toEqual(['foundry_app_play_stats', 'foundry_my_play_stats']);
	});

	/**
	 * THE BOUNDARY AT THE ONE PLACE THIS SIDE CAN STATE IT. 0204's personal
	 * function takes the app and nothing else, so the caller is `auth.uid()` and
	 * no other student can be named -- and what this side can check is that the
	 * route sends exactly `p_app_id`. A second key appearing in that payload
	 * would be the one change here capable of asking a wider question.
	 */
	it('sends the app id and nothing else to the personal read', async () => {
		const { live: m, calls } = routePage();
		await m.settle();
		const mine = calls.find((c) => c.fn === 'foundry_my_play_stats');
		expect(mine).toBeDefined();
		expect(mine!.args).toEqual({ p_app_id: APP_ID });
		expect(Object.keys(mine!.args as object)).toEqual(['p_app_id']);
	});

	/**
	 * A DEPLOYMENT WITHOUT 0204, DRIVEN THROUGH THE ROUTE'S OWN ERROR HANDLING
	 * RATHER THAN THROUGH A TRANSPORT THAT RETURNS NULL. PostgREST answers
	 * `PGRST202` for a function that is not there; the page must render the
	 * totals it still has and simply carry no personal row.
	 */
	it('a PGRST202 on the personal read leaves the page standing', async () => {
		live = mountInto(FoundryPage as never, {
			data: {
				apps: [SUMMARY],
				selected: DETAIL,
				playCounts: {},
				isAdmin: false,
				supabase: {
					rpc: async (fn: string) => {
						if (fn === 'foundry_app_play_stats') return { data: TOTALS, error: null };
						if (fn === 'foundry_my_play_stats') {
							return { data: null, error: { code: 'PGRST202', message: 'not found' } };
						}
						return { data: null, error: null };
					}
				}
			}
		});
		await live.settle();
		expect(live.target.querySelectorAll('[data-testid="foundry-play-stats"]')).toHaveLength(1);
		expect(live.target.querySelectorAll('[data-testid="foundry-my-play-stats"]')).toHaveLength(0);
	});
});
