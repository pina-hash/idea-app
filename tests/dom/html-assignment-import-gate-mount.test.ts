// tests/dom/html-assignment-import-gate-mount.test.ts
//
// DOES A NON-ADMIN SEE THE PORTED-DOCUMENT IMPORT CONTROL? On the REAL
// `ContentComposer`, really mounted, with the props the REAL route passes.
//
// THIS IS THE LEG OF LEDGER 0139'S WALK THAT MATTERS MOST, because it is the
// one whose failure is silent. A missing panel is loud -- an admin reports it
// the first time they try to post a worksheet. A panel offered to somebody the
// database will refuse is quiet: it renders, it takes a file, it reads it, it
// stages it, and the refusal arrives after Post, in front of a class.
//
// THREE COMBINATIONS, AND THE THIRD IS THE POSITIVE CONTROL. Absence
// assertions are worthless without a case that finds something through the
// same selector, so every one below is reported as a COUNT beside the count
// the opposite mount produced:
//
//   admin       transport + admin=true   -> panel 1, refusal 0
//   the route's transport null, admin=false -> panel 0, refusal 0
//   the explainer transport + admin=false  -> panel 0, refusal 1
//
// THE MIDDLE ROW IS WHAT `src/routes/classroom/[sectionId]/+layout.svelte`
// BUILDS. Both props read one flag there (`data.navIsAdmin === true`), which is
// what keeps the pair out of the third row: a non-admin who was never told the
// control exists should not read a sentence about being refused it. The third
// row is asserted anyway because the branch is in the component and a later
// mount may legitimately want it.
//
// WHAT THIS FILE CANNOT SAY: nothing about geometry, per `tests/dom/README.md`.
// happy-dom has no layout engine, so a box read here is 0x0 and a tap-target or
// contrast claim would pass vacuously. Presence, absence and counts only.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

// The composer's save guard calls `beforeNavigate` during init, and
// `tests/stubs/app-navigation.ts` exports no lifecycle hook -- the same mock
// its sibling mount files carry, for the same reason.
vi.mock('$app/navigation', async () => {
	const actual = await vi.importActual<Record<string, unknown>>('$app/navigation');
	return { ...actual, beforeNavigate: () => {}, afterNavigate: () => {} };
});

import ContentComposer from '$lib/classroom/ContentComposer.svelte';
import type {
	ClassroomComposerTransports,
	ClassroomSection,
	TxResult
} from '$lib/classroom/classroom';
import {
	HTML_ASSIGNMENT_ADMIN_ONLY,
	type HtmlAssignmentTransports
} from '$lib/classroom/html-assignment/store';
import { mountInto, type Mounted } from './mount';

const Composer = ContentComposer as unknown as Component<Record<string, unknown>>;

const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

const ok = <T,>(data: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data });

const transports = {
	createItem: () => ok({ itemId: 'item-1', sectionIds: ['sec-1'], formattingDropped: false }),
	updateItem: () => ok({ itemId: 'item-1', sectionIds: ['sec-1'], formattingDropped: false }),
	uploadAttachment: () => ok(undefined),
	uploadInstructorAttachment: () => ok(undefined),
	deleteAttachment: () => ok(undefined),
	deleteInstructorAttachment: () => ok(undefined),
	setInstructorResources: () => ok(undefined),
	addPostings: () => ok({ added: 0 }),
	removePosting: () => ok({ ok: true }),
	loadCategorySuggestions: () => ok([])
} as unknown as ClassroomComposerTransports;

/**
 * The SHAPE the route hands over, never a stand-in for the RPC behind it. What
 * this file asserts is what the composer renders for a present transport and
 * for an absent one; whether the call lands is `tests/db/html-assignment-
 * wiring.test.ts`'s question, against real Postgres.
 */
const uploadTransports: HtmlAssignmentTransports = {
	setHtmlAssignment: async () => ({ ok: true, revision: 1 }),
	setRubric: async () => ({ ok: true })
};

interface Counts {
	panel: number;
	refusal: number;
	fileInputs: number;
	refusalText: string | null;
}

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

function countsFor(props: {
	htmlAssignmentTransports: HtmlAssignmentTransports | null;
	htmlAssignmentAdmin: boolean;
	kind?: string;
	mode?: string;
}): Counts {
	mounted = mountInto(Composer, {
		mode: props.mode ?? 'create',
		kind: props.kind ?? 'assignment',
		sections: [SECTION],
		initialTargets: [SECTION.id],
		transports,
		htmlAssignmentTransports: props.htmlAssignmentTransports,
		htmlAssignmentAdmin: props.htmlAssignmentAdmin,
		onsaved: () => {}
	});
	const panel = mounted.all('[data-testid="staged-html"]');
	const refusal = mounted.all('[data-testid="staged-html-refusal"]');
	return {
		panel: panel.length,
		refusal: refusal.length,
		// The picker inside the panel: the panel EXISTING is not the same fact as
		// there being something in it to hand a document to.
		fileInputs: panel.flatMap((p) => Array.from(p.querySelectorAll('input[type="file"]'))).length,
		refusalText: refusal[0]?.textContent?.trim() ?? null
	};
}

describe('the ported-document import control', () => {
	it('an admin holding the transport gets the panel and no refusal', () => {
		const c = countsFor({ htmlAssignmentTransports: uploadTransports, htmlAssignmentAdmin: true });
		expect(c).toMatchObject({ panel: 1, refusal: 0 });
		// THE POSITIVE CONTROL FOR EVERY ABSENCE BELOW: this selector finds
		// something, and the panel really does carry a picker.
		expect(c.fileInputs).toBe(1);
	});

	it('a NON-ADMIN, as the route builds it, sees neither the panel nor the refusal', () => {
		const c = countsFor({ htmlAssignmentTransports: null, htmlAssignmentAdmin: false });
		expect(c).toEqual({ panel: 0, refusal: 0, fileInputs: 0, refusalText: null });
	});

	it('a mount that hands the transport over anyway explains itself instead', () => {
		const c = countsFor({ htmlAssignmentTransports: uploadTransports, htmlAssignmentAdmin: false });
		expect(c).toMatchObject({ panel: 0, refusal: 1, fileInputs: 0 });
		// VERBATIM. The sentence is the store's, and a surface that re-tones it
		// is a second spelling of one refusal.
		expect(c.refusalText).toBe(HTML_ASSIGNMENT_ADMIN_ONLY);
	});

	it('and the panel is assignment-only and create-only, for an admin too', () => {
		expect(
			countsFor({
				htmlAssignmentTransports: uploadTransports,
				htmlAssignmentAdmin: true,
				kind: 'post'
			})
		).toMatchObject({ panel: 0, refusal: 0 });
	});

	it('a transport object whose own setter is null removes the panel as surely as a null object', () => {
		// ABSENCE IS THE MECHANISM ALL THE WAY DOWN, which is what stops a future
		// mount from expressing "may not upload" as an object with a hole in it
		// and getting a panel anyway.
		expect(
			countsFor({
				htmlAssignmentTransports: { setHtmlAssignment: null },
				htmlAssignmentAdmin: true
			})
		).toMatchObject({ panel: 0, refusal: 0 });
	});
});
