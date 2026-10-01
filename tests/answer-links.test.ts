// tests/answer-links.test.ts
//
// LEDGER 0360: THE LINKS IN A STUDENT'S ANSWERS, AND THE ONE GATE AN ADDRESS
// PASSES TO BECOME AN `href` ON A GRADING SURFACE.
//
// THE SILENT HALF IS THE SCHEME. A `javascript:` or `data:` answer that became
// an anchor would look exactly like a working Open key and would run in the
// teacher's own session when pressed. Nothing on screen would say so, so this
// is a mutation-proven boundary rather than a harness check: every negative
// below sits beside a positive control of the same shape, and both counts are
// asserted.

import { describe, expect, it } from 'vitest';
import {
	ANSWER_LINK_CAP,
	cellLinks,
	linkHostLabel,
	linksInText,
	linksInValue,
	manifestDeclaresLink,
	openableUrl,
	presentationQueue,
	presentationUrl,
	studentLinks
} from '../src/lib/classroom/answer-links';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';
import type { ResponseRow, StudentWork } from '../src/lib/classroom/assignment-spec';
import { blockLabelsFromSpec } from '../src/lib/classroom/bulk-download';

const SLIDES = 'https://docs.google.com/presentation/d/abc123/edit?usp=sharing';
const CANVA = 'https://www.canva.com/design/DAF1/view';

describe('linksInText finds http(s) links written anywhere in an answer', () => {
	it('a Slides link in the middle of a sentence', () => {
		expect(linksInText(`My deck is ${SLIDES} if you want it`)).toEqual([SLIDES]);
	});

	it('drops the punctuation a sentence puts after a link, and an unbalanced bracket', () => {
		expect(linksInText(`See ${CANVA}.`)).toEqual([CANVA]);
		expect(linksInText(`(the deck: ${CANVA})`)).toEqual([CANVA]);
		expect(linksInText(`[${CANVA}]`)).toEqual([CANVA]);
		expect(linksInText(`${CANVA}, ${SLIDES}!`)).toEqual([CANVA, SLIDES]);
		// A BALANCED bracket is part of the address and is kept.
		expect(linksInText('https://en.wikipedia.org/wiki/Gear_(device)')).toEqual([
			'https://en.wikipedia.org/wiki/Gear_(device)'
		]);
	});

	it('finds a link inside the JSON a worksheet table stores', () => {
		const json = JSON.stringify([{ step: 'deck', where: CANVA }, { step: 'notes', where: 'none' }]);
		expect(linksInText(json)).toEqual([CANVA]);
	});

	it('dedupes, and caps at ANSWER_LINK_CAP', () => {
		expect(linksInText(`${SLIDES} ${SLIDES}`)).toEqual([SLIDES]);
		const many = Array.from({ length: 15 }, (_, i) => `https://example.org/p${i}`).join(' ');
		expect(linksInText(many)).toHaveLength(ANSWER_LINK_CAP);
	});

	it('finds NOTHING that is not http(s), and the positive control finds the one that is', () => {
		const hostile = [
			'javascript:alert(1)',
			'JaVaScRiPt:alert(1)',
			'data:text/html;base64,PHNjcmlwdD4=',
			'mailto:someone@example.org',
			'java\nscript:alert(1)',
			'file:///etc/passwd',
			'ftp://example.org/x',
			'e.g. this one',
			'3.5mm thread',
			'https://user:pw@evil.example/deck'
		];
		let found = 0;
		for (const text of hostile) found += linksInText(text).length;
		expect(found).toBe(0);
		// THE POSITIVE CONTROL, on the same function in the same run.
		expect(linksInText(`${hostile.join(' ')} ${SLIDES}`)).toEqual([SLIDES]);
	});
});

describe('openableUrl is the one gate, and it answers http or https or nothing', () => {
	it('refuses every scheme but http and https, credentials, and a missing host', () => {
		const refused = [
			'javascript:alert(1)',
			'data:text/html,<b>x</b>',
			'mailto:a@b.org',
			'vbscript:msgbox',
			'https://',
			'https://a:b@host.example/',
			'https://host.example/\u0000x',
			'',
			null,
			undefined
		];
		expect(refused.map((u) => openableUrl(u)).filter((u) => u !== null)).toEqual([]);
		// Positive control: the two schemes it exists to admit.
		expect(openableUrl(SLIDES)).toBe(SLIDES);
		expect(openableUrl('http://example.org/a')).toBe('http://example.org/a');
	});
});

describe('linksInValue reads a spec table row as well as text', () => {
	it('finds a link in a table cell (the v1 presentation hand-in collects it in a column)', () => {
		expect(
			linksInValue({ rows: [{ name: 'Deck', link: SLIDES }, { name: 'Notes', link: '' }] })
		).toEqual([SLIDES]);
		expect(linksInValue({ text: `see ${CANVA}`, rows: [{ link: SLIDES }] })).toEqual([CANVA, SLIDES]);
		expect(linksInValue(null)).toEqual([]);
		expect(linksInValue({ checked: [true] })).toEqual([]);
	});
});

describe('presentationUrl reads a declared link field forgivingly', () => {
	it('a whole link, a link inside words, and a link with the scheme left off', () => {
		expect(presentationUrl(`  ${SLIDES}  `)).toBe(SLIDES);
		expect(presentationUrl(`here: ${CANVA}`)).toBe(CANVA);
		expect(presentationUrl('canva.com/design/x')).toBe('https://canva.com/design/x');
		expect(presentationUrl('docs.google.com/presentation/d/abc')).toBe(
			'https://docs.google.com/presentation/d/abc'
		);
	});

	it('is null for words, for a bare word, and for anything hostile', () => {
		for (const text of ['', '   ', 'my slides', 'slides', 'e.g.', '3.5mm', 'javascript:alert(1)', 'not done yet']) {
			expect(presentationUrl(text), text).toBeNull();
		}
	});
});

describe('linkHostLabel names the place in a grader’s words', () => {
	it('knows the common presentation hosts and falls back to the host name', () => {
		expect(linkHostLabel(SLIDES)).toBe('Google Slides');
		expect(linkHostLabel('https://docs.google.com/document/d/x')).toBe('Google Docs');
		expect(linkHostLabel('https://drive.google.com/file/d/x')).toBe('Google Drive');
		expect(linkHostLabel(CANVA)).toBe('Canva');
		expect(linkHostLabel('https://1drv.ms/p/x')).toBe('OneDrive');
		expect(linkHostLabel('https://youtu.be/abc')).toBe('YouTube');
		expect(linkHostLabel('https://www.example.org/x')).toBe('example.org');
	});
});

// ---------------------------------------------------------------------------
// A WORKSHEET, walked through its stored manifest.
// ---------------------------------------------------------------------------

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Pitch',
	course: 'IDEA100',
	points: 10,
	header: [{ id: 'h-name', field: 'name', type: 'text' }],
	modules: [
		{
			id: 'm1',
			title: 'Deck',
			points: 10,
			blocks: [
				{ id: 'm1-link', field: 'deckLink', type: 'text', link: 'presentation', prompt: 'Link to your deck' },
				{ id: 'm1-notes', field: 'notes', type: 'longText' },
				{ id: 'm1-done', field: 'done', type: 'checkbox' }
			],
			criteria: []
		}
	]
} as unknown as HtmlAssignmentManifest;

const NO_LINK_FIELD = {
	...MANIFEST,
	modules: [{ ...MANIFEST.modules[0], blocks: MANIFEST.modules[0].blocks.slice(1) }]
} as unknown as HtmlAssignmentManifest;

const row = (email: string, block: string, text: string): ResponseRow => ({
	item_id: 'i',
	student_email: email,
	block_id: block,
	value: { text }
});

function student(email: string, name: string, responses: ResponseRow[]): StudentWork {
	return { email, displayName: name, active: true, submission: null, responses, files: [], approvals: [] };
}

const ANA = student('ana@x.net', 'Ana', [row('ana@x.net', 'm1-link', SLIDES), row('ana@x.net', 'm1-notes', `I used ${CANVA} for the images.`)]);
const BEN = student('ben@x.net', 'Ben', [row('ben@x.net', 'm1-link', 'my slides')]);
const CRUZ = student('cruz@x.net', 'Cruz', [row('cruz@x.net', 'm1-notes', `Notes only, see ${CANVA}`)]);
const DEE = student('dee@x.net', 'Dee', [row('dee@x.net', 'm1-link', 'canva.com/design/dee')]);
const ELI = student('eli@x.net', 'Eli', []);

describe('studentLinks on a worksheet', () => {
	it('declared field first, then links written in other answers, labelled by question', () => {
		const links = studentLinks(ANA, { manifest: MANIFEST });
		expect(links.map((l) => [l.label, l.url, l.host, l.declared])).toEqual([
			['Link to your deck', SLIDES, 'Google Slides', true],
			['Deck: notes', CANVA, 'Canva', false]
		]);
	});

	it('a declared field holding words is reported, with what was typed and no address', () => {
		const links = studentLinks(BEN, { manifest: MANIFEST });
		expect(links).toEqual([
			{ blockId: 'm1-link', label: 'Link to your deck', url: null, host: '', declared: true, raw: 'my slides' }
		]);
	});

	it('an empty declared field answers nothing, and a checkbox never holds a link', () => {
		expect(studentLinks(ELI, { manifest: MANIFEST })).toEqual([]);
		const cell = {
			blockId: 'm1-done',
			field: 'done',
			type: 'checkbox',
			prompt: null,
			link: null,
			value: true,
			image: null
		};
		expect(cellLinks(cell, 'Deck')).toEqual([]);
	});

	it('a block that declares a link but is not a text block declares nothing', () => {
		const bad = {
			...MANIFEST,
			modules: [
				{ ...MANIFEST.modules[0], blocks: [{ id: 'm1-x', field: 'x', type: 'longText', link: 'presentation' }] }
			]
		};
		expect(manifestDeclaresLink(bad)).toBe(false);
		expect(manifestDeclaresLink(MANIFEST)).toBe(true);
	});
});

describe('studentLinks on a spec assignment', () => {
	it('reads the stored rows, table cells included, named by module', () => {
		const spec = {
			modules: [{ id: 'mod', title: 'Presentation', blocks: [{ id: 'deck-table', type: 'table' }] }]
		};
		const work = student('f@x.net', 'F', [
			{ item_id: 'i', student_email: 'f@x.net', block_id: 'deck-table', value: { rows: [{ link: SLIDES }] } }
		]);
		const links = studentLinks(work, { labels: blockLabelsFromSpec(spec as never) });
		expect(links.map((l) => [l.label, l.url])).toEqual([['Presentation', SLIDES]]);
	});
});

describe('presentationQueue', () => {
	it('with a declared field: only that field counts, roster order kept, no-link students counted', () => {
		const q = presentationQueue([ANA, BEN, CRUZ, DEE, ELI], { manifest: MANIFEST });
		expect(q.declared).toBe(true);
		// CRUZ has a link only in his notes: a declared field is the only thing
		// that puts somebody on the projector, so he is not in the queue.
		expect(q.queue.map((e) => e.displayName)).toEqual(['Ana', 'Dee']);
		expect(q.queue[1].links[0].url).toBe('https://canva.com/design/dee');
		expect(q.missing).toBe(3);
		expect(q.notWorking).toBe(1);
		// Every link in the queue opens.
		expect(q.queue.flatMap((e) => e.links).every((l) => l.url !== null)).toBe(true);
	});

	it('with no declared field: any link in any answer counts', () => {
		const q = presentationQueue([ANA, CRUZ, ELI], { manifest: NO_LINK_FIELD });
		expect(q.declared).toBe(false);
		expect(q.queue.map((e) => e.displayName)).toEqual(['Ana', 'Cruz']);
		expect(q.missing).toBe(1);
	});

	it('carries no address in what the projector is handed', () => {
		const q = presentationQueue([ANA, DEE], { manifest: MANIFEST });
		for (const e of q.queue) {
			expect(Object.keys(e).sort()).toEqual(['displayName', 'email', 'links']);
			for (const l of e.links) expect(JSON.stringify(l)).not.toContain('@');
		}
	});
});
