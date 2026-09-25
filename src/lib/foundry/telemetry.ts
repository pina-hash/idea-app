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
 * and `foundrySortHasSignal` then reads Most hours and Trending as having
 * nothing to rank -- so an unapplied 0221 costs those two orders their
 * ranking, says so in words beside the control, and leaves every other figure
 * on the page exactly as it was. Nothing blanks.
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
 * and an invented figure in a fixture is how an order gets verified against a
 * number nobody meant.
 *
 * Every reader coalesces to zero. An order whose whole signal is then zero
 * says so beside the control (`foundrySortNote`) rather than looking ranked.
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
 * EVERY ORDER THE GALLERY OFFERS, AS DATA, IN THE ORDER THE CONTROL LISTS THEM.
 *
 * ONE NATIVE `<select>` OVER ONE LIST, AND THAT IS DECISION 39 (2026-09-25).
 * Mr. Pina filed it against the gallery as 0221 shipped it -- four ranked
 * sections above the list, each a sideways-scrolling row, plus five buttons
 * under them: "there's a bunch of dead space on the page there's all these
 * scroll bars ... it should just be a drop-down that sorts every game on the
 * website instead of all these different sections". So the sections are gone
 * and every order they ranked on is an option here. Decision 35 is untouched:
 * every order ranks APPS, never students.
 *
 * `trending` AND `new` ARE OPTIONS NOW, AND THEY USED NOT TO BE. They were
 * board-only orders and `isGallerySort` refused them, on the grounds that seven
 * buttons in one group is a control nobody reads at 375px. A `<select>` holds
 * seven options at every width in one line, so that reason went with the
 * buttons.
 *
 * `played` IS THE DEFAULT (decision 04, 2026-09-12) and is FIRST, because
 * decision 39 lists the options in this order. The default is still its own
 * value, `FOUNDRY_GALLERY_DEFAULT_SORT`, and the component reads that and never
 * "whichever option is first": the two agreeing is a fact about the list today,
 * not the mechanism.
 *
 * EACH OPTION SAYS WHAT IT COUNTS AND WHAT IT SAYS WHEN IT HAS NOTHING TO RANK.
 *
 *   `rule`   rendered beside the control. A ranking whose rule is not on the
 *            page is a ranking a reader cannot check, and "trending" means
 *            nothing until it is spelled out. None says "best", "top" or
 *            "popular": an order is a measurement of attention through one
 *            portal, not a verdict on the work.
 *   `flat`   rendered INSTEAD of the rule when `foundrySortHasSignal` says the
 *            order ranks nothing. On a gallery nobody has played, Most played
 *            is every app tied at zero, and a list that silently looks ranked
 *            implies an order that was never earned. Each sentence is true of
 *            exactly the condition that produces it, which is why the
 *            "recently updated order" clause is only on the ones where every
 *            app genuinely ties. Null where an order always ranks something.
 *   `ranksPlays`  the order ranks on a play figure, so the cards carry one
 *            and `FOUNDRY_PLAY_COVERAGE_NOTE` renders beside the control.
 */
export const FOUNDRY_GALLERY_SORTS = [
	{
		id: 'played' as const,
		label: 'Most played',
		rule: 'Every play since the app went live.',
		flat: 'Nothing has been played here yet, so every app ties and the list is in recently updated order.',
		ranksPlays: true
	},
	{
		id: 'trending' as const,
		label: 'Trending',
		rule: 'Played more this week than the week before. The number is the rise.',
		flat: 'Nothing is climbing this week: no app was played more than it was the week before.',
		ranksPlays: true
	},
	{
		id: 'played7d' as const,
		label: 'Played this week',
		rule: 'Plays in the last seven days.',
		flat: 'Nothing has been played this week, so every app ties and the list is in recently updated order.',
		ranksPlays: true
	},
	/**
	 * 0221, REPORT 30, IN AZAD ARTEAGA'S OWN EXAMPLES: "Most hours played, most
	 * versions/updates". Decision 35 answered the shape of them -- ranked by
	 * app, never by student -- and both are rankings over a field that is
	 * already a fact about an APP.
	 *
	 * `versions` NEEDED NO SQL AND GOT NONE. `foundry_list_apps` has projected
	 * `version_count` since 0130 (every version uploaded, drafts included) and
	 * it has reached the client on `FoundryAppSummary` the whole time, so this
	 * is a sort over a number the gallery already holds. `hours` is the one
	 * that needed a migration.
	 */
	{
		id: 'hours' as const,
		label: 'Most hours',
		rule: 'Total time people have spent in the app, to the nearest minute or so.',
		flat: 'No playing time has been recorded yet, so every app ties and the list is in recently updated order.',
		ranksPlays: true
	},
	{
		id: 'versions' as const,
		label: 'Most updated',
		rule: 'How many versions the author has uploaded.',
		flat: 'Every app has the same number of versions, so the list is in recently updated order.',
		ranksPlays: false
	},
	{
		id: 'new' as const,
		label: 'Newest',
		rule: 'The newest apps first, by when each one was first made.',
		flat: null,
		ranksPlays: false
	},
	{
		id: 'recent' as const,
		label: 'Recently updated',
		rule: 'The apps changed most recently first, including a new name or description.',
		flat: null,
		ranksPlays: false
	}
];

/** Every order this gallery knows, which since decision 39 is every option. */
export type FoundryGallerySort = (typeof FOUNDRY_GALLERY_SORTS)[number]['id'];

/** One option of the control: its id, its words and whether it ranks plays. */
export type FoundryGallerySortOption = (typeof FOUNDRY_GALLERY_SORTS)[number];

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
 * True for an id the control actually OFFERS. A stored or URL value is not
 * trusted.
 *
 * IT ADMITS `trending` AND `new` SINCE DECISION 39, and the argument that
 * refused them is what now admits them. The question is "could this value put
 * the control into a state with nothing under it", and while those two had no
 * button the answer was yes. Each is an `<option>` now, so every id this
 * admits is one a person can see selected.
 */
export function isGallerySort(value: unknown): value is FoundryGallerySort {
	return FOUNDRY_GALLERY_SORTS.some((s) => s.id === value);
}

/** The option for an order: its label, its rule and its flat sentence. */
export function gallerySortOption(sort: FoundryGallerySort): FoundryGallerySortOption {
	return FOUNDRY_GALLERY_SORTS.find((s) => s.id === sort) ?? FOUNDRY_GALLERY_SORTS[0];
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
 * recent level, so a third order that ranked on either would be a copy of one
 * of them wearing a different label. An app that went from 1 play to 9 is
 * climbing; an app that sits at 50 a week every week is popular and is
 * already first under the order that says so.
 *
 * A DECLINING APP SCORES NEGATIVE AND THAT IS LEFT ALONE. Nothing clamps: a
 * falling app sorts BELOW an untouched one, which is true, and its card prints
 * no figure (`foundrySortFigure` never prints a fall). Clamping to zero would
 * instead pile every declining app in at the same score as every untouched
 * one and make the tiebreak decide the order. A gallery where nothing is
 * climbing says so beside the control (`foundrySortNote`).
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
 * covers every order rather than `FoundryAppSummary`.
 *
 * It is structural for the same reason `rosterSubject` is: the gallery hands
 * in a summary, `/foundry/mine` hands in one too, and the dev harness and the
 * sort tests hand in three fields and an id. A parameter typed to the full
 * payload would make every one of those a cast.
 */
export interface FoundrySortable {
	id: string;
	/** `student_apps.created_at`, for the "Newest" ranking. */
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
 * exactly the order "Recently updated" shows -- which is the honest answer,
 * and is why the popularity orders are offered before anybody plays anything
 * (the sentence beside the control says the list is tied, `foundrySortNote`).
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
 * tie was only ever seen by somebody who chose a popularity order; `played` is
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
 * a metadata edit moves. "Newest" is when the app was FIRST made, which
 * nothing moves, and report 32b asked for that one by name ("brand new").
 * Ranking it on `updated_at` would put a four-term-old app at the top the day
 * its author fixed a typo in its tagline.
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
 * WHAT THE GALLERY PRINTS BESIDE ITS ORDER: a figure per card and a sentence
 * beside the control.
 * ===========================================================================
 *
 * THERE ARE NO RANKED SECTIONS ANY MORE, AND THERE IS STILL NO BOARD PAGE.
 * 0221 answered reports 30 and 32b with up to four "boards" above the list;
 * decision 39 (2026-09-25, Mr. Pina, by filing R11) replaced them with one
 * `<select>` over one list, because the sections were dead space and a stack
 * of sideways scrollbars. What survives of them is everything that was a RULE
 * rather than a layout: every order is `sortGallery`'s own ranking, the number
 * beside a card is the metric in force, and an order with nothing to rank says
 * so in words rather than looking ranked.
 *
 * DECISION 35 GOVERNS ALL OF IT: ranked by APP, never by student. There is no
 * per-person figure in the input to any of these -- `foundry_play_counts` is
 * counts over apps and `version_count` is a fact about an app -- so there is
 * none in the output and none that could be widened into one.
 */

/**
 * THE FIGURE A CARD PRINTS UNDER AN ORDER, which is that order's own metric
 * and never a different one.
 *
 * A card ranked by hours showing its play count is a ranking the reader cannot
 * check -- they would read the order as wrong. Before decision 39 the list's
 * own cards printed plays under every order but Recent, so Most hours and Most
 * updated showed a number that did not explain the order it sat in; this is
 * the ONE mapping now, for every order.
 *
 * NOTHING UNDER `new` OR `recent`. Both rank on a timestamp, and a date beside
 * every card reads as a different kind of thing from a count; the option's own
 * rule, beside the control, already says what the order is. Nothing for zero
 * or a fall either: "0 plays" or "-28 this week" on a card reads as a verdict
 * on the work rather than as a measurement.
 */
export function foundrySortFigure(
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
		case 'recent':
			return '';
		default:
			return playCountLabel(row?.plays ?? 0) ?? '';
	}
}

/**
 * WHETHER AN ORDER RANKS ANYTHING ON THIS GALLERY.
 *
 * THE FLATNESS RULE OUTLIVED THE BOARDS IT WAS WRITTEN FOR. A board used to be
 * suppressed when its signal was flat; there is nothing to suppress now, but a
 * list ordered by a signal nobody has produced still looks ranked, and "a
 * leaderboard implies the order was earned" is as true of a dropdown as of a
 * section. So instead of hiding anything, the control's sentence changes (see
 * `foundrySortNote`).
 *
 * THE TEST IS PER ORDER AND READS THE ONE SCORE FUNCTION. A play order ranks
 * something when any app scores above zero on it -- for trending that is
 * "something is climbing", which a gallery of only falling apps is not.
 * `versions` ranks something when two apps differ, because every published
 * app has at least one version. `new` and `recent` always rank: `created_at`
 * always differs, and `recent` is the list as it arrived.
 */
export function foundrySortHasSignal(
	apps: readonly FoundrySortable[],
	counts: FoundryPlayCounts,
	sort: FoundryGallerySort
): boolean {
	if (sort === 'recent' || sort === 'new') return true;
	const score = foundrySortScore(sort);
	const scores = apps.map((app) => score(app, counts[app.id]));
	if (sort === 'versions') return scores.some((s) => s !== scores[0]);
	return scores.some((s) => s > 0);
}

/**
 * WHAT A PLAY ORDER SAYS WHEN THE COUNTS NEVER ARRIVED, which is not what it
 * says when they arrived and were zero.
 *
 * The gallery load degrades a failed `foundry_play_counts` read to NO COUNTS
 * rather than taking the page down, and no counts is every app tied at zero --
 * the exact input on which the flat sentences say "Nothing has been played here
 * yet". Printed there, that is a false statement about every app on the page
 * made by an instrument that simply did not answer. So a load that could not
 * read the counts says THAT, and the list is still in recently updated order,
 * which is true: every app scores zero and the sort is stable.
 */
export const FOUNDRY_PLAY_COUNTS_UNKNOWN_NOTE =
	'Play counts could not be loaded just now, so the list is in recently updated order. Reloading the page may bring them back.';

/**
 * THE SENTENCE BESIDE THE CONTROL: what the order counts, or, when it has
 * nothing to rank, that it has nothing to rank -- or, for an order that ranks
 * on plays, that the plays could not be read (`countsKnown` false).
 *
 * `countsKnown` DEFAULTS TO TRUE because every caller but the real route hands
 * in counts it made itself; the route passes false when its count read failed,
 * so "not read" and "read, and zero" never share a sentence.
 *
 * Pure, and it takes the gallery as data, so which sentence a reader sees
 * under which counts is assertable with no browser. The component only
 * renders what this returns.
 */
export function foundrySortNote(
	apps: readonly FoundrySortable[],
	counts: FoundryPlayCounts,
	sort: FoundryGallerySort,
	countsKnown = true
): string {
	const option = gallerySortOption(sort);
	if (!countsKnown && option.ranksPlays) return FOUNDRY_PLAY_COUNTS_UNKNOWN_NOTE;
	return option.flat && !foundrySortHasSignal(apps, counts, sort) ? option.flat : option.rule;
}
