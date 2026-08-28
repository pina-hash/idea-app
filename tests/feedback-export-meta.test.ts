// tests/feedback-export-meta.test.ts
//
// THE MARKDOWN EXPORT IS THE ARTIFACT THAT GETS READ, and it used to be
// narrower than the console it sits beside. FeedbackConsole.svelte was fixed
// to render every meta key it finds (feedback-meta-fields.test.ts); the
// export stayed on the fixed set of named accessors -- `rowRoute`, `rowRole`
// and so on -- so a key none of them claims (VANGUARD's `surface` and
// `initials`, captureMeta's own `error`) reached the console but never
// reached a pasted bundle.
//
// This asserts `rowMetaExtras` and its wiring into `feedbackMarkdown`'s
// per-row block: every key not already claimed by a named accessor gets a
// generic line, in a stable sorted position, with the same drop/cap rules
// the console applies -- and that a key ALREADY claimed by a named accessor
// (route, path, role, section, viewport, userAgent, at, build, status,
// errorId) is never printed a second time through the generic pass.

import { describe, expect, it } from 'vitest';
import { feedbackJson, feedbackMarkdown, rowMetaExtras } from '../src/lib/feedback/console';
import type { FeedbackRow } from '../src/lib/feedback/feedback';

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

describe('rowMetaExtras', () => {
	it('surfaces a key nothing already claims', () => {
		expect(
			rowMetaExtras(
				row({ meta: { route: '/vanguard', path: '/vanguard/', surface: 'in-game-composer', initials: 'AB' } })
			)
		).toEqual([
			{ key: 'initials', value: 'AB' },
			{ key: 'surface', value: 'in-game-composer' }
		]);
	});

	it('surfaces meta.error, which captureMeta itself has always emitted', () => {
		expect(rowMetaExtras(row({ meta: { error: 'TypeError: x is not a function' } }))).toEqual([
			{ key: 'error', value: 'TypeError: x is not a function' }
		]);
	});

	it('never repeats a key a named accessor already reads', () => {
		expect(
			rowMetaExtras(
				row({
					meta: {
						route: '/notebook',
						path: '/notebook/entry/1',
						role: 'student',
						section: 'sec-1',
						viewport: '1440x900',
						userAgent: 'Mozilla/5.0',
						at: '2026-08-21T09:02:00.000Z',
						build: { value: 'abc123', source: 'git-commit', means: 'the commit' },
						status: 404,
						errorId: 'err-9'
					}
				})
			)
		).toEqual([]);
	});

	it('drops null, empty-string and whitespace-only values', () => {
		expect(rowMetaExtras(row({ meta: { a: null, b: '', c: '   ' } }))).toEqual([]);
	});

	it('drops an object or array rather than serialising it inline', () => {
		expect(rowMetaExtras(row({ meta: { nested: { x: 1 }, roster: [1, 2, 3] } }))).toEqual([]);
	});

	it('renders a number or boolean as text', () => {
		expect(rowMetaExtras(row({ meta: { attempt: 3, retried: true } }))).toEqual([
			{ key: 'attempt', value: '3' },
			{ key: 'retried', value: 'true' }
		]);
	});

	it('caps a long value rather than carrying it in full', () => {
		const long = 'x'.repeat(5000);
		const [extra] = rowMetaExtras(row({ meta: { dump: long } }));
		expect(extra.value).toBe(`${'x'.repeat(200)}…`);
	});

	it('sorts by key, so the same extra set prints in the same order every time', () => {
		expect(rowMetaExtras(row({ meta: { zebra: '1', alpha: '2' } }))).toEqual([
			{ key: 'alpha', value: '2' },
			{ key: 'zebra', value: '1' }
		]);
	});
});

describe('feedbackMarkdown carries a documented-and-unanticipated meta set', () => {
	it('prints every key that reaches the row: named fields via their own sentence, everything else via the generic pass', () => {
		const r = row({
			meta: {
				route: '/vanguard',
				path: '/vanguard/run/7',
				role: 'student',
				section: 'sec-1',
				viewport: '1440x900',
				userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
				at: '2026-08-21T09:02:00.000Z',
				build: { value: 'abc123', source: 'git-commit', means: 'the commit this deployment was built from' },
				status: 404,
				errorId: 'err-9',
				// documented producers this file did not name until now
				surface: 'in-game-composer',
				initials: 'AB',
				error: 'TypeError: x is not a function',
				// a producer nobody has written yet
				someFutureField: 'a value'
			}
		});
		const { text } = feedbackMarkdown([r], { classroomSections: new Map() });

		// Named fields still print through their own accessor.
		expect(text).toContain('path: /vanguard/run/7');
		expect(text).toContain('role: student');
		expect(text).toContain('viewport: 1440x900');
		expect(text).toContain('http status: 404');
		expect(text).toContain('build: abc123 (git-commit)');

		// Every key the export could not have named before now still lands.
		expect(text).toContain('surface: in-game-composer');
		expect(text).toContain('initials: AB');
		expect(text).toContain('error: TypeError: x is not a function');
		expect(text).toContain('someFutureField: a value');

		// The generic pass never repeats a build object as a raw dump.
		expect(text).not.toContain('[object Object]');
		// meta.at never gets a second line: it is the same instant as "filed".
		expect(text).not.toMatch(/^- at 2026-08-21T09:02:00\.000Z$/m);
	});

	it('a key with no value in a row otherwise carrying only named fields adds no extra bullet', () => {
		const { text } = feedbackMarkdown([
			row({ meta: { route: '/', path: '/', a: null, b: '', c: '   ' } })
		]);
		expect(text).not.toMatch(/^- a: /m);
		expect(text).not.toMatch(/^- b: /m);
		expect(text).not.toMatch(/^- c: /m);
	});

	it('the JSON export already carries the full meta blob, unaffected by the generic markdown pass', () => {
		const parsed = JSON.parse(
			feedbackJson([row({ meta: { route: '/vanguard', surface: 'in-game-composer' } })])
		);
		expect(parsed.reports[0].meta).toEqual({ route: '/vanguard', surface: 'in-game-composer' });
	});
});
