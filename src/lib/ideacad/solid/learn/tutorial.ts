/**
 * THE TUTORIAL: FIVE SHORT TASKS RUN IN THE REAL WORKSPACE, ON THE STUDENT'S
 * OWN DOCUMENT. Nothing here blocks the work or builds a practice model: each
 * step names the real control (a registry command id, which the panel lights
 * on screen) and is done when the student has actually done it, judged by a
 * pure predicate over what the workspace already holds.
 *
 * A STEP IS JUDGED AGAINST WHERE IT STARTED. `tutorialFacts` counts the few
 * things the tasks care about; a step is done when its count went up since the
 * step began (or, for a "pick the tool" step, when the tool is armed). So a
 * document that already has a fillet does not tick "round an edge" by itself,
 * and a step resumed on another day starts counting from that day.
 *
 * PROGRESS IS A STEP ID, stored in the Hints preferences
 * (`hints.tutorial.step`), with `finished` beside it: every step before the
 * stored one is done. Ids follow the preferences' hint id rule, and they are
 * stored, so an id is never renamed; a step is reworded by its `line`.
 */
import type { Feature, ModelProjection } from '../types';

export interface TutorialFacts {
	tool: string;
	bodies: number;
	/** Sketches with four or more lines: a rectangle, or a closed four-sided shape. */
	rectangles: number;
	/** Extrudes, revolves, sweeps and lofts that add material and built. */
	solids: number;
	fillets: number;
	/** Sketches drawn on a model face that hold a circle. */
	faceCircles: number;
	/** Cuts that built, and holes. */
	cuts: number;
	/** Mates that solved (an error does not count). */
	mates: number;
}
export interface TutorialStep {
	/** Stored in preferences; never renamed. */
	id: string;
	/** One line. */
	line: string;
	/** The registry command whose control the panel lights. */
	command: string;
	done(start: TutorialFacts, now: TutorialFacts): boolean;
}
export interface TutorialTask { id: string; title: string; steps: TutorialStep[] }

const ADDS: readonly string[] = ['extrude', 'revolve', 'sweep', 'loft'];
/** What the tasks count, from the projection, the manifest's features and the armed tool. */
export function tutorialFacts(model: Pick<ModelProjection, 'bodies' | 'sketches' | 'features' | 'mates'>, features: readonly Feature[], tool: string): TutorialFacts {
	const built = new Set(model.features.filter((r) => r.status === 'ok' || r.status === 'warning').map((r) => r.id));
	const op = (f: Feature) => ('operation' in f ? f.operation : null);
	let solids = 0, cuts = 0, fillets = 0;
	for (const f of features) {
		if (!built.has(f.id) || f.suppressed) continue;
		if (ADDS.includes(f.type)) { if (op(f) === 'cut') cuts++; else solids++; }
		else if (f.type === 'hole') cuts++;
		else if (f.type === 'fillet') fillets++;
	}
	const lines = (s: ModelProjection['sketches'][number]) => s.entities.filter((e) => e.type === 'line' && !e.construction).length;
	return {
		tool,
		bodies: model.bodies.length,
		rectangles: model.sketches.filter((s) => lines(s) >= 4).length,
		solids, fillets, cuts,
		faceCircles: model.sketches.filter((s) => s.planeRef.kind === 'face' && s.entities.some((e) => e.type === 'circle' && !e.construction)).length,
		mates: model.mates.filter((m) => m.status !== 'error').length
	};
}

const rose = (key: Exclude<keyof TutorialFacts, 'tool'>) => (start: TutorialFacts, now: TutorialFacts) => now[key] > start[key];
const armed = (tool: string, key: Exclude<keyof TutorialFacts, 'tool'>) => (start: TutorialFacts, now: TutorialFacts) => now.tool === tool || now[key] > start[key];

export const TUTORIAL: readonly TutorialTask[] = [
	{ id: 'draw', title: 'Draw a rectangle', steps: [
		{ id: 'draw-tool', line: 'Pick Rectangle', command: 'rectangle', done: armed('rectangle', 'rectangles') },
		{ id: 'draw-drag', line: 'Drag corner to corner on a plane', command: 'rectangle', done: rose('rectangles') }
	] },
	{ id: 'pull', title: 'Pull it into a solid', steps: [
		{ id: 'pull-drag', line: 'Drag the sketch up, or type a height and press Enter', command: 'extrude', done: rose('solids') }
	] },
	{ id: 'round', title: 'Round an edge', steps: [
		{ id: 'round-tool', line: 'Pick Fillet', command: 'fillet', done: armed('fillet', 'fillets') },
		{ id: 'round-drag', line: 'Drag an edge of the solid', command: 'fillet', done: rose('fillets') }
	] },
	{ id: 'cut', title: 'Cut a hole', steps: [
		{ id: 'cut-circle', line: 'Pick Circle and draw on a face of the solid', command: 'circle', done: rose('faceCircles') },
		{ id: 'cut-push', line: 'Drag the circle down into the solid', command: 'extrude', done: rose('cuts') }
	] },
	{ id: 'mate', title: 'Mate two parts', steps: [
		{ id: 'mate-part', line: 'Make a second solid beside the first', command: 'rectangle', done: (start, now) => now.bodies > start.bodies || now.bodies >= 2 },
		{ id: 'mate-tool', line: 'Pick Mate', command: 'mate', done: armed('mate', 'mates') },
		{ id: 'mate-pick', line: 'Click a face on each part', command: 'mate', done: rose('mates') }
	] }
];
export const TUTORIAL_STEPS: readonly (TutorialStep & { task: TutorialTask; taskIndex: number })[] = TUTORIAL.flatMap((task, taskIndex) => task.steps.map((s) => ({ ...s, task, taskIndex })));

/** Where the tutorial stands. `index` is the current step's place in `TUTORIAL_STEPS`, or null when finished or not started. */
export interface TutorialPosition { index: number | null; finished: boolean }
/** The stored progress to a position. An unknown step id (a step since removed) starts the task list over rather than guessing. */
export function tutorialPosition(stored: { step: string | null; finished: boolean }): TutorialPosition {
	if (stored.finished) return { index: null, finished: true };
	if (stored.step === null) return { index: null, finished: false };
	const i = TUTORIAL_STEPS.findIndex((s) => s.id === stored.step);
	return { index: i < 0 ? 0 : i, finished: false };
}
/** The stored progress for a step index; past the last step is finished. */
export function tutorialProgress(index: number): { step: string | null; finished: boolean } {
	if (index >= TUTORIAL_STEPS.length) return { step: null, finished: true };
	return { step: TUTORIAL_STEPS[Math.max(0, index)].id, finished: false };
}
/** How many tasks are complete when the current step is `index` (or all, when finished). */
export function tasksDone(position: TutorialPosition): number {
	if (position.finished) return TUTORIAL.length;
	if (position.index === null) return 0;
	return TUTORIAL_STEPS[position.index].taskIndex;
}
/** The first step of task `taskIndex`, for jumping straight to a task. */
export const firstStepOf = (taskIndex: number) => TUTORIAL_STEPS.findIndex((s) => s.taskIndex === taskIndex);
/**
 * The step to be on after `now`: every step whose predicate holds is passed in
 * order (so a student ahead of the tutorial is caught up), counting each from
 * `start`. Returns the same index when nothing is done.
 */
export function advance(index: number, start: TutorialFacts, now: TutorialFacts): number {
	let i = index;
	while (i < TUTORIAL_STEPS.length && TUTORIAL_STEPS[i].done(start, now)) i++;
	return i;
}
