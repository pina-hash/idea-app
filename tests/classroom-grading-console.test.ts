// tests/classroom-grading-console.test.ts
//
// THE GRADING CONSOLE'S SILENT GUARANTEES.
//
// Everything asserted here fails INVISIBLY. A tooltip that opens off the
// bottom of the window looks like a tooltip that did not open. A shortcut that
// fires while somebody is typing a comment sets a rubric level and says
// nothing -- the grader finds out when a student asks why they got a 3. A short
// form that stops resolving falls back to the full descriptor, which is not
// wrong, only wrong-looking, so nobody reports it. A `busy` flag left set on a
// throw disables the form with the grading still in it. None of that is
// type-checkable and none of it reddens a page.
//
// Feature correctness that fails VISIBLY -- the three-pane layout, the pane
// scrolling, the level control's appearance -- is verified in the browser
// against /dev/classroom?view=grade and is deliberately not here.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { anchorPosition, type AnchorBox } from '../src/lib/shell/anchored';
import { isTypingTarget, keyAction, type KeyBinding } from '../src/lib/shell/keys';
import {
	levelShort,
	rubricFromSpec,
	validateSpec,
	type AssignmentSpec,
	type RubricCriterion
} from '../src/lib/classroom/assignment-spec';

function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const CONSOLE = 'src/lib/classroom/GradingConsole.svelte';

// ---------------------------------------------------------------------------
// 1. The anchored panel's arithmetic.
// ---------------------------------------------------------------------------

const VIEWPORT = { width: 1440, height: 900 };
const PANEL = { width: 320, height: 120 };
const box = (left: number, top: number, w = 60, h = 20): AnchorBox => ({
	left,
	top,
	right: left + w,
	bottom: top + h,
	width: w,
	height: h
});

describe('a panel anchored against the viewport', () => {
	it('opens on the preferred side when there is room', () => {
		const at = anchorPosition(box(400, 500), PANEL, VIEWPORT, { prefer: 'above' });
		expect(at.side).toBe('above');
		expect(at.flipped).toBe(false);
		// gap 6 by default: the panel's bottom sits just above the anchor's top.
		expect(at.top).toBe(500 - 6 - PANEL.height);
	});

	it('FLIPS BELOW when the anchor is against the top of the window', () => {
		// The whole reason this exists: a tip on a table header that has just
		// been scrolled to the top of its pane.
		const at = anchorPosition(box(400, 10), PANEL, VIEWPORT, { prefer: 'above' });
		expect(at.side).toBe('below');
		expect(at.flipped).toBe(true);
		expect(at.top).toBe(30 + 6);
	});

	it('FLIPS ABOVE when the anchor is against the bottom of the window', () => {
		const at = anchorPosition(box(400, 880), PANEL, VIEWPORT, { prefer: 'below' });
		expect(at.side).toBe('above');
		expect(at.flipped).toBe(true);
	});

	it('FLIPS ITS ALIGNMENT at the right edge, and back at the left', () => {
		const nearRight = anchorPosition(box(1380, 500), PANEL, VIEWPORT, { align: 'start' });
		expect(nearRight.align).toBe('end');
		// End-aligned would put it at 1440-320 = 1120, whose right edge is the
		// very edge of the window; the margin clamp pulls it back to 1112 so the
		// panel keeps its 8px of air.
		expect(nearRight.left).toBe(1112);
		expect(nearRight.left + PANEL.width).toBe(VIEWPORT.width - 8);

		const nearLeft = anchorPosition(box(4, 500), PANEL, VIEWPORT, { align: 'end' });
		expect(nearLeft.align).toBe('start');
		expect(nearLeft.left).toBeGreaterThanOrEqual(8);
	});

	it('flips BOTH axes at once in a corner', () => {
		const at = anchorPosition(box(1390, 6), PANEL, VIEWPORT, { prefer: 'above', align: 'start' });
		expect(at.side).toBe('below');
		expect(at.align).toBe('end');
		expect(at.flipped).toBe(true);
	});

	/**
	 * THE SWEEP, and its case count is asserted so a sweep that generated
	 * nothing cannot pass. Every position a panel can be asked for, at both the
	 * measured viewports: the panel must never leave the window.
	 */
	it('never leaves the viewport, anywhere in it, at 1440 and at 375', () => {
		const viewports = [
			{ width: 1440, height: 900 },
			{ width: 375, height: 812 }
		];
		const panels = [
			{ width: 320, height: 120 },
			{ width: 200, height: 40 }
		];
		const grid = (span: number) => {
			const step = Math.round(span / 12);
			const out: number[] = [];
			for (let v = 0; v <= span; v += step) out.push(v);
			return out;
		};
		let cases = 0;
		let expected = 0;
		for (const vp of viewports) {
			const xs = grid(vp.width);
			const ys = grid(vp.height);
			expect(xs.length, 'the x sweep is empty').toBeGreaterThan(10);
			expect(ys.length, 'the y sweep is empty').toBeGreaterThan(10);
			expected += xs.length * ys.length * panels.length * 2;
			for (const panel of panels) {
				for (const x of xs) {
					for (const y of ys) {
						for (const prefer of ['above', 'below'] as const) {
							const at = anchorPosition(box(x, y), panel, vp, { prefer });
							cases += 1;
							expect(at.left, `x=${x} y=${y}`).toBeGreaterThanOrEqual(8);
							expect(at.top, `x=${x} y=${y}`).toBeGreaterThanOrEqual(8);
							expect(at.left + panel.width, `x=${x} y=${y}`).toBeLessThanOrEqual(vp.width - 8);
							expect(at.top + panel.height, `x=${x} y=${y}`).toBeLessThanOrEqual(vp.height - 8);
						}
					}
				}
			}
		}
		// The sweep is the size it claims to be, so one that generated nothing
		// cannot pass.
		expect(cases).toBe(expected);
		expect(cases).toBe(1300);
	});

	it('keeps the START of a panel bigger than the window on screen', () => {
		// The one case where "inside the viewport" is impossible; the low edge
		// wins so the reader sees the beginning of the text.
		const at = anchorPosition(box(100, 400), { width: 320, height: 1200 }, VIEWPORT, {});
		expect(at.top).toBe(8);
	});
});

// ---------------------------------------------------------------------------
// 2. The shared key machinery, and the console's own bindings.
// ---------------------------------------------------------------------------

/**
 * READ OFF THE SHIPPING SOURCE rather than retyped here: a copy of the table
 * would agree with itself forever. The `dispatch` maps are plain object
 * literals in one `const`, so they parse.
 */
function gradeKeys(): KeyBinding<string>[] {
	const src = read(CONSOLE);
	const block = src.match(/const GRADE_KEYS: KeyBinding<GradeAction>\[\] = \[([\s\S]*?)\n\t\];/);
	expect(block, 'GRADE_KEYS is not where the test expects it').not.toBeNull();
	const body = block![1];
	const out: KeyBinding<string>[] = [];
	for (const entry of body.split(/\},\s*\n\s*\{/)) {
		const keys = entry.match(/keys: '([^']*)'/)?.[1];
		const label = entry.match(/label: '([^']*)'/)?.[1];
		const action = entry.match(/action: '([^']*)'/)?.[1];
		const native = /native: true/.test(entry);
		const dispatchSrc = entry.match(/dispatch: \{([\s\S]*?)\}/)?.[1];
		const dispatch: Record<string, string> = {};
		if (dispatchSrc) {
			for (const pair of dispatchSrc.matchAll(/'?([A-Za-z0-9]+)'?: '([a-z0-9-]+)'/g)) {
				dispatch[pair[1]] = pair[2];
			}
		}
		if (keys && label) out.push({ keys, label, action, native, dispatch });
	}
	return out;
}

describe('the console owns its keys, and prints the ones it owns', () => {
	it('the parser found the real table, not an empty one', () => {
		// Without this the two assertions below pass vacuously against [].
		const keys = gradeKeys();
		expect(keys.length).toBeGreaterThanOrEqual(7);
		expect(keys.filter((k) => k.dispatch && Object.keys(k.dispatch).length).length).toBe(
			keys.length - keys.filter((k) => k.native).length
		);
	});

	it('every advertised row either dispatches or is the browser doing it', () => {
		for (const k of gradeKeys()) {
			expect(k.keys.length, `${k.label} prints nothing`).toBeGreaterThan(0);
			expect(k.label.length).toBeGreaterThan(0);
			if (k.native) {
				expect(k.dispatch && Object.keys(k.dispatch).length, `${k.keys} is native AND dispatches`).toBeFalsy();
				continue;
			}
			expect(Object.keys(k.dispatch ?? {}).length, `${k.keys} is printed but never dispatched`)
				.toBeGreaterThan(0);
		}
	});

	it('resolves every key it advertises, and nothing it does not', () => {
		const keys = gradeKeys();
		const resolved = new Set<string>();
		for (const k of keys) {
			for (const [key, action] of Object.entries(k.dispatch ?? {})) {
				expect(keyAction({ key }, keys), `${key} does not resolve`).toBe(action);
				resolved.add(action);
			}
		}
		// The four digits, both directions of both axes, both students, save,
		// return, close.
		expect(resolved.size).toBe(13);
		// TAB IS NOT SWALLOWED. It moves between criteria by native focus order
		// over the roving tabindex; taking it here would trap focus in the
		// rubric with no way out.
		expect(keyAction({ key: 'Tab' }, keys)).toBeNull();
		expect(keyAction({ key: 'q' }, keys)).toBeNull();
		expect(keyAction({ key: '5' }, keys)).toBeNull();
	});

	it('never claims a MODIFIED press', () => {
		const keys = gradeKeys();
		for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
			expect(keyAction({ key: '1', [mod]: true }, keys), mod).toBeNull();
			expect(keyAction({ key: 's', [mod]: true }, keys), mod).toBeNull();
			expect(keyAction({ key: 'ArrowDown', [mod]: true }, keys), mod).toBeNull();
		}
		// Shift is allowed: a capital S is the same request.
		expect(keyAction({ key: 'S' }, keys)).toBe('save');
		expect(keyAction({ key: 'N' }, keys)).toBe('student-next');
	});

	/**
	 * THE EXCLUSION, AND ITS POSITIVE CONTROL.
	 *
	 * This is the assertion whose failure is invisible: a grader typing "no
	 * level fits this" into a comment box would silently set level 1 on the
	 * criterion (the "1" in "1 view is missing"), pick a level with "n", and
	 * save a draft with "s". The absence assertions are worthless without the
	 * presence ones beside them, which is why both counts are asserted.
	 */
	it('is SILENT on every typing target, and LOUD everywhere else', () => {
		const keys = gradeKeys();
		const typed = ['1', '2', '3', '4', 'n', 'p', 's', 'r', 'ArrowDown', 'ArrowUp', 'Escape'];
		const typingTargets = [
			{ tagName: 'INPUT' },
			{ tagName: 'TEXTAREA' },
			{ tagName: 'SELECT' },
			{ tagName: 'DIV', isContentEditable: true }
		];
		const inertTargets = [{ tagName: 'BUTTON' }, { tagName: 'BODY' }, { tagName: 'DIV' }, {}];

		let suppressed = 0;
		for (const target of typingTargets) {
			expect(isTypingTarget(target), JSON.stringify(target)).toBe(true);
			for (const key of typed) {
				// The console's guard is `isTypingTarget(target) -> return`, so
				// the resolved action never runs.
				const wouldFire = !isTypingTarget(target) && keyAction({ key }, keys) !== null;
				expect(wouldFire, `${key} fired into ${target.tagName}`).toBe(false);
				suppressed += 1;
			}
		}
		let fired = 0;
		for (const target of inertTargets) {
			expect(isTypingTarget(target), JSON.stringify(target)).toBe(false);
			for (const key of typed) {
				if (!isTypingTarget(target) && keyAction({ key }, keys) !== null) fired += 1;
			}
		}
		// BOTH counts, so neither half can be a sweep that generated nothing.
		expect(suppressed).toBe(typingTargets.length * typed.length);
		expect(fired).toBe(inertTargets.length * typed.length);
	});

	it('the legend the console renders IS the table it dispatches from', () => {
		const src = read(CONSOLE);
		expect(src).toMatch(/\{#each GRADE_KEYS as k \(k\.keys\)\}/);
		expect(src).toMatch(/<kbd>\{k\.keys\}<\/kbd>/);
		// On the surface, not only in a report.
		expect(src).toMatch(/data-testid="grade-key-legend"/);
	});

	it('gates on typing and on a modal dialog, in the handler itself', () => {
		const src = read(CONSOLE);
		const handler = src.slice(src.indexOf('function onWindowKey'));
		expect(handler).toMatch(/isTypingTarget\(target\)/);
		expect(handler).toMatch(/document\.querySelector\('dialog\[open\]'\)/);
		expect(handler).toMatch(/event\.preventDefault\(\)/);
		expect(src).toContain('<svelte:window onkeydown={onWindowKey} />');
	});

	it('is the SAME machinery the notebook console uses, not a second copy', () => {
		// The generic half lives in one module; a re-implementation here is the
		// thing that quietly stops matching.
		expect(read(CONSOLE)).toMatch(/from '\$lib\/shell\/keys'/);
		expect(read('src/lib/notebook-review.ts')).toMatch(/from '\$lib\/shell\/keys'/);
		// ...and the notebook no longer carries its own copy of either rule.
		const nb = read('src/lib/notebook-review.ts');
		expect(nb).not.toMatch(/export function isTypingTarget\(/);
		expect(nb).not.toMatch(/case 'ArrowUp':\s*\n\s*return 'up';/);
	});
});

// ---------------------------------------------------------------------------
// 3. The short form, and the order it resolves in.
// ---------------------------------------------------------------------------

// A REAL spec, not a shape hand-trimmed to what the two functions below happen
// to read. It carries `schemaVersion` and `meta` because the authoring path and
// `_classroom_check_spec` (0095) both refuse a spec without them, and its
// module points sum to meta.totalPoints for the same reason -- so a fixture
// here cannot drift into a document no teacher could ever have imported. The
// `as unknown as AssignmentSpec` this replaces was hiding exactly that: an
// object missing both fields, carrying a `version` key no version of the format
// has ever had.
//
// CHECKED AGAINST THE SQL BOUNDARY, not only against the type: this exact
// object was run through `public._classroom_check_spec` on a real embedded
// Postgres with the 0086/0092/0095 chain applied and was accepted, and the
// shape it replaces was refused there. That was a throwaway file (this one has
// no database and should not grow one); the runnable half of the guard is the
// `validateSpec` check below, which is the friendly mirror of that function.
const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: {
		assignmentId: 'IDEA209H-sketch',
		title: 'Sketch',
		// The gate the module points below have to add up to.
		totalPoints: 8
	},
	modules: [
		{
			id: 'm1',
			title: 'Views',
			points: 5,
			blocks: [],
			rubric: [
				{
					id: 'views',
					criterion: 'All three views',
					levels: [
						{ points: 5, label: 'Complete', short: 'Three views, all labeled', descriptor: 'All three views drawn to scale with every member labeled.' },
						{ points: 3, label: 'Proficient', short: 'Some labels missing', descriptor: 'All three views drawn; two or three members unlabeled.' },
						{ points: 0, label: 'Absent', short: 'Nothing drawn', descriptor: 'No views drawn, or not attempted.' }
					]
				}
			]
		},
		{
			id: 'm2',
			title: 'Reflection',
			points: 3,
			blocks: [],
			rubric: [
				{
					id: 'why',
					criterion: 'Reflection is specific',
					levels: [
						{ points: 3, label: 'Specific', descriptor: 'Names the view and the exact feature that made it hard.' },
						{ points: 1, label: 'General', descriptor: 'Names the view but not what made it hard.' },
						{ points: 0, label: 'Absent', descriptor: 'No reflection.' }
					]
				}
			]
		}
	]
};

describe('a level shows a line, and the line comes from one place', () => {
	// The guard on the fixture itself, and the reason the cast could go. Nothing
	// below asserts anything about validation; this is here so SPEC cannot quietly
	// become a document the importer would reject, the way its predecessor was.
	// `validateSpec` is the friendly half of the pair whose boundary is
	// `_classroom_check_spec`; the two are required to agree.
	it('is a spec the importer would actually accept', () => {
		const { spec, errors } = validateSpec(SPEC);
		expect(errors).toEqual([]);
		expect(spec).not.toBeNull();
		// Positive control on the check: the shape this fixture used to have --
		// no schemaVersion, no meta -- is refused, so an empty `errors` above
		// means the validator ran rather than that it has nothing to say.
		const { modules } = SPEC;
		expect(validateSpec({ modules }).errors.length).toBeGreaterThan(0);
	});

	it('rubricFromSpec CARRIES the authored short form through', () => {
		const rubric = rubricFromSpec(SPEC);
		expect(rubric.length).toBe(2);
		const views = rubric.find((c) => c.id === 'm1-views')!;
		// The round trip, level by level: every authored short survives, in
		// order, alongside the descriptor it summarises.
		expect(views.levels.map((l) => l.short)).toEqual([
			'Three views, all labeled',
			'Some labels missing',
			'Nothing drawn'
		]);
		expect(views.levels.map((l) => l.descriptor)).toEqual(
			SPEC.modules[0].rubric!.map((r) => r.levels.map((l) => l.descriptor)).flat()
		);
		// ...and a criterion authored without one gains nothing invented.
		const why = rubric.find((c) => c.id === 'm2-why')!;
		expect(why.levels.every((l) => l.short === undefined)).toBe(true);
	});

	it('prefers the STORED short over everything', () => {
		const stored = { points: 5, label: 'Complete', short: 'What the row says', descriptor: 'Long.' };
		expect(levelShort(stored, 'm1-views', SPEC)).toBe('What the row says');
	});

	it('falls back to the SPEC for a row stored before the field existed', () => {
		// Exactly the shape every rubric row in the database has today.
		const stored = { points: 3, label: 'Proficient', descriptor: 'All three views drawn; two or three members unlabeled.' };
		expect(levelShort(stored, 'm1-views', SPEC)).toBe('Some labels missing');
		// Paired on POINTS inside the criterion, so a reordered or trimmed
		// builder rubric still lines up.
		expect(levelShort({ points: 0, label: 'x' }, 'm1-views', SPEC)).toBe('Nothing drawn');
	});

	it('falls back to the FULL descriptor when nothing anywhere has one', () => {
		const stored = { points: 3, label: 'Specific', descriptor: 'Names the view and the exact feature that made it hard.' };
		expect(levelShort(stored, 'm2-why', SPEC)).toBe(
			'Names the view and the exact feature that made it hard.'
		);
		// ...and with no spec at all.
		expect(levelShort(stored, 'm2-why', null)).toBe(
			'Names the view and the exact feature that made it hard.'
		);
		// A criterion id the spec does not know is not an error, only a fallback.
		expect(levelShort(stored, 'hand-built-1', SPEC)).toBe(
			'Names the view and the exact feature that made it hard.'
		);
	});

	it('the builder does not drop it on the way back out', () => {
		// rubricFromSpec carrying it in is worth nothing if the one write path
		// re-lists the level's fields without it.
		const builder = read('src/lib/classroom/RubricBuilder.svelte');
		const payload = builder.slice(builder.indexOf('const payload = rows.map'));
		expect(payload.slice(0, 600)).toMatch(/short: l\.short\.trim\(\)/);
	});

	it('there is no second write path for it', () => {
		// The field reaches a stored row exactly ONE way: rubricFromSpec carries
		// the authored value, the builder's save payload keeps it, and
		// classroom_set_rubric stores `levels` verbatim. TWO emitters in the
		// whole tree, and the grading console is not one of them -- it only
		// READS, through the one resolver.
		expect((read('src/lib/classroom/assignment-spec.ts').match(/\bshort:/g) ?? []).length).toBe(1);
		expect(
			(read('src/lib/classroom/RubricBuilder.svelte').match(/\bshort:/g) ?? []).length
		).toBe(1);
		expect((read(CONSOLE).match(/\bshort:/g) ?? []).length).toBe(0);
		expect(read(CONSOLE)).toMatch(/levelShort\(level, c\.id, spec\)/);
	});
});

// ---------------------------------------------------------------------------
// 4. The two defects the audit found.
// ---------------------------------------------------------------------------

describe('a throw cannot strand the form', () => {
	const FILES = [
		{ file: CONSOLE, fns: ['async function grade(', 'async function setGate('], flag: 'busy' },
		{
			file: 'src/lib/classroom/RubricBuilder.svelte',
			fns: ['async function save(', 'async function removeRubric('],
			flag: 'busy'
		}
	];

	for (const { file, fns, flag } of FILES) {
		for (const fn of fns) {
			it(`${file.split('/').pop()} ${fn.replace('async function ', '')}) clears ${flag} in a finally`, () => {
				const src = read(file);
				const at = src.indexOf(fn);
				expect(at, `${fn} is not in ${file}`).toBeGreaterThan(-1);
				// The body, to the end of the function: the next line that closes
				// at one tab.
				const body = src.slice(at, src.indexOf('\n\t}', at) + 3);
				expect(body, `${fn} never sets ${flag}`).toContain(`${flag} = true`);
				// A `finally` block holding the reset, not a bare assignment on
				// the happy path.
				expect(body, `${fn} clears ${flag} outside a finally`).toMatch(
					new RegExp(`\\} finally \\{[\\s\\S]*?${flag} = false;[\\s\\S]*?\\}`)
				);
				// ...and nowhere else, which is what stops a `finally` being
				// added beside the old line rather than instead of it.
				expect((body.match(new RegExp(`${flag} = false`, 'g')) ?? []).length).toBe(1);
			});
		}
	}

	/**
	 * FEEDBACKBOX USED TO BE IN THE LIST ABOVE, with its own `sending` flag and
	 * its own `finally`. It has none now: sending runs on the shared SaveState in
	 * `autosave: false` mode, which is where the guarantee moved to rather than
	 * where it was dropped. The rule is the same one -- a transport that THROWS
	 * cannot leave the form disabled with the note still typed in it -- asserted
	 * one level up, so it keeps biting for every surface on that machine instead
	 * of only for this box.
	 */
	it('FeedbackBox delegates the stranding guarantee to the shared SaveState', () => {
		const box = read('src/lib/feedback/FeedbackBox.svelte');
		expect(box).toContain("import { SaveState } from '$lib/save-state.svelte'");
		expect(box).toContain('autosave: false');
		// No hand-rolled busy flag came back beside it.
		expect(box).not.toMatch(/\bsending\s*=\s*\$state/);
		expect(box).not.toMatch(/\bsending = (true|false)/);

		// And the machine it delegates to really does clear in-flight in a
		// `finally`, so the delegation is not a promotion of the defect.
		const machine = read('src/lib/save-state.svelte.ts');
		const at = machine.indexOf('async #execute(');
		expect(at, '#execute is not in save-state.svelte.ts').toBeGreaterThan(-1);
		const body = machine.slice(at, machine.indexOf('\n\t}', at) + 3);
		expect(body).toMatch(/\} finally \{[\s\S]*?this\.#inflight = false;[\s\S]*?\}/);
		expect((body.match(/this\.#inflight = false/g) ?? []).length).toBe(1);
	});
});

describe('switching students cannot discard grading silently', () => {
	const src = () => read(CONSOLE);

	it('every path that changes the selection goes through the guard', () => {
		const s = src();
		// The roster row, the Close button, and the keyboard.
		const calls = s.match(/requestSelect\(/g) ?? [];
		expect(calls.length).toBeGreaterThanOrEqual(4);
		// applySelect is the only thing that actually swaps the student, and it
		// is reached from the guard or from the confirm -- never from a click.
		expect(s).toMatch(/onclick=\{\(\) => requestSelect\(s\)\}/);
		expect(s).toMatch(/onclick=\{\(\) => requestSelect\(null\)\}/);
		expect(s).not.toMatch(/onclick=\{\(\) => applySelect\(s\)\}/);
		expect(s).not.toMatch(/selectedEmail = null\)\}/);
	});

	it('the guard is exempt when nothing changed', () => {
		const s = src();
		const guard = s.slice(s.indexOf('function requestSelect'), s.indexOf('function applySelect'));
		expect(guard).toMatch(/if \(!selected \|\| !dirty\)/);
		expect(guard).toMatch(/applySelect\(next\);/);
	});

	it('the confirm names what it costs, with the real counts', () => {
		const s = src();
		expect(s).toMatch(/dirtyCost/);
		expect(s).toMatch(/criteri\$\{n === 1 \? 'on' : 'a'\}/);
		expect(s).toMatch(/Switching now\s*\n?\s*discards it\./);
		// Three ways out, and saving is one of them.
		expect(s).toMatch(/Save draft, then switch/);
		expect(s).toMatch(/Discard and switch/);
		expect(s).toMatch(/Stay here/);
	});

	it('a save makes what is on screen the new baseline', () => {
		// Otherwise the confirm fires after every successful save, which is the
		// fastest way to teach people to click through it.
		const s = src();
		const grade = s.slice(s.indexOf('async function grade('), s.indexOf('async function setGate('));
		expect(grade).toMatch(/baseline = currentSnapshot\(\);/);
	});
});

// ---------------------------------------------------------------------------
// 5. The layout contract that lives in two files at once.
// ---------------------------------------------------------------------------

describe('the console is an application frame, and both halves say so', () => {
	it('the route asks for the console measure and the token exists', () => {
		expect(read('src/lib/classroom/nav.ts')).toMatch(/case 'item-grade':\s*\n\s*return 'console';/);
		expect(read('src/lib/design-system/effects.css')).toMatch(/--measure-console:\s*100%/);
		expect(read(CONSOLE)).toMatch(/max-width: var\(--cr-measure, var\(--measure-console\)\)/);
	});

	it('the LAYOUT supplies the bounded parent, because a component cannot', () => {
		const layout = read('src/routes/classroom/+layout.svelte');
		expect(layout).toMatch(/class:cr-app=\{isConsole\}/);
		expect(layout).toMatch(/measure === 'console'/);
		expect(read(CONSOLE)).toMatch(/class="grading-page cr-console cr-app-body"/);
		// And the harness mirrors it, or a browser pass there proves nothing.
		expect(read('src/routes/dev/classroom/+page.svelte')).toMatch(
			/class:cr-app=\{harnessMeasure === 'console'\}/
		);
	});

	it('nothing names a chrome height any more', () => {
		// `calc(100vh - 11rem)` is what this replaced: a constant nobody can keep
		// true across a hero that wraps or a notice that appears. Comments are
		// stripped first, so the note explaining what was removed is not read as
		// the thing it describes (the ReferenceDoc scrollbar test's convention).
		const src = read(CONSOLE);
		const css = src.slice(src.indexOf('<style>')).replace(/\/\*[\s\S]*?\*\//g, '');
		expect(css).not.toMatch(/calc\(100vh/);
		expect(css).not.toMatch(/max-height:\s*calc\(/);
	});

	it('the stacking breakpoints below the frame are untouched', () => {
		const s = read(CONSOLE);
		expect(s).toMatch(/@media \(max-width: 800px\) \{\s*\n\s*\.console\.split \{\s*\n\s*grid-template-columns: 1fr;/);
		expect(s).toMatch(/@media \(max-width: 900px\) \{\s*\n\s*\.work-split\.has-rubric \{\s*\n\s*grid-template-columns: 1fr;/);
	});

	it('all three regions bound themselves, and only above the breakpoint', () => {
		const s = read(CONSOLE);
		const frame = s.slice(s.indexOf('@media (min-width: 1024px)'));
		for (const region of ['.roster-list', '.work-split.has-rubric .work-col']) {
			expect(frame, `${region} has no overflow rule`).toMatch(
				new RegExp(`${region.replace(/\./g, '\\.')} \\{[\\s\\S]*?overflow-y: auto;`)
			);
		}
		// The roster used to have NO overflow rule at all, which is how a class
		// of thirty made the page taller instead of scrolling the list.
		expect(frame).toMatch(/\.roster \{[\s\S]*?overflow: hidden;/);
	});
});
