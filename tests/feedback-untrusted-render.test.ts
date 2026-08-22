// tests/feedback-untrusted-render.test.ts
//
// THE FEEDBACK QUEUE NOW RENDERS TEXT FROM ANYONE WITH THE URL.
//
// WHY THIS FILE EXISTS SEPARATELY FROM THE REPO'S GENERAL ANSWER. The general
// answer is real and it is stronger than escaping: there is no `{@html}` in the
// note or item-body path, a typed document is stored, and the renderer walks it
// into real Svelte elements. tests/classroom-figures.test.ts proved the prose
// path emits no elements it was not asked for.
//
// None of that is a proof ABOUT THIS SURFACE. The feedback console renders a
// plain string column, not a typed document; it is reached by no rich-text
// renderer and no sanitizer; and since 0126 that string can be written by
// anybody who can reach the site, with no account, straight into a screen only
// admins see. A public write feeding an admin screen is the exact shape the
// escaping property exists to defeat, so it is asserted here rather than
// inherited by argument.
//
// HOW IT IS COUNTED, and why it is counted this way. Slicing the message out of
// the markup and counting tags inside the slice is the obvious instrument and
// it is the wrong one: a fixture containing the surrounding close tag ends the
// slice early, so the count comes back zero for the one payload that got out.
// Instead every case is rendered TWICE -- once with the hostile string, once
// with a benign one -- and the element counts of the two whole documents are
// compared. The chrome is identical, so any difference is markup the fixture
// introduced, wherever in the page it landed.
//
// AND THE INSTRUMENT IS PROVEN BEFORE ANY CLEAN RESULT IS READ. The same
// counter is run over each hostile fixture AS RAW MARKUP, and the test states
// that non-zero total: a fixture that parses to nothing would make every zero
// below vacuous, which is exactly how a scan comes back clean and nobody
// investigates.
//
// NO DOM. `environment: 'node'` with `svelte/server`'s `render()`, the
// classroom-figures.test.ts convention: the assertion is on the REAL SSR markup
// an admin's browser receives, from the REAL shipped component.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FeedbackConsole from '../src/lib/classroom/FeedbackConsole.svelte';
import { feedbackJson, feedbackMarkdown } from '../src/lib/feedback/console';
import type { FeedbackRow } from '../src/lib/feedback/feedback';

const ROOT = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), 'utf8').replace(/\r\n/g, '\n');

/**
 * Every element-open tag in a string.
 *
 * Deliberately a permissive regex rather than a parse, for the same reason
 * countImgs is one in classroom-figures.test.ts: it counts `<b>`, `<B >` and
 * `< img src=x>` alike, so markup in a shape a strict parser would skip still
 * shows up. An undercounting instrument is the failure this file exists to
 * avoid.
 */
function countElements(html: string): number {
	return (html.match(/<\s*[a-zA-Z][^>]*>/g) ?? []).length;
}

/**
 * WHAT A HOSTILE REPORT LOOKS LIKE. Written as things somebody would actually
 * try, not as a syntax exercise: a script tag, an image with an inline handler
 * (the shape that does not need script tags to be enabled), an event handler on
 * ordinary markup, a javascript: link, an iframe, a style block, and -- the one
 * a slicing instrument would miss -- a payload that closes the element it is
 * being rendered inside before opening its own.
 */
const HOSTILE: { name: string; text: string }[] = [
	{ name: 'script tag', text: '<script>alert("x")</script>' },
	{ name: 'image with a handler', text: '<img src=x onerror="alert(1)">' },
	{ name: 'handler on ordinary markup', text: '<b onmouseover="alert(1)">hover me</b>' },
	{ name: 'javascript: link', text: '<a href="javascript:alert(1)">click</a>' },
	{ name: 'iframe', text: '<iframe src="https://example.com"></iframe>' },
	{ name: 'style block', text: '<style>body{display:none}</style>' },
	{
		name: 'breaks out of its own element first',
		text: '</p><h1>promoted</h1><p>and back inside'
	},
	{
		name: 'closes the card and the list around it',
		text: '</span></div></article><script>alert(2)</script><article>'
	},
	{ name: 'svg with a handler', text: '<svg onload="alert(1)"><circle r="9"/></svg>' },
	{ name: 'uppercase and spaced', text: '< IMG SRC=x ONERROR=alert(1) >< SCRIPT >x< /SCRIPT >' }
];

/** The same length class of ordinary prose, so the baseline is comparable. */
const BENIGN = 'the sign in button does nothing when I press it on my phone in the library';

function row(over: Partial<FeedbackRow>): FeedbackRow {
	return {
		id: 'r1',
		app: 'portal',
		context: '/',
		kind: 'bug',
		message: BENIGN,
		meta: { route: '/', path: '/', viewport: '1440x900' },
		status: 'new',
		created_at: '2026-08-21T09:02:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: null,
		submitter_email: null,
		anonymous: true,
		contact: null,
		...over
	} as FeedbackRow;
}

/** Render the REAL console exactly as /classroom/feedback mounts it. */
function renderConsole(rows: FeedbackRow[]): string {
	return render(FeedbackConsole, {
		props: {
			ready: true,
			rows,
			setStatus: async () => ({ ok: true }),
			now: () => Date.parse('2026-08-21T10:00:00.000Z')
		}
	}).body;
}

const BASELINE_MESSAGE = countElements(renderConsole([row({})]));
const BASELINE_CONTACT = countElements(renderConsole([row({ contact: BENIGN })]));

describe('the instrument, before any clean result is read', () => {
	it('renders a real console with real chrome', () => {
		const html = renderConsole([row({})]);
		// A render that produced nothing would make every comparison below
		// vacuously equal.
		expect(BASELINE_MESSAGE).toBeGreaterThan(20);
		expect(html).toContain(BENIGN);
		expect(html).toContain('Anonymous');
	});

	it('sees elements when there are elements: every fixture is really markup', () => {
		const raw = HOSTILE.map((h) => countElements(h.text));
		// STATED, not merely non-empty: 14 element-open tags across the ten
		// fixtures, counted by the SAME function that returns zero below.
		expect(raw.every((n) => n > 0)).toBe(true);
		expect(raw.reduce((a, b) => a + b, 0)).toBe(14);
		expect(HOSTILE).toHaveLength(10);
	});

	it('DETECTS an escape that failed, which is what makes every zero below a result', () => {
		// The instrument is a DELTA between two whole documents, so the thing
		// worth proving is that the delta can move. Each fixture's markup is
		// appended to the real baseline render -- which is precisely what an
		// unescaped render would have produced -- and the delta comes back as
		// the fixture's own element count, every time.
		const baseline = renderConsole([row({})]);
		const detected = HOSTILE.map((h) => countElements(baseline + h.text) - BASELINE_MESSAGE);
		expect(detected).toEqual(HOSTILE.map((h) => countElements(h.text)));
		expect(detected.every((n) => n > 0)).toBe(true);
	});
});

describe('a report message reaches the queue as text, never as markup', () => {
	it.each(HOSTILE)('$name adds no elements to the page', ({ text }) => {
		const html = renderConsole([row({ message: text })]);
		expect(countElements(html) - BASELINE_MESSAGE).toBe(0);
		// And the writing is still theirs: the text is on the page, escaped.
		expect(html).toContain('&lt;');
	});

	it('escapes every fixture in one run, with the control counted beside it', () => {
		const deltas = HOSTILE.map(
			(h) => countElements(renderConsole([row({ message: h.text })])) - BASELINE_MESSAGE
		);
		expect(deltas).toEqual(new Array(HOSTILE.length).fill(0));
		// The positive control, in the same run and through the same counter.
		expect(HOSTILE.reduce((n, h) => n + countElements(h.text), 0)).toBe(14);
	});
});

describe('the contact string is untrusted in exactly the same way', () => {
	it.each(HOSTILE)('$name in a contact adds no elements', ({ text }) => {
		const html = renderConsole([row({ contact: text })]);
		expect(countElements(html) - BASELINE_CONTACT).toBe(0);
	});

	it('is rendered as what it is, never as an identity the console vouched for', () => {
		const html = renderConsole([row({ contact: 'principal@boscotech.edu' })]);
		expect(html).toContain('Anonymous');
		expect(html).toContain('principal@boscotech.edu');
		// The words that stop an unverified string being read as a verified one.
		expect(html).toContain('typed by the reporter');
		expect(html).toContain('nothing verified it');
	});

	it('says so when an anonymous reporter left nothing', () => {
		const html = renderConsole([row({ contact: null })]);
		expect(html).toContain('left no way to be reached');
		expect(html).not.toContain('unknown');
	});
});

describe('the reporter hash never reaches a screen or an export', () => {
	// It is not in 0127's payload at all, so the strongest statement available
	// here is that no surface reads a field by that name and none renders one
	// that arrived anyway.
	const withHash = { ...row({}), reporter_hash: 'deadbeefdeadbeefdeadbeefdeadbeef' } as FeedbackRow;

	it('is not rendered even when a payload carries one', () => {
		expect(renderConsole([withHash])).not.toContain('deadbeefdeadbeef');
	});

	it('is not read by any feedback surface', () => {
		for (const file of [
			'src/lib/feedback/console.ts',
			'src/lib/feedback/feedback.ts',
			'src/lib/classroom/FeedbackConsole.svelte'
		]) {
			expect([file, read(file).includes('reporter_hash')]).toEqual([file, false]);
		}
		// POSITIVE CONTROL: the string IS in the migration that creates the
		// column, so the sweep is looking at real files.
		expect(read('supabase/migrations/0126_app_feedback_anonymous.sql')).toContain(
			'reporter_hash'
		);
	});

	it('does not ride the markdown export either', () => {
		const md = feedbackMarkdown([withHash]);
		expect(md.text).not.toContain('deadbeefdeadbeef');
		expect(md.included).toBe(1);
	});
});

describe('no surface in this path renders raw markup', () => {
	it('has no {@html} anywhere in the feedback path', () => {
		for (const file of [
			'src/lib/classroom/FeedbackConsole.svelte',
			'src/lib/feedback/FeedbackBox.svelte',
			'src/lib/feedback/SiteFeedback.svelte',
			'src/routes/classroom/feedback/+page.svelte'
		]) {
			expect([file, read(file).includes('{@html')]).toEqual([file, false]);
		}
	});
});

describe('the exports carry a hostile report without being restructured by it', () => {
	it('keeps a multi-line hostile message inside one blockquote', () => {
		const md = feedbackMarkdown([
			row({ message: '### not a heading\n---\n</p><script>alert(1)</script>' })
		]);
		for (const line of md.text.split('\n')) {
			// Every line of the message is quoted, so none of it is a
			// document-level block. The heading and the rule are escaped on top.
			if (line.includes('not a heading') || line.includes('alert(1)')) {
				expect(line.startsWith('>')).toBe(true);
			}
		}
		expect(md.text).toContain('\\### not a heading');
	});

	it('prints a contact on ONE bullet however many lines it was typed on', () => {
		const md = feedbackMarkdown([row({ contact: 'text me\n### injected\n- and a bullet' })]);
		const bullets = md.text.split('\n').filter((l) => l.startsWith('- '));
		expect(bullets.some((l) => l.includes('text me ### injected - and a bullet'))).toBe(true);
		// The injected heading never became one.
		expect(md.text).not.toMatch(/^### injected$/m);
	});

	it('keeps the exact stored bytes in the JSON export, which is not a document', () => {
		const raw = 'text me\n### injected';
		const parsed = JSON.parse(feedbackJson([row({ contact: raw })]));
		expect(parsed.reports[0].contact).toBe(raw);
	});
});
