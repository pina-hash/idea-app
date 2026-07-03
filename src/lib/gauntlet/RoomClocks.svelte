<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * The two live-room timers, both anchored to SERVER timestamps (never a client
	 * clock) and rendered in Share Tech Mono:
	 *   - ROOM: elapsed since the room opened (gauntlet_rooms.created_at). Counts
	 *     the whole session, independent of any single run.
	 *   - RUN: the current attempt, from the round start (the server-stamped
	 *     started_at set by gauntlet_room_start / macro start) until this racer
	 *     submits, at which point it freezes on the server-scored final time.
	 *
	 * A crimson LIVE badge (VIEWPORT reserves --crimson for LIVE / REC / error)
	 * shows while the round is live. A single requestAnimationFrame loop writes the
	 * digits straight to the DOM via textContent, so ticking never re-renders the
	 * page. `clockOffsetMs` (browser - server) corrects the anchor when known;
	 * 0 keeps parity with the room page's existing display clock.
	 */
	let {
		roomOpenedMs = null,
		runStartMs = null,
		live = false,
		runStopped = false,
		runResultMs = null,
		clockOffsetMs = 0
	}: {
		roomOpenedMs?: number | null;
		runStartMs?: number | null;
		live?: boolean;
		/** This racer has submitted; freeze the RUN timer on runResultMs. */
		runStopped?: boolean;
		/** Server-scored final elapsed (ms) to hold when stopped. */
		runResultMs?: number | null;
		clockOffsetMs?: number;
	} = $props();

	let roomEl: HTMLSpanElement | null = $state(null);
	let runEl: HTMLSpanElement | null = $state(null);

	const two = (n: number) => String(n).padStart(2, '0');

	function fmt(ms: number, withCs: boolean): string {
		if (!Number.isFinite(ms) || ms < 0) ms = 0;
		const totalCs = Math.floor(ms / 10);
		const cs = totalCs % 100;
		const totalSec = Math.floor(totalCs / 100);
		const s = totalSec % 60;
		const m = Math.floor(totalSec / 60);
		return withCs ? `${two(m)}:${two(s)}.${two(cs)}` : `${two(m)}:${two(s)}`;
	}

	onMount(() => {
		let raf = 0;
		const paint = () => {
			const now = Date.now() - clockOffsetMs;
			if (roomEl) {
				roomEl.textContent = roomOpenedMs != null ? fmt(now - roomOpenedMs, false) : '--:--';
			}
			if (runEl) {
				if (runStopped) {
					runEl.textContent = runResultMs != null ? fmt(runResultMs, true) : runEl.textContent || '00:00.00';
				} else if (live && runStartMs != null) {
					runEl.textContent = fmt(now - runStartMs, true);
				} else {
					runEl.textContent = '00:00.00';
				}
			}
			raf = requestAnimationFrame(paint);
		};
		paint();
		return () => cancelAnimationFrame(raf);
	});
</script>

<div class="rc" class:live>
	<div class="rc-head">
		<span class="rc-title">Timers</span>
		{#if live}
			<span class="rc-live"><span class="rc-dot"></span>LIVE</span>
		{/if}
	</div>
	<div class="rc-row">
		<div class="rc-timer">
			<span class="rc-label">Room</span>
			<span class="rc-value room" bind:this={roomEl}>--:--</span>
		</div>
		<div class="rc-timer">
			<span class="rc-label">Run</span>
			<span class="rc-value run" class:hot={live && !runStopped} bind:this={runEl}>00:00.00</span>
		</div>
	</div>
</div>

<style>
	.rc {
		display: inline-flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.7rem 1rem;
		background: var(--bg2, #0a1512);
		border: 1px solid var(--line, #16242c);
		border-radius: 6px;
	}
	.rc.live {
		border-color: rgba(255, 60, 40, 0.45);
	}
	.rc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
	}
	.rc-title {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.58rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--dim, #5f8a78);
	}
	.rc-live {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		/* Crimson is reserved for LIVE / REC / error. */
		color: var(--crimson, #ff3b28);
	}
	.rc-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--crimson, #ff3b28);
		box-shadow: 0 0 8px rgba(255, 40, 20, 0.85);
		animation: rc-blink 1.1s steps(1, end) infinite;
	}
	.rc-row {
		display: flex;
		gap: 1.4rem;
	}
	.rc-timer {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.rc-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.56rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--dim, #5f8a78);
	}
	.rc-value {
		font-family: 'Share Tech Mono', monospace;
		font-variant-numeric: tabular-nums;
		font-size: 1.5rem;
		line-height: 1;
		color: var(--white, #e8ffe8);
	}
	.rc-value.room {
		color: var(--cyan, #00f0ff);
	}
	.rc-value.run.hot {
		color: var(--crimson, #ff3b28);
		text-shadow: 0 0 12px rgba(255, 60, 20, 0.5);
	}
	@keyframes rc-blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0.2;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rc-dot {
			animation: none;
		}
	}
</style>
