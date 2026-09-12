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
// LEDGER 0172 ADDS THREE MORE, BECAUSE THE COMPONENT IS MOUNTED NOW. 0152 built
// all of the above and could not make the one wire -- the student's item page
// was held by five parallel lanes -- so until `0172` nothing anywhere wrote a
// `classroom_presence` row and every assertion here was about a component with
// no caller. What mounting it makes checkable:
//
//   5. THE CLIENT WRITE RATE, MEASURED RATHER THAN ASSERTED. 0152 measured the
//      DATABASE half (a hundred beats in a tight loop, one row write). The
//      CLIENT half had never been measured at all, which is the half the
//      "do not add a client throttle" decision rests on: the component beats at
//      30 seconds and `_classroom_presence_min_gap()` refuses a write inside 20,
//      so the client is ALREADY the wider of the two and a third limit could
//      only be a third place for the rate to be written down. Two simulated
//      minutes of continuous typing are driven through the REAL class and the
//      REAL twin below, with the no-rate-rule client as the other direction.
//
//   6. `send` IS READ ONCE, AT MOUNT, WHICH IS WHY THE ROUTE KEYS THE ELEMENT.
//      A client-side navigation between two assignments in one class re-runs
//      the item route's load WITHOUT remounting the page, so a component that
//      kept its first transport would go on beating for the assignment the
//      student has left. Nothing warns: the beats keep landing, on the wrong
//      row. The hazard is measured here and `{#key data.item.id}` in
//      `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` is what
//      answers it.
//
//   7. A STUDENT NEVER SEES ANOTHER STUDENT'S PRESENCE -- the CLIENT half. 0152
//      proved the database half with an anonymous control and a signed-in peer
//      control. What no RLS policy can say is what the student's own page puts
//      on screen, and the answer has to be nothing: the page mounts this
//      component, which has no read transport and renders no element at all.
//      The control that would redden is the REAL `GradingConsole` mounted on the
//      identical peer data in the same test, which draws them.
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
import { mountWithLiveProps } from './presence-heartbeat-mount-props.svelte';
import GradingConsole from '$lib/classroom/GradingConsole.svelte';
import { createMemoryPresence } from '$lib/classroom/presence/transports';
import type { PresencePayload } from '$lib/classroom/presence/state';

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

describe('the client write rate, measured -- ledger 0172', () => {
	/**
	 * TWO SIMULATED MINUTES OF CONTINUOUS TYPING, THROUGH THE REAL CLASS AND THE
	 * REAL TWIN.
	 *
	 * `createMemoryPresence` is not a stub: it applies `minGapSeconds` exactly as
	 * `classroom_presence_ping` does and credits by the same rule, so `writes()`
	 * here is the number of ROW WRITES the database would have taken. A harness
	 * whose twin wrote every beat would make this assertion vacuous, which is why
	 * the twin is the shipped one and not a local counter.
	 *
	 * THE KEYSTROKE RATE IS DELIBERATELY FASTER THAN ANYBODY TYPES -- one every
	 * 250ms, 240 a minute -- and the tick rate is deliberately faster than the
	 * component's own timer, one a second against one every thirty. Both are
	 * pushed past the real case so the measurement is an upper bound rather than
	 * a typical one.
	 */
	function twoMinutes(opts: { beatEveryMs: number; tickEveryMs: number }) {
		const c = clock();
		const twin = createMemoryPresence({ now: c.now, studentEmail: 'ana@boscotech.net' });
		const h = new PresenceHeartbeat({
			now: c.now,
			send: (b) => twin.ping(b),
			heartbeatMs: opts.beatEveryMs,
			inputWindowMs: PRESENCE_LIMITS_FALLBACK.inputWindowSeconds * 1000
		});
		h.noteVisibility(true);
		h.start();
		let keystrokes = 0;
		for (let elapsed = 0; elapsed < 120_000; elapsed += 250) {
			c.advance(250);
			h.noteInput();
			keystrokes += 1;
			// THE TIMER, DRIVEN AT THE RATE THIS CLIENT'S DESIGN WOULD DRIVE IT.
			// For the real component that is thirty times more often than its
			// interval actually fires -- `tick()` is idempotent inside a heartbeat
			// window, which is what lets it be driven this hard and is why no
			// second rate rule is needed at the call site.
			if (elapsed % opts.tickEveryMs === 0) h.tick();
		}
		return {
			keystrokes,
			beatsSent: h.sent.length,
			rowWrites: twin.writes(),
			throttledByDatabaseRule: twin.beats.filter((b) => !b.written).length,
			rows: twin.rows.size,
			activeSeconds: twin.rows.get('ana@boscotech.net')?.active_seconds ?? 0
		};
	}

	it('480 keystrokes over two minutes produce 4 beats and 4 row writes', () => {
		const m = twoMinutes({
			beatEveryMs: PRESENCE_LIMITS_FALLBACK.heartbeatSeconds * 1000,
			tickEveryMs: 1_000
		});

		// THE FIGURE, AND BOTH HALVES OF IT. 120 keystrokes per beat, and every
		// beat the component sent was WIDE ENOUGH FOR THE DATABASE TO TAKE -- so
		// the client is the binding limit here and the database's floor never
		// fires. That is the whole of the "do not add a client throttle"
		// argument: a third limit could only narrow the REQUEST count, and the
		// WRITE count is already the database's to decide.
		expect(m.keystrokes).toBe(480);
		expect(m.beatsSent).toBe(4);
		expect(m.rowWrites).toBe(4);
		expect(m.throttledByDatabaseRule).toBe(0);

		// ONE ROW, NOT A HISTORY. Four writes to one accumulating row, which is
		// the schema decision the whole privacy argument rests on.
		expect(m.rows).toBe(1);

		// AND THE COUNTER IS THE TIME ACTUALLY WORKED: three credited intervals
		// of thirty seconds. The FIRST beat credits nothing -- there is no
		// interval behind it -- so two minutes of solid typing is 90 seconds and
		// not 120, and a counter that answered 120 would be crediting a gap it
		// has no evidence for.
		expect(m.activeSeconds).toBe(90);
	});

	it('THE OTHER DIRECTION: a client with no rate rule writes 7, not 480', () => {
		// The component the route does NOT mount: one beat per keystroke. This is
		// what the database's own floor is for, and it is the reason the floor is
		// in the function rather than here -- a limit that lives only in the code
		// sending the requests is a promise, and the next caller keeps none of it.
		// One beat per keystroke: the timer fires as often as the keys do and the
		// class has no window to refuse inside.
		const m = twoMinutes({ beatEveryMs: 0, tickEveryMs: 250 });
		// 481, not 480: `start()` beats at once, which is what makes a student
		// appear on the console when they open the assignment rather than half a
		// minute later.
		expect(m.beatsSent).toBe(481);
		expect(m.rowWrites).toBe(7); // 120s / 20s, plus the first beat
		expect(m.throttledByDatabaseRule).toBe(474);
		expect(m.rows).toBe(1);

		// AND THE COUNTER IS 120 HERE AGAINST 90 ABOVE, which is not a better
		// number. Both are correct answers to "how long was this student
		// working" at their own resolution -- 20-second intervals credit six of
		// them, 30-second intervals credit three -- and the finer one costs 120
		// requests for every 1 the real client makes. That is the trade, stated:
		// nothing about the counter argues for beating faster.
		expect(m.activeSeconds).toBe(120);

		// THE COMPARISON IS THE POINT. The real client makes 4 requests where
		// this one makes 480, and the database writes 4 rows where it would have
		// written 7. Narrower on both counts, with no rule of its own beyond the
		// heartbeat it already had.
		const real = twoMinutes({
			beatEveryMs: PRESENCE_LIMITS_FALLBACK.heartbeatSeconds * 1000,
			tickEveryMs: 1_000
		});
		expect(real.beatsSent).toBeLessThan(m.beatsSent);
		expect(real.rowWrites).toBeLessThan(m.rowWrites);
	});
});

describe('`send` is read once at mount, which is why the route keys the element', () => {
	/**
	 * THE FIRST VERSION OF THIS TEST WAS VACUOUS AND THE MUTATION SAID SO.
	 *
	 * It changed the prop and then dispatched `input` and `visibilitychange`. In
	 * happy-dom `document.visibilityState` is `visible` and stays visible, so
	 * `noteVisibility(true)` returned early, and `noteInput` records an instant
	 * and sends nothing by design -- so NO BEAT WAS EMITTED AT ALL after the
	 * swap, and "nothing reached the second transport" passed because nothing
	 * reached anything. A component mutated to re-read `send` on every beat
	 * passed it too, which is how the instrument was caught.
	 *
	 * SO THE BEAT IS FORCED THROUGH THE COMPONENT'S OWN TIMER. `limits` is a real
	 * prop and the component builds its interval from `heartbeatSeconds`, so a
	 * 50ms heartbeat drives the identical `setInterval(() => heart.tick(), ...)`
	 * the production mount runs at 30 seconds. Nothing is stubbed and no private
	 * is reached into; the only thing that changed is how long the test waits.
	 */
	const FAST = { ...PRESENCE_LIMITS_FALLBACK, heartbeatSeconds: 0.05 };

	it('a transport swapped underneath a LIVE mount is never picked up', async () => {
		// TWO ASSIGNMENTS, TWO TRANSPORTS. In the route these are
		// `createPresenceBeatTransport(supabase, data.item.id)` for two different
		// items, and a client-side navigation between them re-runs the item
		// route's load WITHOUT remounting the page.
		const toFirst: PresenceBeat[] = [];
		const toSecond: PresenceBeat[] = [];
		const live = mountWithLiveProps(
			PresenceHeartbeatComponent as unknown as Component<Record<string, unknown>>,
			{ send: (b: PresenceBeat) => toFirst.push(b), limits: FAST }
		);
		expect(toFirst).toHaveLength(1);

		// THE PROP GENUINELY MOVES -- `$state`, flushed -- so what follows is the
		// component declining to re-read it rather than a write nothing was
		// watching. That is `PresenceHeartbeat`'s documented contract ("a remount
		// is what a changed transport should cost"), and it is exactly the
		// hazard: nothing throws, nothing warns, and every later beat lands on
		// the assignment the student has left.
		live.set('send', (b: PresenceBeat) => toSecond.push(b));

		const before = toFirst.length;
		await new Promise((r) => setTimeout(r, 250));
		live.flush();

		// THE POSITIVE CONTROL, AND IT IS THE HALF THE FIRST VERSION OF THIS TEST
		// DID NOT HAVE: beats really did go out during the wait. Without this the
		// zero below is a component that had simply stopped.
		expect(toFirst.length).toBeGreaterThan(before);
		// AND EVERY ONE OF THEM WENT TO THE TRANSPORT CAPTURED AT MOUNT.
		expect(toSecond).toHaveLength(0);

		await live.stop();

		// SO THE ANSWER IS A REMOUNT, which is what `{#key data.item.id}` buys in
		// `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte`: a fresh
		// mount beats immediately, to the new transport.
		mounted = mountInto(PresenceHeartbeatComponent as unknown as Component<Record<string, unknown>>, {
			send: (b: PresenceBeat) => toSecond.push(b)
		});
		mounted.flush();
		expect(toSecond).toEqual([{ typed: false, visible: true }]);
	});
});

describe("a student never sees another student's presence -- the client half", () => {
	/**
	 * 0152 PROVED THE DATABASE HALF, with an anonymous control and a signed-in
	 * peer control against the real RLS policy. What no policy can answer is what
	 * the student's own page PUTS ON SCREEN, and the answer has to be nothing at
	 * all -- not their classmates', and not their own.
	 *
	 * THE CONTROL IS IN THE SAME TEST, ON THE SAME DATA, AND IT IS THE REAL
	 * CONSOLE. An absence measured alone passes on a component that failed to
	 * mount, on a selector that was renamed, and on a fixture that was empty. So
	 * every zero below is reported beside the number the identical peer rows
	 * produce one mount over.
	 */
	const PEERS = [
		{ student_email: 'ben@boscotech.net', display_name: 'Ben Okafor', active: true },
		{ student_email: 'cruz@boscotech.net', display_name: 'Cruz Delgado', active: true }
	];
	const PEER_PRESENCE: PresencePayload = {
		item_id: 'i1',
		section_id: 's1',
		at: new Date().toISOString(),
		limits: PRESENCE_LIMITS_FALLBACK,
		students: [
			{
				student_email: 'ben@boscotech.net',
				state: 'working',
				last_seen_at: new Date(Date.now() - 5_000).toISOString(),
				last_input_at: new Date(Date.now() - 5_000).toISOString(),
				page_visible: true,
				active_seconds: 1_500
			},
			{
				student_email: 'cruz@boscotech.net',
				state: 'away',
				last_seen_at: new Date(Date.now() - 600_000).toISOString(),
				last_input_at: new Date(Date.now() - 650_000).toISOString(),
				page_visible: true,
				active_seconds: 45
			}
		]
	};

	it('the student mount draws no peer, where the instructor mount draws two', async () => {
		// THE STUDENT'S PAGE. One element, the one the route mounts, handed the
		// only transport the route builds -- a BEAT, which has no read in it.
		const sent: PresenceBeat[] = [];
		mounted = mountInto(PresenceHeartbeatComponent as unknown as Component<Record<string, unknown>>, {
			send: (b: PresenceBeat) => sent.push(b)
		});
		mounted.flush();
		const studentHtml = mounted.target.innerHTML;

		const studentCounts = {
			lines: mounted.all('[data-testid="presence-line"]').length,
			chips: mounted.all('[data-testid="presence-chip"]').length,
			never: mounted.all('[data-testid="presence-never"]').length,
			notes: mounted.all('[data-testid="presence-note"]').length,
			elements: mounted.target.querySelectorAll('*').length
		};

		// NOT ONE OF ANYTHING, and no text either -- the component's whole render
		// is empty, so there is no surface for a peer to appear on.
		expect(studentCounts).toEqual({ lines: 0, chips: 0, never: 0, notes: 0, elements: 0 });
		expect(studentHtml.trim()).toBe('');

		// AND NO CLASSMATE'S ADDRESS OR NAME IS ANYWHERE IN IT. Asserted against
		// the literal peer rows so a rename of a test id could not quietly make
		// this pass for the wrong reason.
		for (const p of PEERS) {
			expect(studentHtml).not.toContain(p.student_email);
			expect(studentHtml).not.toContain(p.display_name);
		}
		// Nor is the student's own row on screen. They may READ it -- 0200's
		// policy admits the subject deliberately -- but this page does not show
		// it to them while they work.
		expect(studentHtml).not.toContain('ana@boscotech.net');
		expect(sent).toHaveLength(1);

		await mounted.stop();

		// THE POSITIVE CONTROL: the REAL console, the identical peer rows. If
		// this draws nothing, every zero above is meaningless and this test says
		// so instead of passing.
		mounted = mountInto(GradingConsole as unknown as Component<Record<string, unknown>>, {
			section: { id: 's1', label: 'Period 1', course: { code: 'IDEA100', title: 'Design' } },
			item: { id: 'i1', kind: 'assignment', title: 'Bridge Sketch', body: 'Do it.', points: 20, published: true },
			spec: null,
			rubric: [],
			transports: {
				loadGrading: async () => ({
					ok: true,
					data: { roster: PEERS, submissions: [], responses: [], files: [], approvals: [] }
				})
			},
			presence: { loadPresence: async () => PEER_PRESENCE }
		});
		await mounted.settle();

		const teacherHtml = mounted.target.innerHTML;
		const teacherCounts = {
			lines: mounted.all('[data-testid="presence-line"]').length,
			chips: mounted.all('[data-testid="presence-chip"]').length
		};
		expect(teacherCounts).toEqual({ lines: 2, chips: 2 });
		// The same names the student's mount could not show.
		expect(teacherHtml).toContain('Ben Okafor');
		expect(teacherHtml).toContain('Cruz Delgado');
	});
});
