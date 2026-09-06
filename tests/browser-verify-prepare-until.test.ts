/**
 * `until` ON A PREPARE STEP IS A GUARANTEE OR IT IS NOTHING.
 *
 * `tools/browser-verify/run.mjs` judged an `evaluate` prepare step on whether
 * it THREW, and read `step.until` nowhere. A predicate an author wrote as a
 * guarantee -- "wait until this page has actually hydrated before I measure
 * it" -- was discarded in silence, and the step reported success without
 * waiting for anything. That is the eighth entry in this repository's list of
 * green checks proving nothing, and the first where the instrument threw away
 * a guard somebody wrote on purpose.
 *
 * WHY THIS IS A TEST AND NOT ONLY A HARNESS CONTROL. `npm run verify:browser`
 * is deliberately outside `npm test` and outside CI (see its README), so a
 * control that lives only there is a control nobody runs on a branch. The
 * defect it guards is invisible by construction: a discarded `until` prints
 * `ok`, costs nothing, and reads in the spec source exactly like a working
 * one. That is the definition of a regression that would be SILENT, which is
 * this repository's own bar for writing a test at all.
 *
 * THE PAGE IS A STUB AND THE PREDICATE SOURCES ARE REALLY EVALUATED. The stub
 * runs each source string through `eval` against shared state, so the
 * `page.evaluate(string)` EXPRESSION trap -- an arrow-function source handed
 * over bare becomes a function OBJECT and is never `=== true` -- is reproduced
 * here rather than papered over: a fixture that called the predicate as a
 * function would certify the one bug this whole family of workarounds exists
 * for. No browser is needed to prove a retry loop retries.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

/**
 * IMPORTED THROUGH A COMPUTED URL, NOT A LITERAL SPECIFIER, AND THAT IS NOT A
 * STYLE CHOICE. A static `import ... from '../tools/browser-verify/run.mjs'`
 * pulls the whole `tools/browser-verify` JS tree into `svelte-check`'s program:
 * measured in this container, the baseline went from **0 errors / 37 warnings
 * to 356 errors / 37 warnings**, 348 of them in six harness modules this
 * bundle does not own and none of them a defect this change introduced. A
 * computed URL is not statically resolvable, so the harness stays a tool and
 * the type baseline stays what CLAUDE.md says it is.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
let evaluateUntil: any;
let prepareEvalUntilResult: any;
let prepareStepShapeResults: any;

beforeAll(async () => {
	const run = await import(new URL('../tools/browser-verify/run.mjs', import.meta.url).href);
	({ evaluateUntil, prepareEvalUntilResult, prepareStepShapeResults } = run);
	expect(typeof evaluateUntil).toBe('function');
});

/** Shared state the evaluated sources read and write, the way a real page's DOM is. */
type Bench = { ran: number; flipAfter: number; throwOn: number };
declare global {
	// eslint-disable-next-line no-var
	var __bv: Bench;
}

function stubPage() {
	const waits: number[] = [];
	return {
		waits,
		async evaluate(src: string) {
			return (0, eval)(src);
		},
		async waitForTimeout(ms: number) {
			waits.push(ms);
		}
	};
}

beforeEach(() => {
	globalThis.__bv = { ran: 0, flipAfter: 0, throwOn: 0 };
});

/* The sources a spec author would actually write: arrow-function SOURCE, not a
   function value. `flipAfter` is how many runs of the step it takes before the
   predicate holds -- the "false at first and true later" the control needs. */
const EVALUATE = '() => { globalThis.__bv.ran++; if (globalThis.__bv.ran === globalThis.__bv.throwOn) throw new Error("boom"); return "ran " + globalThis.__bv.ran; }';
const UNTIL_EVENTUALLY = '() => globalThis.__bv.ran > globalThis.__bv.flipAfter';
const UNTIL_NEVER = '() => false';

describe('an `evaluate` prepare step honours its `until`', () => {
	it('CONTROL 1: a predicate false at first and true later is WAITED for, and the wait is reported', async () => {
		globalThis.__bv.flipAfter = 3; // holds only from the 4th run of the step
		const page = stubPage();
		const r = await evaluateUntil(page, { evaluate: EVALUATE, until: UNTIL_EVENTUALLY }, { gapMs: 1 });

		expect(r.ok).toBe(true);
		/* The whole claim: it did not accept the first answer. A step that
		   reported `attempts: 1` here is the defect wearing the fix's clothes. */
		expect(r.attempts).toBeGreaterThan(1);
		expect(r.attempts).toBe(4);
		expect(r.reason).toBe('predicate satisfied');
		expect(typeof r.elapsedMs).toBe('number');
		/* And the predicate did NOT already hold, so it discriminated something. */
		expect(r.heldBefore).toBe(false);

		const row = prepareEvalUntilResult({ evaluate: EVALUATE, until: UNTIL_EVENTUALLY }, r);
		expect(row.withinThreshold).toBe(true);
		expect(row.measured).toContain('4 attempt(s)');
	});

	it('CONTROL 2: a predicate that is NEVER true FAILS, and names the step and the predicate', async () => {
		const page = stubPage();
		const step = { evaluate: EVALUATE, until: UNTIL_NEVER };
		const r = await evaluateUntil(page, step, { attempts: 3, gapMs: 1 });

		expect(r.ok).toBe(false);
		expect(r.attempts).toBe(3);
		expect(r.reason).toContain('never satisfied');

		const row = prepareEvalUntilResult(step, r);
		/* It does not pass, and it does not merely warn: `withinThreshold: false`
		   is what the summary counts and what `--strict` exits 1 on. */
		expect(row.withinThreshold).toBe(false);
		expect(row.check).toBe('prepare-eval');
		expect(row.label).toContain('globalThis.__bv.ran++'); // the step
		expect(String(row.data.until)).toBe(UNTIL_NEVER); // the predicate
		expect(row.threshold).toContain('`until` then holds');
	});

	it('CONTROL 3: a step with NO `until` is judged exactly as before -- it never reaches this path', async () => {
		/* The guarantee that the fix is additive. `runRoute` branches on
		   `step.until`, so a step without one takes the untouched
		   `prepareEvalResult` path; asserted here at the level this file can
		   see, and asserted on the real surface by the byte-identical output of
		   a live route that has such a step (reported in the history entry). */
		expect(prepareStepShapeResults({ evaluate: EVALUATE })).toEqual([]);
	});

	it('a THROW stops immediately rather than being retried into a count', async () => {
		globalThis.__bv.throwOn = 1;
		globalThis.__bv.flipAfter = 0;
		const page = stubPage();
		const step = { evaluate: EVALUATE, until: UNTIL_EVENTUALLY };
		const r = await evaluateUntil(page, step, { attempts: 5, gapMs: 1 });

		expect(r.ok).toBe(false);
		expect(r.attempts).toBe(1);
		expect(r.reason).toBe('THREW');
		expect(prepareEvalUntilResult(step, r).measured).toContain('THREW: boom');
	});

	it('a predicate that ALREADY HELD is annotated, not failed -- the evaluate did run', async () => {
		/* The mirror of `prepareClickResult`'s "already satisfied" finding, and
		   deliberately NOT the same verdict. A click that never fired reached no
		   state; an evaluate ran. What the reader still needs is that the
		   predicate could not have told the difference. */
		globalThis.__bv.ran = 99;
		const page = stubPage();
		const step = { evaluate: EVALUATE, until: UNTIL_EVENTUALLY };
		const r = await evaluateUntil(page, step, { gapMs: 1 });

		expect(r.ok).toBe(true);
		expect(r.heldBefore).toBe(true);
		expect(prepareEvalUntilResult(step, r).measured).toContain('ALREADY HELD');
		/* Still a pass: annotation, not verdict. */
		expect(prepareEvalUntilResult(step, r).withinThreshold).toBe(true);
	});
});

describe('a step whose SHAPE cannot keep its promise is a measurement', () => {
	it('an `until` on a `waitFor` step is reported as DISCARDED', async () => {
		const rows: any[] = prepareStepShapeResults({ waitFor: '() => true', until: '() => true' });
		expect(rows).toHaveLength(1);
		expect(rows[0].withinThreshold).toBe(false);
		expect(rows[0].measured).toContain('DISCARDED');
	});

	it('an `until` on a `click` or an `evaluate` is fine -- both read one', async () => {
		expect(prepareStepShapeResults({ click: '.x', until: '() => true' })).toEqual([]);
		expect(prepareStepShapeResults({ evaluate: '() => 1', until: '() => true' })).toEqual([]);
	});

	it('a step with no action key at all is reported -- a mistyped `evaulate:` is exactly this', async () => {
		const rows: any[] = prepareStepShapeResults({ evaulate: '() => 1', waitMs: 500 });
		expect(rows.some((r) => r.measured.includes('no action key'))).toBe(true);
		expect(rows.every((r) => r.withinThreshold === false)).toBe(true);
	});

	it('POSITIVE CONTROL: every shipped prepare step passes the shape guard', async () => {
		/* Pairs the absence assertion above with something that can fail.
		   Without it, "0 bad steps" cannot be told from "the sweep found no
		   steps at all", which is the shape of clean result nobody
		   investigates. */
		const { readdirSync } = await import('node:fs');
		const dir = new URL('../tools/browser-verify/routes/', import.meta.url);
		const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_'));
		let steps = 0;
		const bad: string[] = [];
		for (const f of files) {
			const spec = (await import(new URL(f, dir).href)).default;
			for (const step of spec.prepare ?? []) {
				steps++;
				for (const row of prepareStepShapeResults(step)) bad.push(`${f}: ${row.measured}`);
			}
		}
		expect(files.length).toBeGreaterThan(100); // the sweep found the directory
		expect(steps).toBeGreaterThan(100); // and it found steps
		expect(bad).toEqual([]);
	});
});
