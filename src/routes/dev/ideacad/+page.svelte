<script lang="ts">
	/**
	 * Dev harness for the REAL BladeEditor -- never a copy of its markup.
	 * States by query string, per the bundle's own verification plan:
	 *   role=student                    one seeded concept (default)
	 *   role=student&state=three        three concepts, one failing diameter
	 *   role=student&state=compare      the compare surface open, no prediction
	 *                                   made, the physics on screen anyway
	 *   role=student&state=predicted    the compare surface with a prediction
	 *                                   already recorded, so the form is gone
	 *   role=student&state=property     the PropertyManager open on the BODY,
	 *                                   which is the panel with the station
	 *                                   table and the profile preview in it
	 *   role=student&state=committed    three concepts, the active one committed
	 *   role=teacher                    the same component, read-only
	 *   role=teacher&state=property     the read-only PropertyManager
	 * `commitConceptCard` is handed in only where a state wants the control: its
	 * ABSENCE is what removes it, which is the rule the real page relies on too.
	 *
	 * THE PROPERTY STATE IS REACHED THROUGH THE REAL CONTROL, not through a prop.
	 * `BladeEditor` has no `editing` input and must not gain one: a harness that
	 * could put the panel on screen by a route nothing else has would be measuring
	 * an arrangement a student cannot reach. `openPropertyManager` below
	 * double-clicks the Body Revolve row, which is exactly what a student does.
	 */
	import BladeEditor from '$lib/ideacad/BladeEditor.svelte';
	import type { ViewportProbe } from '$lib/ideacad/viewport/camera-rig';
	import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '$lib/ideacad/blade/materials';
	import type { BladeTree } from '$lib/ideacad/blade/tree';

	let role = 'student';
	let state = '';
	if (typeof window !== 'undefined') {
		const q = new URLSearchParams(location.search);
		role = q.get('role') ?? 'student';
		state = q.get('state') ?? '';
	}

	/** A tree whose body stations put the diameter over the 5 in rule, so a FAIL chip renders. */
	function oversized(): BladeTree {
		const t = structuredClone(DEFAULT_BLADE_TREE);
		const body = t.features.find((f) => f.type === 'revolve');
		if (body && body.type === 'revolve') body.stations = body.stations.map((s) => ({ ...s, r: s.r * 1.9 }));
		return t;
	}

	const many = [
		{ id: 'c1', name: 'Concept 1', features: structuredClone(DEFAULT_BLADE_TREE), committed: state === 'committed' },
		{ id: 'c2', name: 'Wide four', features: oversized(), committed: false },
		{ id: 'c3', name: 'Concept 3', features: structuredClone(DEFAULT_BLADE_TREE), committed: false }
	];
	/** `state=three` puts the OVERSIZED concept first, so it is the active one and the rail
	 *  renders a real FAIL chip: the rule-failure rendering is the half of the readouts
	 *  nobody had ever seen, and a fixture that never fails a rule cannot show it. */
	const concepts =
		state === 'three'
			? [many[1], many[0], many[2]]
			: state === 'compare' || state === 'predicted' || state === 'committed'
				? many
				: undefined;
	const commits: string[] = [];

	/**
	 * A prediction ALREADY RECORDED, which is what puts the recorded line on
	 * screen instead of the form. It unlocks NOTHING -- decision 26 is answered
	 * and the physics is always visible -- so what this state measures is the
	 * sheet in its OTHER arrangement, which is the one a student sees on every
	 * visit after the first.
	 */
	const prediction =
		state === 'predicted'
			? { conceptId: 'c2', rationale: 'the wide one carries its mass further out', at: '2026-09-12' }
			: null;

	/**
	 * Open the PropertyManager the way a student does. A `waitFor` in the route
	 * spec cannot press anything, and a prop that skipped the press would put an
	 * arrangement on screen that the real surface has no path to.
	 */
	function openPropertyManager(): boolean {
		const row = [...document.querySelectorAll('.tree [role="treeitem"]')].find((b) =>
			b.textContent?.includes('Body Revolve')
		);
		if (!row) return false;
		row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		return true;
	}

	/**
	 * THE VIEWPORT PROBE AND THE FRAME CLOCK ARE HANDED IN, NEVER HUNG ON THE
	 * COMPONENT. `Viewport.svelte` takes an optional `onReady` and an optional
	 * `onFrame`; the real classroom page supplies neither, so production carries
	 * no harness hook at all and the absence is what removes it. This page
	 * supplies both and republishes them on `window`, which is where a route
	 * spec can reach them.
	 */
	let probe: ViewportProbe | null = null;
	const frames: number[] = [];
	function onFrame(ms: number) {
		frames.push(ms);
		/* Bounded: a long session must not grow an array forever. 3000 is ten
		   times the 300-frame drag PART 4 asks to be measured. */
		if (frames.length > 3000) frames.splice(0, frames.length - 3000);
	}
	function percentile(values: number[], p: number): number {
		if (!values.length) return NaN;
		const sorted = [...values].sort((a, b) => a - b);
		/* Nearest-rank, so p95 of 300 samples is a real sample and not an
		   interpolation between two of them. */
		const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
		return sorted[rank - 1];
	}

	/**
	 * The geometry probe the browser harness reads. It lives on the PAGE, not in
	 * the route spec, so a verdict that stops being produced shortens the array
	 * and reddens rather than quietly checking less -- and so the numbers come
	 * off the real boxes at whichever width the harness is driving.
	 *
	 * The console held 628px of a 1440px window when this bundle opened, because
	 * the editor's body was a bare `<main>` and `src/app.css` styles that element
	 * globally (max-width 880px, auto side margins). The middle grid track -- the
	 * whole 3D viewport -- measured 0px. Every verdict below is that defect asked
	 * as a question.
	 */
	function verdicts(): string[] {
		const out: string[] = [];
		const say = (claim: string, ok: boolean) => out.push(`${claim} ${ok ? 'ok' : 'FAILED'}`);
		const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
		const root = box('[data-testid="ideacad-editor"]');
		const vp = box('.viewport');
		const tree = box('.tree');
		const rail = box('.readouts');
		const de = document.documentElement;
		const wide = window.innerWidth >= 1024;

		say('the console uses the width of the window', !!root && Math.abs(root.width - window.innerWidth) <= 1);
		say('the viewport has real width', !!vp && vp.width >= 200);
		say(
			'the viewport is the widest region',
			!!vp && !!tree && !!rail && (wide ? vp.width > tree.width && vp.width > rail.width : vp.width >= window.innerWidth - 4)
		);
		say(
			'the three regions fill the console',
			!wide || (!!root && !!vp && !!tree && !!rail && Math.abs(tree.width + vp.width + rail.width - root.width) <= 4)
		);
		say('nothing is wider than the window', de.scrollWidth <= de.clientWidth + 0.5);
		say('the desktop console does not scroll the page', !wide || de.scrollHeight <= de.clientHeight + 0.5);
		say(
			'the view toolbar is inside the viewport it belongs to',
			(() => {
				const nav = box('.viewport nav');
				return !!nav && !!vp && nav.left >= vp.left - 0.5 && nav.right <= vp.right + 0.5;
			})()
		);
		say(
			'every view control is on screen rather than clipped',
			[...document.querySelectorAll('.viewport nav button')].every((b) => {
				const r = b.getBoundingClientRect();
				return r.width > 0 && r.right <= (vp?.right ?? 0) + 0.5 && r.bottom <= (vp?.bottom ?? 0) + 0.5;
			})
		);
		say(
			'the confirm pair clears the reference triad',
			(() => {
				const f = box('footer');
				const t = box('.triad');
				return !f || !t || f.left >= t.right - 0.5 || f.top >= t.bottom - 0.5 || f.bottom <= t.top + 0.5;
			})()
		);
		say(
			'the confirm pair clears the concept strip',
			(() => {
				const f = box('footer');
				const strip = box('.concepts');
				return !f || !strip || f.bottom <= strip.top + 0.5;
			})()
		);
		say('the readouts rail shows its last row', (() => {
			const notice = box('.readouts .notice');
			return !!notice && !!rail && notice.bottom <= rail.bottom + 0.5 && notice.height > 0;
		})());

		/* THE VIEWPORT IS A REAL CANVAS NOW, AND THESE ARE THE CLAIMS THAT WERE
		   UNANSWERABLE WHILE IT WAS THREE CSS DIVS. A pane with real width was
		   already measured; a pane with a canvas in it that draws nothing is the
		   next way for this surface to be wrong while every threshold passes. */
		const cv = box('canvas[data-testid="ideacad-canvas"]');
		say('the canvas fills the viewport pane', !!cv && !!vp && Math.abs(cv.width - vp.width) <= 1 && Math.abs(cv.height - vp.height) <= 1);
		say('the canvas has a backing store', !!probe && probe.canvas().width > 0 && probe.canvas().height > 0);
		/* The backing store is the CSS box times the device pixel ratio, which
		   PART 4 clamps to [1.5, 2]. A renderer that quietly stopped resizing
		   paints a stretched model and nothing says so. */
		say('the backing store matches the pane at the clamped pixel ratio', (() => {
			if (!probe || !cv) return false;
			const ratio = probe.canvas().width / Math.max(1, Math.round(cv.width));
			return ratio >= 1.5 - 0.02 && ratio <= 2 + 0.02;
		})());
		say('the renderer issued draw calls', !!probe && probe.drawCalls() > 0);
		/* Triangles, not just calls: a scene whose every geometry failed to build
		   still issues calls for its lights and clears. */
		say('the model has triangles in it', !!probe && probe.triangles() > 0);
		/* The rig against the module it is built on. `zoomOrthoAboutCursor` is
		   tested pure; this is the same invariant asked of the REAL camera, which
		   is the only place a rig that reads `rotationCenter` differently shows
		   up. */
		say('the world point under a pixel survives a zoom', (() => {
			if (!probe) return false;
			const el = document.querySelector('[data-testid="ideacad-viewport"]');
			const r = el?.getBoundingClientRect();
			if (!r) return false;
			/* THE CLIENT COORDINATES ARE CHOSEN AS INTEGERS AND THE PANE PIXEL IS
			   DERIVED FROM THEM, NEVER THE OTHER WAY AROUND. `new WheelEvent`
			   rounds `clientX`/`clientY`, so asking about pane pixel 173 while
			   the pane sits at y = 83.422 delivers a wheel at 172.578 and the
			   handler zooms about a point 0.42px from the one under test. That
			   read as a rig defect on the first run and was the probe: measured
			   drift 0.00124 world units, which is exactly the 0.42px at that
			   zoom. Integer client coordinates make the two agree exactly, and
			   the check is then a real statement about the rig. */
			const cx = Math.round(r.left + r.width * 0.72);
			const cy = Math.round(r.top + r.height * 0.31);
			const px = { x: cx - r.left, y: cy - r.top };
			const wheel = (deltaY: number) =>
				el!.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
			const before = probe.under(px.x, px.y);
			wheel(-100);
			const after = probe.under(px.x, px.y);
			const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
			wheel(100);
			return moved < 1e-9;
		})());
		say('the model is inside the pane at the zoom it fits to', (() => {
			if (!probe) return false;
			const b = probe.box();
			const m = probe.projected();
			return m.width > 0 && m.height > 0 && m.width <= b.width + 1 && m.height <= b.height + 1;
		})());
		/* AND IT USES THE ROOM. The claim above is satisfied by a model rendered
		   one pixel wide, which is exactly the state a fit taken from the wrong
		   radius produces -- measured, a bound read off the box CORNERS rather
		   than the vertices put the model at 28.7% of the pane's width and every
		   threshold still passed. This asks the geometry, not the arithmetic:
		   `radius * 2 * zoom` is invariant under a wrong radius because the fit
		   derives one from the other. */
		say('the model fills the pane it was fitted to', (() => {
			if (!probe) return false;
			const b = probe.box();
			const m = probe.projected();
			const smallest = Math.min(b.width, b.height);
			return Math.max(m.width, m.height) >= smallest * 0.55;
		})());
		return out;
	}
	/**
	 * LEDGER 0160'S OWN EXPERIMENT, RUN AGAINST A SURFACE WITH NO GATE IN IT.
	 *
	 * 0160 measured the broken gate like this: one character typed into "Say
	 * why", with NO concept picked and Reveal never pressed, rendered
	 * `I 1626.6 g-cm2 / k 2.97 cm` under the heading `Prediction: . h`.
	 *
	 * MR. PINA DECIDED ON 2026-09-12 THAT PHYSICS IS ALWAYS VISIBLE
	 * (`docs/decisions/entries/26-*`), so the SAME keystrokes now have to leave
	 * the physics on screen at every step rather than off it, and the claim that
	 * used to be the leak is the claim that the feature works. The steps are
	 * kept in 0160's order deliberately: this is the same experiment with its
	 * expected answers inverted, which is what makes the reversal auditable.
	 *
	 * THE NEGATIVE CONTROL IS THE ONE THAT MATTERS NOW, and it is the last step:
	 * with the gate gone, every "the physics is visible" claim would also be
	 * satisfied by a sheet that rendered physics and nothing else, so the probe
	 * ends by checking the PREDICTION is still being collected and recorded.
	 * That is the half Mr. Pina kept.
	 *
	 * It runs on the PAGE rather than in the route spec so the numbers come off
	 * the real component at whichever width the harness is driving, and so a
	 * step that stops running shortens the array and reddens.
	 */
	async function physicsProbe(): Promise<string[]> {
		const out: string[] = [];
		const say = (claim: string, ok: boolean) => out.push(`${claim} ${ok ? 'ok' : 'FAILED'}`);
		const physics = () => document.querySelectorAll('.compare dl').length;
		const sheet = () => document.querySelector('.compare')?.textContent ?? '';
		const tick = () => new Promise((res) => setTimeout(res, 60));
		const rail = () => document.querySelector('.readouts')?.textContent ?? '';
		const field = document.querySelector('.compare input') as HTMLInputElement | null;
		const picker = document.querySelector('.compare select') as HTMLSelectElement | null;
		const record = [...document.querySelectorAll('.compare button')].find(
			(b) => b.textContent?.trim() === 'Record prediction'
		) as HTMLButtonElement | null;

		/* THE RAIL FIRST, because "from the first frame" is a claim about what is
		   on screen when the editor mounts, and the compare sheet is a thing a
		   student opens. */
		say('the Rules rail carries the rotational inertia', /Rotational inertia/.test(rail()));
		say('and the radius of gyration beside it', /Radius of gyration/.test(rail()));
		say('with a real figure rather than a label alone', /g·cm²/.test(rail()));

		if (!field || !picker || !record) {
			say('the prediction form is on screen to be measured', false);
			return out;
		}
		say('the sheet opens with the physics already on it', physics() === 3);

		/* 0160's exact keystroke: ONE character, nothing picked, nothing pressed. */
		field.value = 'h';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		say('one character typed into Say why changes nothing about the physics', physics() === 3);
		say('and the inertia figure is on the sheet', /g·cm²/.test(sheet()));

		/* The press with only half the answer. The control is `aria-disabled` and
		   not `disabled`, so it can explain itself -- which means the HANDLER has
		   to refuse too, and a real click is what asks it. */
		record.click();
		await tick();
		say('a press with no concept picked records nothing', !/Prediction:/.test(sheet()));
		say('and still leaves the physics where it was', physics() === 3);

		/* The other half alone. */
		picker.value = 'c2';
		picker.dispatchEvent(new Event('change', { bubbles: true }));
		field.value = '';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		record.click();
		await tick();
		say('a concept picked with no reason records nothing either', !/Prediction:/.test(sheet()));

		/* THE NEGATIVE CONTROL. The prediction is the half that stayed, so a
		   sheet that only ever shows physics has to fail here. */
		field.value = 'the wide one carries its mass further out';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		record.click();
		await tick();
		say('the deliberate press records the prediction', /Prediction:/.test(sheet()));
		say('and the form is gone, so nobody is asked twice', !document.querySelector('.compare select'));
		say('and the physics never moved', physics() === 3);
		return out;
	}

	/**
	 * THE LEFT PANE'S OWN CLAIMS, for the two arrangements it has.
	 *
	 * These are separate from `verdicts` because the pane is the region whose
	 * failure mode is the subtlest on this surface: the PropertyManager REPLACES
	 * the tree in place, so a panel that rendered BELOW the tree instead of
	 * instead of it would look almost right, scroll a little further, and pass
	 * every content check ever written about either half. The discriminator is
	 * that the tree's own rows are GONE while the panel is up, asked of the same
	 * element.
	 *
	 * The station table is the other one. It is the only control cluster on this
	 * surface with three controls on one row, and 0160's defect here was a row
	 * running off its pane -- so the cells are measured against the pane they sit
	 * in rather than against the window.
	 */
	function paneVerdicts(): string[] {
		const out: string[] = [];
		const say = (claim: string, ok: boolean) => out.push(`${claim} ${ok ? 'ok' : 'FAILED'}`);
		const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
		const pane = box('.tree');
		const pm = box('[data-testid="ideacad-property-manager"]');

		say('the PropertyManager is on screen', !!pm && pm.width > 0 && pm.height > 0);
		say(
			'it replaced the feature tree rather than joining it',
			document.querySelectorAll('.tree [role="tree"]').length === 0
		);
		say('it is inside the pane the tree was in', !!pm && !!pane && pm.left >= pane.left - 0.5 && pm.right <= pane.right + 0.5);
		say(
			'every station cell is inside that pane',
			[...document.querySelectorAll('.pm tbody input, .pm .acts button')].every((el) => {
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.left >= (pane?.left ?? 0) - 0.5 && r.right <= (pane?.right ?? 0) + 0.5;
			})
		);
		say(
			'the profile preview is drawn and inside the pane',
			(() => {
				const svg = box('.pm .profile svg');
				return (
					!!svg &&
					svg.width > 0 &&
					svg.height > 0 &&
					!!pane &&
					svg.right <= pane.right + 0.5 &&
					document.querySelectorAll('.pm .profile circle').length > 0
				);
			})()
		);
		say(
			'nothing is wider than the window',
			document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5
		);
		return out;
	}

	/**
	 * PART 4's 300-frame drag, run on the page rather than from the route spec.
	 *
	 * It dispatches REAL middle-button pointer events at the real viewport, so
	 * what is measured is the same path a student's hand takes: the controls
	 * write a new `CameraState`, the effect re-applies the camera, and the
	 * renderer draws once. The clock is the renderer's own -- `onFrame` is
	 * called with the duration of `renderer.render` -- so the number is the
	 * frame cost and not the cost of the harness driving it.
	 *
	 * Ledger 0160 could not take this number at all: there was nothing to drag.
	 */
	async function frameProbe(count = 300) {
		const el = document.querySelector('[data-testid="ideacad-viewport"]') as HTMLElement | null;
		if (!el || !probe) return { ok: false, why: 'no viewport' };
		const r = el.getBoundingClientRect();
		const mid = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		const ev = (type: string, x: number, y: number, buttons: number) =>
			el.dispatchEvent(
				new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 1, buttons, clientX: x, clientY: y, bubbles: true, cancelable: true })
			);
		/* A settle first: the fit, the resize and the first paint are not part of
		   a drag, and folding them in flatters or damns the number by luck. */
		await new Promise((res) => setTimeout(res, 300));
		frames.length = 0;
		/* TWO CLOCKS, BECAUSE ONE OF THEM ANSWERS THE WRONG QUESTION.
		   `onFrame` times `renderer.render()`, which submits GL commands and
		   returns before the driver has rasterised or the compositor has
		   presented -- so it is the CPU cost of issuing a frame and is always
		   the smaller number. The interval between successive animation frames
		   during the drag is the one a 60 fps budget is actually about, because
		   it includes everything the first clock does not. Both are reported;
		   neither is presented as the other. */
		const stamps: number[] = [];
		/* AN IDLE CONTROL, TAKEN FIRST, AND THE PRESENTED NUMBER IS UNREADABLE
		   WITHOUT IT. The viewport renders on demand, so with no drag running it
		   issues NO frames at all -- these intervals are the host's animation
		   cadence and nothing else. A drag whose presented p95 equals this one
		   is a drag costing nothing; a drag above it is a drag the host could
		   not keep up with. Without the control, a headless compositor ticking
		   at 30 Hz reads as a renderer missing a 60 fps budget by half. */
		const idle: number[] = [];
		{
			const t: number[] = [];
			for (let i = 0; i < 30; i++) await new Promise((res) => requestAnimationFrame((n) => res(t.push(n))));
			for (let i = 1; i < t.length; i++) idle.push(t[i] - t[i - 1]);
		}
		ev('pointerdown', mid.x, mid.y, 4);
		for (let i = 0; i < count; i++) {
			/* A circle rather than a line: a straight drag leaves the model at a
			   pose whose triangle count may differ from every other pose, and one
			   pose is not a drag. */
			const a = (i / count) * Math.PI * 4;
			ev('pointermove', mid.x + Math.cos(a) * 90, mid.y + Math.sin(a) * 60, 4);
			/* One rendered frame per move: the renderer draws on demand, so the
			   loop waits for the frame it just asked for rather than queueing
			   300 state writes against one paint. */
			await new Promise((res) => requestAnimationFrame((t) => res(stamps.push(t))));
		}
		ev('pointerup', mid.x, mid.y, 0);
		/* PUT THE VIEW BACK, THROUGH THE REAL CONTROL. This probe rotates the
		   model, and every layout verdict after it would be measuring a
		   different pose. `pointerdown` recorded the pre-drag view, so Previous
		   is exactly the right restore -- and using the control rather than
		   writing the state back means a Previous that stopped working shows up
		   here too. */
		[...document.querySelectorAll('.viewport nav button')]
			.find((b) => b.textContent?.trim() === 'Previous')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await new Promise((res) => setTimeout(res, 60));
		const taken = frames.slice(0, count);
		const gaps: number[] = [];
		for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
		const round = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(3)) : null);
		return {
			ok: taken.length > 0,
			asked: count,
			/* The two clocks, named rather than merged. */
			render: {
				frames: taken.length,
				p50: round(percentile(taken, 50)),
				p95: round(percentile(taken, 95)),
				max: round(Math.max(...taken))
			},
			presented: {
				intervals: gaps.length,
				p50: round(percentile(gaps, 50)),
				p95: round(percentile(gaps, 95)),
				max: round(Math.max(...gaps))
			},
			idle: {
				intervals: idle.length,
				p50: round(percentile(idle, 50)),
				p95: round(percentile(idle, 95))
			},
			/* PART 4 asks for 60 fps, which is 16.67 ms. */
			budgetMs: Number((1000 / 60).toFixed(3))
		};
	}

	/**
	 * The frame claims, as verdicts a route spec can compare.
	 *
	 * ONLY THE HALF THIS CODE CONTROLS IS THRESHOLDED. `onFrame` times
	 * `renderer.render()` -- the CPU cost of issuing a frame -- and that is the
	 * viewport's own work, so it is held to PART 4's 60 fps budget. The
	 * PRESENTED cadence is the host's: this container has no GPU and Chromium
	 * falls back to SwiftShader, a software rasteriser whose cost is fill-rate
	 * bound, measured here at 16.7 ms up to about half a million backing-store
	 * pixels and 33.3 ms above a million. Holding a software rasteriser to a
	 * 60 fps budget would redden this harness for the machine it runs on rather
	 * than for anything in the repository, so the presented numbers are
	 * REPORTED beside the idle control and never thresholded.
	 */
	type FrameReading = {
		ok: boolean;
		render: { frames: number; p95: number | null };
		presented: { p95: number | null };
		idle: { p95: number | null };
		budgetMs: number;
	};
	/* THE DRAG RUNS ONCE. A route spec reports the numbers from a `prepare`
	   step and compares the claims in a verdict block, and running 300 frames
	   twice to serve both would double the cost and let the two disagree. */
	let lastFrames: FrameReading | null = null;

	async function runFrameProbe() {
		lastFrames = (await frameProbe(300)) as FrameReading;
		const f = lastFrames;
		/* A printable string: `prepareEvalResult` renders a string or a number
		   into the run output and says "nothing printable" for anything else. */
		return `render p95 ${f.render.p95} ms over ${f.render.frames} frames; presented p95 ${f.presented.p95} ms; host idle p95 ${f.idle.p95} ms; 60 fps budget ${f.budgetMs} ms`;
	}

	async function frameVerdicts() {
		const r = lastFrames ?? ((await frameProbe(300)) as FrameReading);
		const out: string[] = [];
		const say = (claim: string, ok: boolean) => out.push(`${claim} ${ok ? 'ok' : 'FAILED'}`);
		say('a 300-frame middle-drag reaches the renderer', r.ok && r.render.frames >= 285);
		say(
			'the cost of issuing a frame is inside the 60 fps budget',
			r.render.p95 !== null && r.render.p95 < r.budgetMs
		);
		return out;
	}

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		w.__ideacadVerdicts = verdicts;
		w.__ideacadFrameProbe = frameProbe;
		w.__ideacadFrameVerdicts = frameVerdicts;
		w.__ideacadRunFrameProbe = runFrameProbe;
		w.__ideacadCamera = () => probe;
		w.__ideacadOpenPropertyManager = openPropertyManager;
		w.__ideacadPaneVerdicts = paneVerdicts;
		w.__ideacadPhysicsProbe = physicsProbe;
	}
</script>

<svelte:head><title>IdeaCAD harness</title></svelte:head>
<BladeEditor
	tree={DEFAULT_BLADE_TREE}
	config={DEFAULT_BLADE_CONFIG}
	{concepts}
	{prediction}
	openCompare={state === 'compare' || state === 'predicted'}
	readOnly={role === 'teacher'}
	conceptName={role === 'teacher' ? 'Student concept' : 'Concept 1'}
	commitConceptCard={role === 'teacher' ? undefined : async (id: string) => void commits.push(id)}
	{onFrame}
	onViewportReady={(p) => (probe = p)}
/>
