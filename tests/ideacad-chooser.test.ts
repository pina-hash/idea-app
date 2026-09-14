// tests/ideacad-chooser.test.ts
//
// THE CHOOSER'S PURE LAYER: what a card says, how the list is ordered and
// narrowed, and what a refusal reads. No browser, no database.
//
// WHY THESE FIVE ARE AUTOMATED AND THE REST OF THE SCREEN IS NOT. Every
// guarantee below regresses SILENTLY -- it keeps rendering, it looks right, and
// the only symptom is somebody acting on a wrong answer:
//
//   * A REFUSAL THAT SAYS SOMETHING OTHER THAN WHAT THE SERVER SAID. This is
//     the measured one. A chooser reported "This document could not be opened"
//     over the database's "Only a student enrolled in this class can work on
//     this assignment", and the two point at completely different next actions.
//     A generalised sentence is indistinguishable on screen from a correctly
//     reported one, so nobody finds out the real message was dropped.
//   * A LIST THAT RESHUFFLES BETWEEN TWO RENDERS. Thirty documents on one
//     assignment share a title EXACTLY, because the title is the assignment's;
//     a comparator with no tie break leaves their order to the engine.
//   * AN OWNER LINE ON THE WRONG ROWS. Dropped from somebody else's work, a
//     manager's list is thirty identical cards. Added to your own, it is thirty
//     rows of noise. Both directions are asserted.
//   * A FILTER COUNT TAKEN OVER THE NARROWED LIST. Plausible numbers that are
//     wrong; nothing on screen contradicts them.
//   * A THUMBNAIL DRAWN FROM A TREE THAT WAS NOT READ. A picture of a part
//     nobody is going to get.
//
// WHERE THE EXPECTED VALUES COME FROM. The ordering cases use fixtures built to
// TIE on the field being sorted, so the tie break is the only thing that can
// separate them; the refusal cases use sentences this module cannot produce.
// Nothing here is derived from the implementation's own rule.

import { describe, expect, it } from 'vitest';
import {
	IDEACAD_CHOOSER_CONTROLS_AT,
	IDEACAD_CHOOSER_FILTERS,
	IDEACAD_CHOOSER_FILTER_LABELS,
	IDEACAD_CHOOSER_SORTS,
	IDEACAD_CHOOSER_SORT_LABELS,
	ideaCadChooserArchiveConfirm,
	ideaCadChooserEmptyNote,
	ideaCadChooserFilterFrom,
	ideaCadChooserRestoreConfirm,
	ideaCadChooserRows,
	ideaCadChooserSortFrom,
	ideaCadEditedLabel,
	ideaCadOpenRefusal,
	ideaCadOwnerLabel,
	ideaCadProfileSketch,
	ideaCadThumbnailPoints,
	type IdeaCadDocumentSummary
} from '../src/lib/ideacad/app/types';
import { profilePolyline } from '../src/lib/ideacad/ui/feature-model';
import { bladeWorkspace } from '../src/lib/ideacad/blade/workspace';

const doc = (over: Partial<IdeaCadDocumentSummary> & { id: string }): IdeaCadDocumentSummary => ({
	itemId: 'item-1',
	title: 'Competition blade study',
	updatedAt: '2026-09-14T12:00:00Z',
	ownerEmail: 'reyes.ana@boscotech.net',
	isOwn: false,
	archivedAt: null,
	conceptCount: 2,
	profile: null,
	canArchive: false,
	...over
});

describe('the chooser reports the REAL reason a document did not open', () => {
	// The sentence `0201` actually raises. It must survive byte for byte.
	const enrolled = 'Only a student enrolled in this class can work on this assignment.';

	it('hands back an Error message verbatim, with nothing added and nothing removed', () => {
		expect(ideaCadOpenRefusal(new Error(enrolled))).toBe(enrolled);
	});

	it('hands back a bare string and a PostgrestError-shaped object the same way', () => {
		expect(ideaCadOpenRefusal(enrolled)).toBe(enrolled);
		expect(ideaCadOpenRefusal({ message: enrolled, code: 'P0001' })).toBe(enrolled);
	});

	it('keeps `details` and `hint`, which is where a permission failure puts the useful half', () => {
		const said = ideaCadOpenRefusal({
			message: 'permission denied for function ideacad_open_shared_document',
			details: 'The grant was revoked.',
			hint: 'Ask the owner to share it again.'
		});
		expect(said).toContain('permission denied for function ideacad_open_shared_document');
		expect(said).toContain('The grant was revoked.');
		expect(said).toContain('Ask the owner to share it again.');
	});

	it('never repeats a detail that is identical to the message', () => {
		expect(ideaCadOpenRefusal({ message: enrolled, details: enrolled })).toBe(enrolled);
	});

	// THE NEGATIVE CONTROL FOR THE WHOLE FILE. A failure carrying no text must
	// SAY it carried no text -- and must never be described with a sentence that
	// a real refusal could also produce, or the two become indistinguishable.
	it('says a textless failure was textless, and names the code when there is one', () => {
		const coded = ideaCadOpenRefusal({ code: 'PGRST202' });
		expect(coded).toContain('PGRST202');
		expect(coded).toContain('no message');
		const blank = ideaCadOpenRefusal({});
		expect(blank).toContain('no reason at all');
		// Neither fallback may be reachable when a message exists.
		expect(blank).not.toBe(ideaCadOpenRefusal(new Error(enrolled)));
		expect(coded).not.toBe(blank);
	});

	it('does not swallow a message just because a code came with it', () => {
		expect(ideaCadOpenRefusal({ message: enrolled, code: 'PGRST202' })).toBe(enrolled);
	});

	it('treats whitespace as no message, rather than reporting an empty refusal', () => {
		// An empty string renders as NOTHING beside `{#if refusal}`, which is a
		// press that silently does nothing -- the worst of the three outcomes.
		expect(ideaCadOpenRefusal(new Error('   ')).trim()).not.toBe('');
	});
});

describe('the list is ordered totally, so two renders cannot disagree', () => {
	it('breaks a tie on the document id when every sorted field is identical', () => {
		// Built to TIE: one title, one stamp, one owner. Only the tie break can
		// separate these, so a comparator that lost it reddens here and nowhere else.
		const tied = [doc({ id: 'c' }), doc({ id: 'a' }), doc({ id: 'b' })];
		for (const sort of IDEACAD_CHOOSER_SORTS) {
			const ids = ideaCadChooserRows(tied, { sort }).rows.map((r) => r.id);
			expect(ids, sort).toEqual(['a', 'b', 'c']);
			// And the same input sorted twice answers the same way.
			expect(ideaCadChooserRows(tied, { sort }).rows.map((r) => r.id), sort).toEqual(ids);
		}
	});

	it('sorts recent newest-first, name alphabetically and owner by address', () => {
		const rows = [
			doc({ id: '1', title: 'Zeta', updatedAt: '2026-09-01T00:00:00Z', ownerEmail: 'z@x.net' }),
			doc({ id: '2', title: 'Alpha', updatedAt: '2026-09-14T00:00:00Z', ownerEmail: 'm@x.net' }),
			doc({ id: '3', title: 'Mid', updatedAt: '2026-09-07T00:00:00Z', ownerEmail: 'a@x.net' })
		];
		expect(ideaCadChooserRows(rows, { sort: 'recent' }).rows.map((r) => r.id)).toEqual(['2', '3', '1']);
		expect(ideaCadChooserRows(rows, { sort: 'name' }).rows.map((r) => r.id)).toEqual(['2', '3', '1']);
		expect(ideaCadChooserRows(rows, { sort: 'owner' }).rows.map((r) => r.id)).toEqual(['3', '2', '1']);
	});

	it('is case- and whitespace-insensitive about an owner address', () => {
		const rows = [
			doc({ id: '1', ownerEmail: ' B@x.net ' }),
			doc({ id: '2', ownerEmail: 'a@X.NET' })
		];
		expect(ideaCadChooserRows(rows, { sort: 'owner' }).rows.map((r) => r.id)).toEqual(['2', '1']);
	});

	it('sorts a COPY, leaving the caller’s own array where it was', () => {
		// Sorting in place reorders a Svelte 5 list under a reader mid-render.
		const rows = [doc({ id: 'b', updatedAt: '2026-09-01T00:00:00Z' }), doc({ id: 'a' })];
		const before = rows.map((r) => r.id);
		ideaCadChooserRows(rows, { sort: 'recent' });
		expect(rows.map((r) => r.id)).toEqual(before);
	});

	it('puts an unparseable stamp last rather than throwing the ordering away', () => {
		const rows = [doc({ id: 'bad', updatedAt: 'not a date' }), doc({ id: 'good' })];
		expect(ideaCadChooserRows(rows, { sort: 'recent' }).rows.map((r) => r.id)).toEqual(['good', 'bad']);
	});
});

describe('narrowing, and the counts beside it', () => {
	const population = [
		doc({ id: 'mine-live', isOwn: true, ownerEmail: 'you@boscotech.net' }),
		doc({ id: 'mine-archived', isOwn: true, ownerEmail: 'you@boscotech.net', archivedAt: '2026-09-10T00:00:00Z' }),
		doc({ id: 'theirs-live', ownerEmail: 'ana@boscotech.net' }),
		doc({ id: 'theirs-archived', ownerEmail: 'dayo@boscotech.net', archivedAt: '2026-09-11T00:00:00Z' })
	];

	it('gives each filter the rows it names, and `all` keeps the archived ones', () => {
		const of = (filter: (typeof IDEACAD_CHOOSER_FILTERS)[number]) =>
			ideaCadChooserRows(population, { filter }).rows.map((r) => r.id).sort();
		expect(of('all')).toEqual(['mine-archived', 'mine-live', 'theirs-archived', 'theirs-live']);
		expect(of('mine')).toEqual(['mine-archived', 'mine-live']);
		expect(of('shared')).toEqual(['theirs-archived', 'theirs-live']);
		expect(of('archived')).toEqual(['mine-archived', 'theirs-archived']);
	});

	it('counts over the WHOLE list, never over the narrowed one', () => {
		// The mutation this catches: computing counts after the filter, which
		// leaves every inactive tab reading 0 and looks entirely plausible.
		const narrowed = ideaCadChooserRows(population, { filter: 'mine' });
		expect(narrowed.rows).toHaveLength(2);
		expect(narrowed.counts).toEqual({ all: 4, mine: 2, shared: 2, archived: 2 });
		// And the counts do not move when a search narrows further.
		expect(ideaCadChooserRows(population, { query: 'nothing matches this' }).counts).toEqual({
			all: 4,
			mine: 2,
			shared: 2,
			archived: 2
		});
	});

	it('reports how many the narrowing removed, zero included', () => {
		expect(ideaCadChooserRows(population).hidden).toBe(0);
		expect(ideaCadChooserRows(population, { filter: 'mine' }).hidden).toBe(2);
	});

	it('searches the title and the owner, and not the document id', () => {
		const by = (query: string) => ideaCadChooserRows(population, { query }).rows.map((r) => r.id);
		expect(by('ana@')).toEqual(['theirs-live']);
		expect(by('COMPETITION')).toHaveLength(4);
		// A stray paste of a uuid must not silently narrow the list to one row.
		expect(by('mine-live')).toEqual([]);
	});

	it('draws the controls only once there are enough rows to need them', () => {
		const many = Array.from({ length: IDEACAD_CHOOSER_CONTROLS_AT }, (_, i) => doc({ id: `d${i}` }));
		expect(ideaCadChooserRows(many).showControls).toBe(true);
		expect(ideaCadChooserRows(many.slice(1)).showControls).toBe(false);
	});

	it('says so when a narrowing emptied the list, and says nothing when there was nothing', () => {
		expect(ideaCadChooserEmptyNote(ideaCadChooserRows(population, { query: 'zzz' }))).not.toBe('');
		expect(ideaCadChooserEmptyNote(ideaCadChooserRows(population))).toBe('');
		// An empty ACCOUNT is a different screen and must not read as a bad search.
		expect(ideaCadChooserEmptyNote(ideaCadChooserRows([]))).toBe('');
	});

	it('drops a stored filter or sort the union does not name, rather than coercing it', () => {
		expect(ideaCadChooserFilterFrom('archived')).toBe('archived');
		expect(ideaCadChooserFilterFrom('everything')).toBe('all');
		expect(ideaCadChooserFilterFrom(null)).toBe('all');
		expect(ideaCadChooserSortFrom('owner')).toBe('owner');
		expect(ideaCadChooserSortFrom(7)).toBe('recent');
	});

	it('has a word for every filter and every sort, so no control renders blank', () => {
		for (const key of IDEACAD_CHOOSER_FILTERS) expect(IDEACAD_CHOOSER_FILTER_LABELS[key]).toBeTruthy();
		for (const key of IDEACAD_CHOOSER_SORTS) expect(IDEACAD_CHOOSER_SORT_LABELS[key]).toBeTruthy();
	});
});

describe('what a card says about whose work it is', () => {
	it('names somebody else and says NOTHING about you', () => {
		// Both directions. The first is what makes a manager's list readable;
		// the second is what keeps a student's list from being thirty of their
		// own address.
		expect(ideaCadOwnerLabel(doc({ id: 'x', isOwn: false, ownerEmail: 'Ana@Boscotech.net' }))).toBe(
			'ana@boscotech.net'
		);
		expect(ideaCadOwnerLabel(doc({ id: 'x', isOwn: true, ownerEmail: 'you@boscotech.net' }))).toBeNull();
	});

	it('renders nothing rather than an empty label when the address is missing', () => {
		expect(ideaCadOwnerLabel(doc({ id: 'x', isOwn: false, ownerEmail: '   ' }))).toBeNull();
	});

	it('reads a stamp in the reader’s words and falls back to a date, never to nothing', () => {
		const now = Date.parse('2026-09-14T12:00:00Z');
		const ago = (ms: number) => ideaCadEditedLabel(new Date(now - ms).toISOString(), now);
		expect(ago(10_000)).toBe('just now');
		expect(ago(60_000)).toBe('1 minute ago');
		expect(ago(25 * 60_000)).toBe('25 minutes ago');
		expect(ago(3 * 3_600_000)).toBe('3 hours ago');
		expect(ago(26 * 3_600_000)).toBe('yesterday');
		expect(ago(4 * 24 * 3_600_000)).toBe('4 days ago');
		// Past a week the calendar date is more use than a growing day count.
		expect(ago(40 * 24 * 3_600_000)).not.toContain('days ago');
		expect(ago(40 * 24 * 3_600_000)).not.toBe('');
	});

	it('reads a stamp slightly in the future as now, rather than as nonsense', () => {
		// Clock skew between the server that stamped the row and the browser.
		const now = Date.parse('2026-09-14T12:00:00Z');
		expect(ideaCadEditedLabel(new Date(now + 4000).toISOString(), now)).toBe('just now');
	});

	it('answers the empty string for an unparseable stamp, so the caller draws no line', () => {
		expect(ideaCadEditedLabel('not a date', Date.now())).toBe('');
	});
});

describe('the archive confirmation says what will happen', () => {
	const row = doc({ id: 'x', ownerEmail: 'Ana@Boscotech.net', title: 'Blade study', conceptCount: 3 });

	it('names the owner, the document and the real count, and says nothing is deleted', () => {
		const said = ideaCadChooserArchiveConfirm(row);
		expect(said).toContain('ana@boscotech.net');
		expect(said).toContain('Blade study');
		expect(said).toContain('3 concepts');
		// Decision 29: archived, never deleted. A confirm that implied otherwise
		// would be asking somebody to agree to something that does not happen.
		expect(said).toContain('Nothing is deleted');
	});

	it('counts one concept in the singular', () => {
		expect(ideaCadChooserArchiveConfirm({ ...row, conceptCount: 1 })).toContain('1 concept');
		expect(ideaCadChooserArchiveConfirm({ ...row, conceptCount: 1 })).not.toContain('1 concepts');
	});

	it('warns that restoring drops the class shares, which is the half that is NOT reversible', () => {
		// `0214`'s own comment: restoring deletes the section grants and
		// re-archiving does not bring them back. Nothing else tells a reader.
		expect(ideaCadChooserRestoreConfirm(row)).toContain('loses access');
		expect(ideaCadChooserRestoreConfirm(row)).toContain('does not bring that back');
	});
});

describe('the thumbnail is read off the stored tree, and judges nothing', () => {
	const real = bladeWorkspace.defaultContext.config.defaultFeatures as unknown;

	it('reads the real default tree a new document starts on', () => {
		// The fixture is what the PRODUCER emits. A hand-written station list
		// would exercise a shape nothing stores.
		const sketch = ideaCadProfileSketch(real);
		expect(sketch).not.toBeNull();
		expect(sketch!.stations.length).toBeGreaterThanOrEqual(2);
		expect(sketch!.bladeCount).toBeGreaterThan(0);
	});

	it('projects through `profilePolyline` rather than through a second copy of it', () => {
		// A thumbnail that drifted from the editor's own preview would draw the
		// same part two ways on two screens, with nothing able to compare them.
		const sketch = ideaCadProfileSketch(real)!;
		expect(ideaCadThumbnailPoints(sketch, 64, 84)).toBe(
			profilePolyline(sketch.stations, 64, 84, 4).points
		);
	});

	it('answers null for everything it cannot read, rather than drawing a wrong part', () => {
		expect(ideaCadProfileSketch(null)).toBeNull();
		expect(ideaCadProfileSketch('a string')).toBeNull();
		expect(ideaCadProfileSketch({})).toBeNull();
		expect(ideaCadProfileSketch({ features: 'not an array' })).toBeNull();
		expect(ideaCadProfileSketch({ features: [{ type: 'hexBoss' }] })).toBeNull();
		expect(ideaCadProfileSketch({ features: [{ type: 'revolve', stations: 'no' }] })).toBeNull();
		// A station whose numbers are not numbers, and one that is not finite.
		expect(
			ideaCadProfileSketch({ features: [{ type: 'revolve', stations: [{ r: '1', z: 0 }, { r: 2, z: 1 }] }] })
		).toBeNull();
		expect(
			ideaCadProfileSketch({ features: [{ type: 'revolve', stations: [{ r: NaN, z: 0 }, { r: 2, z: 1 }] }] })
		).toBeNull();
		// One point is a dot, which says nothing about a shape.
		expect(ideaCadProfileSketch({ features: [{ type: 'revolve', stations: [{ r: 1, z: 0 }] }] })).toBeNull();
	});

	it('reads a tree with no pattern as zero blades rather than refusing it', () => {
		const sketch = ideaCadProfileSketch({
			features: [{ type: 'revolve', stations: [{ r: 0, z: 0 }, { r: 1, z: 2 }] }]
		});
		expect(sketch).not.toBeNull();
		expect(sketch!.bladeCount).toBe(0);
	});
});
