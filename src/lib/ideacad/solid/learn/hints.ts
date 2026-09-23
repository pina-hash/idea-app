/**
 * HINTS THAT RETIRE. A tool armed for the first time shows one line beside
 * itself saying the gesture, and that line goes for good once the tool has
 * been used successfully (a feature was added while it was armed). The
 * retired ids live in the Hints preferences (`hints.retired`), so they follow
 * the student, and Preferences' "Bring back hidden hints" empties the list.
 *
 * Pure: the workspace asks `firstUseHint` what to show and `retireAfterUse`
 * what to store; nothing here reads a clock or the DOM.
 */
import type { Feature } from '../types';

/** One line each, the gesture and nothing else. A tool with no line shows no hint. */
export const FIRST_USE_HINTS: Readonly<Record<string, string>> = {
	rectangle: 'Drag corner to corner on a plane or face',
	circle: 'Drag from the center out',
	line: 'Click each corner; click the first to close',
	polygon: 'Drag from the center to a corner',
	arc: 'Click the center, the start, then the end',
	extrude: 'Drag a sketch up to pull, down to cut',
	revolve: 'Pick a sketch and an axis, then drag',
	fillet: 'Drag an edge to round it',
	chamfer: 'Drag an edge to bevel it',
	shell: 'Drag the face to leave open',
	hole: 'Click a face where the hole goes',
	move: 'Drag a colored arrow',
	rotate: 'Drag a colored ring',
	scale: 'Drag a colored handle',
	mate: 'Click a face on each part',
	'linear-pattern': 'Drag across to space, up for more',
	'circular-pattern': 'Drag up for more copies',
	measure: 'Click one thing, Shift-click a second',
	draft: 'Pick faces, then drag the angle',
	sweep: 'Pick a closed sketch, then its path',
	loft: 'Pick the sketches in order'
};

/** The stored id of a tool's hint. Matches the preferences' hint id rule. */
export const toolHintId = (tool: string) => `tool-${tool}`;

/** The line to show for `tool`, or null when it has none or has retired. */
export function firstUseHint(tool: string, retired: readonly string[]): string | null {
	const line = FIRST_USE_HINTS[tool];
	return line && !retired.includes(toolHintId(tool)) ? line : null;
}

/**
 * The retired list after a change made with `tool` armed: the tool's hint
 * retires when the change added a feature. The same list, unchanged, when
 * nothing was added or the hint had already gone, so a caller can compare by
 * identity and skip a write.
 */
export function retireAfterUse(retired: readonly string[], tool: string, before: readonly Pick<Feature, 'id'>[], after: readonly Pick<Feature, 'id'>[]): readonly string[] {
	if (!FIRST_USE_HINTS[tool]) return retired;
	const id = toolHintId(tool);
	if (retired.includes(id)) return retired;
	const had = new Set(before.map((f) => f.id));
	return after.some((f) => !had.has(f.id)) ? [...retired, id] : retired;
}
