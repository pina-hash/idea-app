/**
 * THE PURE ARITHMETIC BEHIND FOUNDRY PLAY TELEMETRY.
 *
 * Plain data and pure functions, no Svelte and no transports, so the ordering
 * rule, the heartbeat interval and the wording of a duration are assertable
 * without a browser -- and, more to the point, are stated ONCE rather than
 * re-derived inline in the surfaces that would otherwise stop agreeing. (A
 * count of those surfaces used to stand here, said "three", and was four the
 * moment the gallery's detail pane got them -- a figure a commit can move is
 * one to leave out.)
 *
 * WHAT THESE NUMBERS ARE, AND THE SENTENCE THAT HAS TO TRAVEL WITH THEM.
 * `FOUNDRY_PLAY_COVERAGE_NOTE` is the one statement of what is missing: a play
 * started from an app's own direct address, `/a/<appId>/`, has no portal
 * around it and is not counted, because there is nothing of ours on that page
 * to see it. Every surface that renders a figure renders that sentence too.
 * Keeping it here, beside the arithmetic, is what stops a fourth surface
 * showing a count without it.
 */

/**
 * HOW OFTEN THE PORTAL SAYS THE APP IS STILL RUNNING.
 *
 * The database stores `last_seen_at` and the duration is measured to it, so
 * this interval IS the worst-case error on a session that ends by the tab
 * closing -- which is the normal way a play ends. Sixty seconds is the trade:
 * halving it doubles the write traffic to buy thirty seconds of accuracy on a
 * figure nobody reads to the second.
 *
 * It must stay comfortably inside the database's resume window
 * (`_foundry_play_window()`, thirty minutes), or a running app would fall out
 * of its own session between beats.
 */
export const FOUNDRY_PLAY_HEARTBEAT_MS = 60_000;

/** The one statement of what these figures do not include. */
export const FOUNDRY_PLAY_COVERAGE_NOTE =
	'Counted while an app runs here in the Foundry. Opening it from its own share link is not counted, so the real figure is higher.';

/** What `foundry_play_counts` hands back, one row per app. */
export interface FoundryPlayCountRow {
	app_id: string;
	plays: number;
	plays_7d: number;
}

/** The same, keyed by app id, which is how every surface reads it. */
export type FoundryPlayCounts = Record<string, { plays: number; plays7d: number }>;

/** What `foundry_app_play_stats` hands back. Four scalars and no rows. */
export interface FoundryPlayStats {
	plays: number;
	players: number;
	seconds_played: number;
	last_played_at: string | null;
}

/**
 * What `foundry_my_play_stats` hands back: ONE CALLER'S OWN TIME WITH ONE APP.
 *
 * IT IS A DIFFERENT SHAPE FROM `FoundryPlayStats` AND NOT A SUBSET OF IT, which
 * is why it is a second interface rather than a flag on the first. There is no
 * `players` here, deliberately: the row set is one person by construction, so
 * the column could only ever be 1 or 0 and a figure whose value restates the
 * question is noise. And there IS a `first_played_at`, which the aggregate has
 * no counterpart for -- "since when have I been playing this" is a question
 * about a person and is meaningless about a crowd.
 *
 * THE BOUNDARY IS IN THE FUNCTION'S SIGNATURE, NOT IN THIS TYPE. 0204's
 * `foundry_my_play_stats(p_app_id uuid)` takes no identity parameter, so the
 * caller is `auth.uid()` and there is no argument through which another player
 * could be named. Nothing on this side enforces anything; this only describes
 * what comes back.
 */
export interface FoundryMyPlayStats {
	plays: number;
	seconds_played: number;
	first_played_at: string | null;
	last_played_at: string | null;
}

/**
 * A PLAY TIMESTAMP IN THE READER'S OWN LOCALE, AND THERE IS ONE OF IT.
 *
 * It was a private `stamp()` inside `FoundryPlayStats.svelte` while exactly one
 * surface showed a date. The personal layer shows two more (`first_played_at`
 * and its own `last_played_at`), and a second copy of a formatter is the thing
 * this repository says quietly stops matching -- so it moved here, beside
 * `formatPlayTime` and `formatPlayers`, and the component calls it.
 *
 * NULL IS "not yet" AND NOT AN EMPTY STRING. A blank beside the label "Last
 * played" reads as a figure that failed to load; the words say it is a real
 * answer. An unparseable value takes the same branch rather than rendering
 * `Invalid Date`, which is the one output here that would look like a bug in
 * the page rather than a fact about the app.
 */
export function formatPlayStamp(iso: string | null | undefined): string {
	if (!iso) return 'not yet';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return 'not yet';
	return d.toLocaleString([], {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/**
 * WHETHER THE VIEWER HAS ANY TIME OF THEIR OWN WITH THIS APP.
 *
 * THE PROMPT'S RULE, WRITTEN ONCE: "a student who has never played sees the
 * totals and no personal row." So the personal block is rendered on a
 * PREDICATE over the answer, not on whether the transport was supplied -- a
 * caller who has the door and has never opened it is the ordinary case, and a
 * row of zeroes under "Your time with it" tells them something they did not
 * ask and reads as a scoreboard.
 *
 * `plays` AND NOT `seconds_played`, because a play that started and ended
 * inside the same second is a real play with a duration of zero, and keying on
 * the duration would hide it. A null answer (no session, no such app, or an
 * RPC this deployment does not have) is false for the same reason it renders
 * nothing.
 */
export function hasOwnPlaytime(stats: FoundryMyPlayStats | null | undefined): boolean {
	return !!stats && Number(stats.plays) > 0;
}

/**
 * The RPC's rows as the map the surfaces read.
 *
 * PostgREST hands `bigint` back as a STRING, because a bigint does not fit a
 * JavaScript number safely and the driver refuses to guess. Every count here
 * is small enough that `Number` is exact, but the coercion has to be somewhere
 * -- and doing it once here is why no component ever compares a string to a
 * number and silently sorts "9" above "10".
 */
export function foundryPlayCountMap(rows: FoundryPlayCountRow[] | null): FoundryPlayCounts {
	const out: FoundryPlayCounts = {};
	for (const row of rows ?? []) {
		out[row.app_id] = { plays: Number(row.plays) || 0, plays7d: Number(row.plays_7d) || 0 };
	}
	return out;
}

/**
 * HOW THE GALLERY MAY BE ORDERED, as data rather than as a branch in the
 * markup.
 *
 * `played` IS THE DEFAULT, AND THIS COMMENT USED TO ARGUE THE OPPOSITE.
 * It read "`recent` IS THE DEFAULT AND STAYS THE DEFAULT ... Popularity is
 * offered; it is not imposed", which was this assistant's own default and was
 * REVERSED by Mr. Pina on 2026-09-12: decision 04 is answered MOST PLAYED
 * FIRST. `FOUNDRY_GALLERY_DEFAULT_SORT` below is the one statement of it.
 *
 * THE ORDER OF THIS ARRAY IS THE ORDER OF THE BUTTONS AND IS NOT THE DEFAULT.
 * `recent` stays first because the control reads left to right from the
 * plainest ordering to the narrowest window, and reordering it to put the
 * default first would move a control under the reader's finger to say
 * something the pressed state already says. The two are deliberately
 * separate values, and a test pins that they can disagree.
 */
export const FOUNDRY_GALLERY_SORTS = [
	{ id: 'recent' as const, label: 'Recent' },
	{ id: 'played' as const, label: 'Most played' },
	{ id: 'played7d' as const, label: 'Played this week' }
];

export type FoundryGallerySort = (typeof FOUNDRY_GALLERY_SORTS)[number]['id'];

/**
 * WHICH ORDER THE GALLERY OPENS ON. Decision 04, answered 2026-09-12 by Mr.
 * Pina: most played first.
 *
 * IT IS A CONSTANT HERE RATHER THAN A LITERAL IN THE COMPONENT, which is the
 * whole reason this bundle exists. The answer was recorded in ledger 0173 on
 * the day it was given and `FoundryGallery.svelte` went on initialising its
 * own state to `'recent'` for the rest of the day, because a decision written
 * in a document has nothing to hold it to a line of code. A named export does:
 * the component reads it, and a test can assert the value without mounting
 * anything.
 *
 * WHAT IT COSTS, STATED WHERE THE DEFAULT IS SET. Sorting by a number is a
 * stronger claim about that number than showing it is, and every play figure
 * in this file is plays THROUGH THE PORTAL only -- see
 * `FOUNDRY_PLAY_COVERAGE_NOTE`. An app played fifty times from its own share
 * link ranks below one played twice here. That was true under `recent` too and
 * did not matter; under this default it decides whose work a student sees
 * first, which is why the note travels with the ranking and not only with the
 * figures.
 */
export const FOUNDRY_GALLERY_DEFAULT_SORT: FoundryGallerySort = 'played';

/** True for an id the picker actually offers. A stored or URL value is not trusted. */
export function isGallerySort(value: unknown): value is FoundryGallerySort {
	return FOUNDRY_GALLERY_SORTS.some((s) => s.id === value);
}

/**
 * ORDER A GALLERY LIST. Pure, total, and it never mutates its input.
 *
 * THE TIEBREAK IS THE INCOMING ORDER, which is `foundry_list_apps`'s own
 * (`updated_at desc, created_at desc`). A gallery where nothing has been
 * played yet is every app tied at zero, and a stable sort then leaves it in
 * exactly the order the "Recent" tab shows -- which is the honest answer, and
 * is why the popularity tabs are not hidden until somebody plays something.
 *
 * THE TIEBREAK IS THE LANGUAGE'S OWN GUARANTEE AND THERE IS NO SECOND TERM IN
 * THE COMPARATOR. `Array.prototype.sort` has been REQUIRED to be stable since
 * ES2019, so equal counts keep the order they arrived in. This comment used to
 * end "so the index fallback is a statement of intent rather than a
 * workaround", which described a fallback that is not in the code below and
 * never was -- a sentence a reader could only resolve by concluding the
 * tiebreak was implemented somewhere they could not see. Adding an index term
 * now would be a SECOND statement of an ordering the runtime already
 * guarantees, which is the duplication this repository refuses; what the tie
 * needs is not a comparator term but a test, and `tests/dom/foundry-sort.test.ts`
 * pins it in both directions.
 *
 * IT IS LOAD-BEARING NOW IN A WAY IT WAS NOT. Under the old `recent` default a
 * tie was only ever seen by somebody who pressed a popularity tab; `played` is
 * the default since decision 04, so on a gallery where nothing has been played
 * the tie order IS the first thing every student sees, and a comparator that
 * shuffled equal counts would reorder the whole page between two loads.
 *
 * A MISSING COUNT IS ZERO, NOT A HOLE. `foundry_play_counts` left-joins, so
 * every app in the caller's population has a row -- but a surface mounted with
 * no counts at all (a harness, or a load that degraded) must still order
 * rather than throw.
 */
export function sortGallery<T extends { id: string }>(
	apps: readonly T[],
	counts: FoundryPlayCounts,
	sort: FoundryGallerySort
): T[] {
	const list = [...apps];
	if (sort === 'recent') return list;
	const key = sort === 'played7d' ? 'plays7d' : 'plays';
	return list.sort((a, b) => (counts[b.id]?.[key] ?? 0) - (counts[a.id]?.[key] ?? 0));
}

/**
 * The play count as a card reads it, or null when there is nothing to say.
 *
 * NULL FOR ZERO, DELIBERATELY. "0 plays" on every card of a gallery nobody has
 * opened yet is noise on every card, and it reads as a verdict on the work
 * rather than as the absence of a measurement. No chip is the honest render of
 * "nothing recorded".
 */
export function playCountLabel(plays: number): string | null {
	if (!Number.isFinite(plays) || plays <= 0) return null;
	return plays === 1 ? '1 play' : `${plays} plays`;
}

/**
 * A duration in the words a person uses, from whole seconds.
 *
 * NO EM DASHES AND NO DECIMALS. "2h 5m" rather than "2.08 hours", and seconds
 * only below a minute, because a figure like "125 minutes" is arithmetic the
 * reader has to do. Under a minute of total play time is real and is shown as
 * such rather than rounded to "0m", which would read as nothing recorded.
 */
export function formatPlayTime(seconds: number): string {
	const total = Math.max(0, Math.round(Number(seconds) || 0));
	if (total < 60) return `${total}s`;
	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * "Unique players" in words, with the singular written out.
 *
 * It is a COUNT and never a list, here as everywhere: there is no function
 * that returns who they were, for the author or for an admin.
 */
export function formatPlayers(players: number): string {
	const n = Math.max(0, Math.round(Number(players) || 0));
	return n === 1 ? '1 person' : `${n} people`;
}

/**
 * THE AUTHOR'S ROLL-UP ACROSS EVERY APP THEY HAVE.
 *
 * IT WAS BUILT UNDER AN ANSWER TO DECISION 07 THAT HAS SINCE BEEN REVERSED,
 * AND IT SURVIVES THE REVERSAL UNCHANGED. 0173's bundle built it on "owner-only
 * telemetry does not become public; build the owner dashboard instead"; Mr.
 * Pina answered decision 07 PUBLIC on 2026-09-12 and 0204 opened all three
 * metrics. Nothing here had to move, because this was never the gate -- it is
 * one student's own shelf summarised, and a student wanting that has not
 * stopped wanting it because the per-app numbers are now public.
 *
 * IT NEEDS NO NEW SQL AND MUST NOT GET ANY. `foundry_play_counts()` already
 * answers plays and 7-day plays for every app in the CALLER'S OWN population,
 * which on /foundry/mine is their own apps including the unpublished ones --
 * so the roll-up is arithmetic over a read the page already makes. Adding a
 * per-author aggregate RPC would be a second statement of the same numbers,
 * and the second one is what stops matching.
 *
 * IT IS COUNTS OVER APPS AND CANNOT BE ANYTHING ELSE. There is no per-person
 * figure in the input, so there is none in the output and none that could be
 * widened into one -- the same property the gallery's cards have. `players`,
 * `seconds_played` and `last_played_at` stay where they are, on
 * `foundry_app_play_stats`, which since 0204 answers any signed-in caller who
 * can SEE the app rather than the author and an admin alone. That widening
 * changed which apps may be asked about and not what comes back, so the
 * sentence above still holds: counts over apps, never over people.
 *
 * THE COVERAGE NOTE TRAVELS WITH THE FIGURE, zero included, because a zero is
 * exactly when somebody reads a count as "nobody opened it".
 */
export interface FoundryOwnerRollup {
	/** Apps with at least one play. Never the number of apps they have. */
	appsPlayed: number;
	plays: number;
	plays7d: number;
	/** The most-played app, or null when nothing has been played at all. */
	top: { appId: string; title: string; plays: number } | null;
}

export function foundryOwnerRollup(
	apps: readonly { id: string; title: string }[],
	counts: FoundryPlayCounts
): FoundryOwnerRollup {
	let plays = 0;
	let plays7d = 0;
	let appsPlayed = 0;
	let top: { appId: string; title: string; plays: number } | null = null;

	for (const app of apps) {
		const row = counts[app.id];
		const n = row?.plays ?? 0;
		plays += n;
		plays7d += row?.plays7d ?? 0;
		if (n > 0) appsPlayed += 1;
		// STRICTLY GREATER, so a tie keeps the FIRST app in the list the route
		// already ordered. A tie broken by whichever happened to come last is a
		// figure that changes between two loads of the same page.
		if (n > 0 && (top === null || n > top.plays)) {
			top = { appId: app.id, title: app.title, plays: n };
		}
	}

	return { appsPlayed, plays, plays7d, top };
}
