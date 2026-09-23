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

/**
 * What `foundry_play_counts` hands back, one row per app.
 *
 * `plays_prev_7d` AND `seconds_played` ARE 0221 AND ARE OPTIONAL, which is the
 * ladder rule and not defensiveness: migrations here are applied by hand and
 * separately, so a deployment sitting between 0204 and 0221 is a real state and
 * the two keys are genuinely absent on it. The map below reads them as zero,
 * and `foundryBoards` suppresses a board whose whole signal is zero -- so an
 * unapplied 0221 costs the hours board and the trend board and leaves every
 * other figure on the page exactly as it was. Nothing blanks.
 */
export interface FoundryPlayCountRow {
	app_id: string;
	plays: number;
	plays_7d: number;
	plays_prev_7d?: number;
	seconds_played?: number;
}

/**
 * The same, keyed by app id, which is how every surface reads it.
 *
 * THE TWO 0221 FIELDS ARE OPTIONAL HERE TOO, and for a reason narrower than
 * the interface above: `foundryPlayCountMap` always sets them, so inside the
 * running app they are always numbers. What optionality admits is a map BUILT
 * BY HAND -- every dev harness fixture and every sort test -- which is the same
 * shape a deployment between 0204 and 0221 produces. Requiring them would force
 * a harness author to invent an hours figure for a fixture about play counts,
 * and an invented figure in a fixture is how a board gets verified against a
 * number nobody meant.
 *
 * Every reader coalesces to zero. `foundryBoards` then suppresses the boards
 * whose whole signal is zero, so an omitted field costs a section rather than
 * rendering an empty one.
 */
export type FoundryPlayCounts = Record<
	string,
	{ plays: number; plays7d: number; playsPrev7d?: number; seconds?: number }
>;

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
		out[row.app_id] = {
			plays: Number(row.plays) || 0,
			plays7d: Number(row.plays_7d) || 0,
			playsPrev7d: Number(row.plays_prev_7d) || 0,
			seconds: Number(row.seconds_played) || 0
		};
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
	{ id: 'played7d' as const, label: 'Played this week' },
	/**
	 * 0221, REPORT 30, IN AZAD ARTEAGA'S OWN EXAMPLES: "Most hours played, most
	 * versions/updates". Decision 35 answered the shape of them -- ranked by
	 * app, never by student -- and both are rankings over a field that is
	 * already a fact about an APP.
	 *
	 * `versions` NEEDED NO SQL AND GOT NONE. `foundry_list_apps` has projected
	 * `version_count` since 0130 and it has reached the client on
	 * `FoundryAppSummary` the whole time, so this is a sort over a number the
	 * gallery already holds. `hours` is the one that needed a migration.
	 */
	{ id: 'hours' as const, label: 'Most hours' },
	{ id: 'versions' as const, label: 'Most updated' }
];

/**
 * EVERY ORDER THIS GALLERY KNOWS, WHICH IS WIDER THAN THE BUTTONS ABOVE.
 *
 * `trending` and `new` are BOARD orders: they rank a section at the top of the
 * gallery and are deliberately not offered as buttons. Seven buttons in one
 * group is a control nobody reads at 375px, and both of these answer a
 * question a whole-list ordering does not -- "what is climbing" and "what
 * landed this week" are things you look at, not things you browse in.
 *
 * THEY ARE STILL ORDINARY SORT IDS, so `sortGallery` is the ONE implementation
 * of every ranking on this surface. A board that ranked its own way would be
 * the second comparator that stops agreeing with the list beneath it.
 */
export type FoundryGallerySort =
	| (typeof FOUNDRY_GALLERY_SORTS)[number]['id']
	| 'trending'
	| 'new';

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

/**
 * True for an id the picker actually OFFERS. A stored or URL value is not
 * trusted.
 *
 * IT DELIBERATELY DOES NOT ADMIT `trending` OR `new`. This answers "may a
 * caller choose this", and those two are chosen by the board list rather than
 * by a person, so admitting them here would widen the set a stored preference
 * or a query parameter could put the control into -- a pressed state with no
 * button under it. `sortGallery` still ranks them, because that is a different
 * question.
 */
export function isGallerySort(value: unknown): value is FoundryGallerySort {
	return FOUNDRY_GALLERY_SORTS.some((s) => s.id === value);
}

/**
 * WHAT "TRENDING" MEANS, AS A FORMULA OVER STORED COLUMNS. One sentence:
 *
 *   TRENDING IS PLAYS IN THE LAST SEVEN DAYS MINUS PLAYS IN THE SEVEN DAYS
 *   BEFORE THAT.
 *
 * Both terms are `count(*)` over `student_app_plays.started_at` in windows the
 * database computes (`plays_7d` and `plays_prev_7d`, 0221), half-open at the
 * young end so no play falls in both and none between them falls through.
 *
 * IT IS A RISE, NOT A LEVEL, AND THAT IS THE WHOLE POINT OF THE WORD. "Most
 * played" is already the all-time level and "Played this week" is already the
 * recent level, so a third board that ranked on either would be a copy of one
 * of them wearing a different heading. An app that went from 1 play to 9 is
 * climbing; an app that sits at 50 a week every week is popular and is
 * already on the board that says so.
 *
 * A DECLINING APP SCORES NEGATIVE AND THAT IS LEFT ALONE. Nothing clamps,
 * because the board shows only its top few and a negative score can only
 * surface on a gallery where nothing at all is climbing -- which
 * `foundryBoards` suppresses outright. Clamping to zero would instead pile
 * every declining app in at the same score as every untouched one and make
 * the tiebreak decide the board.
 *
 * WHAT IT IS NOT: it is not a rate, not a decay, and not normalised by the
 * app's age or its total. Each of those is defensible and none of them is
 * explicable to a student in one line, which is the bar a ranking that decides
 * whose work gets seen first has to clear.
 */
export function foundryTrendScore(
	row: { plays7d?: number; playsPrev7d?: number } | undefined
): number {
	if (!row) return 0;
	return (Number(row.plays7d) || 0) - (Number(row.playsPrev7d) || 0);
}

/**
 * THE FIELDS AN ORDERING NEEDS OFF AN APP, which is the narrowest shape that
 * covers every board rather than `FoundryAppSummary`.
 *
 * It is structural for the same reason `rosterSubject` is: the gallery hands
 * in a summary, `/foundry/mine` hands in one too, and the dev harness and the
 * sort tests hand in three fields and an id. A parameter typed to the full
 * payload would make every one of those a cast.
 */
export interface FoundrySortable {
	id: string;
	/** `student_apps.created_at`, for the "Brand new" ranking. */
	created_at?: string | null;
	/** `foundry_list_apps`'s own count, for "Most updated". */
	version_count?: number | null;
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
export function sortGallery<T extends FoundrySortable>(
	apps: readonly T[],
	counts: FoundryPlayCounts,
	sort: FoundryGallerySort
): T[] {
	const list = [...apps];
	if (sort === 'recent') return list;
	const score = foundrySortScore(sort);
	return list.sort((a, b) => score(b, counts[b.id]) - score(a, counts[a.id]));
}

/**
 * WHAT EACH ORDER RANKS ON, AS ONE FUNCTION RETURNING ONE NUMBER PER APP.
 *
 * Every order except `recent` is "descending by a number", so the comparator
 * above has one shape and this says what the number is. A new order is an arm
 * here plus a label; it is not a new comparator, a new branch in the markup or
 * a second sort call somewhere else.
 *
 * `new` READS `created_at` AND `recent` DOES NOT, which is the distinction the
 * two words carry and the reason both exist. `recent` is the list exactly as
 * `foundry_list_apps` ordered it, `updated_at desc` -- RECENTLY TOUCHED, which
 * a metadata edit moves. "Brand new" is when the app was FIRST made, which
 * nothing moves, and report 32b asked for that one by name. Ranking "brand
 * new" on `updated_at` would put a four-term-old app at the top the day its
 * author fixed a typo in its tagline.
 *
 * A MISSING FIELD IS ZERO RATHER THAN A THROW. `created_at` and
 * `version_count` are optional on the sortable shape because a harness, a
 * fixture and a deployment between two migrations are all real states, and an
 * order that crashed on one would take the whole gallery with it.
 */
function foundrySortScore(
	sort: FoundryGallerySort
): (app: FoundrySortable, row: FoundryPlayCounts[string] | undefined) => number {
	switch (sort) {
		case 'played7d':
			return (_app, row) => row?.plays7d ?? 0;
		case 'hours':
			return (_app, row) => row?.seconds ?? 0;
		case 'trending':
			return (_app, row) => foundryTrendScore(row);
		case 'versions':
			return (app) => Number(app.version_count) || 0;
		case 'new':
			return (app) => {
				const t = app.created_at ? Date.parse(app.created_at) : Number.NaN;
				return Number.isNaN(t) ? 0 : t;
			};
		default:
			return (_app, row) => row?.plays ?? 0;
	}
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

/**
 * ===========================================================================
 * THE BOARDS: ranked sections, live on the gallery the moment it opens.
 * ===========================================================================
 *
 * REPORT 32b ASKED FOR THREE OF THEM BY NAME -- "trending and most played and
 * then brand new, and all three of those sections should be visible and live
 * right upon opening the gallery" -- and report 30 asked for hours played. They
 * are the same feature: a board is a ranked section, and Azad's "more
 * leaderboards" and the section list are one surface rather than two.
 *
 * SO THERE IS NO SEPARATE LEADERBOARD PAGE, DELIBERATELY. A board page would be
 * a second ranking implementation over the same counts, and this repository's
 * standing rule is that the second implementation is the one that stops
 * matching. The gallery already ranks; what it was missing was showing more
 * than one ranking at a time, which is precisely what report 32b says.
 *
 * DECISION 35 GOVERNS EVERY ONE OF THEM: ranked by APP, never by student. Mr.
 * Pina, 2026-09-21, in his own words: "ranked by app is fine. no need for
 * student ranking." There is no per-person figure in the input to any of these
 * -- `foundry_play_counts` is counts over apps and `version_count` is a fact
 * about an app -- so there is none in the output and none that could be
 * widened into one.
 */

/** One ranked section: an order, a heading, and what the number means. */
export interface FoundryBoardSpec {
	sort: FoundryGallerySort;
	title: string;
	/**
	 * WHAT THIS BOARD COUNTS, IN THE STUDENT'S TERMS, rendered under the
	 * heading. A ranking whose rule is not on the page is a ranking a reader
	 * cannot check, and "trending" in particular means nothing until it is
	 * spelled out.
	 */
	rule: string;
}

/**
 * HOW MANY APPS A BOARD SHOWS. Five reads as a leaderboard; ten reads as a
 * second copy of the list.
 *
 * IT IS ALSO THE FLOOR FOR SHOWING BOARDS AT ALL. On a gallery of five apps or
 * fewer every board is the same five apps in a different order, four times
 * over, above a list of the same five -- so `foundryBoards` returns nothing
 * and the flat list IS the gallery. That is not a degraded state: it is the
 * honest render of "there is not enough here to rank".
 */
export const FOUNDRY_BOARD_SIZE = 5;

/**
 * THE SECTIONS, IN THE ORDER REPORT 32b ASKED FOR THEM.
 *
 * Trending first because it is the one a reader cannot get any other way;
 * brand new last because "what landed recently" is what the list below already
 * opens on for anybody who presses Recent. Hours sits with Most played because
 * they are the same question asked twice, and separating them would put the
 * two play boards at opposite ends of the page.
 *
 * THE RULE LINES SAY WHAT IS COUNTED AND NOT WHAT IS GOOD. None of them says
 * "best", "top" or "popular": a board is a measurement of attention through
 * one portal, and `FOUNDRY_PLAY_COVERAGE_NOTE` is rendered once beside the
 * whole region saying what that measurement misses.
 */
export const FOUNDRY_GALLERY_BOARDS: FoundryBoardSpec[] = [
	{
		sort: 'trending',
		title: 'Trending',
		rule: 'Played more this week than the week before. The number is the rise.'
	},
	{ sort: 'played', title: 'Most played', rule: 'Every play since the app went live.' },
	{
		sort: 'hours',
		title: 'Most hours',
		rule: 'Total time people have spent in the app, to the nearest minute or so.'
	},
	{ sort: 'new', title: 'Brand new', rule: 'The most recently published apps.' }
];

/** A board that has something to say: its order, its words, and its rows. */
export interface FoundryBoard<T> extends FoundryBoardSpec {
	apps: T[];
	/** The figure beside each app, already in words. Empty where none applies. */
	figures: string[];
}

/**
 * THE FIGURE A BOARD PRINTS BESIDE AN APP, which is the board's own metric and
 * never a different one.
 *
 * A card ranked by hours showing its play count is a ranking the reader cannot
 * check -- they would read the order as wrong. This is the same rule the
 * gallery's own cards already follow under a play sort, stated once so the two
 * cannot drift.
 *
 * "BRAND NEW" PRINTS NOTHING. The figure it ranks on is a timestamp, and a
 * date beside every card on one board and a count beside every card on the
 * others reads as two different kinds of thing in one region -- which they are,
 * and the heading already says which.
 */
export function foundryBoardFigure(
	sort: FoundryGallerySort,
	app: FoundrySortable,
	row: FoundryPlayCounts[string] | undefined
): string {
	switch (sort) {
		case 'trending': {
			const rise = foundryTrendScore(row);
			return rise > 0 ? `+${rise} this week` : '';
		}
		case 'hours':
			return (row?.seconds ?? 0) > 0 ? formatPlayTime(row?.seconds ?? 0) : '';
		case 'played7d': {
			const label = playCountLabel(row?.plays7d ?? 0);
			return label ? `${label} this week` : '';
		}
		case 'versions': {
			const n = Number(app.version_count) || 0;
			if (n <= 0) return '';
			return n === 1 ? '1 version' : `${n} versions`;
		}
		case 'new':
			return '';
		default:
			return playCountLabel(row?.plays ?? 0) ?? '';
	}
}

/**
 * WHICH BOARDS HAVE SOMETHING TO SAY, AND THEIR ROWS.
 *
 * A BOARD IS SUPPRESSED WHEN ITS SIGNAL IS FLAT, and that is the rule that
 * keeps this from being four copies of one list. On a gallery where nothing
 * has been played, "Trending", "Most played" and "Most hours" would each rank
 * every app at zero and the stable sort would render the identical row three
 * times over -- which tells a reader nothing and, worse, tells them something
 * false, because a leaderboard implies the order was earned.
 *
 * SO A PLAY BOARD RENDERS ONLY IF SOMETHING SCORES ABOVE ZERO ON IT. "Brand
 * new" has no such test and needs none: `created_at` always differs, so that
 * ranking is always real. `versions` is not a board at all -- it is offered in
 * the sort control, because "most updated" is a thing to browse by rather than
 * a thing to look at.
 *
 * AND NOTHING RENDERS AT ALL BELOW `FOUNDRY_BOARD_SIZE + 1` APPS. See that
 * constant: with five apps or fewer the boards and the list are the same five
 * cards, and stacking them is noise in exactly the state a new gallery is in.
 *
 * IT IS PURE AND TAKES ITS INPUT AS DATA, so the whole region -- which boards
 * show, in what order, with what figures -- is assertable with no browser. The
 * component below it only lays out what this returns.
 */
export function foundryBoards<T extends FoundrySortable>(
	apps: readonly T[],
	counts: FoundryPlayCounts,
	specs: readonly FoundryBoardSpec[] = FOUNDRY_GALLERY_BOARDS
): FoundryBoard<T>[] {
	if (apps.length <= FOUNDRY_BOARD_SIZE) return [];

	const out: FoundryBoard<T>[] = [];
	for (const spec of specs) {
		const ranked = sortGallery(apps, counts, spec.sort).slice(0, FOUNDRY_BOARD_SIZE);
		if (ranked.length === 0) continue;

		const figures = ranked.map((app) => foundryBoardFigure(spec.sort, app, counts[app.id]));

		// THE FLATNESS TEST, and it is over the WHOLE gallery rather than over
		// the five rows kept: a board whose sixth app also scores zero is
		// still a real ranking of the five above it. What makes a board
		// meaningless is nothing scoring at all.
		if (spec.sort !== 'new') {
			const anySignal = apps.some((app) => {
				const row = counts[app.id];
				if (spec.sort === 'trending') return foundryTrendScore(row) > 0;
				if (spec.sort === 'hours') return (row?.seconds ?? 0) > 0;
				if (spec.sort === 'played7d') return (row?.plays7d ?? 0) > 0;
				if (spec.sort === 'versions') return (Number(app.version_count) || 0) > 1;
				return (row?.plays ?? 0) > 0;
			});
			if (!anySignal) continue;
		}

		out.push({ ...spec, apps: ranked, figures });
	}
	return out;
}
