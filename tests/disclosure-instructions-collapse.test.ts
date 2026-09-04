// tests/disclosure-instructions-collapse.test.ts
//
// THE ONE DISCLOSURE, and the instructions collapse built on it.
//
// IDEA_INTERFACE_STANDARDS 1: "Reading material does not sit between a person
// and their work on every return visit. Instructions, guidance, prompts, and
// policy panels open expanded the first time and collapse once the person has
// started working, with the state remembered per person and per item. The
// material is always one action from being read again and is never removed."
//
// WHY THIS IS AUTOMATED AT ALL, against a repo whose rule is that automated
// tests are the exception. Three of the four claims here fail SILENTLY:
//
//   * THE DEFAULT. "Expanded on a fresh item" is invisible on any item that
//     has been worked on, which after week one is every item anyone opens. A
//     regression to collapse-by-default looks completely normal.
//   * ROLE PARITY. A per-role default is the drift this repo keeps paying for
//     and nobody sees it, because nobody holds both roles on one screen.
//   * HIDES, NEVER REMOVES. A collapse implemented with `{#if}` instead of CSS
//     renders identically until someone needs the material back, or prints.
//
// THE FOURTH CLAIM -- that pressing the trigger toggles -- IS NOW ASSERTED,
// IN `tests/dom/disclosure-instructions-collapse-mount.test.ts`. This comment
// used to say it belonged in the harness (/dev/classroom) and that there was
// "no DOM or event-dispatch harness in this repo (`environment: 'node'`,
// `svelte/server`'s `render()` only)". That is out of date: `tests/dom/` is a
// second vitest project with happy-dom and svelte's client build, so a mount
// test can press the control. Nothing here moved -- this file still asserts
// the pure rule, the SSR markup and ItemDetail's wiring, which is what a
// browser RECEIVES -- and the mount file asserts what it then does, including
// the per-viewer storage key nothing anywhere asserted before it.
//
// MUTATION-CHECKED (during this bundle; see docs/HISTORY.md for the numbers).
// Both directions were run, including the REJECTED ALTERNATIVE -- collapsing
// by default on a first open -- which is the design a future session would
// refactor toward because it looks tidier and nothing else would stop it.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import {
	disclosureKey,
	disclosureLatch,
	disclosureOpen,
	readDisclosure,
	writeDisclosure
} from '$lib/disclosure';
import type { AssignmentSpec, ResponseValue } from '$lib/classroom/assignment-spec';

// ---------------------------------------------------------------------------
// Part 1: the rule, pure.
// ---------------------------------------------------------------------------

describe('disclosureOpen: the whole default rule', () => {
	it('opens on a first visit and closes once the work has started', () => {
		expect(disclosureOpen(null, false)).toBe(true);
		expect(disclosureOpen(null, true)).toBe(false);
	});

	it('lets a manual choice override the signal in both directions', () => {
		// Started, but this person opened it anyway: it stays open.
		expect(disclosureOpen(true, true)).toBe(true);
		// Not started, but this person closed it: it stays closed.
		expect(disclosureOpen(false, false)).toBe(false);
	});

	it('takes no role, so there is nothing a role could branch on', () => {
		// A signature check, deliberately. The moment this function grows a
		// third parameter, an instructor and a student can be given different
		// defaults, which is exactly what section 2 of the standard forbids.
		expect(disclosureOpen.length).toBe(2);
	});
});

describe('disclosureLatch: the collapse signal falls and never rises', () => {
	// The pure half of the typing-collapse fix (prompt 0018). The behavioural
	// half is `tests/dom/`; the browser measurement is
	// `tools/browser-verify/routes/classroom-interaction-case-typing.mjs`.

	it('takes its first sample from whatever the panel arrives with', () => {
		expect(disclosureLatch(null, 'k', true)).toEqual({ key: 'k', collapsed: true });
		expect(disclosureLatch(null, 'k', false)).toEqual({ key: 'k', collapsed: false });
	});

	it('IGNORES A RISE, which is a panel folding under somebody typing in it', () => {
		const open = { key: 'k', collapsed: false };
		// The first keystroke that trips `started`/`complete`. Nothing moves,
		// and the SAME object comes back so no render is minted for it.
		expect(disclosureLatch(open, 'k', true)).toBe(open);
		// And it stays ignored, however often the signal flickers.
		expect(disclosureLatch(disclosureLatch(open, 'k', true), 'k', true)).toBe(open);
	});

	it('HONOURS A FALL, which is the one moment the reading is wanted', () => {
		// SpecImporter's refused clipboard copy, and a module whose work is
		// taken back out. Opening a closed panel takes nothing from anybody.
		expect(disclosureLatch({ key: 'k', collapsed: true }, 'k', false)).toEqual({
			key: 'k',
			collapsed: false
		});
	});

	it('re-samples for a DIFFERENT panel rather than carrying the last one', () => {
		// A caller swapping `scope` without remounting: a different item, a
		// different check-in. Same discipline as `override`'s own key.
		const fallen = { key: 'a', collapsed: false };
		expect(disclosureLatch(fallen, 'b', true)).toEqual({ key: 'b', collapsed: true });
		// Including the null key, which is the deliberate do-not-persist scope.
		expect(disclosureLatch({ key: null, collapsed: false }, 'a', true)).toEqual({
			key: 'a',
			collapsed: true
		});
	});
});

describe('disclosureKey: per person and per item', () => {
	it('separates two people looking at the same panel', () => {
		const a = disclosureKey('user-a', 'item:i-1:body');
		const b = disclosureKey('user-b', 'item:i-1:body');
		expect(a).not.toBeNull();
		expect(a).not.toBe(b);
	});

	it('separates two panels for the same person', () => {
		expect(disclosureKey('user-a', 'item:i-1:body')).not.toBe(
			disclosureKey('user-a', 'item:i-2:body')
		);
	});

	it('remembers nothing at all without a scope', () => {
		expect(disclosureKey('user-a', null)).toBeNull();
		expect(disclosureKey('user-a', '   ')).toBeNull();
	});

	it('still keys a signed-out reader rather than colliding on undefined', () => {
		expect(disclosureKey(null, 'item:i-1:body')).toContain('anon');
	});
});

describe('readDisclosure: an unrecognised stored value is dropped', () => {
	function fakeStore() {
		const map = new Map<string, string>();
		const store = {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, v),
			removeItem: (k: string) => void map.delete(k)
		};
		(globalThis as Record<string, unknown>).localStorage = store;
		return map;
	}

	it('reads back exactly what was written', () => {
		const map = fakeStore();
		try {
			writeDisclosure('k', true);
			expect(readDisclosure('k')).toBe(true);
			writeDisclosure('k', false);
			expect(readDisclosure('k')).toBe(false);
			expect(map.size).toBe(1);
		} finally {
			delete (globalThis as Record<string, unknown>).localStorage;
		}
	});

	it('drops a value from outside the union instead of coercing it', () => {
		const map = fakeStore();
		try {
			map.set('k', 'yes');
			// Not `true` by truthiness: a stored value that no branch renders
			// must not be able to put the panel into a state nothing can leave.
			expect(readDisclosure('k')).toBeNull();
			expect(map.has('k')).toBe(false);
		} finally {
			delete (globalThis as Record<string, unknown>).localStorage;
		}
	});
});

// ---------------------------------------------------------------------------
// Part 2: the REAL SpecRenderer, server-rendered.
// ---------------------------------------------------------------------------

const PROSE = 'Measure every dimension twice with the caliper.';

const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'a-1', title: 'Density lab', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Measurement',
			points: 10,
			blocks: [
				{ type: 'instructions', content: PROSE },
				{
					type: 'table',
					id: 't1',
					columns: [
						{ key: 'sample', label: 'Sample' },
						{ key: 'mass', label: 'Mass' }
					],
					minRows: 3
				}
			],
			rubric: [
				{
					id: 'c1',
					criterion: 'Measurements recorded',
					levels: [
						{ points: 10, label: 'Complete', short: 'All six rows', descriptor: 'All six samples measured and recorded.' },
						{ points: 5, label: 'Partial', short: 'Three to five rows', descriptor: 'Three to five samples measured and recorded.' },
						{ points: 0, label: 'Absent', short: 'Under three rows', descriptor: 'Fewer than three samples measured.' }
					]
				}
			]
		}
	]
} as AssignmentSpec;

/** Nothing entered: a student opening this item for the first time. */
const FRESH: Record<string, ResponseValue> = {};

/** ONE cell of ONE row typed into the table. That is "entered any row". */
const STARTED: Record<string, ResponseValue> = {
	t1: { rows: [{ sample: '1', mass: '' }] }
};

function draw(initialValues: Record<string, ResponseValue>, readonly = false): string {
	return render(SpecRenderer, {
		props: { spec: SPEC, initialValues, readonly, uploadEnabled: false }
	}).body;
}

/** The instructions trigger's own tag, so `aria-expanded` cannot be read off
 *  some other button in the module. */
function trigger(html: string): string {
	const match = html.match(/<button[^>]*data-testid="module-instructions"[^>]*>/);
	expect(match, 'no instructions disclosure rendered at all').not.toBeNull();
	return match![0];
}

describe('the instructions panel on a module', () => {
	it('renders as a real disclosure: a button, aria-expanded, aria-controls a real id', () => {
		const html = draw(FRESH);
		const tag = trigger(html);
		expect(tag).toContain('type="button"');
		expect(tag).toMatch(/aria-expanded="(true|false)"/);
		const controls = tag.match(/aria-controls="([^"]+)"/);
		expect(controls, 'the trigger controls nothing').not.toBeNull();
		// The id it names is a real element, not a hopeful string.
		expect(html).toContain(`id="${controls![1]}"`);
	});

	it('carries a visible word, not only a caret', () => {
		const html = draw(FRESH);
		expect(html).toContain('Instructions');
		expect(html).toMatch(/>(Show|Hide)</);
	});

	it('is EXPANDED when the student has entered nothing', () => {
		const html = draw(FRESH);
		expect(trigger(html)).toContain('aria-expanded="true"');
		expect(html).toContain('data-open="true"');
		expect(html).toContain(PROSE);
	});

	it('is COLLAPSED once one cell of one row has been entered', () => {
		const html = draw(STARTED);
		expect(trigger(html)).toContain('aria-expanded="false"');
		expect(html).toContain('data-open="false"');
	});

	it('HIDES the material, it never removes it', () => {
		// The whole difference between this and an `{#if}`: collapsed, the
		// prose is still in the document -- one press away, and still on the
		// printed sheet.
		const collapsed = draw(STARTED);
		expect(collapsed).toContain(PROSE);
		expect(collapsed).toContain('data-open="false"');
	});

	it('gives the instructor the identical panel in the identical state', () => {
		// `readonly` is the manager's read of the same spec (ItemDetail's
		// manager branch, and the grading console). Same values in, same state
		// out: there is no role branch anywhere on this path.
		for (const values of [FRESH, STARTED]) {
			const student = trigger(draw(values, false)).match(/aria-expanded="(true|false)"/)![1];
			const manager = trigger(draw(values, true)).match(/aria-expanded="(true|false)"/)![1];
			expect(manager).toBe(student);
		}
		// ...and the two states are genuinely different, so the equality above
		// is not two identical constants agreeing with each other.
		expect(trigger(draw(FRESH)).includes('aria-expanded="true"')).toBe(true);
		expect(trigger(draw(STARTED)).includes('aria-expanded="false"')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Part 3: ItemDetail's call site, read from source.
//
// ItemDetail needs a section, an item, postings, attachments and a handful of
// transports to render at all, so what is worth pinning here is not its markup
// but its WIRING: that the panel's signal comes from the engine slice the page
// already holds and carries no role term. A source read is the right instrument
// for that whatever else the suite can mount -- `tests/dom/` could drive the
// component, but "no role term appears in this expression" is a claim about the
// expression. Same approach, and same reason, as
// classroom-manager-spec-visibility.test.ts's source assertions.
// ---------------------------------------------------------------------------

describe("ItemDetail's instructions card", () => {
	const src = readFileSync(new URL('../src/lib/classroom/ItemDetail.svelte', import.meta.url), 'utf8');

	/**
	 * EVERY `<Disclosure>` BLOCK IN THE FILE, so an assertion about ONE of them
	 * is picked out by what it IS rather than by where it appears.
	 *
	 * It used to be a single non-greedy match, which meant the first Disclosure
	 * added ABOVE the body card (0123's check-in guidance panel) silently
	 * captured this test -- a legitimate change breaking a passing assertion by
	 * position rather than by meaning.
	 */
	const disclosures = src
		.split('<Disclosure')
		.slice(1)
		.map((s) => s.split('</Disclosure>')[0]);

	it('wraps the body in the shared Disclosure rather than a local one', () => {
		expect(src).toContain("import Disclosure from '$lib/Disclosure.svelte'");
		expect(disclosures.length).toBeGreaterThan(0);
		const card = disclosures.find((d) => d.includes('scope={`item:${item.id}:body`}'));
		expect(card, 'the item body is not inside a Disclosure').toBeDefined();
		expect(card!).toContain('collapseWhen={started}');
		expect(card!).toContain('<ItemBody');
	});

	/**
	 * 0123's check-in guidance panel: the same component, on its own scope.
	 *
	 * ITS OWN SCOPE IS THE CLAIM. The notebook composer renders the same
	 * paragraph under `check-in:<id>:guidance` with a different collapse signal;
	 * sharing one key would let a collapse made mid-upload hide the prompt on
	 * the page a student came to read it on, with nothing on either screen to
	 * say why.
	 */
	it('gives the check-in guidance panel its own Disclosure and its own scope', () => {
		const panel = disclosures.find((d) =>
			d.includes('scope={`item-check-in:${checkIn.session_id}:guidance`}')
		);
		expect(panel, 'the check-in guidance is not inside a Disclosure').toBeDefined();
		expect(panel!).toContain('<ItemBody');
		// Not the notebook composer's key.
		expect(src).not.toContain('scope={`check-in:${checkIn.session_id}:guidance`}');
	});

	it('derives `started` from the engine slice, with no role term in it', () => {
		const derived = src.match(/const started = \$derived\([\s\S]*?\n\t\);/);
		expect(derived, '`started` is not a single derived expression').not.toBeNull();
		const body = derived![0];
		expect(body).toContain('specStarted');
		expect(body).toContain('engine');
		// The whole role-parity claim, checkable by reading one expression.
		expect(body).not.toContain('canManage');
		expect(body).not.toContain('viewAs');
		expect(body).not.toContain('role');
	});

	it('keeps the collapse out of ItemBody, which the class stream also mounts', () => {
		const itemBody = readFileSync(
			new URL('../src/lib/classroom/ItemBody.svelte', import.meta.url),
			'utf8'
		);
		// A disclosure inside ItemBody would give the stream's expanded rows a
		// behaviour nobody asked them for. One component, one decision per
		// surface.
		//
		// MATCHED ON THE IMPORT AND THE ELEMENT, not on the WORD. It used to be a
		// bare `not.toContain('Disclosure')`, which 0123 tripped with a CSS
		// comment explaining that ItemBody's link colour borrows Disclosure's
		// room-hook mechanism -- a true sentence about a real design decision,
		// failing a test it does not violate. What the claim actually is: this
		// component neither IMPORTS the disclosure nor RENDERS one.
		expect(itemBody).not.toContain('Disclosure.svelte');
		expect(itemBody).not.toMatch(/<Disclosure[\s\/>]/);
		expect(itemBody).not.toContain('aria-expanded');
	});
});
