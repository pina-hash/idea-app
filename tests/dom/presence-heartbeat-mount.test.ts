// tests/dom/presence-heartbeat-mount.test.ts
//
// 0200: THE STUDENT SIDE, AND THE ONE THING THAT MUST NEVER LEAVE THE PAGE.
//
// `PresenceHeartbeat.svelte` attaches four listeners to `document` and drives a
// `PresenceHeartbeat`. Everything decided here is decided against the REAL
// component and the REAL class -- no retyped copy of either -- because the
// question this file exists to answer is not "does the arithmetic work" (the
// database tests answer that) but "what actually leaves a student's browser
// when they type".
//
// WHAT IS ASSERTED, AND WHY EACH ONE IS A SILENT REGRESSION IF IT MOVES:
//
//   1. A BEAT CARRIES TWO BOOLEANS AND NOTHING ELSE. Not the key, not the
//      value, not the target, not a URL. A listener that started reading its
//      event would type-check, would work, and would change what this feature
//      stores about a child -- and nothing on screen would report it.
//   2. TYPING DOES NOT DRIVE THE WRITE RATE. Fifty input events produce no
//      beats at all. A `noteInput` that sent would hammer the database exactly
//      as the prompt says it must not, and would still look correct.
//   3. THE HIDE REPORT GOES ONCE, CARRIES `typed: false`, AND IS FOLLOWED BY
//      SILENCE. Without the report, "open in another tab" and "gone" are the
//      same silence; with `typed: true` on it, a tab switch would be stamped as
//      the moment the student last worked.
//   4. THE COMPONENT RENDERS NOTHING. A student is not the audience for their
//      own presence, and a widget saying "you are being timed" changes the
//      thing it measures.
//
// NO GEOMETRY IS ASSERTED HERE. happy-dom has no layout engine, so a box, a
// ratio or a 44px target read in this directory is a zero that passes
// vacuously. See `tests/dom/mount.ts`.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import PresenceHeartbeatComponent from '$lib/classroom/presence/PresenceHeartbeat.svelte';
import { PresenceHeartbeat, type PresenceBeat } from '$lib/classroom/presence/heartbeat';
import { PRESENCE_LIMITS_FALLBACK } from '$lib/classroom/presence/state';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;

afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

/** A clock the test moves by hand. Nothing here waits for a real interval. */
function clock(start = 1_000_000) {
	let at = start;
	return {
		now: () => at,
		advance(ms: number) {
			at += ms;
		}
	};
}

function heart(opts: { onSend?: (b: PresenceBeat) => void } = {}) {
	const c = clock();
	const sent: PresenceBeat[] = [];
	const h = new PresenceHeartbeat({
		now: c.now,
		send: (b) => {
			sent.push(b);
			opts.onSend?.(b);
		},
		heartbeatMs: PRESENCE_LIMITS_FALLBACK.heartbeatSeconds * 1000,
		inputWindowMs: PRESENCE_LIMITS_FALLBACK.inputWindowSeconds * 1000
	});
	return { h, c, sent };
}

describe('what leaves the page', () => {
	it('a beat carries exactly two booleans, and typing adds nothing to it', () => {
		const { h, c, sent } = heart();
		h.start();
		h.noteInput();
		c.advance(30_000);
		h.tick();

		expect(sent).toHaveLength(2);
		for (const beat of sent) {
			// THE SHAPE IS THE GUARANTEE. Two keys, both booleans. A listener that
			// started folding in the event would show up here as a third key.
			expect(Object.keys(beat).sort()).toEqual(['typed', 'visible']);
			expect(typeof beat.typed).toBe('boolean');
			expect(typeof beat.visible).toBe('boolean');
		}
		expect(sent[1]).toEqual({ typed: true, visible: true });
	});

	it('fifty input events produce zero beats', () => {
		// TYPING DOES NOT DRIVE THE WRITE RATE. `noteInput` records an instant and
		// sends nothing; the timer is the only thing that beats.
		const { h, c, sent } = heart();
		h.start();
		const afterStart = sent.length;
		for (let i = 0; i < 50; i += 1) {
			h.noteInput();
			c.advance(100);
		}
		expect(sent.length - afterStart).toBe(0);
	});

	it('ticking faster than the heartbeat sends nothing extra', () => {
		const { h, c, sent } = heart();
		h.start();
		for (let i = 0; i < 100; i += 1) {
			h.tick();
			c.advance(200); // 20 seconds of ticking, every 200ms
		}
		// 20 simulated seconds is inside one 30-second heartbeat, so the opening
		// beat is the only one.
		expect(sent).toHaveLength(1);
	});

	it('the first beat goes out at once and reports no typing', () => {
		// What makes a student appear on the console when they OPEN the assignment
		// rather than half a minute later. It credits nothing -- there is no
		// interval behind it -- so it costs one row and buys the whole difference
		// between "here" and "not opened".
		const { h, sent } = heart();
		h.start();
		expect(sent).toEqual([{ typed: false, visible: true }]);
	});

	it('typed is false once the input window has passed', () => {
		const { h, c, sent } = heart();
		h.start();
		h.noteInput();
		c.advance(PRESENCE_LIMITS_FALLBACK.inputWindowSeconds * 1000 + 1000);
		h.tick();
		expect(sent.at(-1)).toEqual({ typed: false, visible: true });
	});
});

describe('the hide report', () => {
	it('goes once, carries typed:false, and is followed by silence', () => {
		const { h, c, sent } = heart();
		h.start();
		h.noteInput();
		h.noteVisibility(false);

		// `typed: false` EVEN THOUGH THE STUDENT JUST TYPED. The database credits
		// only a beat reporting both typed and visible, so the flag changes no
		// credit -- what it would change is `last_input_at`, and stamping that at
		// the moment somebody switched tabs would report the switch as work.
		expect(sent.at(-1)).toEqual({ typed: false, visible: false });

		const afterHide = sent.length;
		for (let i = 0; i < 20; i += 1) {
			h.tick();
			c.advance(60_000);
		}
		// A PERIODIC BEAT WHILE HIDDEN WOULD BE A PAGE REPORTING FROM A TAB NOBODY
		// IS LOOKING AT. Twenty minutes of ticking adds nothing.
		expect(sent.length).toBe(afterHide);
	});

	it('a repeated hide does not report twice', () => {
		const { h, sent } = heart();
		h.start();
		h.noteVisibility(false);
		const after = sent.length;
		h.noteVisibility(false);
		h.noteVisibility(false);
		expect(sent.length).toBe(after);
	});

	it('coming back beats immediately, which is when an instructor wants to see them', () => {
		const { h, c, sent } = heart();
		h.start();
		h.noteVisibility(false);
		c.advance(5_000); // well inside the heartbeat
		h.noteVisibility(true);
		expect(sent.at(-1)).toEqual({ typed: false, visible: true });
	});

	it('stop() ends everything, including the transitions', () => {
		const { h, sent } = heart();
		h.start();
		const after = sent.length;
		h.stop();
		h.tick();
		h.noteInput();
		h.noteVisibility(false);
		expect(sent.length).toBe(after);
	});
});

describe('the component, mounted for real', () => {
	it('renders nothing at all', () => {
		const sent: PresenceBeat[] = [];
		mounted = mountInto(PresenceHeartbeatComponent as unknown as Component<Record<string, unknown>>, {
			send: (b: PresenceBeat) => sent.push(b)
		});
		mounted.flush();
		// A STUDENT IS NOT THE AUDIENCE FOR THEIR OWN PRESENCE. No chip, no dot,
		// no sentence -- which is not the same as hiding it: 0200's RLS policy
		// admits the subject of the row deliberately.
		expect(mounted.target.innerHTML.trim()).toBe('');
		expect(mounted.target.children.length).toBe(0);
	});

	it('beats on mount, and the beat reaches the injected transport', () => {
		const sent: PresenceBeat[] = [];
		mounted = mountInto(PresenceHeartbeatComponent as unknown as Component<Record<string, unknown>>, {
			send: (b: PresenceBeat) => sent.push(b)
		});
		mounted.flush();
		expect(sent).toEqual([{ typed: false, visible: true }]);
	});

	it('a real input event on the document reaches the beat, carrying nothing of itself', () => {
		const sent: PresenceBeat[] = [];
		mounted = mountInto(PresenceHeartbeatComponent as unknown as Component<Record<string, unknown>>, {
			send: (b: PresenceBeat) => sent.push(b)
		});
		mounted.flush();

		// A REAL EVENT AT A REAL ELEMENT, dispatched the way a browser does it,
		// carrying a value nobody should ever see leave this page.
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.value = 'my sketch is about a cantilever bridge';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		mounted.flush();

		// NOTHING WAS SENT BY THE TYPING ITSELF, which is rule 2 again through the
		// real listener rather than through the class.
		expect(sent).toHaveLength(1);
		// And nothing that was sent carries a trace of it.
		expect(JSON.stringify(sent)).not.toContain('cantilever');
		input.remove();
	});

	it('unmounting removes the listeners, so a torn-down page stops reporting', async () => {
		const sent: PresenceBeat[] = [];
		mounted = mountInto(PresenceHeartbeatComponent as unknown as Component<Record<string, unknown>>, {
			send: (b: PresenceBeat) => sent.push(b)
		});
		mounted.flush();
		const after = sent.length;
		await mounted.stop();
		mounted = null;

		document.dispatchEvent(new Event('visibilitychange'));
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.remove();

		expect(sent.length).toBe(after);
	});
});
