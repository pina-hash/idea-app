/**
 * CHANGING A LIVE TOURNAMENT'S SETTINGS, AS AN ADMIN (ledger 0392, migration
 * 0266, report d1d40a60). Plain data and pure functions, the `settings.ts`
 * convention, so the host console and `/dev/tournament-settings` build the
 * same calls and say the same sentences.
 *
 * THE DATABASE OWNS EVERY RULE: `tournament_live_config_preview` answers what
 * a change would do and writes nothing, and `tournament_live_config_apply`
 * refuses anything the preview would have refused, plus a preview that went
 * stale. This module only turns the answers into words, so the confirm a
 * person reads names exactly what will happen to the matches already played.
 */

/** One changed key, as the preview reports it. */
export interface LiveChange {
	key: string;
	from: unknown;
	to: unknown;
}

/** The preview's answer, normalized. */
export interface LivePlan {
	ok: boolean;
	reason?: string;
	largest?: number;
	message?: string;
	changes: LiveChange[];
	matchesRestamped: number;
	matchesKeptLength: number;
	matchesPlayed: number;
	/** The config the preview was made against; the apply sends it back. */
	stored: unknown;
	/** The config the apply would write. */
	after: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number => {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
};

export function normalizeLivePlan(raw: unknown): LivePlan {
	const r = isRecord(raw) ? raw : {};
	const changes = Array.isArray(r.changes)
		? (r.changes as unknown[])
				.filter(isRecord)
				.filter((c) => typeof c.key === 'string')
				.map((c) => ({ key: c.key as string, from: c.from, to: c.to }))
		: [];
	return {
		ok: r.ok === true,
		reason: typeof r.reason === 'string' ? r.reason : undefined,
		largest: r.largest == null ? undefined : num(r.largest),
		message: typeof r.message === 'string' ? r.message : undefined,
		changes,
		matchesRestamped: num(r.matches_restamped),
		matchesKeptLength: num(r.matches_kept_length),
		matchesPlayed: num(r.matches_played),
		stored: r.stored,
		after: r.after
	};
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const bestOfWords = (v: unknown) => `best of ${num(v)}`;

/** The sentence for one changed setting. */
export function liveChangeLine(c: LiveChange): string {
	switch (c.key) {
		case 'score_entry':
			return c.to === true
				? 'Scoring turns ON: from now on every result is entered with per-game scores.'
				: 'Scoring turns OFF: from now on results are entered as win or loss only.';
		case 'best_of_default':
			return `Match length changes from ${bestOfWords(c.from)} to ${bestOfWords(c.to)}.`;
		case 'best_of':
			return 'Per-round match lengths change (the grand final, or a round override).';
		case 'team_size':
			return `Team size changes from ${num(c.from)} to ${num(c.to)}.`;
		default:
			return `${c.key} changes.`;
	}
}

/** What the change does to the matches, in words, for the confirm. Always says
 * what happens to what is already played, which is the question a person asks. */
export function liveEffectLines(plan: LivePlan): string[] {
	const lines = plan.changes.map(liveChangeLine);
	lines.push(
		plan.matchesPlayed > 0
			? `${plural(plan.matchesPlayed, 'match is', 'matches are')} already decided and keep${plan.matchesPlayed === 1 ? 's' : ''} ${plan.matchesPlayed === 1 ? 'its' : 'their'} recorded result. Nothing is re-decided.`
			: 'No match has been decided yet, so no result changes.'
	);
	if (plan.matchesRestamped > 0) {
		lines.push(`${plural(plan.matchesRestamped, 'match that has not started takes', 'matches that have not started take')} the new length.`);
	}
	if (plan.matchesKeptLength > 0) {
		lines.push(
			`${plural(plan.matchesKeptLength, 'match already started or played keeps', 'matches already started or played keep')} the length ${plan.matchesKeptLength === 1 ? 'it was' : 'they were'} played to.`
		);
	}
	lines.push('No coins move: rewards already recorded keep their amounts, and payouts are still settled at the end.');
	return lines;
}

/** A refusal from either call, in words. */
export function liveRefusalSentence(plan: Pick<LivePlan, 'reason' | 'largest' | 'message'>): string {
	switch (plan.reason) {
		case 'not_admin':
			return 'Only a site admin can change a live tournament’s format.';
		case 'not_live':
			return 'This tournament is no longer live, so this change does not apply. Reload the page.';
		case 'not_found':
			return 'This tournament no longer exists.';
		case 'quals_locked':
			return 'Qualifying cannot be turned on or off while the event runs: the bracket was drawn from it.';
		case 'team_size_below_largest':
			return `The team size cannot go below the largest team already registered (${plan.largest ?? 0}).`;
		case 'stale':
			return 'Someone changed this tournament’s settings after you opened the preview. Nothing was changed. Review the new settings and try again.';
		case 'no_change':
			return 'Nothing in the format would change.';
		case 'invalid':
			return plan.message ?? 'Those settings are not valid.';
		case 'unavailable':
			return 'Changing a live tournament is not available until the database is updated.';
		default:
			return 'That change was refused.';
	}
}

/** The quals lock a live admin edit still carries, as the form's sentence. */
export const LIVE_QUALS_LOCK =
	'The bracket was drawn from qualifying, so this stays as it is while the event runs.';

/** The note above the controls while an admin edits a live event. */
export const LIVE_EDIT_NOTE =
	'This event is live. As a site admin you can still change its format. Saving shows exactly what changes, and what happens to matches already played, before anything is written.';
