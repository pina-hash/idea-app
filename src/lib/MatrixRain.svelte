<script lang="ts">
	import { untrack } from 'svelte';
	import {
		RAIN,
		GLYPH_COUNT,
		glyphAt,
		createColumns,
		stepColumns,
		bandGain,
		fadeAlpha,
		trailAlpha,
		tailRows,
		mulberry32,
		headColour,
		type CellEvent,
		type Column
	} from '$lib/design-system/themes/matrix-rain';

	/**
	 * THE RAIN, THE HALF THAT PAINTS. A `<canvas>` inside the shell's own
	 * `.bg-fx` layer, driven by `requestAnimationFrame`, drawing the columns
	 * `$lib/design-system/themes/matrix-rain.ts` simulates. It renders NO
	 * MARKUP: the canvas is created and placed imperatively while `active` is
	 * true and removed when it stops being, so the server, the client before
	 * hydration and a browser with the theme off all hold an identical DOM --
	 * there is no `{#if}` block for SSR and the client to disagree about.
	 *
	 * WHY IT LIVES INSIDE `.bg-fx` RATHER THAN BESIDE IT. That element is
	 * already the shell's decorative background: `position: fixed`,
	 * `pointer-events: none`, `z-index: 0`, `aria-hidden`, mounted once in the
	 * root layout -- so a child of it can change no geometry, eat no tap and
	 * reach no reader, and inherits the one thing a sibling could not: every
	 * room that suppresses the shell background (`body:has(.cr-root) .bg-fx
	 * { display: none }`, the notebook, the Foundry, the projector view)
	 * suppresses the rain in the same declaration. A room that paints its own
	 * opaque plate is a room the rain does not belong in, and nothing here has
	 * to know the list. With the host at 0x0 the loop does not run at all.
	 *
	 * WHAT IT COSTS AND WHY IT IS A CANVAS. Measured in the harness Chromium
	 * with software raster (`--disable-gpu`) at 1440x900 and 375x667 against a
	 * DOM/CSS column field, an SVG field and a WebGL point field: 2D canvas was
	 * the cheapest at 375 and within a few ms/s of the cheapest at 1440, with
	 * zero style and layout work -- glyph mutation costs a `drawImage`, where
	 * in the DOM it costs a relayout. WebGL is SwiftShader in that container
	 * and could not be measured fairly. The per-frame work is ONE alpha strip
	 * over the canvas (`destination-out`) plus a few `drawImage`s per column
	 * advance from a pre-rendered glyph atlas; no `fillText` on the hot path.
	 * On the real /dev/themes page, painting on every other animation frame,
	 * the rain costs 97 ms/s of main thread at 1440 and 19 ms/s at 375 over
	 * the unthemed page (166 and 83 against 69 and 64), of which the loop's
	 * own script is 10 and 5; the page's frame loop stays at 60 fps. Painting
	 * on every frame cost 292 ms/s at 1440, which is why it does not.
	 *
	 * A DEVICE THAT CANNOT KEEP UP IS DEGRADED, NOT LEFT STUTTERING. Frame
	 * intervals are watched; `RAIN.slowFramesToDegrade` slow frames in a row
	 * halve the update rate, and the same again parks the field as a still
	 * frame and stops the loop. `data-motion` on the canvas says which state
	 * it is in, so a harness can read it rather than guess.
	 *
	 * REDUCED MOTION: NOTHING ANIMATES, NOTHING IS HIDDEN. With the preference
	 * set, no frame is ever scheduled and the canvas holds a deliberate STILL
	 * -- a seeded field of parked streaks, heads and fading tails -- which is
	 * the running picture with the clock stopped rather than a blank ground.
	 * The query is listened to, so flipping it mid-session stops or starts
	 * the loop without a reload.
	 *
	 * rAF AND NOT rAF-OR-TIMEOUT, DELIBERATELY. CLAUDE.md's "schedule on
	 * rAF-or-timeout" rule is for work that must run while a tab is hidden.
	 * A decorative background is the opposite case: a hidden tab should cost
	 * nothing, and rAF pausing there is the behaviour wanted. The return from
	 * hidden is clamped (`fadeAlpha` caps its frame, the slow-frame counter
	 * ignores a gap over 250ms) so the field is not wiped or degraded by the
	 * one long interval that a tab switch produces.
	 */
	let { active = false }: { active?: boolean } = $props();

	$effect(() => {
		/* Track the one input; untrack the work, which touches the DOM and the
		   clock and must not become a dependency of this effect. */
		const on = active;
		if (!on) return;
		return untrack(mountRain);
	});

	function mountRain(): (() => void) | undefined {
		const found = document.querySelector('.bg-fx');
		if (!(found instanceof HTMLElement)) return; // no shell background here: nothing to rain on
		const host: HTMLElement = found;
		const canvas = document.createElement('canvas');
		canvas.className = 'matrix-rain';
		canvas.setAttribute('aria-hidden', 'true');
		canvas.dataset.motion = 'idle';
		canvas.dataset.frames = '0';
		Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
		host.appendChild(canvas);
		const ctx = canvas.getContext('2d', { alpha: true });
		if (!ctx) {
			canvas.remove();
			return;
		}

		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		const rng: () => number = Math.random;
		const events: CellEvent[] = [];
		let alive = true;
		let raf = 0;
		let last = 0;
		let level = 0; // 0 full rate, 1 half rate, 2 parked
		let slow = 0;
		let parity = 0;
		let pendingMs = 0;
		let frames = 0;
		let cssW = 0;
		let cssH = 0;
		let dpr = 1;
		let cols = 0;
		let rows = 0;
		let columns: Column[] = [];
		let gains: number[] = [];
		let atlas: HTMLCanvasElement | null = null;
		let atlasCell = 0;

		/* One offscreen canvas holding every glyph twice over -- head colour
		   on the first row, trail colour on the second -- so the hot path is
		   a `drawImage` of a cell-sized sprite and never a `fillText`. The
		   upper half of the glyph index space is the same set mirrored. */
		function buildAtlas() {
			atlasCell = Math.ceil(RAIN.cell * dpr);
			const a = document.createElement('canvas');
			a.width = atlasCell * GLYPH_COUNT;
			a.height = atlasCell * 2;
			const c = a.getContext('2d');
			if (!c) return;
			c.font = `${RAIN.cell * dpr}px ${RAIN.font}`;
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			const rowsOf: [number, string][] = [
				[0, RAIN.head],
				[1, RAIN.trail]
			];
			for (const [rowIdx, colour] of rowsOf) {
				c.fillStyle = colour;
				for (let g = 0; g < GLYPH_COUNT; g++) {
					const { char, mirrored } = glyphAt(g);
					c.save();
					c.translate(g * atlasCell + atlasCell / 2, rowIdx * atlasCell + atlasCell / 2);
					if (mirrored) c.scale(-1, 1);
					c.fillText(char, 0, 0);
					c.restore();
				}
			}
			atlas = a;
		}

		/* A head takes the bright atlas row only where its column's gain says
		   it may (`headColour`): outside the content band. Under the page's
		   copy every cell is the trail colour, so the brightest pixel the rain
		   can put behind a word is the one the worst-frame test measured. */
		function drawCell(col: number, row: number, kind: CellEvent['kind'], glyph: number, alpha: number) {
			if (!atlas) return;
			const x = col * RAIN.cell;
			const y = row * RAIN.cell;
			const bright = kind === 'head' && headColour(gains[col]) === RAIN.head;
			ctx!.clearRect(x, y, RAIN.cell, RAIN.cell);
			ctx!.globalAlpha = alpha;
			ctx!.drawImage(atlas, glyph * atlasCell, (bright ? 0 : 1) * atlasCell, atlasCell, atlasCell, x, y, RAIN.cell, RAIN.cell);
		}

		/* The still frame: a seeded field of parked streaks, so a reader with
		   reduced motion set -- or a machine that could not keep up -- sees the
		   rain with its clock stopped, and sees the same picture on reload. */
		function drawStill() {
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx!.clearRect(0, 0, cssW, cssH);
			const seeded = mulberry32(cssW * 7919 + cssH);
			const field = createColumns(cols, rows, seeded);
			for (let i = 0; i < field.length; i++) {
				const c = field[i];
				const head = ((c.head % rows) + rows) % rows;
				const tail = tailRows(c.speed);
				drawCell(i, head, 'head', Math.floor(seeded() * GLYPH_COUNT), gains[i]);
				for (let d = 1; d <= tail; d++) {
					const row = head - d;
					if (row < 0) break;
					const a = trailAlpha(d, c.speed) * gains[i];
					if (a < 0.03) break;
					drawCell(i, row, 'trail', Math.floor(seeded() * GLYPH_COUNT), a);
				}
			}
			ctx!.globalAlpha = 1;
		}

		function frame(now: number) {
			if (!alive) return;
			raf = requestAnimationFrame(frame);
			const dt = last ? now - last : 1000 / 60;
			last = now;
			/* A gap over 250ms is a tab that was hidden, not a slow device. */
			if (dt < 250) {
				if (dt > RAIN.slowFrameMs) {
					if (++slow >= RAIN.slowFramesToDegrade) {
						slow = 0;
						level += 1;
						if (level >= 2) {
							cancelAnimationFrame(raf);
							raf = 0;
							canvas.dataset.motion = 'still-slow';
							drawStill();
							return;
						}
						canvas.dataset.motion = 'half';
					}
				} else {
					slow = 0;
				}
			}
			pendingMs += Math.min(dt, 250);
			/* PAINT AT 30 FPS, NOT 60. The film is 24; a glyph advance is a
			   discrete step at 10-36 rows/s; the only continuous thing is the
			   fade, and its per-paint step is invisible at either rate. What
			   halving buys is the full-canvas alpha strip and the upload behind
			   it, which were the whole cost when measured (see the header).
			   Under degradation it is every fourth frame, 15 fps. */
			parity = (parity + 1) % (level === 0 ? 2 : 4);
			if (parity) return;
			const step = pendingMs;
			pendingMs = 0;
			ctx!.globalCompositeOperation = 'destination-out';
			ctx!.globalAlpha = fadeAlpha(step);
			ctx!.fillStyle = '#000';
			ctx!.fillRect(0, 0, cssW, cssH);
			ctx!.globalCompositeOperation = 'source-over';
			events.length = 0;
			stepColumns(columns, rows, step / (1000 / 60), rng, events);
			for (const e of events) drawCell(e.col, e.row, e.kind, e.glyph, e.alpha * gains[e.col]);
			ctx!.globalAlpha = 1;
			if (++frames % 30 === 0) canvas.dataset.frames = String(frames);
		}

		function stop() {
			if (raf) cancelAnimationFrame(raf);
			raf = 0;
			last = 0;
		}
		function start() {
			stop();
			if (!alive || cssW === 0 || cssH === 0 || level >= 2) return;
			raf = requestAnimationFrame(frame);
		}
		function apply() {
			if (mq.matches) {
				stop();
				canvas.dataset.motion = 'reduced';
				drawStill();
			} else if (level >= 2) {
				canvas.dataset.motion = 'still-slow';
				drawStill();
			} else {
				canvas.dataset.motion = cssW && cssH ? (level === 1 ? 'half' : 'running') : 'idle';
				start();
			}
		}

		function layout() {
			const w = host.clientWidth;
			const h = host.clientHeight;
			const ratio = Math.min(window.devicePixelRatio || 1, RAIN.maxDpr);
			if (w === cssW && h === cssH && ratio === dpr) return;
			cssW = w;
			cssH = h;
			if (ratio !== dpr || !atlas) {
				dpr = ratio;
				buildAtlas();
			}
			canvas.width = Math.ceil(cssW * dpr);
			canvas.height = Math.ceil(cssH * dpr);
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
			cols = Math.ceil(cssW / RAIN.cell);
			rows = Math.ceil(cssH / RAIN.cell);
			columns = createColumns(cols, rows, rng);
			gains = Array.from({ length: cols }, (_, i) => bandGain((i + 0.5) * RAIN.cell, cssW));
			apply();
		}

		layout();
		const ro = new ResizeObserver(layout);
		ro.observe(host);
		mq.addEventListener('change', apply);
		const onVisibility = () => {
			if (document.hidden) stop();
			else apply();
		};
		document.addEventListener('visibilitychange', onVisibility);
		/* The atlas is drawn with whatever face is loaded at mount; once the
		   platform's mono arrives, draw it again in that face. */
		const fonts = document.fonts;
		if (fonts && fonts.ready) {
			fonts.ready.then(() => {
				if (!alive) return;
				buildAtlas();
				if (!raf) drawStill();
			});
		}

		return () => {
			alive = false;
			stop();
			ro.disconnect();
			mq.removeEventListener('change', apply);
			document.removeEventListener('visibilitychange', onVisibility);
			canvas.remove();
		};
	}
</script>
