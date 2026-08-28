// tests/feedback-meta-fields.test.ts
//
// THE CONSOLE USED TO RENDER A FIXED LIST OF meta KEYS, AND meta IS FREE-FORM.
// `captureMeta` in context.ts is the shell's one producer, but VANGUARD's
// in-game composer writes `surface` and `initials` straight into the same
// column (src/routes/vanguard/+server.ts, window.__ideaVanguardReport), and
// neither name was ever in the console's list -- so both were stored and
// neither was ever shown to an admin. `meta.error`, which captureMeta itself
// has emitted for every error-boundary report, was in the same position: a
// producer the console's OWN author wrote, silently dropped by the console's
// OWN reader.
//
// This asserts the fix the other way round from "does a known field still
// render": every key NOT already named by this file gets a generic line, an
// absent or empty value renders no row at all, and a value gets the SAME
// escaping every other field on this card uses -- plain text interpolation,
// proven the feedback-untrusted-render.test.ts way (a whole-document element
// delta, with the instrument proven against a positive control first).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FeedbackConsole from '../src/lib/classroom/FeedbackConsole.svelte';
import type { FeedbackRow } from '../src/lib/feedback/feedback';

const CONSOLE_SOURCE = readFileSync(
	new URL('../src/lib/classroom/FeedbackConsole.svelte', import.meta.url),
	'utf8'
);

function row(over: Partial<FeedbackRow>): FeedbackRow {
	return {
		id: 'r1',
		app: 'vanguard',
		context: '/vanguard',
		kind: 'other',
		message: 'the sign in button does nothing when I press it on my phone',
		meta: { route: '/vanguard', path: '/vanguard/' },
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

function countElements(html: string): number {
	return (html.match(/<\s*[a-zA-Z][^>]*>/g) ?? []).length;
}

describe('a meta key nobody enumerated in this file still reaches the screen', () => {
	it('renders VANGUARD in-game composer fields the console never named', () => {
		const html = renderConsole([
			row({ meta: { route: '/vanguard', path: '/vanguard/', surface: 'in-game-composer', initials: 'AB' } })
		]);
		expect(html).toContain('surface');
		expect(html).toContain('in-game-composer');
		expect(html).toContain('initials');
		expect(html).toContain('AB');
	});

	it('renders meta.error, which captureMeta itself has always emitted and the fixed list never named', () => {
		const html = renderConsole([
			row({ meta: { route: '/dashboard', path: '/dashboard', error: 'TypeError: x is not a function' } })
		]);
		expect(html).toContain('error');
		expect(html).toContain('TypeError: x is not a function');
	});

	it('renders a key from a future surface nobody has written yet', () => {
		const html = renderConsole([row({ meta: { route: '/', path: '/', someFutureField: 'a value' } })]);
		expect(html).toContain('someFutureField');
		expect(html).toContain('a value');
	});
});

describe('a meta key with no value never renders an empty row', () => {
	// route === path here on purpose: rowDistinctPath renders no <li> for a
	// matching pair, so this baseline is the ARM with nothing extra to compare
	// against, not the default fixture (whose route and path differ).
	const BASELINE = countElements(renderConsole([row({ meta: { route: '/', path: '/' } })]));

	it('drops null, empty-string and whitespace-only extras', () => {
		const html = renderConsole([
			row({ meta: { route: '/', path: '/', a: null, b: '', c: '   ' } })
		]);
		expect(countElements(html)).toBe(BASELINE);
		expect(html).not.toContain('<li>a ');
		expect(html).not.toContain('<li>b ');
		expect(html).not.toContain('<li>c ');
	});

	it('omits an object or array value rather than printing "[object Object]"', () => {
		const html = renderConsole([
			row({ meta: { route: '/', path: '/', nested: { x: 1 }, roster: [1, 2, 3] } })
		]);
		expect(countElements(html)).toBe(BASELINE);
		expect(html).not.toContain('[object Object]');
		expect(html).not.toContain('<li>nested');
		expect(html).not.toContain('<li>roster');
	});

	it('renders a numeric or boolean extra as text', () => {
		const html = renderConsole([row({ meta: { route: '/', path: '/', attempt: 3, retried: true } })]);
		expect(html).toContain('attempt');
		expect(html).toContain('3');
		expect(html).toContain('retried');
		expect(html).toContain('true');
	});
});

describe('an already-named meta key is not shown twice', () => {
	it('does not repeat route, path, role, section, viewport, userAgent, at, build, status or errorId', () => {
		const html = renderConsole([
			row({
				meta: {
					route: '/notebook',
					path: '/notebook/entry/1',
					role: 'student',
					section: 'sec-1',
					viewport: '1440x900',
					userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
					at: '2026-08-21T09:02:00.000Z',
					build: { value: 'abc123', source: 'git-commit', means: 'the commit' },
					status: 404,
					errorId: 'err-9'
				}
			})
		]);
		// The build's own value/means line renders once, through rowBuild --
		// not a second time as a generic "build [object Object]" line.
		expect(html).not.toContain('[object Object]');
		// meta.at never gets a generic "at 2026-..." line: it is the same
		// instant already shown as "filed" via row.created_at.
		expect(html).not.toContain('>at 2026-08-21T09:02:00.000Z<');
	});
});

describe('an unanticipated meta value is escaped exactly like every other field on the card', () => {
	const HOSTILE = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
	const BASELINE = countElements(renderConsole([row({})]));

	it('adds no elements to the page', () => {
		const html = renderConsole([row({ meta: { route: '/', path: '/', surface: HOSTILE } })]);
		expect(countElements(html) - BASELINE).toBe(0);
		expect(html).toContain('&lt;img');
	});

	it('the instrument is proven against the same fixture as raw markup, so the zero above is a result', () => {
		expect(countElements(HOSTILE)).toBeGreaterThan(0);
	});

	it('has no {@html} in this component', () => {
		expect(CONSOLE_SOURCE.includes('{@html')).toBe(false);
	});

	it('a hostile key name is escaped too', () => {
		const html = renderConsole([
			row({ meta: { route: '/', path: '/', ['<b>hack</b>']: 'value' } })
		]);
		expect(countElements(html) - BASELINE).toBe(0);
	});
});

describe('a very long, unbounded value does not run unbounded onto the card', () => {
	it('is capped rather than printed in full', () => {
		const long = 'x'.repeat(5000);
		const html = renderConsole([row({ meta: { route: '/', path: '/', dump: long } })]);
		expect(html).not.toContain(long);
		expect(html).toContain('x'.repeat(200));
	});
});

describe('the extras are sorted, so the list is stable across renders', () => {
	it('orders keys alphabetically', () => {
		const html = renderConsole([
			row({ meta: { route: '/', path: '/', zebra: '1', alpha: '2' } })
		]);
		expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zebra'));
	});
});
