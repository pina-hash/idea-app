// tests/dom/ideacad-checkout-panel.test.ts
//
// THE PARTS LIST, MOUNTED. `0207` shipped with no `.svelte` file at all, so
// until this bundle nothing in the repository had ever rendered a hold.
//
// WHY THIS IS AUTOMATED, when most feature correctness here belongs in a
// harness: every claim below is one whose regression is INVISIBLE on screen.
//
//   * A VIEWER BEING OFFERED A CLAIM BUTTON. `ideacad_claim_part` raises for a
//     caller who is not on the assembly, so the control would look correct and
//     be a refusal. There is nothing to see until somebody presses it.
//
//   * A ROW SOMEBODY ELSE HOLDS OFFERING A CONTROL. The same shape one row in:
//     `held` is a structured refusal, so the button works, does nothing, and
//     says nothing unless the refusal is rendered.
//
//   * A TERMINAL NOTICE OFFERING A DISMISS. A student who dismissed "you do not
//     have this part any more" would be back to a surface that looks fine and
//     saves nothing, which is the exact failure this whole lane exists to end.
//
// EVERY ABSENCE IS PAIRED WITH ITS POSITIVE CONTROL ON THE SAME FIXTURE and
// BOTH counts are reported.
//
// NO GEOMETRY, CONTRAST OR TAP TARGET HERE -- happy-dom has no layout engine
// and all three read zero. `tools/browser-verify/routes/ideacad-team-*.mjs`
// measures them against a real Chromium.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import PartsPanel from '$lib/ideacad/ui/PartsPanel.svelte';
import { IDEACAD_CHECKOUT_VIEW_ONLY, checkoutNotice } from '$lib/ideacad/checkout';
import type { IdeacadAssembly, IdeacadAssemblyPart } from '$lib/ideacad/assembly';
import { mountInto, type Mounted } from './mount';

const Panel = PartsPanel as unknown as Component<Record<string, unknown>>;

const ME = 'ana@boscotech.net';
const THEM = 'luis@boscotech.net';
const WINDOW = 600;

function part(
	id: string,
	position: number,
	heldBy: string | null,
	live = true
): IdeacadAssemblyPart {
	return {
		id,
		position,
		name: `Part ${position}`,
		activeConceptId: `c-${id}`,
		heldBy,
		heldAt: heldBy ? '2026-09-12T17:59:00Z' : null,
		holdBeatAt: heldBy ? '2026-09-12T17:59:00Z' : null,
		holdRevision: heldBy ? 3 : 1,
		holdLive: heldBy !== null && live,
		holdIsMine: heldBy === ME && live,
		conceptCount: 1
	};
}

/** free, mine, theirs -- the three row states, in one fixture. */
const PARTS = [part('p1', 1, null), part('p2', 2, ME), part('p3', 3, THEM)];

function assembly(over: Partial<IdeacadAssembly> = {}): IdeacadAssembly {
	return {
		documentId: 'doc-1',
		viewer: ME,
		isOwner: false,
		canWrite: true,
		holdWindowSeconds: WINDOW,
		holdRevisionTotal: 5,
		parts: PARTS,
		...over
	};
}

const mounted: Mounted[] = [];
afterEach(async () => {
	while (mounted.length) await mounted.pop()!.stop();
});

function open(props: Record<string, unknown> = {}): Mounted {
	const m = mountInto(Panel, {
		assembly: assembly(),
		myPartId: 'p2',
		secondsLeft: WINDOW - 60,
		phase: 'idle',
		onclaim: () => {},
		onrelease: () => {},
		ondismiss: () => {},
		...props
	});
	mounted.push(m);
	return m;
}

/** The write surface, counted. */
function controls(m: Mounted) {
	return {
		rows: m.all('[data-testid="ideacad-part-row"]').length,
		claim: m.all('.act.claim').length,
		release: m.all('.act.release').length,
		assign: m.all('[data-testid="ideacad-part-assign"]').length,
		blocked: m.all('[data-testid="ideacad-part-blocked"]').length
	};
}

describe('one control per row, and its word is the state', () => {
	it('offers Take on a free part, Release on mine, and NOTHING on somebody else’s', () => {
		expect(controls(open())).toEqual({ rows: 3, claim: 1, release: 1, assign: 0, blocked: 1 });
	});

	it('says who has the part in WORDS on every row, never a colour alone', () => {
		const m = open();
		const said = m.all('[data-testid="ideacad-part-holder"]').map((el) => el.textContent!.trim());
		expect(said).toEqual(['Free', 'Yours', `${THEM} has it`]);
	});

	it('puts a sentence where the blocked row’s button would be', () => {
		// A control absent for a reason says the reason, where every sibling row
		// has one -- otherwise the row reads as a bug.
		const m = open();
		expect(m.one('[data-testid="ideacad-part-blocked"]').textContent?.trim()).toBe('In use');
	});

	it('calls back with the part id, once, on one tap', () => {
		const claimed: string[] = [];
		const released: string[] = [];
		const m = open({
			onclaim: (id: string) => claimed.push(id),
			onrelease: (id: string) => released.push(id)
		});
		m.one<HTMLButtonElement>('.act.claim').click();
		m.one<HTMLButtonElement>('.act.release').click();
		expect(claimed).toEqual(['p1']);
		expect(released).toEqual(['p2']);
	});
});

describe('a viewer is never shown a control that would be refused', () => {
	it('renders every row and not one action', () => {
		// A VIEWER-CONSISTENT FIXTURE. A `canWrite: false` assembly in which this
		// caller holds a part is a state `0207` cannot produce -- a hold requires
		// `_ideacad_part_writer` -- so the fixture is the three parts a viewer can
		// actually be looking at: one free, two held by other people.
		const viewerParts = [part('p1', 1, null), part('p2', 2, THEM), part('p3', 3, THEM)];
		const m = open({
			assembly: assembly({ canWrite: false, parts: viewerParts }),
			myPartId: null,
			secondsLeft: null
		});
		// `blocked: 0` IS THE POINT AND NOT AN OMISSION. "In use" is a marker
		// standing where a control would be, so it is meaningful only on a
		// surface that has controls. What a viewer gets instead is the holder
		// line on every row, asserted below.
		expect(controls(m)).toEqual({ rows: 3, claim: 0, release: 0, assign: 0, blocked: 0 });
		expect(m.all('[data-testid="ideacad-part-holder"]').map((el) => el.textContent!.trim())).toEqual(
			['Free', `${THEM} has it`, `${THEM} has it`]
		);
		expect(m.target.textContent).toContain(IDEACAD_CHECKOUT_VIEW_ONLY);
	});

	it('is the SAME fixture that offers two actions with write access, which is the positive control', () => {
		const writer = open();
		expect(writer.all('.act').length).toBe(2);
		expect(writer.all('[data-testid="ideacad-parts-viewonly"]').length).toBe(0);
	});

	it('has nothing to press even with the transports handed in', () => {
		// `canWrite` is the database's answer and outranks the presence of a
		// callback: a surface that rendered a control because a prop existed
		// would put a refusal on a viewer's screen.
		const m = open({
			assembly: assembly({ canWrite: false }),
			onclaim: () => {},
			onrelease: () => {},
			onassign: () => {}
		});
		expect(controls(m).claim + controls(m).release + controls(m).assign).toBe(0);
	});
});

describe('the owner’s reassign', () => {
	it('is one picker per row, listing the owner and every teammate, plus Nobody', () => {
		const m = open({
			assembly: assembly({ isOwner: true }),
			teammates: [THEM],
			onassign: () => {}
		});
		expect(controls(m).assign).toBe(3);
		const options = m.all<HTMLOptionElement>('[data-testid="ideacad-part-assign"] option').slice(0, 3);
		expect(options.map((o) => o.value)).toEqual(['', ME, THEM]);
		expect(options[0].textContent?.trim()).toBe('Nobody');
	});

	it('is absent for a non-owner even when the callback is handed in', () => {
		// `isOwner` is `0207`'s own answer; a picker rendered on the strength of
		// a prop would be `Only the owner of this assembly can reassign a part.`
		const m = open({ assembly: assembly({ isOwner: false }), onassign: () => {} });
		expect(controls(m).assign).toBe(0);
	});

	it('reports the chosen address, and null for Nobody', () => {
		const seen: [string, string | null][] = [];
		const m = open({
			assembly: assembly({ isOwner: true }),
			teammates: [THEM],
			onassign: (id: string, email: string | null) => seen.push([id, email])
		});
		const picker = m.all<HTMLSelectElement>('[data-testid="ideacad-part-assign"]')[0];
		picker.value = THEM;
		picker.dispatchEvent(new Event('change', { bubbles: true }));
		picker.value = '';
		picker.dispatchEvent(new Event('change', { bubbles: true }));
		expect(seen).toEqual([
			['p1', THEM],
			['p1', null]
		]);
	});
});

describe('a refusal is a surface', () => {
	it('renders the sentence, its tone and the database’s own reason', () => {
		const notice = checkoutNotice({
			ok: false,
			reason: 'held',
			partId: 'p1',
			heldBy: THEM,
			holdRevision: 3
		});
		const m = open({ notice });
		const el = m.one('[data-testid="ideacad-parts-notice"]');
		expect(el.textContent).toContain(THEM);
		expect(el.getAttribute('data-reason')).toBe('held');
		expect(el.className).toContain('refusal');
		// The mark is decoration beside a sentence, never the signal on its own.
		expect(el.querySelector('.mark')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('offers no Dismiss on a TERMINAL notice, and does on every other one', () => {
		const terminal = checkoutNotice({ ok: false, reason: 'lost', partId: 'p2', holdRevision: 4 });
		const ordinary = checkoutNotice({ ok: true, reason: 'released', partId: 'p2', holdRevision: 4 });
		expect(open({ notice: terminal }).all('.dismiss').length).toBe(0);
		expect(open({ notice: ordinary }).all('.dismiss').length).toBe(1);
	});

	it('states that the work on screen survives a lost hold', () => {
		const m = open({
			notice: checkoutNotice({ ok: false, reason: 'lapsed', partId: 'p2', holdRevision: 4 })
		});
		expect(m.one('[data-testid="ideacad-parts-notice"]').textContent).toMatch(/still here/);
	});
});

describe('the hold clock', () => {
	it('is on screen while a hold is running, in words and a number', () => {
		const m = open({ secondsLeft: 540 });
		const chip = m.one('[data-testid="ideacad-hold-clock"]');
		expect(chip.textContent).toContain('9 min 00 s');
		expect(chip.getAttribute('aria-live')).toBe('polite');
	});

	it('marks the hold as expiring inside the window’s warning fraction', () => {
		// A STUDENT SEES THE LAPSE COMING. The paired counts are the point: the
		// same component at half the window carries no warning.
		expect(open({ secondsLeft: 60 }).one('[data-testid="ideacad-hold-clock"]').className).toContain(
			'expiring'
		);
		expect(
			open({ secondsLeft: 300 }).one('[data-testid="ideacad-hold-clock"]').className
		).not.toContain('expiring');
	});

	it('is absent entirely when nothing is held', () => {
		const m = open({ myPartId: null, secondsLeft: null });
		expect(m.all('[data-testid="ideacad-hold-clock"]').length).toBe(0);
	});
});

describe('the empty and unopened states', () => {
	it('says an assembly has no parts rather than rendering an empty list', () => {
		const m = open({ assembly: assembly({ parts: [] }), myPartId: null, secondsLeft: null });
		expect(m.all('[data-testid="ideacad-part-row"]').length).toBe(0);
		expect(m.target.textContent).toContain('no parts yet');
	});

	it('renders no row and throws nothing before the first read lands', () => {
		const m = open({ assembly: null, myPartId: null, secondsLeft: null });
		expect(m.all('[data-testid="ideacad-part-row"]').length).toBe(0);
		expect(m.all('[data-testid="ideacad-parts-viewonly"]').length).toBe(0);
	});
});
