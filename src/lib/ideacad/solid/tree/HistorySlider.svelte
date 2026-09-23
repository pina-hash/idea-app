<script lang="ts">
	/**
	 * THE HISTORY SLIDER, for the bottom of the workspace: a scrubber over the
	 * build steps (step k is the model with its first k features), the buttons
	 * to walk it, and a Play that runs a time-lapse of the model being built at
	 * a rate the student picks. Every rule about timing is `playback.ts`'s; this
	 * file schedules and draws.
	 *
	 * IT OWNS NO MODEL. The owner hands in how many steps there are and which
	 * one is showing, and hears `onstep(step, { playing, animate })` for every
	 * step it should show. `animate` is false under reduced motion: the step
	 * still comes on time, as a cut rather than a glide.
	 *
	 * SCHEDULED ON A TIMEOUT, NEVER ON ANIMATION FRAMES ALONE: a backgrounded or
	 * throttled window never ticks requestAnimationFrame, and a time-lapse that
	 * silently stops is worse than one that runs late.
	 */
	import { onMount, untrack } from 'svelte';
	import { RATES, RATE_WORDS, createPlayback, isRate, motion, pause, play, seek, setRate, stepBy, stop, sync, tick, waitFor, type Playback } from './playback';
	let { steps, step, onstep, labels = [] }: {
		steps: number;
		step: number;
		onstep: (step: number, how: { playing: boolean; animate: boolean }) => void;
		/** The name of each feature in build order: step k shows `labels[k - 1]`. */
		labels?: readonly string[];
	} = $props();
	let pb = $state<Playback>(untrack(() => createPlayback(steps, step)));
	let reduced = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
	const label = $derived(pb.step > 0 ? (labels[pb.step - 1] ?? '') : '');
	/* The owner's count and position, as they change. */
	$effect(() => { const n = steps, at = step; untrack(() => { pb = sync(pb, n, at); if (!pb.playing) disarm(); }); });
	function disarm() { if (timer) { clearTimeout(timer); timer = null; } }
	function arm() {
		disarm();
		const wait = waitFor(pb, now());
		if (wait !== null) timer = setTimeout(fire, wait);
	}
	function emit() { onstep(pb.step, { playing: pb.playing, animate: motion(reduced, pb.rate).animate }); }
	function fire() {
		timer = null;
		const before = pb.step;
		pb = tick(pb, now());
		if (pb.step !== before) emit();
		arm();
	}
	function go(next: Playback) { const before = pb.step; pb = next; if (pb.step !== before) emit(); arm(); }
	function toggle() { if (pb.playing) go(pause(pb)); else go(play(pb, now())); }
	onMount(() => {
		const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
		const read = () => { reduced = !!query?.matches; };
		read(); query?.addEventListener?.('change', read);
		return () => { query?.removeEventListener?.('change', read); disarm(); };
	});
	const glyph = { start: 'M6 5v14M19 5l-9 7 9 7z', back: 'M17 5l-10 7 10 7z', play: 'M7 4l13 8-13 8z', pause: 'M7 5h3v14H7zM14 5h3v14h-3z', next: 'M7 5l10 7-10 7z', stop: 'M6 6h12v12H6z' } as const;
</script>
{#snippet icon(d: string)}<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path {d} fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /></svg>{/snippet}
<div class="history" role="group" aria-label="Build history" data-testid="ideacad-history-slider" class:playing={pb.playing} class:reduced>
	<div class="controls">
		<button type="button" class="ctl" data-control="start" aria-disabled={pb.step === 0 ? 'true' : undefined} onclick={() => go(seek(pb, 0))}>{@render icon(glyph.start)}<span>Start</span></button>
		<button type="button" class="ctl" data-control="back" aria-disabled={pb.step === 0 ? 'true' : undefined} onclick={() => go(stepBy(pb, -1))}>{@render icon(glyph.back)}<span>Back</span></button>
		<button type="button" class="ctl play" data-control="play" aria-pressed={pb.playing} aria-disabled={pb.steps === 0 ? 'true' : undefined} onclick={toggle}>{@render icon(pb.playing ? glyph.pause : glyph.play)}<span>{pb.playing ? 'Pause' : 'Play'}</span></button>
		<button type="button" class="ctl" data-control="next" aria-disabled={pb.step >= pb.steps ? 'true' : undefined} onclick={() => go(stepBy(pb, 1))}>{@render icon(glyph.next)}<span>Next</span></button>
		<button type="button" class="ctl" data-control="stop" onclick={() => go(stop(pb))}>{@render icon(glyph.stop)}<span>Stop</span></button>
	</div>
	<label class="scrub">
		<span class="sr-only">Build step</span>
		<input type="range" min="0" max={pb.steps} step="1" value={pb.step} aria-valuetext={`Step ${pb.step} of ${pb.steps}${label ? `, ${label}` : ''}`} oninput={(e) => go(seek(pb, Number(e.currentTarget.value)))} />
	</label>
	<output class="readout" aria-live="off"><span class="count">{pb.step} / {pb.steps}</span>{#if label}<span class="name">{label}</span>{/if}</output>
	<label class="speed"><span class="speed-word">Speed</span>
		<select value={pb.rate} onchange={(e) => { const r = Number(e.currentTarget.value); if (isRate(r)) go(setRate(pb, r, now())); }}>
			{#each RATES as rate (rate)}<option value={rate}>{RATE_WORDS[rate]}</option>{/each}
		</select>
	</label>
</div>
<style>
	.history{container-type:inline-size;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:4px 8px;box-sizing:border-box;min-width:0;background:var(--surface-1);border-top:1px solid var(--hairline);font-family:Rajdhani,sans-serif;color:var(--text-1)}
	.controls{display:flex;gap:4px;flex-shrink:0}
	.ctl{min-height:44px;min-width:44px;display:inline-flex;align-items:center;gap:6px;padding:0 10px;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-2);color:var(--text-1);font:600 14px Rajdhani,sans-serif;cursor:pointer;white-space:nowrap}.ctl:hover{border-color:var(--green)}.ctl:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}.ctl[aria-disabled="true"]{color:var(--text-2);border-style:dashed;cursor:default}.ctl[aria-disabled="true"]:hover{border-color:var(--boundary)}
	.play{min-width:84px;justify-content:center}.play[aria-pressed="true"]{border-color:var(--green);color:var(--green);background:var(--green-tint,color-mix(in srgb,var(--green) 12%,var(--surface-1)))}
	.scrub{flex:1 1 160px;min-width:140px;display:flex;align-items:center;min-height:44px}.scrub input{width:100%;min-height:44px;margin:0;background:transparent;border:0;box-shadow:none;accent-color:var(--green)}
	.readout{display:flex;align-items:baseline;gap:8px;min-width:0;max-width:220px;flex:0 1 auto}.count{font:14px 'Share Tech Mono',monospace;color:var(--text-1);white-space:nowrap}.name{font-size:14px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.speed{display:flex;align-items:center;gap:6px;flex-shrink:0}.speed-word{font:11px 'Share Tech Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--text-2)}.speed select{min-height:44px;min-width:64px;padding:0 8px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:14px 'Share Tech Mono',monospace}
	/* A PHONE: the five controls fit one row with their words, and the scrubber, the count and the speed share the second. The feature's name is the one thing that goes; the stage and the scrubber's own reading still say it. Measured, not guessed: at 375 and 414 the five controls take 342.7px and the bar is two rows, 103px, with nothing off screen; at 960 and 1440 it is one row, 53px. Before this rule, Stop ran off the right edge at 375. */
	@container (max-width: 440px){.controls{gap:4px}.ctl{padding:0 8px;gap:4px}.play{min-width:0}.name{display:none}.scrub{flex-basis:120px;min-width:100px}.speed{gap:4px}}
	.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
	@media(prefers-reduced-motion:no-preference){.ctl{transition:border-color .12s ease,background-color .12s ease}}
</style>
