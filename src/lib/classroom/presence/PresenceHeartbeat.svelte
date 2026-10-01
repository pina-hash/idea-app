<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { PresenceHeartbeat, type PresenceBeat } from './heartbeat';
	import { PRESENCE_BEAT_STRETCH, PRESENCE_LIMITS_FALLBACK, type PresenceLimits } from './state';
	import { POLL_JITTER, startPoller, type Poller, type PollOutcome } from '../poll';
	import { pollSessionKey, pollSignedOut } from '../poll-session';

	/**
	 * THE STUDENT SIDE, MOUNTED ON THE PAGE THEY ARE WORKING ON. It renders
	 * NOTHING -- there is no chip, no dot and no sentence, because a student is
	 * not the audience for their own presence and a widget saying "you are being
	 * timed" is a widget that changes the thing it measures.
	 *
	 * WHICH IS NOT THE SAME AS HIDING IT. A student can read their own presence
	 * row: `0200`'s RLS policy admits the subject of the row, deliberately and
	 * with the reasoning in its header. What this component does not do is put it
	 * on screen while they work.
	 *
	 * EVERY DECISION IS IN `heartbeat.ts` AND `$lib/classroom/poll` AND NONE IS
	 * HERE. This attaches four listeners and the shared poller to a
	 * `PresenceHeartbeat` and gets out of the way, so the rules are assertable at
	 * a pinned instant with no browser.
	 *
	 * `send` IS CALLER-SUPPLIED CODE AND EVERY CALL TO IT IS UNTRACKED. That is
	 * the `effect_update_depth_exceeded` rule: a transport written by whoever
	 * mounts this reads and writes whatever it likes before its first await, and
	 * anything reactive it touches would otherwise join this effect's dependency
	 * set. The real transport is a plain Supabase call with no reactivity in it,
	 * which is exactly the state the composer's was in the day before a harness
	 * handed it a stateful one.
	 *
	 * LISTENERS ARE ATTACHED WITH `addEventListener` rather than through a
	 * binding, because they are on `document` and `window` and there is no
	 * element here to bind to.
	 */
	let {
		send,
		announce = null,
		limits = PRESENCE_LIMITS_FALLBACK,
		onbeat = null
	}: {
		/**
		 * Fire and forget. A beat that does not land costs one poll interval; a
		 * transport that says how it went lets the beat back off a failing database
		 * and stop when the session is gone (ledger 0357).
		 */
		send: (beat: PresenceBeat) => void | Promise<PollOutcome>;
		/** The payload-free live notice, if the mounting surface has a bus. */
		announce?: (() => void) | null;
		limits?: PresenceLimits;
		/** The harness's window onto what was sent. Absent in production. */
		onbeat?: ((beat: PresenceBeat) => void) | null;
	} = $props();

	/** The running poller, for the auth effect below. Not reactive state. */
	let poller: Poller | null = null;

	onMount(() => {
		// Read once, untracked: a remount is what a changed transport should cost,
		// not a re-subscription inside a live effect.
		const sendNow = untrack(() => send);
		const announceNow = untrack(() => announce);
		const onbeatNow = untrack(() => onbeat);
		// The page beats at 4/3 of the database's heartbeat (ledger 0357); see
		// `PRESENCE_BEAT_STRETCH` for why that ratio and no more.
		const beatMs = Math.round(untrack(() => limits.heartbeatSeconds) * 1000 * PRESENCE_BEAT_STRETCH);
		const inputMs = untrack(() => limits.inputWindowSeconds) * 1000;

		/** The outcome of the beat the current run sent, if it sent one. */
		let sent: Promise<PollOutcome> | null = null;
		/**
		 * HOW THE LAST BEAT WENT, WHICHEVER PATH SENT IT (the poller's run, or the
		 * hide report a visibility change sends on its own). A run whose tick was
		 * throttled sends nothing, and reporting `ok` for it would reset a backoff
		 * and hide a lost session, so it reports this instead.
		 */
		let lastOutcome: PollOutcome = 'ok';

		const heart = new PresenceHeartbeat({
			now: () => Date.now(),
			send: (beat) => {
				const r = sendNow(beat);
				sent = r instanceof Promise ? r : null;
				if (sent) {
					void sent.then(
						(o) => {
							lastOutcome = o;
						},
						() => {
							lastOutcome = 'failed';
						}
					);
				}
				onbeatNow?.(beat);
			},
			announce: announceNow ?? undefined,
			// THE CLASS'S OWN THROTTLE SITS UNDER THE JITTER'S FLOOR (ledger 0357).
			// The poller beats at the heartbeat +/- POLL_JITTER, so its shortest wait
			// is 80% of it; a throttle at the full heartbeat would swallow every
			// early beat and turn 30s into 54s, past the database's 60s credit cap.
			// 80% less half a second still clears the database's own 20s floor
			// (`_classroom_presence_min_gap`, 0200), which is what bounds the rate.
			heartbeatMs: Math.max(0, Math.floor(beatMs * (1 - POLL_JITTER)) - 500),
			inputWindowMs: inputMs
		});

		/**
		 * THE LISTENER NEVER LOOKS AT THE EVENT. Not the target, not the key, not
		 * the value. It records that some input happened, which is the whole of
		 * what leaves this page about what a student typed.
		 */
		const onInput = () => heart.noteInput();
		/**
		 * GOING HIDDEN sends the one hide report at once. COMING BACK goes through
		 * the poller (`runNow`), so the return beat is a poller run: its outcome is
		 * read, and the next wait restarts from it. Without that, a short tab switch
		 * left the old timer's phase in place, the class's throttle swallowed the
		 * tick that followed the return beat, and the next real beat landed up to
		 * 80 seconds later, past the database's 60-second credit cap.
		 */
		const onVisibility = () => {
			if (document.visibilityState === 'visible') poller?.runNow();
			else heart.noteVisibility(false);
		};

		heart.noteVisibility(document.visibilityState === 'visible');

		document.addEventListener('input', onInput, { capture: true, passive: true });
		document.addEventListener('keydown', onInput, { capture: true, passive: true });
		document.addEventListener('pointerdown', onInput, { capture: true, passive: true });
		// Registered BEFORE the poller's own listener, so a return to the tab beats
		// here first and the poller's poke that follows is throttled to nothing:
		// one beat per return.
		document.addEventListener('visibilitychange', onVisibility);

		/**
		 * THE POLLER IS THE BEAT'S ONLY CLOCK (ledger 0357), and `tick()` is
		 * idempotent inside the class's throttle, so it needs no rate rule of its
		 * own. IMMEDIATE, because the first beat is what makes a student appear
		 * on the console the moment they open the work; every later beat is
		 * jittered, waits while the tab is hidden, backs off a failing database,
		 * and a signed-out answer stops the heart for good. It is timeout-based,
		 * never `requestAnimationFrame`: a backgrounded tab never ticks rAF,
		 * which is precisely the state this component exists to report.
		 */
		poller = startPoller({
			intervalMs: beatMs,
			immediate: true,
			pokeGapMs: beatMs,
			// A run only ever happens while the tab is visible (the poller holds a
			// due run for the return), so each branch beats as visible: a restart
			// after a lost session, a return to the tab, or the ordinary tick.
			run: async () => {
				sent = null;
				if (!heart.running) {
					// `start()` beats when the heart believes it is visible; a heart
					// stopped while hidden still believes it is not, so it is told.
					heart.start();
					if (!heart.visible) heart.noteVisibility(true);
				} else if (!heart.visible) heart.noteVisibility(true);
				else heart.tick();
				const outcome = sent as Promise<PollOutcome> | null;
				sent = null;
				return outcome ? await outcome : lastOutcome;
			},
			onSignedOut: () => {
				heart.stop();
				pollSignedOut();
			}
		});

		return () => {
			poller?.stop();
			poller = null;
			heart.stop();
			document.removeEventListener('input', onInput, { capture: true });
			document.removeEventListener('keydown', onInput, { capture: true });
			document.removeEventListener('pointerdown', onInput, { capture: true });
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	/** A NEW session (a refreshed token) restarts a heart a lost one stopped. */
	$effect(() => {
		const key = pollSessionKey(page.data.claims);
		untrack(() => poller?.authChanged(key));
	});
</script>
