/**
 * A TOURNAMENT'S SETTINGS AS ONE FORM: the draft, the config it becomes, and
 * the locks (ledger 0298, report R02). Plain data and pure functions, the
 * `tournaments.ts` convention, so the new-tournament page, the host console's
 * Settings card and `/dev/tournament-settings` all build the SAME payload
 * through the same code and the arithmetic is testable with no browser.
 *
 * THE RPC REPLACES THE CONFIG WHOLESALE. `tournament_update` (0062, last
 * redefined in 0192) normalizes `p_config` and writes it over the stored
 * object; a key that is not sent takes the normalizer's default, softened
 * for `team_size` alone. So an edit is never "the fields the form shows":
 * `buildConfig` starts from the STORED object and lays the edited fields over
 * it, and a per-round `best_of` override the form has no control for (any
 * key but `grand_final`) survives an edit untouched. Dropping one would
 * silently change how a round is played, with nothing on screen to say so --
 * which is why `tests/tournament-settings.test.ts` pins it.
 *
 * THE LOCKS ARE THE DATABASE'S RULE PLUS ONE EDGE IT DOES NOT COVER.
 *   - Format, once the bracket exists (`live`, `complete`): the RPC refuses a
 *     config then with 'Format settings are locked once the bracket is
 *     generated.' The form shows the format as text instead of controls, so
 *     the refusal is never the first a host hears of it.
 *   - Qualifying on/off, once pools exist. The RPC still accepts
 *     `quals_enabled: false` in `seeding` after `tournament_generate_qual_pools`,
 *     and the bracket generator then ignores the pools -- which stay in the
 *     tables, still shown on every entry page, with any results in them, and
 *     come back if qualifying is turned on again. Nothing deletes pools, so
 *     the lock stays until the bracket is drawn.
 *   - Score entry, once a qualifying result is recorded. Scores break ties in
 *     the pool standings (`_tournament_qual_seed_order`'s points difference),
 *     so switching mid-pool would rank some matches by score and others with
 *     none.
 * The last two are UI locks only; no migration was available (ledger 0298
 * shipped none) and the RPC is unchanged.
 */

import { parseConfig, TEAM_SIZE_MAX, type TournamentStatus } from './tournaments';

/** The best-of lengths the form offers. A stored value outside this list
 * (the normalizer admits any odd number 1 to 15) is added to the choices
 * rather than silently shown as something else: `bestOfChoices`. */
export const BEST_OF_CHOICES: readonly number[] = [1, 3, 5, 7];

/** The key the form's "Grand final" control writes. Every other `best_of`
 * key is carried through untouched. */
export const GRAND_FINAL_KEY = 'grand_final';

/** Everything the form edits, as the form holds it. */
export interface SettingsDraft {
	name: string;
	description: string;
	qualsEnabled: boolean;
	scoreEntry: boolean;
	bestOfDefault: number;
	/** 0 means "same as the default": no `grand_final` key is sent. */
	bestOfGrandFinal: number;
	teamSize: number;
}

/** A reason in words, or null where the field is free. */
export interface SettingsLocks {
	format: string | null;
	quals: string | null;
	score: string | null;
}

export const OPEN_LOCKS: SettingsLocks = { format: null, quals: null, score: null };

/** The draft a brand-new tournament starts from: today's new-tournament
 * defaults, unchanged. */
export const NEW_TOURNAMENT_DRAFT: SettingsDraft = {
	name: '',
	description: '',
	qualsEnabled: false,
	scoreEntry: false,
	bestOfDefault: 1,
	bestOfGrandFinal: 0,
	teamSize: 1
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

/** The draft a stored tournament opens on. Read through `parseConfig`, the
 * one client reading of a stored config. */
export function draftFromStored(name: string, description: string, config: unknown): SettingsDraft {
	const c = parseConfig(config);
	const gf = c.best_of[GRAND_FINAL_KEY];
	return {
		name,
		description,
		qualsEnabled: c.quals_enabled,
		scoreEntry: c.score_entry,
		bestOfDefault: c.best_of_default,
		bestOfGrandFinal: typeof gf === 'number' ? gf : 0,
		teamSize: c.team_size
	};
}

/**
 * One string per draft, for "has this moved". Name and description are
 * compared TRIMMED, which is how the RPCs store them: a trailing space the
 * server would strip is not an edit.
 */
export function draftSignature(d: SettingsDraft): string {
	return JSON.stringify([
		d.name.trim(),
		d.description.trim(),
		d.qualsEnabled,
		d.scoreEntry,
		d.bestOfDefault,
		d.bestOfGrandFinal,
		d.teamSize
	]);
}

/** The draft with every LOCKED field put back to its stored value, so a lock
 * holds in the payload even if something moved the control underneath it. */
export function effectiveDraft(
	stored: SettingsDraft,
	draft: SettingsDraft,
	locks: SettingsLocks
): SettingsDraft {
	if (locks.format) {
		return { ...stored, name: draft.name, description: draft.description };
	}
	return {
		...draft,
		qualsEnabled: locks.quals ? stored.qualsEnabled : draft.qualsEnabled,
		scoreEntry: locks.score ? stored.scoreEntry : draft.scoreEntry
	};
}

/** Which of the three things `tournament_update` writes would change. */
export function settingsChanges(
	stored: SettingsDraft,
	draft: SettingsDraft,
	locks: SettingsLocks
): { name: boolean; description: boolean; format: boolean } {
	const d = effectiveDraft(stored, draft, locks);
	return {
		name: d.name.trim() !== stored.name.trim(),
		description: d.description.trim() !== stored.description.trim(),
		format:
			!locks.format &&
			(d.qualsEnabled !== stored.qualsEnabled ||
				d.scoreEntry !== stored.scoreEntry ||
				d.bestOfDefault !== stored.bestOfDefault ||
				d.bestOfGrandFinal !== stored.bestOfGrandFinal ||
				d.teamSize !== stored.teamSize)
	};
}

/**
 * THE WHOLE CONFIG OBJECT, from the stored one with the edited fields laid
 * over it. For a new tournament `stored` is `{}` and the result is exactly
 * the literal the new-tournament page used to send, keys in the same order.
 */
export function buildConfig(stored: unknown, draft: SettingsDraft): Record<string, unknown> {
	const base: Record<string, unknown> = isRecord(stored) ? { ...stored } : {};
	const bestOf: Record<string, unknown> = isRecord(base.best_of) ? { ...base.best_of } : {};
	delete bestOf[GRAND_FINAL_KEY];
	if (draft.bestOfGrandFinal > 0) bestOf[GRAND_FINAL_KEY] = draft.bestOfGrandFinal;
	return {
		...base,
		quals_enabled: draft.qualsEnabled,
		score_entry: draft.scoreEntry,
		best_of_default: draft.bestOfDefault,
		best_of: bestOf,
		team_size: draft.teamSize
	};
}

/** Per-round overrides the form does not show (every `best_of` key but the
 * grand final), which an edit keeps. The form says how many there are. */
export function hiddenRoundOverrides(stored: unknown): string[] {
	const c = parseConfig(stored);
	return Object.keys(c.best_of)
		.filter((k) => k !== GRAND_FINAL_KEY)
		.sort();
}

/** The form's own refusals, in the words `tournament_create` uses. */
export function validateSettings(d: SettingsDraft): string | null {
	const name = d.name.trim();
	if (!name) return 'Give the tournament a name.';
	if (name.length > 80) return 'Tournament name is limited to 80 characters.';
	return null;
}

/** `tournament_create`'s arguments. */
export function tournamentCreateArgs(d: SettingsDraft): {
	p_name: string;
	p_description: string;
	p_config: Record<string, unknown>;
} {
	return {
		p_name: d.name.trim(),
		p_description: d.description.trim(),
		p_config: buildConfig({}, d)
	};
}

/**
 * `tournament_update`'s arguments. A field that did not change is sent as
 * null, which the RPC reads as "keep": a host renaming the event does not
 * also rewrite a description a co-host edited a minute ago, and a format
 * that did not change is not re-sent (nor, once locked, sent at all -- the
 * RPC would refuse it).
 */
export function tournamentUpdateArgs(
	tournamentId: string,
	stored: { name: string; description: string; config: unknown },
	draft: SettingsDraft,
	locks: SettingsLocks
): {
	p_tournament_id: string;
	p_name: string | null;
	p_description: string | null;
	p_config: Record<string, unknown> | null;
} {
	const storedDraft = draftFromStored(stored.name, stored.description, stored.config);
	const d = effectiveDraft(storedDraft, draft, locks);
	const changed = settingsChanges(storedDraft, draft, locks);
	return {
		p_tournament_id: tournamentId,
		p_name: changed.name ? d.name.trim() : null,
		p_description: changed.description ? d.description.trim() : null,
		p_config: changed.format ? buildConfig(stored.config, d) : null
	};
}

/**
 * THE LOCKS, from what the host console already loads. Each reason is the
 * sentence the form shows beside the locked field.
 */
export function settingsLocks(input: {
	status: TournamentStatus;
	/** Qualifying pools on the tournament (`tournament_qual_pools` rows). */
	pools: number;
	/** Qualifying matches with a winner recorded. */
	qualResults: number;
}): SettingsLocks {
	if (input.status === 'live' || input.status === 'complete') {
		return {
			format:
				input.status === 'live'
					? 'The bracket is live, so the format is locked: every match was set up from it. The name and the description can still change.'
					: 'The tournament is complete, so the format is locked. The name and the description can still change.',
			quals: null,
			score: null
		};
	}
	return {
		format: null,
		quals:
			input.pools > 0
				? 'Qualifying pools have already been drawn, so this stays as it is. Changing it now would leave the pools, and any results in them, behind.'
				: null,
		score:
			input.qualResults > 0
				? 'Qualifying results are already recorded, so this stays as it is. Scores break ties in the pool standings, and switching now would rank some matches by score and others without one.'
				: null
	};
}

/** The best-of lengths to offer, with a stored value outside the usual list
 * included so a select never shows something other than what is stored. */
export function bestOfChoices(current: number): number[] {
	const set = new Set<number>(BEST_OF_CHOICES);
	if (Number.isInteger(current) && current >= 1 && current <= 15 && current % 2 === 1) {
		set.add(current);
	}
	return [...set].sort((a, b) => a - b);
}

/** The team sizes the form offers, 1 to TEAM_SIZE_MAX. */
export const TEAM_SIZES: readonly number[] = Array.from({ length: TEAM_SIZE_MAX }, (_, i) => i + 1);

/** How a team size reads. */
export const teamSizeLabel = (n: number): string => (n === 1 ? 'Solo' : `Teams of up to ${n}`);

/** The largest roster on any entry, which the team size may not go under
 * (`tournament_update` refuses it, naming the number). */
export function largestRoster(entryMemberCounts: Iterable<number>): number {
	let max = 0;
	for (const n of entryMemberCounts) if (n > max) max = n;
	return max;
}
