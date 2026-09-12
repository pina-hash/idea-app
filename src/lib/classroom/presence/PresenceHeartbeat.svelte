<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { PresenceHeartbeat, type PresenceBeat } from './heartbeat';
	import { PRESENCE_LIMITS_FALLBACK, type PresenceLimits } from './state';

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
	 * EVERY DECISION IS IN `heartbeat.ts` AND NONE IS HERE. This attaches four
	 * listeners and an interval to a `PresenceHeartbeat` and gets out of the way,
	 * so the rules are assertable at a pinned instant with no browser.
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
		/** Fire and forget. A beat that does not land costs one poll interval. */
		send: (beat: PresenceBeat) => void;
		/** The payload-free live notice, if the mounting surface has a bus. */
		announce?: (() => void) | null;
		limits?: PresenceLimits;
		/** The harness's window onto what was sent. Absent in production. */
		onbeat?: ((beat: PresenceBeat) => void) | null;
	} = $props();

	onMount(() => {
		// Read once, untracked: a remount is what a changed transport should cost,
		// not a re-subscription inside a live effect.
		const sendNow = untrack(() => send);
		const announceNow = untrack(() => announce);
		const onbeatNow = untrack(() => onbeat);
		const beatMs = untrack(() => limits.heartbeatSeconds) * 1000;
		const inputMs = untrack(() => limits.inputWindowSeconds) * 1000;

		const heart = new PresenceHeartbeat({
			now: () => Date.now(),
			send: (beat) => {
				sendNow(beat);
				onbeatNow?.(beat);
			},
			announce: announceNow ?? undefined,
			heartbeatMs: beatMs,
			inputWindowMs: inputMs
		});

		/**
		 * THE LISTENER NEVER LOOKS AT THE EVENT. Not the target, not the key, not
		 * the value. It records that some input happened, which is the whole of
		 * what leaves this page about what a student typed.
		 */
		const onInput = () => heart.noteInput();
		const onVisibility = () => heart.noteVisibility(document.visibilityState === 'visible');

		heart.noteVisibility(document.visibilityState === 'visible');
		heart.start();

		document.addEventListener('input', onInput, { capture: true, passive: true });
		document.addEventListener('keydown', onInput, { capture: true, passive: true });
		document.addEventListener('pointerdown', onInput, { capture: true, passive: true });
		document.addEventListener('visibilitychange', onVisibility);

		/**
		 * THE INTERVAL IS THE BEAT'S ONLY DRIVER, and `tick()` is idempotent
		 * inside a heartbeat window, so this needs no rate rule of its own. It is
		 * a TIMEOUT-based interval rather than anything riding on
		 * `requestAnimationFrame`: a backgrounded tab never ticks rAF, which is
		 * precisely the state this component exists to report.
		 */
		const timer = setInterval(() => heart.tick(), beatMs);

		return () => {
			clearInterval(timer);
			heart.stop();
			document.removeEventListener('input', onInput, { capture: true });
			document.removeEventListener('keydown', onInput, { capture: true });
			document.removeEventListener('pointerdown', onInput, { capture: true });
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>
