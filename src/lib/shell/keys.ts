/**
 * KEYBOARD SHORTCUTS ON A REVIEW SURFACE, as the generic half.
 *
 * The notebook's review console had all of this first and had it in the right
 * shape: one array that is BOTH the legend and the dispatch table, an
 * event-to-action mapper with a modifier rule, and a guard that keeps a
 * single-letter shortcut from firing into a comment box. The grading console
 * needs exactly the same three things with a different set of actions, and a
 * second copy of a rule is the thing that quietly stops matching -- so the
 * generic parts live here and each surface keeps only its own actions.
 *
 * NOTHING HERE KNOWS ABOUT NOTEBOOKS OR RUBRICS. It takes an array of bindings
 * parameterised on the caller's own action union and hands back one of them.
 */

/**
 * ONE ROW OF THE LEGEND, which is also one row of the dispatch table.
 *
 * "Every key is discoverable in the interface" is a property of there being one
 * array rather than of a printed list happening to match a switch statement.
 */
export interface KeyBinding<A extends string> {
	/** What the legend prints in its `<kbd>`. */
	keys: string;
	label: string;
	/**
	 * The action this row STANDS FOR in the legend. A row printing a pair
	 * ("↑ ↓ Criterion") names one of the two; `dispatch` holds both.
	 */
	action?: A;
	/**
	 * Which `event.key` values fire, and what each one means. Single-character
	 * keys are matched case-insensitively, so a capital A is the same request.
	 * Absent on a NATIVE row (below).
	 */
	dispatch?: Readonly<Record<string, A>>;
	/**
	 * THE BROWSER ALREADY DOES THIS ONE. Tab moving between criteria is native
	 * focus order over a roving tabindex, not a key this module swallows --
	 * hijacking Tab would trap focus inside the widget. It is printed in the
	 * legend because it works and people need to know it does; it dispatches
	 * nothing, and a legend-versus-handler test must skip it rather than fail on
	 * it.
	 */
	native?: boolean;
}

/**
 * A key press, resolved against a binding table. `null` = not ours, and the
 * event is left alone.
 *
 * MODIFIED PRESSES ARE NEVER OURS. Ctrl/Cmd/Alt combinations belong to the
 * browser and the operating system, and swallowing Cmd+A ("select all") to mean
 * "accept" is the kind of theft that makes a keyboard surface unusable rather
 * than fast. Shift is allowed.
 */
export function keyAction<A extends string>(
	event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
	bindings: readonly KeyBinding<A>[]
): A | null {
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	const key = event.key;
	const lower = key.length === 1 ? key.toLowerCase() : key;
	for (const binding of bindings) {
		const table = binding.dispatch;
		if (!table) continue;
		const hit = table[key] ?? table[lower];
		if (hit) return hit;
	}
	return null;
}

/**
 * IS THE PERSON TYPING? A single-letter shortcut over a screen that also has a
 * comment box is how "insufficient detail" becomes an accept halfway through
 * the word "flag", and on the grading console it is how a sentence about a
 * student's method sets a rubric level.
 *
 * Pure, and takes the SHAPE rather than the element, so the rule is testable
 * without a DOM: any form control, anything contenteditable.
 */
export function isTypingTarget(target: {
	tagName?: string;
	isContentEditable?: boolean;
}): boolean {
	if (target.isContentEditable) return true;
	const tag = (target.tagName ?? '').toLowerCase();
	return tag === 'input' || tag === 'textarea' || tag === 'select';
}
