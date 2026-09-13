// tests/dom/ideacad-archive-mount.test.ts
//
// THE INSTRUCTOR ARCHIVE SURFACE, MOUNTED FOR REAL.
//
// Decision 29 is the reason the surface exists at all: a departing student's
// IdeaCAD document is ARCHIVED rather than deleted, stays reachable by the
// instructor, and may be shown to a current class. `0214` is the data layer and
// enforces every rule; what is tested here is what a person can SEE and PRESS,
// which the database cannot answer for.
//
// WHY THESE CLAIMS ARE TESTED RATHER THAN LOOKED AT. Every one of them fails
// SILENTLY:
//
//   * a write transport that stopped being handed down removes a control, and
//     a panel with no Archive button is a perfectly correct-looking panel --
//     which is also exactly what the read-only state is SUPPOSED to look like,
//     so only a paired positive control tells the two apart;
//   * the share picker appearing on a LIVE (off-roster, unarchived) row would
//     offer a press whose only outcome is `0214` refusing it, and nothing on
//     screen would say so until somebody pressed;
//   * `IDEACAD_ARCHIVE_SHARE_NOTE` going missing costs an instructor the one
//     sentence telling them a whole class will see whose work this is -- the
//     same failure mode `FoundryShare`'s sentence exists to prevent, and a
//     surface that quietly lost it looks finished;
//   * an empty archive rendering as a blank panel is indistinguishable from a
//     broken one.
//
// EVERY ABSENCE IS PAIRED WITH A POSITIVE CONTROL ON THE SAME FIXTURE, because
// "0 archive buttons" is also what a component that rendered nothing reports.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. Structure, counts, which branch
// rendered, what a transport was called with, and the pure functions behind the
// ordering. NOT geometry, NOT contrast and NOT a tap target: happy-dom has no
// layout engine, so a box reads 0 and a colour reads '' and both pass
// VACUOUSLY (`tests/dom/README.md`). Those are `verify:browser`'s claims and
// live in `tools/browser-verify/routes/ideacad-archive.mjs`.
import { afterEach, describe, expect, it } from 'vitest';
import ArchivePanel from '../../src/lib/ideacad/ui/ArchivePanel.svelte';
import {
	IDEACAD_ARCHIVE_EMPTY_NOTE,
	IDEACAD_ARCHIVE_REASON_LABELS,
	IDEACAD_ARCHIVE_SHARE_NOTE,
	IDEACAD_ARCHIVE_UNAVAILABLE,
	ideacadArchiveCanShare,
	ideacadArchiveOrder,
	ideacadArchiveShareTargets,
	ideacadArchiveUndecided,
	ideacadArchiveReasonFromPayload,
	type IdeacadArchiveRow,
	type IdeacadArchiveSection
} from '../../src/lib/ideacad/archive';
import { mountInto, type Mounted } from './mount';

const SECTIONS: IdeacadArchiveSection[] = [
	{ sectionId: 'sec-p3', label: 'Period 3' },
	{ sectionId: 'sec-p5', label: 'Period 5' }
];

const ARCHIVED: IdeacadArchiveRow = {
	documentId: 'doc-reyes',
	ownerEmail: 'ana.reyes@boscotech.net',
	archivedAt: '2026-06-04T17:20:00.000Z',
	archivedBy: 'apina@boscotech.edu',
	onRoster: false,
	reason: 'archived',
	conceptCount: 4,
	updatedAt: '2026-05-29T15:02:00.000Z',
	sharedWithSections: [
		{
			sectionId: 'sec-p3',
			label: 'Period 3',
			grantedBy: 'apina@boscotech.edu',
			grantedAt: '2026-09-02T16:00:00.000Z'
		}
	]
};

const OFF_ROSTER: IdeacadArchiveRow = {
	documentId: 'doc-okonkwo',
	ownerEmail: 'daniel.okonkwo@boscotech.net',
	archivedAt: null,
	archivedBy: null,
	onRoster: false,
	reason: 'off_roster',
	conceptCount: 2,
	updatedAt: '2026-04-11T14:41:00.000Z',
	sharedWithSections: []
};

const noop = async () => {};

let m: Mounted | null = null;
afterEach(async () => {
	await m?.stop();
	m = null;
});

/** Mount the real panel with every write transport handed in. */
function full(props: Record<string, unknown> = {}): Mounted {
	m = mountInto(ArchivePanel as never, {
		rows: [ARCHIVED, OFF_ROSTER],
		sections: SECTIONS,
		archiveReady: true,
		onarchive: noop,
		onshare: noop,
		onunshare: noop,
		onopen: () => {},
		...props
	});
	return m;
}

const count = (v: Mounted, selector: string) => v.all(selector).length;
const buttonsNamed = (v: Mounted, text: string) =>
	v.all<HTMLButtonElement>('button').filter((b) => (b.textContent ?? '').trim().startsWith(text));

// ---------------------------------------------------------------------------
describe('the archive renders both populations and says which is which', () => {
	it('draws one row per document, each carrying its reason as a WORD', () => {
		const v = full();
		expect(count(v, '[data-testid="ideacad-archive-row"]')).toBe(2);
		const chips = v
			.all('[data-testid="ideacad-archive-reason"]')
			.map((c) => (c.textContent ?? '').trim());
		// Colour is never the only signal, so each chip carries the word.
		expect(chips.sort()).toEqual(
			[IDEACAD_ARCHIVE_REASON_LABELS.archived, IDEACAD_ARCHIVE_REASON_LABELS.off_roster].sort()
		);
	});

	it('puts the row that still needs a decision FIRST, whatever order the payload arrived in', () => {
		// `ideacad_archive` orders by owner address; an instructor is reading a
		// list of decisions, so the undecided one leads. The fixture's addresses
		// sort the other way round, which is what makes this measurable at all.
		const v = full({ rows: [ARCHIVED, OFF_ROSTER] });
		const reasons = v
			.all('[data-testid="ideacad-archive-row"]')
			.map((li) => li.getAttribute('data-reason'));
		expect(reasons).toEqual(['off_roster', 'archived']);
		expect(ARCHIVED.ownerEmail < OFF_ROSTER.ownerEmail).toBe(true);
	});

	it('renders the count of undecided rows, and renders it when it is ZERO', () => {
		const v = full();
		expect(v.one('[data-testid="ideacad-archive-undecided"]').textContent).toContain('1 to decide');

		const solo = mountInto(ArchivePanel as never, {
			rows: [ARCHIVED],
			sections: SECTIONS,
			onarchive: noop
		});
		try {
			// A zero is exactly when somebody reads a missing number as "it did
			// not load", so it is drawn rather than hidden.
			expect(solo.one('[data-testid="ideacad-archive-undecided"]').textContent).toContain(
				'0 to decide'
			);
		} finally {
			void solo.stop();
		}
	});

	it('an EMPTY archive says so in a sentence rather than rendering a blank panel', () => {
		const v = full({ rows: [] });
		expect(v.one('[data-testid="ideacad-archive-empty"]').textContent).toContain(
			IDEACAD_ARCHIVE_EMPTY_NOTE
		);
		expect(count(v, '[data-testid="ideacad-archive-row"]')).toBe(0);
		// The control: the same panel with rows draws no empty note.
		expect(count(full(), '[data-testid="ideacad-archive-empty"]')).toBe(0);
	});

	it('a deployment without 0214 says THAT, which is a different sentence', () => {
		const v = full({ archiveReady: false });
		expect(v.one('[data-testid="ideacad-archive-off"]').textContent).toContain(
			IDEACAD_ARCHIVE_UNAVAILABLE
		);
		// "Cannot tell" must never render as "there is nothing here": the empty
		// note and the unavailable note are never both on screen, and the list is
		// withheld rather than shown as empty.
		expect(count(v, '[data-testid="ideacad-archive-empty"]')).toBe(0);
		expect(count(v, '[data-testid="ideacad-archive-row"]')).toBe(0);
	});
});

// ---------------------------------------------------------------------------
describe('ABSENCE IS THE MECHANISM', () => {
	it('with every transport handed in: 1 Archive, 1 Restore, 1 picker, 1 Stop sharing, 2 Open', () => {
		// THE POSITIVE CONTROL for every absence below, on the same fixture.
		const v = full();
		expect({
			archive: buttonsNamed(v, 'Archive').length,
			restore: buttonsNamed(v, 'Restore').length,
			pickers: count(v, 'select'),
			stop: buttonsNamed(v, 'Stop sharing').length,
			open: buttonsNamed(v, 'Open').length,
			shareNotes: count(v, '[data-testid="ideacad-archive-share-note"]')
		}).toEqual({ archive: 1, restore: 1, pickers: 1, stop: 1, open: 2, shareNotes: 1 });
	});

	it('with NO write transports: 0 of each, and the list still renders', () => {
		const v = full({ onarchive: undefined, onshare: undefined, onunshare: undefined });
		expect({
			archive: buttonsNamed(v, 'Archive').length,
			restore: buttonsNamed(v, 'Restore').length,
			pickers: count(v, 'select'),
			stop: buttonsNamed(v, 'Stop sharing').length
		}).toEqual({ archive: 0, restore: 0, pickers: 0, stop: 0 });
		// Read-only is structural, not blank: both rows are still there to read.
		expect(count(v, '[data-testid="ideacad-archive-row"]')).toBe(2);
		expect(buttonsNamed(v, 'Open').length).toBe(2);
	});

	it('omitting onopen alone removes only Open', () => {
		const v = full({ onopen: undefined });
		expect(buttonsNamed(v, 'Open').length).toBe(0);
		expect(buttonsNamed(v, 'Archive').length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
describe('a control whose only outcome would be a refusal is not offered', () => {
	it('the share picker is absent on an UNARCHIVED row and present on an archived one', () => {
		// 0214's narrowing (b): a live document cannot be shared with a class.
		// Offering the picker would be a press the database refuses.
		const v = full({ rows: [OFF_ROSTER] });
		expect(count(v, 'select')).toBe(0);
		expect(count(v, '[data-testid="ideacad-archive-share-note"]')).toBe(0);

		const archived = mountInto(ArchivePanel as never, {
			rows: [ARCHIVED],
			sections: SECTIONS,
			onshare: noop
		});
		try {
			expect(count(archived, 'select')).toBe(1);
		} finally {
			void archived.stop();
		}
	});

	it('the picker offers only classes it is NOT already shared with', () => {
		const v = full({ rows: [ARCHIVED] });
		const options = v
			.all<HTMLOptionElement>('select option')
			.map((o) => o.value)
			.filter((value) => value !== '');
		// Period 3 already holds a grant, so only Period 5 is offered.
		expect(options).toEqual(['sec-p5']);
	});

	it('and the picker is absent entirely once every class already has it', () => {
		const everywhere: IdeacadArchiveRow = {
			...ARCHIVED,
			sharedWithSections: SECTIONS.map((s) => ({
				sectionId: s.sectionId,
				label: s.label,
				grantedBy: 'apina@boscotech.edu',
				grantedAt: '2026-09-02T16:00:00.000Z'
			}))
		};
		const v = full({ rows: [everywhere] });
		expect(count(v, 'select')).toBe(0);
		// The control: the Stop sharing rows ARE there, two of them, so the panel
		// did render the share block and simply offered no new target.
		expect(buttonsNamed(v, 'Stop sharing').length).toBe(2);
	});

	it('with no sections at all the picker is absent even on an archived row', () => {
		const v = full({ rows: [ARCHIVED], sections: [] });
		expect(count(v, 'select')).toBe(0);
	});
});

// ---------------------------------------------------------------------------
describe('what the surface says before somebody presses', () => {
	it('names the disclosure BEFORE the share control, not after it', () => {
		const v = full({ rows: [ARCHIVED] });
		const note = v.one('[data-testid="ideacad-archive-share-note"]');
		expect(note.textContent).toContain(IDEACAD_ARCHIVE_SHARE_NOTE);
		// The sentence says a whole class will see WHOSE work it is, which is the
		// half worth pinning by text: 0214 projects the owner's address
		// deliberately, so the surface is what has to say so.
		expect(IDEACAD_ARCHIVE_SHARE_NOTE).toContain('whose work it is');

		const picker = v.one('select');
		// DOM order: the sentence precedes the control it is about.
		expect(note.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('restoring is a two-step confirm that NAMES what it costs', async () => {
		const v = full({ rows: [ARCHIVED] });
		expect(buttonsNamed(v, 'Restore, and stop sharing').length).toBe(0);
		v.one<HTMLButtonElement>('button').click();
		buttonsNamed(v, 'Restore')[0].click();
		v.flush();
		const armed = buttonsNamed(v, 'Restore, and stop sharing');
		expect(armed).toHaveLength(1);
		// The real count, not a generic warning: this document is shared with one
		// class, and restoring it drops that grant in 0214's own statement.
		expect(armed[0].textContent).toContain('1 class');
		expect(buttonsNamed(v, 'Keep')).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
describe('the transports are called with what the row names', () => {
	it('Archive sends the document id and true', async () => {
		const calls: Array<[string, boolean]> = [];
		m = mountInto(ArchivePanel as never, {
			rows: [OFF_ROSTER],
			sections: SECTIONS,
			onarchive: async (id: string, on: boolean) => {
				calls.push([id, on]);
			}
		});
		buttonsNamed(m, 'Archive')[0].click();
		await m.settle();
		expect(calls).toEqual([[OFF_ROSTER.documentId, true]]);
		expect(m.one('[data-testid="ideacad-archive-done"]').textContent).toContain(
			OFF_ROSTER.ownerEmail
		);
	});

	it('a refusal is rendered VERBATIM, not re-toned', async () => {
		const sentence = 'Archive this document first. Sharing with a whole class is for archived reference work.';
		m = mountInto(ArchivePanel as never, {
			rows: [OFF_ROSTER],
			sections: SECTIONS,
			onarchive: async () => {
				throw new Error(sentence);
			}
		});
		buttonsNamed(m, 'Archive')[0].click();
		await m.settle();
		expect(m.one('[data-testid="ideacad-archive-refusal"]').textContent).toBe(sentence);
		// ...and the panel is not left disabled after a throw.
		expect(buttonsNamed(m, 'Archive')[0].getAttribute('aria-disabled')).toBe('false');
	});

	it('Stop sharing sends the document AND the section', async () => {
		const calls: Array<[string, string]> = [];
		m = mountInto(ArchivePanel as never, {
			rows: [ARCHIVED],
			sections: SECTIONS,
			onunshare: async (doc: string, section: string) => {
				calls.push([doc, section]);
			}
		});
		buttonsNamed(m, 'Stop sharing')[0].click();
		await m.settle();
		expect(calls).toEqual([[ARCHIVED.documentId, 'sec-p3']]);
	});
});

// ---------------------------------------------------------------------------
describe('the pure layer the surface reads from', () => {
	it('ideacadArchiveCanShare keys on the STAMP, not on the reason', () => {
		expect(ideacadArchiveCanShare({ archivedAt: '2026-06-04T17:20:00.000Z' })).toBe(true);
		expect(ideacadArchiveCanShare({ archivedAt: null })).toBe(false);
	});

	it('ideacadArchiveOrder does not mutate its input', () => {
		const input = [ARCHIVED, OFF_ROSTER];
		const copy = [...input];
		ideacadArchiveOrder(input);
		// Sorting the array the payload arrived in would reorder a caller's own
		// state under a reader between two unrelated renders.
		expect(input).toEqual(copy);
	});

	it('ideacadArchiveUndecided counts only the off-roster rows', () => {
		expect(ideacadArchiveUndecided([ARCHIVED, OFF_ROSTER])).toBe(1);
		expect(ideacadArchiveUndecided([ARCHIVED])).toBe(0);
		expect(ideacadArchiveUndecided([])).toBe(0);
	});

	it('ideacadArchiveShareTargets excludes what is already granted', () => {
		expect(ideacadArchiveShareTargets(ARCHIVED, SECTIONS).map((s) => s.sectionId)).toEqual([
			'sec-p5'
		]);
		expect(ideacadArchiveShareTargets(OFF_ROSTER, SECTIONS)).toHaveLength(2);
	});

	it('an unrecognised reason comes back NULL rather than reaching a renderer', () => {
		// "Cannot tell" must never read as the permissive answer, and a value no
		// branch renders must not reach the UI.
		expect(ideacadArchiveReasonFromPayload('archived')).toBe('archived');
		expect(ideacadArchiveReasonFromPayload('off_roster')).toBe('off_roster');
		for (const bad of ['deleted', '', null, undefined, 3, {}]) {
			expect(ideacadArchiveReasonFromPayload(bad)).toBeNull();
		}
	});
});
