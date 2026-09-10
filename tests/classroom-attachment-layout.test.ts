// tests/classroom-attachment-layout.test.ts
//
// THE PURE HALF OF 0193, in the node project with no mount: where an item's
// files and links sit, how an id list is reordered, and what a rename is
// refused for. Every helper here is called by three surfaces (the composer's
// handlers, `AttachmentList`, the item page) and by the dev harness, so a
// wrong answer would be wrong on all of them at once -- and the answers are
// the kind that fail SILENTLY: a placement dropped to the default reads as
// "the teacher never moved it", a mention the regex misses reads as "nothing
// references this file" right up to the moment a picture goes blank.
//
// EVERY EXPECTED VALUE IS WRITTEN BY HAND, never derived from the helper under
// test (CLAUDE.md, "where does the expected value come from"). The sanitized
// names in particular are worked out from `sanitizeAttachmentFilename`'s own
// four-step rule and typed here as literals, so a change to that rule reddens
// this file rather than rewriting its expectations.
//
// BOTH DIRECTIONS on every predicate: a mention that IS found sits beside one
// that must NOT be (a longer name with the same prefix, a different scheme,
// the bare filename with no `attachment:` in front of it), and every refusal
// sits beside the sibling case that is allowed.

import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ITEM_LAYOUT,
	attachmentRefMentionedIn,
	itemLayoutKnown,
	itemLayoutOf,
	placementOf,
	renameBlockedReason,
	renameCollides,
	renamedAttachmentFilename,
	reorderIds,
	sameLayout,
	sameOrder,
	withItemLayout
} from '../src/lib/classroom/attachments';

describe('placementOf drops anything outside the union to the default', () => {
	it('answers top for top and bottom for everything else', () => {
		expect(placementOf('top')).toBe('top');
		expect(placementOf('bottom')).toBe('bottom');
		// A stored value can never put a surface in a state no branch renders:
		// the preferences rule, applied to a column.
		expect(placementOf('TOP')).toBe('bottom');
		expect(placementOf('middle')).toBe('bottom');
		expect(placementOf(null)).toBe('bottom');
		expect(placementOf(undefined)).toBe('bottom');
		expect(placementOf(1)).toBe('bottom');
	});
});

describe('itemLayoutOf reads an attached layout, a raw row, or nothing', () => {
	it('reads the attached shape', () => {
		expect(itemLayoutOf({ id: 'i', layout: { files: 'top', links: 'bottom' } })).toEqual({
			files: 'top',
			links: 'bottom'
		});
	});
	it('reads a raw row carrying the two columns', () => {
		expect(itemLayoutOf({ id: 'i', files_placement: 'bottom', links_placement: 'top' })).toEqual({
			files: 'bottom',
			links: 'top'
		});
	});
	it('the attached shape wins over raw columns when both are present', () => {
		expect(
			itemLayoutOf({
				layout: { files: 'top', links: 'top' },
				files_placement: 'bottom',
				links_placement: 'bottom'
			})
		).toEqual({ files: 'top', links: 'top' });
	});
	it('answers the default for a row with neither, for null, and for a non-object', () => {
		expect(itemLayoutOf({ id: 'i', title: 'x' })).toEqual({ files: 'bottom', links: 'bottom' });
		expect(itemLayoutOf(null)).toEqual({ files: 'bottom', links: 'bottom' });
		expect(itemLayoutOf(undefined)).toEqual({ files: 'bottom', links: 'bottom' });
		expect(itemLayoutOf('top')).toEqual({ files: 'bottom', links: 'bottom' });
	});
	it('never answers a value outside the union, whatever the row carries', () => {
		expect(itemLayoutOf({ layout: { files: 'left', links: 42 } })).toEqual({
			files: 'bottom',
			links: 'bottom'
		});
		expect(itemLayoutOf({ files_placement: 'TOP', links_placement: null })).toEqual({
			files: 'bottom',
			links: 'bottom'
		});
	});
	it('answers a fresh object each time, never the frozen default itself', () => {
		const a = itemLayoutOf(null);
		expect(a).not.toBe(DEFAULT_ITEM_LAYOUT);
		a.files = 'top';
		expect(itemLayoutOf(null).files).toBe('bottom');
	});
});

describe('withItemLayout attaches only what the row actually carried', () => {
	it('attaches the layout when both columns are present', () => {
		const item = { id: 'i', title: 'Lab 3' };
		const out = withItemLayout(item, { files_placement: 'top', links_placement: 'bottom' });
		expect(out.layout).toEqual({ files: 'top', links: 'bottom' });
		// Attached onto the SAME object, which is how the item page's row
		// reaches the component without a second normalizer.
		expect(out).toBe(item);
	});
	it('attaches nothing when the row lacks a column (a pre-0193 read), and says so', () => {
		const partial = withItemLayout({ id: 'i' }, { files_placement: 'top' });
		expect('layout' in partial).toBe(false);
		expect(itemLayoutKnown(partial)).toBe(false);
		const none = withItemLayout({ id: 'i' }, null);
		expect('layout' in none).toBe(false);
		expect(itemLayoutKnown(none)).toBe(false);
	});
	it('itemLayoutKnown is true for an attached layout and for a raw row with the columns', () => {
		expect(itemLayoutKnown({ layout: { files: 'top', links: 'top' } })).toBe(true);
		expect(itemLayoutKnown({ files_placement: 'bottom', links_placement: 'bottom' })).toBe(true);
		expect(itemLayoutKnown({ id: 'i' })).toBe(false);
		expect(itemLayoutKnown(null)).toBe(false);
	});
	it('sameLayout compares both halves', () => {
		expect(sameLayout({ files: 'top', links: 'bottom' }, { files: 'top', links: 'bottom' })).toBe(true);
		expect(sameLayout({ files: 'top', links: 'bottom' }, { files: 'top', links: 'top' })).toBe(false);
		expect(sameLayout({ files: 'top', links: 'bottom' }, { files: 'bottom', links: 'bottom' })).toBe(false);
	});
});

describe('reorderIds and sameOrder', () => {
	const ids = ['a', 'b', 'c', 'd'];
	it('moves one id down and one id up', () => {
		expect(reorderIds(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
		expect(reorderIds(ids, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
	});
	it('a one-step move is what an arrow key produces', () => {
		expect(reorderIds(ids, 1, 2)).toEqual(['a', 'c', 'b', 'd']);
		expect(reorderIds(ids, 1, 0)).toEqual(['b', 'a', 'c', 'd']);
	});
	it('never mutates its input', () => {
		const before = [...ids];
		reorderIds(ids, 0, 3);
		expect(ids).toEqual(before);
	});
	it('a bad index or a no-move answers the same list, as a copy', () => {
		expect(reorderIds(ids, 0, 0)).toEqual(ids);
		expect(reorderIds(ids, -1, 2)).toEqual(ids);
		expect(reorderIds(ids, 0, 4)).toEqual(ids);
		expect(reorderIds(ids, 4, 0)).toEqual(ids);
		expect(reorderIds(ids, 0, 0)).not.toBe(ids);
	});
	it('sameOrder is exact about order and about length', () => {
		expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
		expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
		expect(sameOrder(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
		expect(sameOrder([], [])).toBe(true);
	});
});

describe('renamedAttachmentFilename is the record route rule, and blank is null', () => {
	it('answers null for nothing typed', () => {
		expect(renamedAttachmentFilename('')).toBeNull();
		expect(renamedAttachmentFilename('   ')).toBeNull();
		expect(renamedAttachmentFilename('\n\t')).toBeNull();
	});
	it('applies the four steps: runs to -, collapse, trim -, empty becomes attachment', () => {
		// Worked by hand from sanitizeAttachmentFilename: each run of whitespace
		// and ()[] becomes ONE dash, then runs of dashes collapse, then leading
		// and trailing dashes go.
		expect(renamedAttachmentFilename('Lab notes (final).pdf')).toBe('Lab-notes-final-.pdf');
		expect(renamedAttachmentFilename('  bracket v2 .sldprt  ')).toBe('bracket-v2-.sldprt');
		expect(renamedAttachmentFilename('[draft]  report')).toBe('draft-report');
		expect(renamedAttachmentFilename('a--b')).toBe('a-b');
		expect(renamedAttachmentFilename('---')).toBe('attachment');
		expect(renamedAttachmentFilename('()')).toBe('attachment');
	});
	it('leaves an already-clean name alone', () => {
		expect(renamedAttachmentFilename('figure.png')).toBe('figure.png');
		expect(renamedAttachmentFilename('IMG_0042.HEIC')).toBe('IMG_0042.HEIC');
	});
	it('caps at 300 characters before sanitizing', () => {
		const long = 'x'.repeat(320) + '.pdf';
		expect(renamedAttachmentFilename(long)).toBe('x'.repeat(300));
	});
});

describe('attachmentRefMentionedIn finds the whole reference, anywhere, case-insensitively', () => {
	it('finds a body document img src', () => {
		const doc = { type: 'doc', content: [{ type: 'img', src: 'attachment:figure.png', alt: 'x' }] };
		expect(attachmentRefMentionedIn(doc, 'figure.png')).toBe(true);
	});
	it('finds a markdown figure in a spec string, nested deep in an object', () => {
		const spec = {
			modules: [{ instructions: 'See the setup:\n\n![Setup](attachment:Setup Photo.jpg)\n' }]
		};
		expect(attachmentRefMentionedIn(spec, 'Setup Photo.jpg')).toBe(true);
	});
	it('matches case-insensitively, because the resolver does', () => {
		expect(attachmentRefMentionedIn('![a](attachment:FIGURE.PNG)', 'figure.png')).toBe(true);
		expect(attachmentRefMentionedIn({ src: 'Attachment:figure.png' }, 'Figure.PNG')).toBe(true);
	});
	it('does NOT match a longer name with the same prefix, nor the bare name, nor another scheme', () => {
		// The negative controls: each of these would be a false "referenced"
		// that blocks a rename nobody needed to block.
		expect(attachmentRefMentionedIn('![a](attachment:figure.png2)', 'figure.png')).toBe(false);
		expect(attachmentRefMentionedIn('![a](attachment:figure.png.bak)', 'figure.png')).toBe(false);
		expect(attachmentRefMentionedIn('the file figure.png is attached', 'figure.png')).toBe(false);
		expect(attachmentRefMentionedIn('![a](https://x.test/figure.png)', 'figure.png')).toBe(false);
		expect(attachmentRefMentionedIn({ src: 'attachment:other.png' }, 'figure.png')).toBe(false);
	});
	it('treats the filename as literal text, not a pattern', () => {
		// A dot in the name must not match any character; a name with a
		// bracket must not be a character class.
		expect(attachmentRefMentionedIn('attachment:figureXpng', 'figure.png')).toBe(false);
		expect(attachmentRefMentionedIn('attachment:part[1].png', 'part[1].png')).toBe(true);
	});
	it('accepts the reference at the end of a sentence, before a bracket or a quote', () => {
		expect(attachmentRefMentionedIn('src is attachment:figure.png.', 'figure.png')).toBe(false);
		expect(attachmentRefMentionedIn('src is attachment:figure.png', 'figure.png')).toBe(true);
		expect(attachmentRefMentionedIn('(attachment:figure.png)', 'figure.png')).toBe(true);
		expect(attachmentRefMentionedIn('"attachment:figure.png"', 'figure.png')).toBe(true);
		expect(attachmentRefMentionedIn('attachment:figure.png, then', 'figure.png')).toBe(true);
	});
	it('survives a cyclic object and answers false for nothing', () => {
		const cyc: Record<string, unknown> = { a: 'no mention' };
		cyc.self = cyc;
		expect(attachmentRefMentionedIn(cyc, 'figure.png')).toBe(false);
		expect(attachmentRefMentionedIn(null, 'figure.png')).toBe(false);
		expect(attachmentRefMentionedIn('attachment:figure.png', '')).toBe(false);
		expect(attachmentRefMentionedIn('attachment:figure.png', '   ')).toBe(false);
	});
});

describe('renameBlockedReason and renameCollides', () => {
	const body = { type: 'doc', content: [{ type: 'img', src: 'attachment:figure.png' }] };
	const spec = { instructions: 'Read ![d](attachment:diagram.jpg) first.' };

	it('answers referenced when any document mentions the file, null otherwise', () => {
		expect(renameBlockedReason('figure.png', { referencedIn: [body, spec] })).toBe('referenced');
		expect(renameBlockedReason('diagram.jpg', { referencedIn: [body, spec] })).toBe('referenced');
		expect(renameBlockedReason('notes.pdf', { referencedIn: [body, spec] })).toBeNull();
		// Absent and empty documents are ordinary (a new item, no spec).
		expect(renameBlockedReason('figure.png', { referencedIn: [null, undefined] })).toBeNull();
		expect(renameBlockedReason('figure.png', {})).toBeNull();
	});

	it('renameCollides is case-insensitive and ignores the row itself', () => {
		const siblings = ['notes.pdf', 'Figure.PNG', 'bracket.sldprt'];
		expect(renameCollides('figure.png', siblings)).toBe(true);
		expect(renameCollides(' FIGURE.png ', siblings)).toBe(true);
		expect(renameCollides('figure2.png', siblings)).toBe(false);
		// Renaming a row to its own current name is not a collision with itself.
		expect(renameCollides('Figure.PNG', siblings, 'Figure.PNG')).toBe(false);
		// ...but the self exclusion is by exact string, so a DIFFERENT row that
		// merely matches case-insensitively is still a collision.
		expect(renameCollides('figure.png', siblings, 'notes.pdf')).toBe(true);
	});
});
