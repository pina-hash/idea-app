// tests/html-assignment-reupload.test.ts
//
// THE RULES THAT DECIDE WHETHER REPLACING A PORTED DOCUMENT IS SAFE, put to
// values with no database and no browser in the room. The DATABASE half -- the
// real counts, the real orphaning, the three shapes end to end -- is
// `tests/db/html-assignment-revision.test.ts`; this is the half that has to
// hold for inputs a database fixture cannot conveniently produce: a stored
// manifest that is not a manifest, a counter that throws, a header block
// renamed on its own.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. A block id is the join key for
// every stored answer, so a diff that quietly answered "nothing removed" for a
// manifest it could not read would hand a teacher a green light and orphan a
// term of work with no error anywhere. That regression is SILENT, which is this
// repository's whole bar for an automated test.
//
// WHERE THE EXPECTED VALUES COME FROM. The manifests are typed out here and the
// expected id sets are read off them by eye, never computed by the function
// under test. The counter is a stub whose return value this file chooses, so
// the sentences asserted are a pure function of numbers this file picked.

import { describe, expect, it } from 'vitest';
import {
	assessHtmlReupload,
	htmlManifestDiff,
	HTML_REUPLOAD_HELD,
	type CountHtmlOrphans
} from '../src/lib/classroom/html-assignment/store';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';

function manifest(
	moduleIds: string[],
	headerIds: string[] = ['who']
): HtmlAssignmentManifest {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bench setup',
		course: 'IDEA100',
		points: moduleIds.length * 2,
		header: headerIds.map((id, i) => ({ id, field: `h${i + 1}`, type: 'text' as const })),
		modules: moduleIds.map((id, i) => ({
			id: `m${i + 1}`,
			title: `Step ${i + 1}`,
			points: 2,
			audience: 'individual' as const,
			blocks: [{ id, field: `f${i + 1}`, type: 'longText' as const, minSentences: 1 }],
			criteria: []
		}))
	} as HtmlAssignmentManifest;
}

/** A counter answering whatever this file decides, so every sentence below is
    a pure function of numbers typed out here. */
const counting = (responses: number, files = 0): CountHtmlOrphans => async () => ({
	ok: true,
	responses,
	files
});

describe('htmlManifestDiff', () => {
	it('splits the ids three ways, header included', () => {
		const diff = htmlManifestDiff(manifest(['a', 'b']), manifest(['b', 'c']));
		expect(diff).not.toBeNull();
		// `who` is the header block and is in BOTH, which is the whole reason the
		// walk goes through `manifestBlocks` rather than over `modules` alone: a
		// student's name is an answer stored under a block id like any other.
		expect(diff!.kept.sort()).toEqual(['b', 'who']);
		expect(diff!.removed).toEqual(['a']);
		expect(diff!.added).toEqual(['c']);
	});

	it('sees a renamed HEADER block, which a modules-only walk would miss', () => {
		const diff = htmlManifestDiff(manifest(['a'], ['who']), manifest(['a'], ['student-name']));
		expect(diff!.removed).toEqual(['who']);
		expect(diff!.added).toEqual(['student-name']);
		expect(diff!.kept).toEqual(['a']);
	});

	it('answers NULL for a stored manifest it cannot walk, never an empty diff', () => {
		// AN EMPTY DIFF WOULD READ AS "NOTHING AT RISK" on exactly the input
		// where nothing is known. Each of these is a shape jsonb can really hold.
		for (const bad of [
			null,
			undefined,
			'a string',
			42,
			{ modules: 'not an array' },
			{ header: 'not an array' },
			{ modules: [null] },
			{ modules: [{ blocks: 'not an array' }] },
			{ modules: [{ blocks: [{ field: 'no id' }] }] },
			{ modules: [{ blocks: [{ id: 7 }] }] }
		]) {
			expect(htmlManifestDiff(bad, manifest(['a']))).toBeNull();
		}
		// THE POSITIVE CONTROL. Without it, a function that returned null for
		// everything would pass all ten assertions above.
		expect(htmlManifestDiff(manifest(['a']), manifest(['a']))).not.toBeNull();
	});

	it('treats a manifest with no modules key as one with no module blocks', () => {
		// A legal shape: `header` alone. It is not unreadable, it simply has
		// nothing under `modules`, and answering null for it would demand a
		// confirmation for a document where the header IS the whole diff.
		const diff = htmlManifestDiff({ header: [{ id: 'who', field: 'n' }] }, manifest(['a']));
		expect(diff).not.toBeNull();
		expect(diff!.kept).toEqual(['who']);
		expect(diff!.removed).toEqual([]);
		expect(diff!.added).toEqual(['a']);
	});
});

describe('assessHtmlReupload', () => {
	it('asks for nothing when every id survives', async () => {
		const risk = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a', 'b']), counting(99));
		expect(risk.needsConfirmation).toBe(false);
		expect(risk.confirmLabel).toBeNull();
		// THE COUNTER IS NOT EVEN ASKED when nothing is removed -- which is why
		// it is stubbed at 99 here. A 99 appearing in the counts would mean the
		// no-removal branch had gone and asked about an empty id list.
		expect(risk.counts).toEqual({ responses: 0, files: 0 });
		expect(risk.lines.join(' ')).toContain('No answer block is dropped');
	});

	it('asks for nothing when a dropped block has no work under it', async () => {
		// A GUARD THAT FIRES WHEN NOTHING IS WRONG is a guard people learn to
		// click through, which costs the one case it exists for. A block nobody
		// answered is named and waved through.
		const risk = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), counting(0));
		expect(risk.needsConfirmation).toBe(false);
		expect(risk.confirmLabel).toBeNull();
		expect(risk.lines.join(' ')).toContain('No student answer is stored under it');
	});

	it('names the real count in the confirmation, and never a vague warning', async () => {
		const risk = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), counting(12));
		expect(risk.needsConfirmation).toBe(true);
		expect(risk.confirmLabel).toBe('Replace the document and orphan 12 answers');
		const text = risk.lines.join(' ');
		expect(text).toContain('12 answers are stored under that block');
		// IT SAYS WHAT ACTUALLY HAPPENS TO THEM, because "will be lost" is wrong
		// -- nothing is deleted -- and a teacher who believes the rows are gone
		// will not think to put the id back.
		expect(text).toContain('does not delete them');
		expect(text).toContain('SAME block ids');
	});

	it('counts uploaded files beside answers, as two figures', async () => {
		// A DROPPED IMAGE BLOCK ORPHANS A PHOTOGRAPH. Counting responses alone
		// would understate the loss on the one block type where the work is
		// hardest to redo.
		const risk = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), counting(2, 5));
		expect(risk.counts).toEqual({ responses: 2, files: 5 });
		expect(risk.confirmLabel).toBe('Replace the document and orphan 2 answers and 5 uploaded files');
		// FILES ALONE still holds the post: a photograph is work.
		const filesOnly = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), counting(0, 1));
		expect(filesOnly.needsConfirmation).toBe(true);
		expect(filesOnly.confirmLabel).toBe('Replace the document and orphan 1 uploaded file');
	});

	it('reads the singular correctly, so the sentence is not obviously machine-made', async () => {
		const risk = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), counting(1));
		expect(risk.confirmLabel).toBe('Replace the document and orphan 1 answer');
		expect(risk.lines.join(' ')).toContain('1 answer is stored under that block');
	});

	it('FAILS CLOSED on a stored manifest it cannot read', async () => {
		// "Cannot tell" must never render as "nothing at risk". The counter here
		// would answer zero, and it must not be what decides.
		const risk = await assessHtmlReupload('i', 'not a manifest', manifest(['a']), counting(0));
		expect(risk.diff).toBeNull();
		expect(risk.counts).toBeNull();
		expect(risk.needsConfirmation).toBe(true);
		expect(risk.confirmLabel).toBe('Replace the document without knowing what it orphans');
	});

	it('FAILS CLOSED when the count is refused, when it throws, and when there is no counter', async () => {
		const refused = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), async () => ({
			ok: false,
			message: 'permission denied'
		}));
		expect(refused.needsConfirmation).toBe(true);
		expect(refused.counts).toBeNull();
		// THE REFUSAL'S OWN WORDS RIDE ALONG, so a teacher reading "could not be
		// counted" has something to tell an admin.
		expect(refused.lines.join(' ')).toContain('permission denied');

		const threw = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), async () => {
			throw new Error('the network went away');
		});
		expect(threw.needsConfirmation).toBe(true);
		expect(threw.counts).toBeNull();
		expect(threw.lines.join(' ')).toContain('the network went away');

		const absent = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), null);
		expect(absent.needsConfirmation).toBe(true);
		expect(absent.counts).toBeNull();

		// THE POSITIVE CONTROL for all three: the same manifests with a working
		// counter reporting zero DO go through, so `needsConfirmation` is not
		// simply always true once a block is removed.
		const fine = await assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), counting(0));
		expect(fine.needsConfirmation).toBe(false);
	});

	it('never renders an empty report', async () => {
		// Every branch says SOMETHING. A panel that held the post and printed
		// nothing would be the silence this whole gate exists to end.
		const cases = await Promise.all([
			assessHtmlReupload('i', manifest(['a']), manifest(['a']), counting(0)),
			assessHtmlReupload('i', manifest(['a', 'b']), manifest(['a']), counting(3)),
			assessHtmlReupload('i', manifest(['a']), manifest(['a', 'b']), counting(0)),
			assessHtmlReupload('i', {}, manifest(['a']), counting(0)),
			assessHtmlReupload('i', 'broken', manifest(['a']), counting(0))
		]);
		expect(cases).toHaveLength(5);
		for (const c of cases) {
			expect(c.lines.length).toBeGreaterThan(0);
			for (const line of c.lines) expect(line.trim().length).toBeGreaterThan(0);
		}
	});

	it('has one held sentence, and it is a sentence rather than a shrug', () => {
		expect(HTML_REUPLOAD_HELD).toContain('not posted yet');
		expect(HTML_REUPLOAD_HELD.length).toBeGreaterThan(20);
	});

	it('lists at most six ids inline and counts the rest', async () => {
		// A worksheet can drop a whole module. A sentence listing forty ids is
		// one nobody finishes reading, and the ids are a diagnostic rather than
		// the decision -- the COUNT is the decision.
		// NINE module blocks, eight of them dropped: six named, two counted.
		const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
		const risk = await assessHtmlReupload('x', manifest(many), manifest(['a']), counting(4));
		expect(risk.diff!.removed).toHaveLength(8);
		const text = risk.lines.join(' ');
		expect(text).toContain('8 answer blocks in the document on this assignment are not in the new one');
		expect(text).toContain('and 2 more');
		// The last two are counted, not named.
		expect(text).not.toContain('h,');
		expect(text).not.toContain(', i)');
	});
});
