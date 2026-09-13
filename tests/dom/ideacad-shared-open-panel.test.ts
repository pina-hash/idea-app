// tests/dom/ideacad-shared-open-panel.test.ts
//
// THE SHARED-DOCUMENTS PANEL, MOUNTED. `0205` shipped
// `ideacad_shared_with_me` and `ideacad_open_shared_document` in July and
// NEITHER HAD A CALLER: a student could be granted access and had no surface
// anywhere that named the document. `ideacad_shared_with_me` is a grantee's ONLY
// route to a document id -- the roster is teacher-only and a classmate's
// document is on no surface they can already read -- so the grant was
// unreachable by construction. This file is the structural half of the proof
// that it is reachable now.
//
// WHY THIS IS AUTOMATED. Three claims here regress SILENTLY:
//
//   * "NOTHING SHARED" AND "CANNOT ASK" RENDERING THE SAME THING. A deployment
//     between 0204 and 0205 cannot answer the question at all, and reporting
//     that as "nobody has shared anything with you" is a confident answer to a
//     question nobody asked. Both states render one quiet line and look alike.
//
//   * THE ROW ALREADY OPEN GROWING A CONTROL. Re-opening the document on screen
//     is a press whose only outcome is nothing happening. A button there looks
//     completely normal.
//
//   * A VIEWER'S ROW LOSING ITS SENTENCE. A row with nothing to say about why it
//     cannot be edited reads as broken rather than as read-only, and the
//     sentence is the half that disappears in a restyle.
//
// EVERY ABSENCE CLAIM IS PAIRED WITH ITS POSITIVE CONTROL ON THE SAME FIXTURE
// and BOTH counts are reported: a selector that matches nothing comes back
// clean, and clean is what nobody investigates.
//
// NO GEOMETRY, NO CONTRAST, NO TAP TARGET. happy-dom has no layout engine and
// every one of those reads zero here. They are measured against a real Chromium
// in `tools/browser-verify/routes/ideacad-shared-*.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import SharedDocuments from '$lib/ideacad/ui/SharedDocuments.svelte';
import {
	IDEACAD_SHARED_ACCESS_LOST,
	IDEACAD_SHARED_HEADING,
	IDEACAD_SHARED_UNAVAILABLE,
	ideacadSharedOff,
	ideacadSharedOn,
	ideacadSharedRows
} from '$lib/ideacad/shared-open';
import {
	IDEACAD_ROLE_LABELS,
	IDEACAD_ROLE_NOTES,
	type IdeacadSharedDocument
} from '$lib/ideacad/sharing';
import { mountInto, type Mounted } from './mount';

const Panel = SharedDocuments as unknown as Component<Record<string, unknown>>;

const OWNER = 'ana.reyes@boscotech.net';
const OTHER = 'luis.ortega@boscotech.net';
const DOC_A = '11111111-2222-3333-4444-555555555555';
const DOC_B = '22222222-3333-4444-5555-666666666666';

const SHARED: IdeacadSharedDocument[] = [
	{
		documentId: DOC_A,
		ownerEmail: OWNER,
		role: 'editor',
		grantedAt: '2026-09-12T17:00:00Z',
		updatedAt: '2026-09-13T00:00:00Z'
	},
	{
		documentId: DOC_B,
		ownerEmail: OTHER,
		role: 'viewer',
		grantedAt: '2026-09-11T15:30:00Z',
		updatedAt: '2026-09-12T20:45:00Z'
	}
];

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

function panel(props: Record<string, unknown>): Mounted {
	mounted = mountInto(Panel, props);
	return mounted;
}

describe('the shared-documents panel', () => {
	it('lists every shared document with its owner and its role word', () => {
		const m = panel({ rows: ideacadSharedRows(SHARED), capability: ideacadSharedOn() });
		const rows = m.all('[data-testid="ideacad-shared-row"]');
		expect(rows.length).toBe(2);
		const text = m.one('[data-testid="ideacad-shared"]').textContent ?? '';
		expect(text).toContain(OWNER);
		expect(text).toContain(OTHER);
		// THE WORD IS `sharing.ts`'s OWN LABEL, not a second spelling. A restyle
		// that hand-wrote "Editor" beside the hue would drift from the chip the
		// owner reads on the same screen.
		expect(text).toContain(IDEACAD_ROLE_LABELS.editor);
		expect(text).toContain(IDEACAD_ROLE_LABELS.viewer);
		expect(text).toContain(IDEACAD_SHARED_HEADING);
	});

	it('offers one Open per row, and NO control on the row already open', () => {
		// POSITIVE CONTROL FIRST, on the same fixture: nothing open, two Opens.
		const closed = panel({
			rows: ideacadSharedRows(SHARED),
			capability: ideacadSharedOn(),
			openDocumentId: null,
			onopen: () => {}
		});
		expect(closed.all('[data-testid="ideacad-shared-open"]').length).toBe(2);
		expect(closed.all('[data-testid="ideacad-shared-current"]').length).toBe(0);
		void closed.stop();

		const open = panel({
			rows: ideacadSharedRows(SHARED),
			capability: ideacadSharedOn(),
			openDocumentId: DOC_A,
			onopen: () => {}
		});
		// One Open control remains (the other document), and the open row carries a
		// WORD in its place rather than nothing at all.
		expect(open.all('[data-testid="ideacad-shared-open"]').length).toBe(1);
		expect(open.all('[data-testid="ideacad-shared-current"]').length).toBe(1);
	});

	it('hands the document id up when Open is pressed', () => {
		const seen: string[] = [];
		const m = panel({
			rows: ideacadSharedRows(SHARED),
			capability: ideacadSharedOn(),
			onopen: (id: string) => seen.push(id)
		});
		// The rows are ordered by owner address, so ana's DOC_A is first.
		m.all<HTMLButtonElement>('[data-testid="ideacad-shared-open"]')[0].click();
		m.flush();
		expect(seen).toEqual([DOC_A]);
	});

	it('ABSENCE OF THE CALLBACK REMOVES EVERY OPEN CONTROL, with its control', () => {
		const withCallback = panel({
			rows: ideacadSharedRows(SHARED),
			capability: ideacadSharedOn(),
			onopen: () => {}
		});
		expect(withCallback.all('[data-testid="ideacad-shared-open"]').length).toBe(2);
		void withCallback.stop();

		const without = panel({
			rows: ideacadSharedRows(SHARED),
			capability: ideacadSharedOn()
		});
		// Absence is the mechanism: there is no write to execute, so there is no
		// button in the markup at all -- not a disabled one.
		expect(without.all('[data-testid="ideacad-shared-open"]').length).toBe(0);
		expect(without.all('button').length).toBe(0);
		// And the rows are still there, which is what makes the zero above mean
		// "no control" rather than "no list".
		expect(without.all('[data-testid="ideacad-shared-row"]').length).toBe(2);
	});

	it("says why a viewer's row cannot be edited, in ONE sentence from sharing.ts", () => {
		const m = panel({
			rows: ideacadSharedRows(SHARED),
			capability: ideacadSharedOn(),
			onopen: () => {}
		});
		// One of the two fixture rows is view-only, so exactly one tagged note and
		// exactly one untagged one.
		const viewOnly = m.all('[data-testid="ideacad-shared-viewonly"]');
		const editable = m.all('[data-testid="ideacad-shared-rolenote"]');
		expect(viewOnly.length).toBe(1);
		expect(editable.length).toBe(1);
		// IT IS `sharing.ts`'s OWN NOTE AND NOT A SECOND SENTENCE. The panel
		// carried a separate view-only string under this one until the pages were
		// rasterized, which put two paragraphs saying the same thing on the row.
		expect(viewOnly[0].textContent?.trim()).toBe(IDEACAD_ROLE_NOTES.viewer);
		expect(editable[0].textContent?.trim()).toBe(IDEACAD_ROLE_NOTES.editor);
		// ONE NOTE PER ROW, which is the half a count of sentences cannot see.
		for (const row of m.all('[data-testid="ideacad-shared-row"]')) {
			expect(row.querySelectorAll('.row-note').length).toBe(1);
		}
	});

	it('a row whose access was LOST stops claiming the role it no longer has', () => {
		// The contradiction rasterizing caught: the list is fetched once and the
		// loss is learned later, so a stale row went on reading "Can edit" and
		// "Open now" under a notice saying the access was gone.
		const m = panel({
			rows: ideacadSharedRows(SHARED),
			capability: ideacadSharedOn(),
			openDocumentId: DOC_A,
			accessLost: true,
			onopen: () => {}
		});
		const lostRow = m.all('[data-testid="ideacad-shared-row"]')[0];
		expect(lostRow.textContent).not.toContain(IDEACAD_ROLE_LABELS.editor);
		expect(lostRow.textContent).not.toContain('Open now');
		expect(lostRow.querySelectorAll('[data-testid="ideacad-shared-row-lost"]').length).toBe(1);
		// NO CONTROL EITHER: both would be claims about a document this caller
		// cannot reach.
		expect(lostRow.querySelectorAll('button').length).toBe(0);
		// POSITIVE CONTROL: the OTHER row is untouched and still offers Open.
		const otherRow = m.all('[data-testid="ideacad-shared-row"]')[1];
		expect(otherRow.querySelectorAll('[data-testid="ideacad-shared-open"]').length).toBe(1);
		expect(otherRow.textContent).toContain(IDEACAD_ROLE_LABELS.viewer);
		// AND THE HEADER COUNT GOES TOO. The list was read before the grant went
		// away, so "1 you can edit" counts a document the student has just been
		// told they cannot open. There is no honest number to put there.
		expect(m.all('[data-testid="ideacad-shared-summary"]').length).toBe(0);
	});

	it('renders NO placeholder for an empty list, and no row', () => {
		const m = panel({ rows: [], capability: ideacadSharedOn() });
		expect(m.all('[data-testid="ideacad-shared-row"]').length).toBe(0);
		expect(m.all('[data-testid="ideacad-shared-summary"]').length).toBe(0);
		// A sentence, because an empty panel with only a heading reads as loading.
		expect(m.all('[data-testid="ideacad-shared-empty"]').length).toBe(1);
		// And NOT the ladder's sentence: nothing shared and cannot-ask are two
		// different states and must not render the same words.
		expect(m.one('[data-testid="ideacad-shared"]').textContent).not.toContain(
			IDEACAD_SHARED_UNAVAILABLE
		);
	});

	it('says the LADDER\'s sentence on a deployment with no 0205, and lists nothing', () => {
		const m = panel({ rows: ideacadSharedRows(SHARED), capability: ideacadSharedOff() });
		expect(m.all('[data-testid="ideacad-shared-unavailable"]').length).toBe(1);
		expect(m.one('[data-testid="ideacad-shared-unavailable"]').textContent?.trim()).toBe(
			IDEACAD_SHARED_UNAVAILABLE
		);
		// ROWS HANDED IN ARE STILL NOT RENDERED. "Cannot tell" must never render as
		// an answer, even when a caller passes a stale list alongside it.
		expect(m.all('[data-testid="ideacad-shared-row"]').length).toBe(0);
		expect(m.all('[data-testid="ideacad-shared-empty"]').length).toBe(0);
	});

	it('renders the access-lost notice only when the flag is set', () => {
		const quiet = panel({
			rows: ideacadSharedRows(SHARED),
			capability: ideacadSharedOn(),
			openDocumentId: DOC_A
		});
		expect(quiet.all('[data-testid="ideacad-shared-access-lost"]').length).toBe(0);
		// THE POSITIVE CONTROL for the summary zero asserted in the lost test: on
		// the identical fixture without the flag, the count is there.
		expect(quiet.all('[data-testid="ideacad-shared-summary"]').length).toBe(1);
		void quiet.stop();

		const lost = panel({
			rows: ideacadSharedRows(SHARED),
			capability: ideacadSharedOn(),
			openDocumentId: DOC_A,
			accessLost: true
		});
		const notice = lost.all('[data-testid="ideacad-shared-access-lost"]');
		expect(notice.length).toBe(1);
		expect(notice[0].textContent).toContain(IDEACAD_SHARED_ACCESS_LOST);
		// The rows are STILL listed: the student has to be able to see the
		// document is gone from their list, or ask for it again.
		expect(lost.all('[data-testid="ideacad-shared-row"]').length).toBe(2);
	});
});
