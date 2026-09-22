/**
 * THE AUTHOR PAGE FIXTURE (report 31).
 *
 * THREE AUTHORS, WHICH ARE THE THREE CASES THE PAGE HAS TO RENDER, and they are
 * mounted SIDE BY SIDE rather than behind a picker so one drive reads all three:
 *
 *   FULL     a chosen display name, a pathway, a class, a picture and four
 *            apps. Everything present.
 *   SPARSE   no display name (so the `full_name` rung has to run, which
 *            production sampling says is the NORMAL case), no pathway, no
 *            class, no picture -- so the initials tile, and three fields that
 *            each have to render as NOTHING rather than as an empty chip, a
 *            stranded separator or a colon.
 *   NAMELESS no name of any kind. The one case where "render nothing" is not
 *            available, because a page needs a title: it renders the word
 *            "Publisher", and a drive can prove the heading is not empty.
 *
 * NO EMAIL ANYWHERE IN THIS FIXTURE, deliberately, because the payload it
 * imitates has no column for one. A harness that carried an address would make
 * a leak look like fixture data.
 */
import type { FoundryAppSummary, FoundryAuthorCard } from '$lib/foundry/transports';
import type { FoundryPlayCounts } from '$lib/foundry/telemetry';

export const prerender = false;

interface Case {
	key: string;
	card: FoundryAuthorCard;
	titles: string[];
}

function app(owner: string, i: number, title: string, versions: number): FoundryAppSummary {
	return {
		id: `${owner}-${i}`,
		slug: `${owner}-${i}`,
		title,
		tagline: 'A small thing that runs in a browser.',
		description: 'Built for IDEA. Plain HTML, CSS and JavaScript.',
		owner,
		cover_path: null,
		published_version_id: `v-${owner}-${i}`,
		published_ordinal: versions,
		version_count: versions,
		submitted_version_id: null,
		metadata_flagged_at: null,
		hidden_at: null,
		owner_display_name: null,
		owner_full_name: null,
		owner_class: null,
		updated_at: '2026-09-01T12:00:00Z',
		created_at: '2026-03-04T12:00:00Z'
	};
}

const CASES: Case[] = [
	{
		key: 'full',
		card: {
			owner: 'full',
			owner_display_name: 'anaTheBuilder',
			owner_full_name: 'Ana Reyes',
			owner_class: 'Engineering I Honors',
			// A PRESET rather than an upload: an upload path would make the page
			// ask `/api/avatar/<key>` for bytes no dev server has, and a broken
			// image in a harness reads as a broken component.
			avatar: 'preset:bolt',
			avatar_url: null,
			pathway: 'IDEA',
			app_count: 4,
			first_published_at: '2026-03-04T12:00:00Z'
		},
		titles: ['Cookie Press', 'Orbit Lab', 'Frog Frenzy', 'Sprout Sim']
	},
	{
		key: 'sparse',
		card: {
			owner: 'sparse',
			owner_display_name: null,
			owner_full_name: 'Bo Tran',
			owner_class: null,
			avatar: null,
			avatar_url: null,
			pathway: null,
			app_count: 1,
			first_published_at: null
		},
		titles: ['Quiet Quest']
	},
	{
		key: 'nameless',
		card: {
			owner: 'nameless',
			owner_display_name: null,
			owner_full_name: null,
			owner_class: null,
			avatar: null,
			avatar_url: null,
			pathway: null,
			app_count: 2,
			first_published_at: '2026-08-30T12:00:00Z'
		},
		titles: ['Bolt Run', 'Tide Pool']
	}
];

export function load() {
	const cases = CASES.map((c) => ({
		key: c.key,
		card: c.card,
		apps: c.titles.map((t, i) => app(c.card.owner, i, t, i + 1))
	}));

	const playCounts: FoundryPlayCounts = {};
	for (const c of cases) {
		c.apps.forEach((a, i) => {
			// One app of the FULL author carries zero plays, so the absence of a
			// chip is provable beside two real ones rather than assumed.
			playCounts[a.id] = { plays: i === 2 ? 0 : (i + 1) * 9, plays7d: i, playsPrev7d: 0, seconds: 0 };
		});
	}

	return { cases, playCounts };
}
