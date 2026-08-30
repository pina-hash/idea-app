<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import NavigationProgress from '$lib/NavigationProgress.svelte';
	import Pending from '$lib/Pending.svelte';

	/**
	 * The harness page. It mounts the REAL components -- never a copy of their
	 * markup -- and adds three probes the browser harness reads back:
	 *
	 *   __navShift     layout shift caused by the indicator appearing, measured
	 *                  two independent ways, plus a NEGATIVE CONTROL that puts
	 *                  the same bar in flow and must move the page.
	 *   __navContrast  the bar's own ratios, painted to a canvas and read back.
	 *   __navProbe     (in the layout) the real-navigation observations.
	 *
	 * The forced indicator below is a SECOND instance under its own testid. The
	 * real one is mounted by the root layout, exactly as in production, and both
	 * are on this page at once -- which is itself the reason the testid is a
	 * prop rather than a literal.
	 */

	let forced = $state(false);

	/**
	 * `?force=1` PINS THE BAR ON for the whole visit, which is what the
	 * reduced-motion sweep needs: `motion` flips the media feature and re-reads
	 * the SAME elements twice, so an element that only exists inside a probe's
	 * own toggle is gone before the second read and the sweep reports nothing
	 * to animate -- which the check counts as a FAILURE, correctly, and which
	 * would be a fixture gap rather than a finding.
	 *
	 * READ FROM `page.url` IN THE COMPONENT, never from a load. The layout load
	 * above must not read `url` (it would re-run on every navigation and stop
	 * outliving the ones the probe measures), and a page load is not needed for
	 * a value the template can derive.
	 */
	const pinned = $derived(page.url.searchParams.get('force') === '1');

	// ---------------------------------------------------------------- shift

	type ShiftReading = {
		/** Cumulative layout-shift score reported by the browser itself. */
		cls: number;
		/** Movement of a reference element's top edge, in px. The deterministic half. */
		refTopDeltaPx: number;
	};

	async function measureShift(inFlow: boolean): Promise<ShiftReading> {
		const ref = document.querySelector('[data-testid="shift-ref"]')!;
		const style = document.createElement('style');
		if (inFlow) {
			/*
			 * THE NEGATIVE CONTROL. This is the defect the design avoids, written
			 * out: an indicator that takes a line box instead of being fixed. If
			 * this reading comes back 0 too, the probe cannot see a shift and the
			 * real reading proves nothing -- which is the whole reason it is here.
			 */
			style.setAttribute('data-shift-control', '1');
			style.textContent =
				'[data-testid="nav-progress-forced"] { position: static !important; }';
			document.head.appendChild(style);
		}

		let cls = 0;
		const obs = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const e = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
				if (!e.hadRecentInput) cls += e.value;
			}
		});
		obs.observe({ type: 'layout-shift', buffered: false });

		const before = ref.getBoundingClientRect().top;
		forced = true;
		await settle();
		const during = ref.getBoundingClientRect().top;
		forced = false;
		await settle();

		obs.disconnect();
		if (inFlow) style.remove();
		return { cls: Number(cls.toFixed(4)), refTopDeltaPx: Math.round((during - before) * 100) / 100 };
	}

	/**
	 * Two timeouts rather than one rAF: rAF does not fire in a hidden or
	 * throttled window, and a shift reading taken before the flush landed is a
	 * zero that means nothing.
	 */
	const settle = () =>
		new Promise<void>((r) => setTimeout(() => setTimeout(() => r(), 60), 60));

	// ------------------------------------------------------------- contrast

	/**
	 * PAINT AND READ THE PIXEL BACK, the way the harness's own contrast check
	 * does, because a regex over computed styles skips `color-mix()` silently
	 * and this bar's TRACK is a `color-mix()`.
	 *
	 * THE HARNESS'S CHECK CANNOT DO THIS ONE. `contrast` in `checks.mjs`
	 * measures an element's `color` against the ground it sits on -- text ink.
	 * The bar has no text: what has to clear a threshold here is a BACKGROUND
	 * against another background, at the 3:1 non-text floor rather than 4.5:1.
	 * So the arithmetic is here, and because a second copy of a formula is the
	 * thing that quietly stops matching, it carries its own oracle (below)
	 * rather than being trusted.
	 */
	function ratioOf(fg: string, bg: string): number {
		const c = document.createElement('canvas');
		c.width = c.height = 1;
		const ctx = c.getContext('2d', { willReadFrequently: true })!;
		const px = (colour: string, over: string | null): [number, number, number] => {
			ctx.clearRect(0, 0, 1, 1);
			if (over) {
				ctx.fillStyle = over;
				ctx.fillRect(0, 0, 1, 1);
			}
			ctx.fillStyle = colour;
			ctx.fillRect(0, 0, 1, 1);
			const d = ctx.getImageData(0, 0, 1, 1).data;
			return [d[0], d[1], d[2]];
		};
		const lum = ([r, g, b]: [number, number, number]) => {
			// WCAG 2.x relative luminance. The divisor is 1.055, and this line is
			// why the probe below exists: written 2.055 by hand, it reported
			// --green on --bg0 as 2.50:1 where the real figure is 7.54:1 -- a
			// plausible-looking number, in the failing direction, that would have
			// been "measured" straight into a report.
			const f = (v: number) => {
				const s = v / 255;
				return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
			};
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		// The foreground is composited OVER the ground first, so an alpha or a
		// color-mix() resolves against what is actually behind it.
		const a = lum(px(fg, bg));
		const b = lum(px(bg, null));
		const [hi, lo] = a > b ? [a, b] : [b, a];
		return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
	}

	/**
	 * THE INSTRUMENT'S OWN POSITIVE CONTROL, three pairs whose answers are
	 * fixed by the specification rather than by this code: black on white is
	 * 21:1 exactly, a colour on itself is 1:1 exactly, and #767676 on white is
	 * the canonical 4.54:1 borderline WCAG's own worked examples use. A probe
	 * that cannot reproduce those is reporting arithmetic, not contrast, and
	 * says so instead of returning numbers.
	 */
	function probeSelfCheck(): string | null {
		const cases: [string, string, number][] = [
			['rgb(0,0,0)', 'rgb(255,255,255)', 21],
			['rgb(120,184,112)', 'rgb(120,184,112)', 1],
			['rgb(118,118,118)', 'rgb(255,255,255)', 4.54]
		];
		const bad = cases
			.map(([fg, bg, want]) => [fg, bg, want, ratioOf(fg, bg)] as const)
			.filter(([, , want, got]) => Math.abs(got - want) > 0.02);
		return bad.length === 0
			? null
			: bad.map(([fg, bg, want, got]) => `${fg} on ${bg}: want ${want}, got ${got}`).join('; ');
	}

	async function measureContrast() {
		forced = true;
		/* THE FLUSH IS NOT OPTIONAL. Reading the DOM in the same tick as the
		   state write measured a bar that was not rendered yet and returned four
		   nulls -- which reads exactly like a broken selector and is nothing of
		   the kind. Settled on a timeout, never rAF, for the reason above. */
		await settle();
		const root = document.querySelector('[data-testid="nav-progress-forced"]')!;
		const track = root.querySelector('.nav-prog-track') as HTMLElement | null;
		const sweep = root.querySelector('.nav-prog-sweep') as HTMLElement | null;
		const ground = getComputedStyle(document.body).backgroundColor;
		const trackBg = track ? getComputedStyle(track).backgroundColor : null;
		const sweepBg = sweep ? getComputedStyle(sweep).backgroundColor : null;
		const out = {
			instrument: probeSelfCheck() ?? 'ok (21:1, 1:1, 4.54:1 reproduced)',
			ground,
			trackBg,
			sweepBg,
			/* Each ratio names what it is against, because "the bar's contrast"
			   is three different questions and only one of them is the gate. */
			trackVsGround: trackBg ? ratioOf(trackBg, ground) : null,
			sweepVsGround: sweepBg ? ratioOf(sweepBg, ground) : null,
			/* The track is a color-mix WITH ALPHA, so it is composited over the
			   page ground before it can be used as a ground itself. Passing the
			   raw declared value here read 1.01:1 for a pair visibly two stops
			   apart. */
			sweepVsTrack:
				sweepBg && trackBg
					? ratioOf(sweepBg, compositeOver(trackBg, ground))
					: null
		};
		forced = false;
		await settle();
		return out;
	}

	/** Flatten an alpha colour onto an opaque one and return the opaque result. */
	function compositeOver(colour: string, ground: string): string {
		const c = document.createElement('canvas');
		c.width = c.height = 1;
		const ctx = c.getContext('2d', { willReadFrequently: true })!;
		ctx.fillStyle = ground;
		ctx.fillRect(0, 0, 1, 1);
		ctx.fillStyle = colour;
		ctx.fillRect(0, 0, 1, 1);
		const d = ctx.getImageData(0, 0, 1, 1).data;
		return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
	}

	onMount(() => {
		const w = window as unknown as Record<string, unknown>;
		w.__measureNavShift = async () => {
			const real = await measureShift(false);
			const control = await measureShift(true);
			const reading = {
				real,
				control,
				/*
				 * THE VERDICT IS TWO CLAUSES AND BOTH MUST HOLD. "the real bar
				 * shifts nothing" on its own is satisfied by a probe that cannot
				 * see a shift at all, which is why the control's non-zero reading
				 * is part of the same string the harness compares.
				 */
				verdict:
					real.refTopDeltaPx === 0 && real.cls === 0
						? control.refTopDeltaPx > 0
							? 'fixed: 0 shift, control moved'
							: 'fixed: 0 shift, CONTROL ALSO 0 (probe is blind)'
						: 'fixed: SHIFTED'
			};
			w.__navShift = reading;
			return reading;
		};
		w.__measureNavContrast = async () => {
			const reading = await measureContrast();
			w.__navContrast = reading;
			return reading;
		};
		return () => {
			delete w.__measureNavShift;
			delete w.__measureNavContrast;
			delete w.__navShift;
			delete w.__navContrast;
		};
	});
</script>

<svelte:head><title>dev // navigation indicator</title></svelte:head>

<!-- The REAL component, pinned on, so the painted bar can be measured without
     racing a navigation. Its own testid so it is distinguishable from the live
     one the root layout mounts. -->
<NavigationProgress force={forced || pinned} testid="nav-progress-forced" />

<div class="page">
	<section class="card">
		<h2>1. The route-transition indicator</h2>
		<p class="note">
			The live indicator is mounted by the root layout, exactly as in production. These two
			links navigate for real: one load resolves immediately, the other sleeps past the
			delay gate.
		</p>
		<p class="links">
			<a class="btn" data-testid="nav-fast" href="/dev/navigation/0">Navigate (0ms load)</a>
			<a class="btn" data-testid="nav-slow" href="/dev/navigation/1200"
				>Navigate (1200ms load)</a
			>
		</p>
		<p class="note" data-testid="shift-ref">
			This paragraph is the layout-shift reference. Its top edge is read before and during
			the forced indicator; a fixed overlay cannot move it.
		</p>
	</section>

	<section class="card">
		<h2>2. The shared pending primitive</h2>
		<p class="note">Block variant, full width:</p>
		<Pending label="Loading the roster" />

		<p class="note">
			Inline variant, in a sentence: <Pending label="Checking" variant="inline" /> and the
			sentence continues.
		</p>

		<p class="note">
			A deliberately narrow pane. The label is longer than the pane is wide, so a primitive
			that did not wrap would push the page wider than the viewport here first.
		</p>
		<div class="narrow" data-testid="narrow-pane">
			<Pending label="Loading every earlier revision of this document" />
		</div>
	</section>
</div>

<style>
	.page {
		padding: 1rem;
		display: grid;
		gap: 1rem;
		max-width: 70ch;
		margin: 0 auto;
	}
	.card {
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 6px);
		padding: 1rem;
	}
	h2 {
		margin: 0 0 0.5rem;
		color: var(--text-1);
		font-size: 1rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	/* 140px, chosen so the longest label above cannot fit on one line: the
	   overflow check has something to find if the primitive stops wrapping. */
	.narrow {
		width: 140px;
		border: 1px dashed var(--hairline);
		padding: 0.4rem;
	}
</style>
