/**
 * THE FIXTURE FOR THE GALLERY'S ONE SORT CONTROL AND ITS SEARCH BOX.
 *
 * THE ROUTE NAME IS HISTORICAL. Until decision 39 (2026-09-25) this harness
 * measured up to four ranked sections ("boards") above the list; those are gone
 * and every order they ranked on is an option in one native `<select>`. The
 * path stays because the browser-verify specs and their measured files are
 * named after it, and a rename would be churn with nothing to show for it.
 *
 * NINE APPS, AND EVERY ORDER HAS A DIFFERENT WINNER, deliberately. If one app
 * led every order, a bug that ranked all seven on the same field would render
 * the same list under every option and look exactly like working code.
 *
 *   trending   Sprout Sim       +8  (9 this week against 1 the week before)
 *   played     Cookie Press     310 all time, and FALLING, so it is not trending
 *   hours      Orbit Lab        4h 10m, on only 40 plays
 *   new        Frog Frenzy      the most recent created_at
 *   versions   Maze Maker       11 versions
 *
 * `?fixture=unplayed` IS THE SAME NINE APPS WITH EVERY PLAY FIGURE AT ZERO,
 * which is the state a new gallery is in. Every play order then has nothing to
 * rank, and the control has to SAY so rather than show a list that looks
 * ranked; the flat sentences are measured on it. It is a query parameter, not
 * a second route, so the apps and the component are byte-identical between the
 * two and only the counts differ.
 *
 * THE SEARCH CASES ARE IN THE DATA rather than in the drive:
 *
 *   "Cookie Clicker"  finds COOKIE PRESS on the shared token alone, which is
 *                     report 32b's own example and the thing it called
 *                     synonyms.
 *   "maze"            finds Maze Maker by title and Frog Frenzy by DESCRIPTION,
 *                     which is the field the client used to drop.
 *   "cookei"          finds Cookie Press at one edit, which is the spelling
 *                     tolerance rung.
 *   "Reyes"           finds Ana Reyes's three apps by author name.
 *   "xylophone"       finds nothing, which is the empty state.
 *
 * DEV ONLY: 404 in production, like every harness here. It had no such guard
 * until decision 39's bundle found it missing.
 */
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { FoundryAppSummary } from '$lib/foundry/transports';
import type { FoundryPlayCounts } from '$lib/foundry/telemetry';
import type { PageLoad } from './$types';

export const prerender = false;
export const ssr = true;

interface Seed {
	slug: string;
	title: string;
	tagline: string;
	description: string;
	author: string;
	full: string | null;
	cls: string | null;
	versions: number;
	/** Days before the fixture clock the app was created. */
	age: number;
	plays: number;
	plays7d: number;
	playsPrev7d: number;
	seconds: number;
}

const CLOCK = Date.parse('2026-09-22T12:00:00Z');

const SEEDS: Seed[] = [
	{
		slug: 'cookie-press',
		title: 'Cookie Press',
		tagline: 'Press the cookie. Keep pressing it.',
		description: 'An idle game where you press a cookie and numbers go up forever.',
		author: 'anaTheBuilder',
		full: 'Ana Reyes',
		cls: 'Engineering I Honors',
		versions: 4,
		age: 120,
		plays: 310,
		plays7d: 12,
		playsPrev7d: 40,
		seconds: 9_000
	},
	{
		slug: 'sprout-sim',
		title: 'Sprout Sim',
		tagline: 'Grow one plant, very slowly.',
		description: 'A calm plant simulator with a watering can and a lot of patience.',
		author: null as unknown as string,
		full: 'Bo Tran',
		cls: 'Engineering II',
		versions: 2,
		age: 14,
		plays: 31,
		plays7d: 9,
		playsPrev7d: 1,
		seconds: 1_800
	},
	{
		slug: 'orbit-lab',
		title: 'Orbit Lab',
		tagline: 'Throw a satellite and see where it goes.',
		description: 'A two body gravity sandbox. Drag to launch, scroll to zoom.',
		author: null as unknown as string,
		full: 'Ana Reyes',
		cls: 'Engineering I Honors',
		versions: 6,
		age: 200,
		plays: 40,
		plays7d: 4,
		playsPrev7d: 3,
		seconds: 15_000
	},
	{
		slug: 'maze-maker',
		title: 'Maze Maker',
		tagline: 'Draw a maze, then try to finish it.',
		description: 'Build a maze with the mouse and race your own best time through it.',
		author: null as unknown as string,
		full: 'Kit Alvarez',
		cls: null,
		versions: 11,
		age: 300,
		plays: 96,
		plays7d: 6,
		playsPrev7d: 6,
		seconds: 4_200
	},
	{
		slug: 'frog-frenzy',
		title: 'Frog Frenzy',
		tagline: 'Hop across the road without getting flattened.',
		description: 'A road crossing game. The lanes are a maze that moves.',
		author: null as unknown as string,
		full: 'Ana Reyes',
		cls: 'Engineering I Honors',
		versions: 1,
		age: 2,
		plays: 18,
		plays7d: 7,
		playsPrev7d: 0,
		seconds: 900
	},
	{
		slug: 'tide-pool',
		title: 'Tide Pool',
		tagline: 'Watch small things in a small pool.',
		description: 'An aquarium screensaver with six kinds of fish and no goal at all.',
		author: null as unknown as string,
		full: 'Noor Haddad',
		cls: 'Engineering II',
		versions: 3,
		age: 60,
		plays: 12,
		plays7d: 2,
		playsPrev7d: 2,
		seconds: 2_400
	},
	{
		slug: 'pixel-forge',
		title: 'Pixel Forge',
		tagline: 'A tiny sprite editor.',
		description: 'Draw a 16 by 16 sprite and export it as a PNG.',
		author: null as unknown as string,
		full: 'Kit Alvarez',
		cls: null,
		versions: 5,
		age: 40,
		plays: 7,
		plays7d: 1,
		playsPrev7d: 4,
		seconds: 600
	},
	{
		slug: 'quiet-quest',
		title: 'Quiet Quest',
		tagline: 'A text adventure with no combat.',
		description: 'Walk around a house and read things. Twelve rooms.',
		author: null as unknown as string,
		full: 'Noor Haddad',
		cls: 'Engineering II',
		versions: 2,
		age: 90,
		plays: 0,
		plays7d: 0,
		playsPrev7d: 0,
		seconds: 0
	},
	{
		slug: 'bolt-run',
		title: 'Bolt Run',
		tagline: 'An endless runner with one button.',
		description: 'Jump over crates. It gets faster. That is the whole game.',
		author: null as unknown as string,
		full: null,
		cls: null,
		versions: 1,
		age: 10,
		plays: 5,
		plays7d: 3,
		playsPrev7d: 1,
		seconds: 300
	}
];

export const load: PageLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const unplayed = url.searchParams.get('fixture') === 'unplayed';

	const apps: FoundryAppSummary[] = SEEDS.map((s, i) => ({
		id: `app-${i}`,
		slug: s.slug,
		title: s.title,
		tagline: s.tagline,
		description: s.description,
		cover_path: null,
		published_version_id: `ver-${i}`,
		published_ordinal: s.versions,
		version_count: s.versions,
		submitted_version_id: null,
		metadata_flagged_at: null,
		hidden_at: null,
		owner_display_name: s.author ?? null,
		owner_full_name: s.full,
		owner_class: s.cls,
		// The list arrives in `foundry_list_apps`'s own order, `updated_at desc`,
		// which is what "Recent" means and what every tie falls back to.
		updated_at: new Date(CLOCK - s.age * 86_400_000).toISOString(),
		created_at: new Date(CLOCK - s.age * 86_400_000).toISOString()
	})).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

	const playCounts: FoundryPlayCounts = {};
	for (let i = 0; i < SEEDS.length; i++) {
		const s = SEEDS[i];
		playCounts[`app-${i}`] = unplayed
			? { plays: 0, plays7d: 0, playsPrev7d: 0, seconds: 0 }
			: {
					plays: s.plays,
					plays7d: s.plays7d,
					playsPrev7d: s.playsPrev7d,
					seconds: s.seconds
				};
	}

	return { apps, playCounts, unplayed };
};
