/**
 * THE ONE PERSON PICKER'S DATA (ledger 0470, generalized from ledger 0455's
 * tournament picker). Plain data, client-safe: what a row of the list is and
 * what a search answers. `PersonPicker.svelte` beside it is the component.
 *
 * A SURFACE OWNS ITS DIRECTORY, NEVER THE PICKER. Each caller hands in its own
 * `search`, backed by its own database function and its own rule for who may
 * be found (the tournament host's `tournament_people_search`, IdeaCAD's
 * `ideacad_share_people`), and maps its rows onto `PickerPerson`. So the picker
 * holds no disclosure decision of its own: it shows exactly what the row
 * carries, and a surface that keeps addresses out of its rows keeps them out
 * of the list.
 */
import type { AvatarSubject } from '$lib/avatars';

export interface PickerPerson {
	/** Stable and unique within one answer: an address, or an opaque account key. */
	key: string;
	/** The name the person shows. */
	name: string;
	/** The quieter line under the name (role, relation, access). */
	detail?: string;
	/** Drawn beside the name through `Avatar.svelte` when present. */
	picture?: AvatarSubject | null;
	/** Shown dimmed and never the first highlighted row (already in, already shared). */
	muted?: boolean;
	/** What a `fill` picker writes into its box when this row is picked. */
	fill?: string;
}

export type PickerAnswer =
	| { ok: true; rows: PickerPerson[] }
	/** `unavailable`: the directory is not on this deployment; `refused`: not for this caller. Both leave a plain box. */
	| { ok: false; reason: 'unavailable' | 'refused' | 'failed' };

/** The wait after the last keystroke before asking, 0455's figure. */
export const PICKER_DEBOUNCE_MS = 180;

/** The first row worth highlighting: the first that is not muted, else the first. */
export function firstPickable(rows: readonly PickerPerson[]): number {
	const first = rows.findIndex((p) => !p.muted);
	return first >= 0 ? first : rows.length ? 0 : -1;
}
