// tests/ideacad-attach-control.test.ts
//
// THE CONTROL THAT MAKES IDEACAD REACHABLE -- 0223, and the four ways it can
// regress SILENTLY.
//
//   1. THE PROP STOPS BEING HANDED DOWN. `ideacadAttach` is optional, so
//      deleting the one line in the item route's `ItemDetail` invocation is
//      valid TypeScript, compiles clean, renders a perfectly normal page and
//      quietly returns the whole subsystem to the state ledger 0223 exists to
//      end -- built, applied, and reachable by nobody. That is exactly the
//      state 0201 left and 0217 had to clean up, one component over, and
//      nothing in the repository noticed for three days.
//   2. IT ESCAPES INTO THE STUDENT ARM. The block sits inside the inspector's
//      one `{#if canManage}`, and a second guard is cheap; what is not cheap is
//      finding out from a student that they can turn their own assignment off.
//   3. THE SCHEMA-3 SENTENCE GOES MISSING. A control absent for a reason has to
//      SAY the reason, or the block reads as a defect.
//   4. THE CONFIG VALIDATION MOVES AFTER THE CALL. An editor row written with a
//      config `validateBladeTree` refuses is an assignment that accepts a
//      student and then will not open for them, days later, in front of the
//      wrong person. Nothing on this screen would report it.
//
// EVERY ABSENCE CLAIM HERE CARRIES A POSITIVE CONTROL in the same test -- the
// count of the thing that must be PRESENT, on the same fixture -- because a
// selector that is simply wrong reads exactly like a control that is correctly
// gone.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import ItemDetail from '$lib/classroom/ItemDetail.svelte';
import { SECTION, ITEMS } from '../src/routes/dev/classroom-split/fixture';
import { itemInspector } from '$lib/classroom/inspector.svelte';
import type { ClassroomItem } from '$lib/classroom/classroom';
import { bladeConfigShaped } from '$lib/ideacad/config';
import { DEFAULT_BLADE_CONFIG } from '$lib/ideacad/blade/materials';
import {
	ideacadAttachRefusal,
	ideacadAttachState,
	IDEACAD_ATTACH_BAD_CONFIG,
	IDEACAD_ATTACH_OFF_CONFIRM,
	IDEACAD_ATTACH_OFF_PROMPT,
	IDEACAD_ATTACH_OTHER_SURFACE,
	type IdeacadAttachControl
} from '$lib/ideacad/transports';

const ITEM_ROUTE = 'src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte';

/** A published assignment from the fixture's own rows, never typed out: a
    hand-written item is a shape the fixture's producer never emits. */
function assignment(schema?: number): ClassroomItem {
	const found = ITEMS.find((i) => i.kind === 'assignment' && i.published);
	if (!found) throw new Error('the split fixture has no published assignment');
	const next = { ...found } as ClassroomItem & { assignment_schema_version?: number };
	if (schema === undefined) delete next.assignment_schema_version;
	else next.assignment_schema_version = schema;
	return next as ClassroomItem;
}

function material(): ClassroomItem {
	const found = ITEMS.find((i) => i.kind === 'material');
	if (!found) throw new Error('the split fixture has no material');
	return { ...found } as ClassroomItem;
}

const attach: IdeacadAttachControl = {
	bladeConfig: DEFAULT_BLADE_CONFIG,
	setEditor: async () => ({})
};

/**
 * THE INSPECTOR IS COLLAPSED ON A FRESH LOAD, DELIBERATELY
 * (`inspector.svelte.ts`), and its BODY -- where every assignment control
 * lives, this one included -- is inside `{#if inspectorOpen}`. So a render
 * taken without opening it measures an EMPTY REGION and reports every absence
 * below as a pass. Opened through the REAL module rather than a second copy of
 * its state, which is also what the harness does.
 */
function html(props: Record<string, unknown>): string {
	itemInspector.open = true;
	return render(ItemDetail, { props: { section: SECTION, ...props } as never }).body;
}

/** The same render with the tools SHUT, which is what a teacher's first paint
    is and what the collapsed-by-default test below asserts against. */
function shutHtml(props: Record<string, unknown>): string {
	itemInspector.open = false;
	return render(ItemDetail, { props: { section: SECTION, ...props } as never }).body;
}

/** `data-testid` occurrences, which is what the harness and the browser spec
    both key on, so the two agree about what they are counting. */
function count(body: string, testid: string): number {
	return body.split(`data-testid="${testid}"`).length - 1;
}

describe('ideacadAttachState reads the column through the existing predicates', () => {
	it('answers on, off and other-surface, and never throws', () => {
		expect(ideacadAttachState({ assignment_schema_version: 4 })).toBe('on');
		expect(ideacadAttachState({ assignment_schema_version: 3 })).toBe('other-surface');
		expect(ideacadAttachState({ assignment_schema_version: 1 })).toBe('off');
		expect(ideacadAttachState({ assignment_schema_version: null })).toBe('off');
		expect(ideacadAttachState({})).toBe('off');
		expect(ideacadAttachState(null)).toBe('off');
		expect(ideacadAttachState(undefined)).toBe('off');
		// A string is what a value that took some other path into the payload
		// looks like; the safe reading is the one that does not claim schema 4.
		expect(ideacadAttachState({ assignment_schema_version: '4' })).toBe('off');
	});
});

describe('the config the control writes', () => {
	// THE AUDIT ANSWER, PINNED. `ideacad_open_document` builds a student's first
	// concept out of `config->'defaultFeatures'`, so if the one config anything
	// ships stopped satisfying the gate, every new Blade assignment would be
	// one nobody can open -- and the only symptom is a student in class.
	it('DEFAULT_BLADE_CONFIG satisfies bladeConfigShaped as written', () => {
		expect(bladeConfigShaped(DEFAULT_BLADE_CONFIG)).toBe(true);
	});

	it('and the gate genuinely bites on a tree it cannot validate', () => {
		expect(
			bladeConfigShaped({ ...DEFAULT_BLADE_CONFIG, defaultFeatures: { schema: 1, features: [] } })
		).toBe(false);
		expect(bladeConfigShaped({ ...DEFAULT_BLADE_CONFIG, defaultFeatures: null })).toBe(false);
		expect(bladeConfigShaped(null)).toBe(false);
		expect(bladeConfigShaped({})).toBe(false);
	});
});

describe('ideacadAttachRefusal keeps the database sentence verbatim', () => {
	it('renders the schema-3 refusal unchanged rather than re-toning it', () => {
		const sentence = 'This assignment already uses another work surface. Remove it first.';
		expect(ideacadAttachRefusal(new Error(sentence))).toBe(sentence);
		expect(ideacadAttachRefusal(new Error('Only a teacher for this class can change its editor.'))).toBe(
			'Only a teacher for this class can change its editor.'
		);
	});

	it('falls back only where there is no message at all', () => {
		expect(ideacadAttachRefusal(new Error(''))).toMatch(/Nothing was saved/);
		expect(ideacadAttachRefusal(undefined)).toMatch(/Nothing was saved/);
	});
});

describe('who gets the control', () => {
	it('a manager on an assignment gets it, with both the block and the state sentence', () => {
		const body = html({ item: assignment(), canManage: true, ideacadAttach: attach });
		expect(count(body, 'insp-ideacad-attach')).toBe(1);
		expect(count(body, 'ideacad-attach-state')).toBe(1);
		expect(count(body, 'ideacad-attach-on')).toBe(1);
		expect(count(body, 'ideacad-attach-off')).toBe(0);
	});

	it('a STUDENT gets none of it, against that same 1/1/1 as the control', () => {
		const body = html({ item: assignment(), canManage: false, ideacadAttach: attach });
		expect(count(body, 'insp-ideacad-attach')).toBe(0);
		expect(count(body, 'ideacad-attach-state')).toBe(0);
		expect(count(body, 'ideacad-attach-on')).toBe(0);
		expect(count(body, 'ideacad-attach-off')).toBe(0);
		// The positive control: the same fixture with canManage true renders it.
		expect(count(html({ item: assignment(), canManage: true, ideacadAttach: attach }), 'ideacad-attach-on')).toBe(1);
	});

	it('a manager with NO transport gets none of it -- absence is the mechanism', () => {
		const body = html({ item: assignment(), canManage: true, ideacadAttach: null });
		expect(count(body, 'insp-ideacad-attach')).toBe(0);
		expect(count(body, 'ideacad-attach-on')).toBe(0);
		expect(count(html({ item: assignment(), canManage: true, ideacadAttach: attach }), 'ideacad-attach-on')).toBe(1);
	});

	it('a MATERIAL gets none of it, even for a manager holding the transport', () => {
		const body = html({ item: material(), canManage: true, ideacadAttach: attach });
		expect(count(body, 'insp-ideacad-attach')).toBe(0);
		expect(count(html({ item: assignment(), canManage: true, ideacadAttach: attach }), 'insp-ideacad-attach')).toBe(1);
	});
});

describe('where a teacher finds it', () => {
	/**
	 * ONE CLICK BEHIND "Instructor tools", exactly like the spec importer and
	 * the rubric builder it sits beside. That is the inspector's own rule
	 * (`inspector.svelte.ts`: a fresh load starts collapsed, because the page's
	 * content is the student's view) and not something this block opted into --
	 * but it IS the first thing anybody will ask about, so it is written down
	 * as a measured fact rather than left for somebody to discover.
	 */
	it('is inside the collapsed instructor tools, and the toggle that opens them is not', () => {
		const shut = shutHtml({ item: assignment(), canManage: true, ideacadAttach: attach });
		expect(count(shut, 'insp-ideacad-attach')).toBe(0);
		// The positive control: the strip itself IS on screen while shut, so
		// there is a way in rather than a region with no door.
		expect(count(shut, 'inspector-toggle')).toBe(1);
		expect(count(html({ item: assignment(), canManage: true, ideacadAttach: attach }), 'insp-ideacad-attach')).toBe(1);
	});

	it('and the transport alone is enough to put the inspector on a page that would otherwise have none', () => {
		/* `hasInspector` and `groupContent` both had to widen, or a manager
		   whose ONLY instructor affordance is this control would get no tools
		   strip at all -- or a strip that opens onto an empty region, since a
		   group renders nothing when every gate inside it is false.

		   THE ITEM IS PINNED QUIET FIRST. The fixture's published assignment
		   trips `hasState` on its own, which would make this pass whatever
		   `hasInspector` said. Live, not scheduled and not public is an
		   ordinary shape and is the one that isolates the claim. */
		const quiet = {
			...assignment(),
			published: true,
			publish_at: null,
			is_public: false
		} as ClassroomItem;
		const base = { item: quiet, canManage: true, transports: null };
		/* MEASURED, AND IT CORRECTS WHAT THIS TEST FIRST CLAIMED: the fixture's
		   item puts the inspector on screen by itself even with every transport
		   withheld, so `hasInspector` cannot be isolated on it and an assertion
		   that it goes to 0 is one that fails against correct code. The GROUP is
		   the half that isolates cleanly, and it is the half that matters -- an
		   inspector whose content group is empty is a strip that opens onto
		   nothing. */
		expect(count(shutHtml({ ...base, ideacadAttach: attach }), 'item-inspector')).toBe(1);
		expect(count(html({ ...base, ideacadAttach: null }), 'insp-group-content')).toBe(0);
		expect(count(html({ ...base, ideacadAttach: attach }), 'insp-group-content')).toBe(1);
		expect(count(html({ ...base, ideacadAttach: attach }), 'insp-ideacad-attach')).toBe(1);
	});
});

describe('what the control says in each of the three states', () => {
	it('OFF offers to turn it on and offers no way to turn it off', () => {
		const body = html({ item: assignment(), canManage: true, ideacadAttach: attach });
		expect(count(body, 'ideacad-attach-on')).toBe(1);
		expect(count(body, 'ideacad-attach-off')).toBe(0);
		expect(body).not.toContain(IDEACAD_ATTACH_OTHER_SURFACE);
	});

	it('ON offers to turn it off and offers no way to turn it on', () => {
		const body = html({ item: assignment(4), canManage: true, ideacadAttach: attach });
		expect(count(body, 'ideacad-attach-off')).toBe(1);
		expect(count(body, 'ideacad-attach-on')).toBe(0);
		// The typed confirmation is ARMED, not standing: nothing is typed into
		// on first render, so the input and the confirm are correctly absent.
		expect(count(body, 'ideacad-attach-off-input')).toBe(0);
		expect(count(body, 'ideacad-attach-off-confirm')).toBe(0);
	});

	it('OTHER SURFACE offers nothing at all and says why in its place', () => {
		const body = html({ item: assignment(3), canManage: true, ideacadAttach: attach });
		expect(count(body, 'insp-ideacad-attach')).toBe(1);
		expect(count(body, 'ideacad-attach-blocked')).toBe(1);
		expect(count(body, 'ideacad-attach-on')).toBe(0);
		expect(count(body, 'ideacad-attach-off')).toBe(0);
		expect(count(body, 'ideacad-attach-state')).toBe(0);
		expect(body).toContain(IDEACAD_ATTACH_OTHER_SURFACE);
	});
});

describe('the wiring that makes any of it reachable', () => {
	// THE REGRESSION THIS FILE EXISTS FOR. Nothing type-checks an optional prop
	// that is never passed.
	it('the item route hands the attach control down, gated on canManage', () => {
		const source = readFileSync(ITEM_ROUTE, 'utf8');
		expect(source).toContain('ideacadAttach={data.canManage ? ideacadTransports : null}');
	});

	it('and it is the SAME predicate that gates every other manager-shaped prop there', () => {
		const source = readFileSync(ITEM_ROUTE, 'utf8');
		expect(source).toContain('teacherTransports={data.canManage ? teacherTransports : null}');
		expect(source).toContain('referenceTransports={data.canManage ? referenceTransports : null}');
	});

	it('the control validates the config BEFORE the call, never after', () => {
		const source = readFileSync('src/lib/classroom/ItemDetail.svelte', 'utf8');
		const guard = source.indexOf('bladeConfigShaped(attach.bladeConfig)');
		const call = source.indexOf("attach.setEditor(item.id, 'blade'");
		expect(guard).toBeGreaterThan(-1);
		expect(call).toBeGreaterThan(-1);
		expect(guard).toBeLessThan(call);
		// And the refusal returns rather than falling through to the call.
		expect(source.replace(/\r\n/g, '\n')).toContain(`ideacadAttachError = IDEACAD_ATTACH_BAD_CONFIG;\n\t\t\treturn;`);
	});

	it('the refusal sentences are one spelling each, read from the module', () => {
		const source = readFileSync('src/lib/classroom/ItemDetail.svelte', 'utf8');
		for (const literal of [
			IDEACAD_ATTACH_BAD_CONFIG,
			IDEACAD_ATTACH_OTHER_SURFACE,
			IDEACAD_ATTACH_OFF_PROMPT
		]) {
			expect(source).not.toContain(literal);
		}
		expect(IDEACAD_ATTACH_OFF_PROMPT).toContain(IDEACAD_ATTACH_OFF_CONFIRM);
	});
});
