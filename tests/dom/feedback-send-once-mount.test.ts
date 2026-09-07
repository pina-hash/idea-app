// tests/dom/feedback-send-once-mount.test.ts
//
// ONE PRESS OF SEND FILES ONE REPORT, EVEN IF SOMEBODY KEEPS TYPING WHILE IT
// IS "SENDING". This is the proof for prompt 0099's feedback item, in the
// shape `maps-node-create-once.test.ts` set for the same family of defect.
//
// THE MECHANISM, READ OFF THE CODE AND THEN MEASURED HERE. `FeedbackBox`'s
// three text fields call `typed()` on `oninput`, which called
// `save.markDirty()` with no phase gate. `SaveState.markDirty()` sets its
// pending flag even while the phase is `writing`, and `#execute()` -- after a
// SUCCESSFUL write -- does `if (this.#pending) { if (settledOk) await
// this.#run(); }`. That is the machine's designed behaviour for an autosaving
// document: an edit landed mid-write, send the newest value once this settles.
// On this surface the "newest value" is a second `app_feedback` row carrying
// the newer text. Two rows, not thirty: nothing here loops, because the second
// run clears the flag and nobody types into the thank-you.
//
// THE FIX IS TWO HALVES, AND THIS FILE PROVES THEM SEPARATELY.
//   1. `typed()` refuses `markDirty()` while the phase is `writing`. THIS is
//      what holds the row count, and the mutant below removes exactly this
//      line: `dispatchEvent` runs a `disabled` control's listener anyway
//      (CLAUDE.md, DOM traps), so the attribute alone would let a scripted
//      -- or a queued -- input event through.
//   2. The fields carry a real `disabled` while a send is in flight, so a
//      person cannot type mid-send at all; a `failed` outcome leaves the
//      `writing` phase, which hands the fields back to the Retry control.
//      Asserted as a CONTRACT (the attribute is there, and then it is not),
//      never by dispatching at a disabled control and expecting silence.
//
// THE MUTANT IS BUILT FROM THE SHIPPING SOURCE, not retyped: the fixed file
// is read, the one gate line is removed, the copy is written beside the
// original under a uuid name (so relative imports resolve identically),
// imported, driven through the IDENTICAL scenario, and deleted in `finally`.
// A submit count of TWO on the mutant is what says the assertion of ONE on the
// real component is measuring the gate and not the instrument.
//
// WHY THIS CANNOT BE A SERVER RENDER: every claim is about what an EVENT does
// several promise ticks later. `svelte/server`'s render() runs no handler.
// Structure, events and a transport's call log only; no geometry, no contrast,
// no tap target (happy-dom has no layout engine).

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import FeedbackBox from '$lib/feedback/FeedbackBox.svelte';
import type { FeedbackEntry, FeedbackResult } from '$lib/feedback/feedback';
import { mountInto, type Mounted } from './mount';

type Box = Component<Record<string, unknown>>;
const Fixed = FeedbackBox as unknown as Box;

/**
 * RESOLVED FROM `process.cwd()`, NOT FROM `import.meta.url`: under happy-dom
 * that URL is an `http://` one and `fileURLToPath` throws (measured, and
 * `app-navigation-stub-mount.test.ts` says the same). vitest runs from the
 * repo root.
 */
const ROOT = process.cwd();
const BOX_PATH = join(ROOT, 'src/lib/feedback/FeedbackBox.svelte');

/** What was on screen when SEND was pressed, and what was typed after. */
const AT_PRESS = 'The launch button did nothing.';
const TYPED_LATER = 'The launch button did nothing, and then the whole page went blank.';

/**
 * THE GATE, as the shipping file spells it. The mutant is the file with this
 * one line removed -- the pre-fix `typed()` -- so the source assertion below
 * is what keeps the mutant honest: if the gate is ever rewritten, this string
 * stops matching and the test reddens here rather than building a "mutant"
 * that is byte-identical to the original.
 */
const GATE_LINE = "\t\tif (save.phase === 'writing') return;\n";

interface Transport {
	submit: (entry: FeedbackEntry) => Promise<FeedbackResult>;
	/** Every entry `submit` was handed, in order. */
	sent: FeedbackEntry[];
	/** Settle the i-th call. Each call is held open until this is called. */
	release: (i: number, result?: FeedbackResult) => void;
	/** How many calls are still held open. */
	open: () => number;
}

/**
 * A submit that RECORDS every entry and HOLDS each call open on a promise the
 * test resolves by hand. That is the only way to stand between the dispatch
 * and the acknowledgement and type into the box while the request is out.
 */
function heldTransport(): Transport {
	const sent: FeedbackEntry[] = [];
	const resolvers: (((r: FeedbackResult) => void) | null)[] = [];
	return {
		sent,
		submit: (entry) => {
			sent.push(entry);
			return new Promise<FeedbackResult>((resolve) => {
				resolvers.push(resolve);
			});
		},
		release(i, result = { error: null, retryable: false }) {
			const r = resolvers[i];
			if (!r) throw new Error(`no held submit call at index ${i}`);
			resolvers[i] = null;
			r(result);
		},
		open: () => resolvers.filter((r) => r !== null).length
	};
}

function click(el: Element): void {
	el.dispatchEvent(new Event('click', { bubbles: true }));
}

/** A person typing: value, then the `input` event both `bind:value` and `oninput` listen for. */
function typeInto(m: Mounted, el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	m.flush();
}

/** Matched on the class, not the word: the label is SEND and becomes SENDING mid-write. */
const sendButton = (m: Mounted) => m.one<HTMLButtonElement>('button.fb-btn-primary');
const messageField = (m: Mounted) => m.one<HTMLTextAreaElement>('#fb-msg');
const triedField = (m: Mounted) => m.one<HTMLTextAreaElement>('#fb-tried');
const contactField = (m: Mounted) => m.one<HTMLInputElement>('#fb-contact');
const kindRadios = (m: Mounted) => m.all<HTMLButtonElement>('button.fb-kind');

/** Every field's `disabled`, as one object, so a mismatch names which one. */
function disabledMap(m: Mounted): Record<string, boolean> {
	return {
		message: messageField(m).disabled,
		tried: triedField(m).disabled,
		contact: contactField(m).disabled,
		kinds: kindRadios(m).every((b) => b.disabled)
	};
}

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

/** Mount the box directly, the way the harness does, with the contact field offered. */
function open(component: Box, t: Transport): Mounted {
	const m = mountInto(component, {
		app: 'harness',
		submit: t.submit,
		onClose: () => {},
		askContact: true
	});
	mounted.push(m);
	return m;
}

/**
 * THE SCENARIO, IDENTICAL FOR THE REAL COMPONENT AND THE MUTANT: type, press
 * SEND, and while the submit is still held open type a LONGER message into
 * `#fb-msg`; then release, and let the machine settle twice (the settle path
 * re-runs a pending edit, which takes a second round).
 */
async function typeDuringFlight(component: Box): Promise<{ m: Mounted; t: Transport }> {
	const t = heldTransport();
	const m = open(component, t);
	typeInto(m, messageField(m), AT_PRESS);
	const send = sendButton(m);
	// The control is genuinely enabled here; a disabled one would mean the
	// typing never reached `canSend` and the press would prove nothing.
	expect(send.disabled).toBe(false);
	click(send);
	m.flush();
	// The flight is open: exactly one call, not yet answered.
	expect(t.sent).toHaveLength(1);
	expect(t.open()).toBe(1);
	expect(send.textContent?.trim()).toBe('SENDING');

	typeInto(m, messageField(m), TYPED_LATER);

	t.release(0);
	await m.settle();
	await m.settle();
	return { m, t };
}

describe('the real FeedbackBox: one press, one row, whatever is typed mid-flight', () => {
	it('calls submit ONCE and the row carries the text as it was when SEND was pressed', async () => {
		const { m, t } = await typeDuringFlight(Fixed);

		// THE ASSERTION THIS FILE EXISTS FOR.
		expect(t.sent).toHaveLength(1);
		expect(t.sent[0].message).toBe(AT_PRESS);
		expect(t.open()).toBe(0);
		// And the box moved on to the thank-you rather than a second SENDING.
		expect(m.target.textContent).toContain('Thanks, that went through.');
	});

	it('carries `disabled` on every field while the flight is open, and not before', async () => {
		const t = heldTransport();
		const m = open(Fixed, t);
		typeInto(m, messageField(m), AT_PRESS);
		// AT REST: nothing is disabled, which is the positive control for the
		// contract below -- a field that was disabled all along proves nothing.
		expect(disabledMap(m)).toEqual({ message: false, tried: false, contact: false, kinds: false });
		expect(kindRadios(m).length).toBeGreaterThan(1);

		click(sendButton(m));
		m.flush();
		expect(t.open()).toBe(1);
		// IN FLIGHT: the attribute is the half a person meets.
		expect(disabledMap(m)).toEqual({ message: true, tried: true, contact: true, kinds: true });

		t.release(0);
		await m.settle();
	});

	it('hands the fields back after a FAILED send, which is what Retry needs', async () => {
		const t = heldTransport();
		const m = open(Fixed, t);
		typeInto(m, messageField(m), AT_PRESS);
		click(sendButton(m));
		m.flush();
		expect(disabledMap(m).message).toBe(true);

		// A REFUSAL, not a network failure: `retryable: false` means the machine
		// reports it once and does not back off into a second attempt.
		t.release(0, { error: 'That did not send.', retryable: false });
		await m.settle();
		await m.settle();

		expect(t.sent).toHaveLength(1);
		expect(disabledMap(m)).toEqual({ message: false, tried: false, contact: false, kinds: false });
		// The shared indicator offers Retry, and the send control is live again.
		expect(m.all('button.save-ind-btn.retry')).toHaveLength(1);
		expect(sendButton(m).disabled).toBe(false);
		expect(sendButton(m).textContent?.trim()).toBe('SEND');
	});
});

describe('MUTATION PROOF: the same scenario against the pre-fix typed()', () => {
	it('with the phase gate removed, submit is called TWICE and the second row carries the newer text', async () => {
		const source = readFileSync(BOX_PATH, 'utf8');
		// The mutant is the shipping file minus one line. If the gate has been
		// respelled, say so here rather than building a copy that changes nothing.
		expect(source.split(GATE_LINE)).toHaveLength(2);
		const mutantSource = source.replace(GATE_LINE, '');
		expect(mutantSource).not.toBe(source);

		const mutantPath = join(ROOT, `src/lib/feedback/FeedbackBox.mutant-${randomUUID()}.svelte`);
		writeFileSync(mutantPath, mutantSource);
		try {
			const mod = (await import(/* @vite-ignore */ mutantPath)) as { default: Box };
			const { t } = await typeDuringFlight(mod.default);

			// TWO ROWS. The first is the report as pressed; the second is the
			// machine's "an edit landed mid-write" re-run carrying the newer text,
			// which on this surface is a report nobody asked for.
			expect(t.sent).toHaveLength(2);
			expect(t.sent[0].message).toBe(AT_PRESS);
			expect(t.sent[1].message).toBe(TYPED_LATER);
			// Tidy: the second call is still held; answer it so nothing leaks past
			// the unmount.
			t.release(1);
			await new Promise((r) => setTimeout(r, 30));
		} finally {
			rmSync(mutantPath, { force: true });
		}
	});
});
