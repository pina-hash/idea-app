// tests/dom/gauntlet-modeling-run-mount.test.ts
//
// A PASSING RUN IN AN UNRANKED MODE MUST SAY IT PASSED.
//
// 0146 took Reverse Engineer and Feature Golf off `gauntlet_leaderboard`
// because neither ranks on anything the server can check, and its own header
// predicted the client fallout: "ModelingRun.svelte keys its post-run sentence
// on `result.is_correct && myBest` and falls through to 'A miss is recorded but
// does not rank.' when myBest is null, so a PASSING Feature Golf run will
// currently read as a miss."
//
// THAT PREDICTION IS NARROWER THAN IT READS, AND THIS FILE PINS WHICH VERSION
// IS TRUE. The miss sentence is guarded by `{:else if !result.is_correct}`, so
// it does NOT render on a pass. What renders is NOTHING: a student clears the
// challenge and is told neither that they ranked nor that they did not, under
// an empty board reading "No verified runs yet. Be the first to clear it."
// Silence is the defect, and silence is exactly the kind of thing a render test
// catches and a person reading a diff does not.
//
// WHY A MOUNT AND NOT A SERVER RENDER. The sentence lives in `phase === 'done'`,
// which is only reachable through the Realtime callback the component registers
// in `onMount`. `svelte/server`'s `render()` runs no effects and no onMount, so
// the done screen has no SSR representation at all: an SSR test of this claim
// could only assert the framing screen and would pass while saying nothing.
// The supabase client is a PROP, so the callback is reachable by handing the
// component a channel stub and invoking what it registered -- which is the same
// path a real INSERT takes.
//
// WHAT IS NOT ASSERTED HERE: geometry, colour, tap targets. happy-dom has no
// layout engine and those read zero (tests/dom/README.md). Every assertion
// below is text content and element counts.

import { beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';

import ModelingRun from '$lib/gauntlet/ModelingRun.svelte';
import { formatTime } from '$lib/gauntlet';
import { mountInto, type Mounted } from './mount';
// The vitest alias points `$app/navigation` at this same file, so the module
// instance is shared with the component under test. Imported by PATH rather
// than through the alias because `svelte-check` resolves the alias to the
// real SvelteKit module, which has no `calls` or `reset` on it.
import * as nav from '../stubs/app-navigation';

type RealtimeRow = {
	source?: string;
	user_id?: string;
	is_correct?: boolean;
	score_metric?: number | null;
};

const ME = '11111111-1111-1111-1111-111111111111';

/**
 * The narrowest client ModelingRun uses: a reveal RPC and one Realtime channel.
 * `emit` invokes the handler the component registered, with the payload shape
 * Supabase delivers, so the done screen is reached the way production reaches
 * it rather than by poking `phase`.
 */
function channelStub() {
	let handler: ((payload: { new: RealtimeRow }) => void) | null = null;
	const channel = {
		on(_event: string, _filter: unknown, cb: (payload: { new: RealtimeRow }) => void) {
			handler = cb;
			return channel;
		},
		subscribe() {
			return channel;
		}
	};
	return {
		supabase: {
			channel: () => channel,
			removeChannel: () => {},
			rpc: async () => ({ data: { code: 'ABCD1234', drawing: null }, error: null })
		},
		emit(row: RealtimeRow) {
			if (!handler) throw new Error('the component registered no realtime handler');
			handler({ new: row });
		},
		get registered() {
			return handler !== null;
		}
	};
}

const FRAMING = {
	material: 'Aluminum 6061',
	density: 2.7,
	density_unit: 'g/cm3',
	target_mass: 216,
	mass_unit: 'g',
	tolerance_pct: 2
};

function mountRun(opts: { myBest: { score_metric: number | null; rank: number } | null }) {
	const stub = channelStub();
	const m = mountInto(ModelingRun as unknown as Component<Record<string, unknown>>, {
		supabase: stub.supabase,
		challenge: { id: 'c1', title: 'Angle Bracket', difficulty: 2, framing: FRAMING },
		board: [],
		myUserId: ME,
		myBest: opts.myBest,
		gated: true,
		metricLabel: 'Time',
		formatMetric: formatTime,
		backHref: '/gauntlet/feature-golf',
		next: null
	});
	return { m, stub };
}

/** Every post-run sentence the component renders, as trimmed text. */
const sentences = (m: Mounted) =>
	m.all<HTMLElement>('.question-panel p.instructions').map((p) => p.textContent?.trim() ?? '');

const MISS_COPY = /A miss is recorded but does not rank/i;

/**
 * Drive one run to its result screen. `settle` is what lets the awaited
 * `invalidateAll()` resolve, which is what flips `boardSettled` -- the flag
 * that stops the unranked sentence flashing at a first clear in a mode that
 * DOES rank.
 */
async function runTo(
	opts: { myBest: { score_metric: number | null; rank: number } | null; correct: boolean }
) {
	const { m, stub } = mountRun({ myBest: opts.myBest });
	m.one<HTMLButtonElement>('.start-gate .btn').click();
	await m.settle();
	stub.emit({ source: 'macro', user_id: ME, is_correct: opts.correct, score_metric: 74.5 });
	await m.settle();
	return { m, stub };
}

beforeEach(() => nav.reset());

describe('the post-run sentence, in all three outcomes', () => {
	it('A PASS IN AN UNRANKED MODE SAYS IT PASSED, AND SAYS WHY IT DOES NOT RANK', async () => {
		const { m } = await runTo({ myBest: null, correct: true });
		const said = sentences(m);

		// The verdict itself is the shared results screen's, and it is right.
		expect(m.one<HTMLElement>('.result-verdict').textContent?.trim()).toBe('Pass, verified');

		// THE FIX. Something is said, it says the run passed, and it gives 0146's
		// own reason rather than a second version of it.
		const note = said.find((s) => /Pass recorded/i.test(s));
		expect(note).toBeDefined();
		expect(note).toMatch(/counts toward your XP/i);
		expect(note).toMatch(/not something the server can verify/i);
		expect(note).toMatch(/no run in it ranks/i);

		// No rank is claimed: there is no board row to claim one from.
		expect(said.filter((s) => /Ranked #/i.test(s))).toHaveLength(0);

		await m.stop();
	});

	it('AND THE MISS COPY IS ABSENT FROM IT', async () => {
		// ITS OWN TEST, deliberately, and not one more line inside the assertion
		// above. This is the exclusion 0146's header actually predicted, and an
		// exclusion buried after a `toBeDefined()` never runs once anything ahead
		// of it fails -- so a mutation that reintroduced the miss copy would
		// redden the pass test for the OTHER reason and this claim would never be
		// exercised at all. Its positive control is the next test, which asserts
		// the same string IS present on the same component.
		const { m } = await runTo({ myBest: null, correct: true });
		expect(sentences(m).filter((s) => MISS_COPY.test(s))).toHaveLength(0);
		await m.stop();
	});

	it('POSITIVE CONTROL: a miss still renders the miss copy, unchanged', async () => {
		const { m } = await runTo({ myBest: null, correct: false });
		const said = sentences(m);
		expect(said.filter((s) => MISS_COPY.test(s))).toHaveLength(1);
		expect(said.filter((s) => /Pass recorded/i.test(s))).toHaveLength(0);
		expect(m.one<HTMLElement>('.result-verdict').textContent?.trim()).toBe('Outside tolerance');
		await m.stop();
	});

	it('POSITIVE CONTROL: a pass WITH a board row still claims its rank', async () => {
		const { m } = await runTo({ myBest: { score_metric: 80.1, rank: 3 }, correct: true });
		const said = sentences(m);
		expect(said.filter((s) => /Ranked/i.test(s) && /#3/.test(s))).toHaveLength(1);
		// The unranked sentence must not double up beside a real rank.
		expect(said.filter((s) => /Pass recorded/i.test(s))).toHaveLength(0);
		await m.stop();
	});
});

describe('the unranked sentence cannot flash at a first clear in a ranked mode', () => {
	it('says nothing until the post-run reload has actually resolved', async () => {
		// The window this guards is real: the Realtime row arrives BEFORE the load
		// that would fold it into `myBest`, so between them `myBest` is null for a
		// student who has just made their first clear. Rendering the unranked
		// sentence there would tell that student something false about their own
		// board.
		const { m, stub } = mountRun({ myBest: null });
		m.one<HTMLButtonElement>('.start-gate .btn').click();
		await m.settle();

		stub.emit({ source: 'macro', user_id: ME, is_correct: true, score_metric: 74.5 });
		m.flush(); // the result is on screen; invalidateAll() has NOT resolved yet
		expect(m.one<HTMLElement>('.result-verdict')).toBeTruthy();
		expect(sentences(m).filter((s) => /Pass recorded/i.test(s))).toHaveLength(0);

		await m.settle(); // now it has
		expect(sentences(m).filter((s) => /Pass recorded/i.test(s))).toHaveLength(1);

		// And the reload was genuinely requested, rather than the flag being set
		// by something that never asked for one.
		expect(nav.calls.filter((c) => c.fn === 'invalidateAll').length).toBeGreaterThan(0);
		await m.stop();
	});
});

describe('the instrument itself', () => {
	it('another player\'s submission does not end this student\'s run', async () => {
		// Teachers can read every submission over Realtime, so the component scopes
		// on `user_id`. If this stopped biting, the assertions above would be
		// driving a screen a stranger triggered.
		const { m, stub } = mountRun({ myBest: null });
		m.one<HTMLButtonElement>('.start-gate .btn').click();
		await m.settle();
		expect(stub.registered).toBe(true);

		stub.emit({ source: 'macro', user_id: 'someone-else', is_correct: true, score_metric: 1 });
		await m.settle();
		expect(m.all('.result-verdict')).toHaveLength(0);

		// ...and a MACRO-less row of our own is ignored too (the practice path).
		stub.emit({ source: 'web', user_id: ME, is_correct: true, score_metric: 1 });
		await m.settle();
		expect(m.all('.result-verdict')).toHaveLength(0);
		await m.stop();
	});
});
