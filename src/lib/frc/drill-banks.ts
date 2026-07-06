/**
 * Interactive drill banks for the five units that have one (MDM-1, 2, 3, 9,
 * 10): order (arrange a sequence), match (pair left items to right items),
 * and pick (a scenario multiple choice with feedback). Client-side only, on
 * purpose: unlike the quiz banks (`$lib/server/frc`), these are coached
 * practice, not a graded gate, so the content is meant to be shown, and there
 * is no server round trip, no persistence, and no schema. Units without a
 * bank (MDM-4 through MDM-8) keep the write-from-memory drill
 * (`FrcDrillPhase.svelte`); `UnitPage.svelte` picks between them via
 * `getDrillBank`.
 */
import raw from '../../../mdm-drill-banks.json';

export interface DrillOrderItem {
	id: string;
	type: 'order';
	prompt: string;
	/** The correct order; shown shuffled to the student. */
	sequence: string[];
}
export interface DrillMatchItem {
	id: string;
	type: 'match';
	prompt: string;
	/** left[i] pairs with right[i]; the right column is shown shuffled. */
	left: string[];
	right: string[];
}
export interface DrillPickItem {
	id: string;
	type: 'pick';
	prompt: string;
	options: string[];
	/** Index of the correct option. */
	answer: number;
	feedback: string;
}
export type DrillItem = DrillOrderItem | DrillMatchItem | DrillPickItem;

export interface DrillBank {
	/** Percent of items that must be correct on the FIRST try to unlock the Quiz. */
	readinessPass: number;
	items: DrillItem[];
}

const BANKS = (raw as { banks: Record<string, DrillBank> }).banks;

/** The interactive drill bank for a unit, or undefined if it has none yet. */
export function getDrillBank(unitId: string): DrillBank | undefined {
	return BANKS[unitId];
}

/** Fisher-Yates shuffle; never mutates the input. */
export function shuffled<T>(items: T[]): T[] {
	const arr = items.slice();
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}
