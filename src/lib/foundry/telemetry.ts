/**
 * THE PURE ARITHMETIC BEHIND FOUNDRY PLAY TELEMETRY.
 *
 * Plain data and pure functions, no Svelte and no transports, so the ordering
 * rule, the heartbeat interval and the wording of a duration are assertable
 * without a browser -- and, more to the point, are stated ONCE rather than
 * re-derived inline in the three surfaces that would otherwise stop agreeing.
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
 * `recent` IS THE DEFAULT AND STAYS THE DEFAULT. It is what
 * `foundry_list_apps` already returns (newest activity first) and it is the
 * only order that does not put the same handful of apps at the top of the
 * page every day of the year. Popularity is offered; it is not imposed.
 */
export const FOUNDRY_GALLERY_SORTS = [
	{ id: 'recent' as const, label: 'Recent' },
	{ id: 'played' as const, label: 'Most played' },
	{ id: 'played7d' as const, label: 'Played this week' }
];

export type FoundryGallerySort = (typeof FOUNDRY_GALLERY_SORTS)[number]['id'];

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
 * `Array.prototype.sort` is required to be stable, so the index fallback is a
 * statement of intent rather than a workaround.
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
