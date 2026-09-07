import type { AssignmentStanding } from '$lib/classroom/classroom';

/**
 * HOW THE GRADES TAB ORDERS ITS ASSIGNMENTS, and the one implementation of it.
 *
 * WHY THIS EXISTS AT ALL. An instructor reported the page as "kinda random",
 * and the sort it was reporting was not random: waiting-to-be-marked first,
 * then by due date descending, written inline in `GradesPanel.svelte`. What
 * made it READ as random is that its primary key is a LIVE COUNT of other
 * people's actions. An assignment from May climbs above one from September the
 * moment a single student hands in, and drops back the moment it is marked --
 * so the list reorders itself between two visits for reasons the person
 * looking at it did not cause, cannot see, and is not told about. A stable
 * order somebody can predict is worth more on this page than an order that is
 * always optimal for one question.
 *
 * SO THE DEFAULT IS A DATE AND THE QUEUE IS THE OTHER OPTION, not the reverse.
 * The queue order is genuinely useful and was built deliberately, which is why
 * it survives as `queue` rather than being deleted; what changes is which one
 * a teacher gets without asking. `GRADING_ORDER_DEFAULT` is the whole of that
 * decision and every caller reads it rather than spelling `'due'`.
 *
 * IT IS A MODULE AND NOT A COMPARATOR INSIDE THE COMPONENT because the claim
 * "the list is in due order" is the thing that has to be assertable without a
 * browser -- a sort written inline in a `$derived` can only be checked by
 * rendering, and a rendering check reads the same whether the comparator is
 * right or the fixture is unlucky.
 */
export type GradingOrderKey = 'due' | 'queue';

export const GRADING_ORDER_DEFAULT: GradingOrderKey = 'due';

/**
 * The visible words, per key. One label for the control and one SENTENCE the
 * page states about itself -- a list that says what it is sorted by is a list
 * nobody has to call random. Colour is never the only signal here and neither
 * is position: the order is written out in text.
 */
export const GRADING_ORDER_OPTIONS: {
	key: GradingOrderKey;
	label: string;
	says: string;
}[] = [
	{ key: 'due', label: 'By due date', says: 'Newest due date first' },
	{ key: 'queue', label: 'Needs marking first', says: 'Waiting to be marked first' }
];

/** The sentence for a key, or the default's when the key is not one we know. */
export function gradingOrderSays(key: GradingOrderKey): string {
	const found = GRADING_ORDER_OPTIONS.find((o) => o.key === key);
	return (found ?? GRADING_ORDER_OPTIONS[0]).says;
}

/**
 * Milliseconds, or null for absent/unparseable.
 *
 * NULL IS NOT A DATE AND MUST NOT BE COERCED INTO ONE. The inline sort this
 * replaces read `Date.parse(item.due_at ?? '0')`, and `Date.parse('0')` is
 * 2000-01-01 in V8 (measured) rather than NaN or zero -- so a due-less
 * assignment was silently sorted as if it were due at the turn of the century.
 * It landed last, which is where it belongs, so nothing ever looked wrong; but
 * the reason it landed last was an accident of how one engine parses a
 * one-character string, and an accident that happens to be right is still not
 * a rule. Undated rows are a SEPARATE GROUP here, decided by name.
 */
function instant(value: string | null | undefined): number | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

/**
 * Does this assignment carry a due date at all. The dividing line between the
 * two groups a `due` sort produces, exported because the panel draws a heading
 * at exactly that boundary and must not re-derive the test.
 */
export function hasDueDate(s: AssignmentStanding): boolean {
	return instant(s.item.due_at) != null;
}

/**
 * THE ORDER, given a key. Never mutates its input.
 *
 * `due` -- every DATED assignment first, most recently due first, then every
 * UNDATED one, most recently posted first. Nearest-to-now leads in both
 * groups, which is one rule and not two: a teacher on this page is working on
 * what was just due, and last term's lab is the thing they scroll to, not the
 * thing they land on.
 *
 * Dated before undated, rather than the other way round, because an assignment
 * with no deadline is the one nobody is waiting on -- it cannot be late, it
 * cannot be overdue, and putting it above dated work buries the only rows the
 * page's own question is about.
 *
 * `queue` -- the order this panel produced before, kept so the option is the
 * old behaviour rather than a reconstruction of it: anything with submissions
 * waiting, most waiting first, then due date descending. The one expression
 * that differs is the stand-in for a missing due date, `0` here against the
 * old `Date.parse('0')`, and it is INERT: both are below every reachable due
 * date, so undated rows land last in a descending sort either way and tie with
 * each other either way. The old value was 2000-01-01 and the difference would
 * only show for work due before then.
 *
 * BOTH BRANCHES END ON A TOTAL ORDER. `Array.prototype.sort` is stable, so a
 * comparator that runs out of keys leaves the input order -- which here is
 * `created_at desc` from `itemsForSection`, an order this module cannot see
 * and a future caller might not preserve. Two rows that tie on every stated
 * key would then swap places between two loads with nothing to say why, which
 * is the exact complaint this change exists to answer. So `created_at` and
 * then `id` close both branches: `created_at` because it is the order the
 * stream already reads in, and `id` because two rows written in one
 * transaction share `created_at` exactly (transaction time, the roster-import
 * lesson) and a tie has to break on something that cannot repeat.
 */
export function orderStandings(
	standings: AssignmentStanding[],
	key: GradingOrderKey = GRADING_ORDER_DEFAULT
): AssignmentStanding[] {
	const rows = [...standings];
	if (key === 'queue') {
		return rows.sort(
			(a, b) =>
				(b.awaiting > 0 ? 1 : 0) - (a.awaiting > 0 ? 1 : 0) ||
				b.awaiting - a.awaiting ||
				(instant(b.item.due_at) ?? 0) - (instant(a.item.due_at) ?? 0) ||
				lastly(a, b)
		);
	}
	return rows.sort((a, b) => {
		const da = instant(a.item.due_at);
		const db = instant(b.item.due_at);
		if (da != null && db != null) return db - da || lastly(a, b);
		// Dated ahead of undated. Never a subtraction against a stand-in value.
		if (da != null) return -1;
		if (db != null) return 1;
		return lastly(a, b);
	});
}

/** The tail both branches share: newest posted, then id. */
function lastly(a: AssignmentStanding, b: AssignmentStanding): number {
	const ca = instant(a.item.created_at) ?? 0;
	const cb = instant(b.item.created_at) ?? 0;
	if (cb !== ca) return cb - ca;
	return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
}

/**
 * Where the undated group starts in an already-`due`-ordered list, or -1 when
 * there is no boundary to draw (every row dated, every row undated, or no rows
 * at all). The panel renders a heading at this index and NOTHING when it is
 * -1: a "No due date" heading over the whole list, or over nothing, is a label
 * that has stopped labelling anything.
 */
export function undatedBoundary(ordered: AssignmentStanding[]): number {
	const first = ordered.findIndex((s) => !hasDueDate(s));
	if (first <= 0) return -1;
	return first;
}
