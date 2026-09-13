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
	 *   role=student&state=materials   the Materials panel, over the REAL library
	 *                                  shape 0208 seeds, with the custom-material
	 *                                  form reachable and one retired material in
	 *                                  the list so the retired case is on screen
	 *   role=student&state=property     the PropertyManager open on the BODY,
	 *                                   which is the panel with the station
	 *                                   table and the profile preview in it
	 *   role=student&state=history      the History timeline open over a REAL log
	 *                                   built by the real `diffTrees`, carrying a
	 *                                   live edit, an undone one and a redone one
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
	import {
		DEFAULT_BLADE_CONFIG,
		DEFAULT_BLADE_TREE,
		type MaterialRow
	} from '$lib/ideacad/blade/materials';
	import type { BladeTree } from '$lib/ideacad/blade/tree';
	import { diffTrees, type IdeacadHistoryRow } from '$lib/ideacad/history';

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
	 * WHO THE FIXTURE'S EDITS BELONG TO (decision 27).
	 *
	 * THESE ARE ADDRESSES BECAUSE `0209` STORES ADDRESSES, and the fixture used
	 * to hold `'you'` and `'A. Reyes'` -- two strings the database cannot
	 * produce. That is the shape `CLAUDE.md` calls a fixture the producer cannot
	 * emit, and it cost exactly what that rule says it costs: the timeline was
	 * printing its actor RAW, and the harness could not show it, because the
	 * made-up values already read like names. The raw-address defect was
	 * invisible to a browser pass that measured sixty things on this surface.
	 *
	 * TWO AUTHORS, ONE OF THEM THE READER. `HARNESS_VIEWER` is handed to the
	 * editor as `viewerEmail`, so their rows say "You" and the partner's row
	 * says a name -- which is the two-author case decision 27 is about, on
	 * screen, at both widths.
	 */
	const HARNESS_VIEWER = 'a.pina@boscotech.net';
	const HARNESS_PARTNER = 'm.reyes@boscotech.net';

	/**
	 * A REAL LOG, BUILT BY THE REAL DIFF (0196).
	 *
	 * `state=history` opens the timeline over a log this file did NOT hand-write
	 * row by row. It mutates a tree the way a student does -- turn a number,
	 * accept, turn another -- and runs `diffTrees` over each accepted pair,
	 * which is exactly what `store.edit` does on the real page. A hand-written
	 * fixture would be a claim about what the diff produces rather than the
	 * thing it produces, and the timeline's whole job is naming what the diff
	 * emitted: a row shape nothing real emits would let the namer pass over a
	 * pointer it cannot actually read.
	 *
	 * THE UNDO ROWS ARE REAL TOO. Seq 5 inverts seq 4 and seq 6 inverts seq 5,
	 * so the fixture carries a live edit, an undone one and a REDONE one --
	 * depths 0, 1 and 2 -- which is what puts the `undone` chip, the `Undid` and
	 * `Redid` verbs and the green "what Ctrl+Z does next" edge all on screen at
	 * once. Depth 3 is the case 0189 got wrong first and is asserted in
	 * `tests/dom/ideacad-timeline-mount.test.ts` rather than drawn here.
	 */
	function historyLog(): IdeacadHistoryRow[] {
		const origin = structuredClone(DEFAULT_BLADE_TREE);
		const rows: IdeacadHistoryRow[] = [
			/* THE ORIGIN IS `migration:0209`, WHICH IS A REAL STATE AND NOT AN
			   ODD ONE. Every concept that predates that migration got its floor
			   from the backfill, and the backfill deliberately does NOT claim a
			   student made the part -- so this is what the oldest row of most
			   parts in production actually says today. It is also the only way
			   to get a NON-PERSON actor on screen, because the two values that
			   are not addresses (`system` and this one) are only ever written at
			   seq 0. */
			{
				seq: 0,
				kind: 'origin',
				path: '',
				before: null,
				after: origin,
				actor: 'migration:0209',
				at: '2026-09-13T15:02:00Z'
			}
		];
		let at = structuredClone(origin);
		let seq = 1;
		const edit = (change: (t: BladeTree) => void, actor: string, clock: string) => {
			const next = structuredClone(at);
			change(next);
			for (const action of diffTrees(at, next))
				rows.push({ ...action, seq: seq++, actor, at: clock });
			at = next;
		};
		edit((t) => {
			const hex = t.features.find((f) => f.type === 'hexBoss');
			if (hex && hex.type === 'hexBoss') hex.height = 0.75;
		}, HARNESS_VIEWER, '2026-09-13T15:04:00Z');
		/* SIX, NOT FOUR. The default tree already carries four blades, so a step
		   "changing" it to four diffs to NOTHING and the fixture silently loses a
		   row -- which is how a spec came to assert a feature name that was never
		   on screen. A fixture step that produces no action is not a step. */
		edit((t) => {
			const p = t.features.find((f) => f.type === 'circularPattern');
			if (p && p.type === 'circularPattern') p.count = 6;
		}, HARNESS_VIEWER, '2026-09-13T15:06:00Z');
		edit((t) => (t.materials.bladeStock = 'aluminum-0125'), HARNESS_VIEWER, '2026-09-13T15:07:00Z');
		edit((t) => (t.rotation = 'ccw'), HARNESS_PARTNER, '2026-09-13T15:09:00Z');
		edit((t) => {
			const s0 = t.features.find((f) => f.type === 'revolve');
			if (s0 && s0.type === 'revolve') s0.stations[1] = { ...s0.stations[1], r: 0.9 };
		}, HARNESS_VIEWER, '2026-09-13T15:11:00Z');
		/* The undo of the newest row, then the redo of that undo -- appended, the
		   way 0189 says an undo is an action rather than a moved pointer. */
		const target = rows[rows.length - 1];
		const undo: IdeacadHistoryRow = {
			seq: seq++,
			kind: 'set',
			path: target.path,
			before: target.after,
			after: target.before,
			undoesSeq: target.seq,
			actor: HARNESS_VIEWER,
			at: '2026-09-13T15:12:00Z'
		};
		rows.push(undo);
		rows.push({
			seq: seq++,
			kind: 'set',
			path: undo.path,
			before: undo.after,
			after: undo.before,
			undoesSeq: undo.seq,
			actor: HARNESS_VIEWER,
			at: '2026-09-13T15:13:00Z'
		});
		return rows;
	}
	const history = state === 'history' ? historyLog() : [];

	/**
	 * THE IN-MEMORY ANSWER FOR UNDO AND REDO. The REAL page hands the store's
	 * own `undo`/`redo` here, which re-read the log and append an inverse
	 * through `ideacad_apply_actions`; this harness has no database, so it only
	 * has to be PRESENT, because presence is what puts the two controls on
	 * screen. `role=teacher` hands neither, which is the read-only timeline.
	 */
	let steps = 0;
	const historyWrites =
		state === 'history' && role !== 'teacher'
			? { undo: async () => void steps++, redo: async () => void steps++ }
			: {};

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
	 * THE MATERIAL LIBRARY, IN THE SHAPE `ideacad_materials` RETURNS IT. These
	 * are 0208's own seeded rows, copied as DATA rather than imported from the
	 * migration -- the harness has no database and the point is to exercise the
	 * client against the shape a read produces, including the two cases the
	 * pickers have to handle and a hand-written fixture would skip: a RETIRED
	 * material that a concept is still using, and a CUSTOM material that belongs
	 * to this student.
	 */
	const LIBRARY: MaterialRow[] = [
		['stainless-steel', 'Stainless steel (304)', 8.0, [0.024, 0.03, 0.048, 0.0625, 0.09, 0.125]],
		['galvanized-steel', 'Galvanized steel', 7.85, [0.0276, 0.0336, 0.0396, 0.0516, 0.0635, 0.0785]],
		['steel', 'Carbon or unknown steel', 7.85, [0.0625, 0.125, 0.1875, 0.25]],
		['aluminum', '6061 aluminum', 2.7, [0.0625, 0.125, 0.1875, 0.25]],
		['polycarbonate', 'Polycarbonate', 1.2, [0.0625, 0.093, 0.125, 0.1875, 0.25]],
		['wood', 'Wood (Baltic birch plywood)', 0.68, [0.118, 0.236, 0.472]]
	].map(([slug, name, d, th]) => ({
		id: slug as string,
		slug: slug as string,
		owner: null,
		name: name as string,
		density_g_cm3: d as number,
		thicknesses_in: th as number[],
		note: null,
		source: 'seeded by 0208, unverified',
		source_verified: false,
		retired_at: null
	}));
	/* The RETIRED row the default tree is still on. This is the whole retirement
	   argument on screen: `pla` is not offered to anybody else, the part using it
	   still computes, and the picker says so. */
	LIBRARY.push({
		id: 'pla',
		slug: 'pla',
		owner: null,
		name: 'PLA (3D printed)',
		density_g_cm3: 1.24,
		thicknesses_in: [],
		note: 'RETIRED. A printed part is not solid, so its effective density depends on your slicer settings.',
		source: 'Filament manufacturer datasheets for solid PLA',
		source_verified: false,
		retired_at: '2026-09-12T00:00:00Z'
	});
	/* One of this student's own. */
	LIBRARY.push({
		id: 'custom-a1b2c3d4e5f6',
		slug: 'custom-a1b2c3d4e5f6',
		owner: 'dev-student',
		name: 'My PETG at 40% infill',
		density_g_cm3: 0.53,
		thicknesses_in: [0.125],
		note: 'measured on the scale, 3 prints',
		source: 'Entered by the student who owns this material.',
		source_verified: false,
		retired_at: null
	});

	/* NO `$state` IN THIS FILE: it declares a local `state` for the query string,
	   so the rune's name collides with it. Nothing here needs to be reactive
	   anyway -- `BladeEditor` holds a newly added custom material in its own
	   state and offers it immediately, which is the behaviour the real page
	   relies on too while its `materials` prop catches up. */
	let addedCount = 0;

	/** The in-memory answer for the custom-material write. The REAL page hands
	 *  `ideacad_material_save_custom` here; its ABSENCE removes the form, which
	 *  is what the `role=teacher` state relies on. */
	async function saveCustomMaterial(input: {
		name: string;
		densityGcm3: number;
		thicknessesIn: number[];
		note: string | null;
	}): Promise<MaterialRow> {
		addedCount += 1;
		const row: MaterialRow = {
			id: `custom-${addedCount}`,
			slug: `custom-dev${addedCount}`,
			owner: 'dev-student',
			name: input.name,
			density_g_cm3: input.densityGcm3,
			thicknesses_in: input.thicknessesIn,
			note: input.note,
			source: 'Entered by the student who owns this material.',
			source_verified: false,
			retired_at: null
		};
		return row;
	}

	/**
	 * Open the Materials panel the way a student does: by double-clicking the
	 * Materials node the FeatureManager has always carried. A prop that put the
	 * panel on screen directly would measure an arrangement the surface has no
	 * path to, which is the same rule `openPropertyManager` follows.
	 */
	function openMaterials(): boolean {
		const row = [...document.querySelectorAll('.tree [role="treeitem"]')].find(
			(b) => b.textContent?.trim() === 'Materials'
		);
		if (!row) return false;
		row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		return true;
	}

	/**
	 * THE MATERIALS PANEL'S OWN CLAIMS. Same shape and same reason as
	 * `paneVerdicts`: the panel REPLACES the tree in the same pane, so a panel
	 * rendered below the tree passes every content check ever written about
	 * either half and only a geometric read tells them apart.
	 *
	 * AND THE PHYSICS CLAIM IS HERE RATHER THAN IN A UNIT TEST, because what is
	 * being asked is whether the CONTROL moves the readout -- a control wired to
	 * a config nobody evaluates is the failure mode, and it looks identical.
	 */
	async function materialVerdicts(): Promise<string[]> {
		const out: string[] = [];
		const say = (claim: string, ok: boolean) => out.push(`${claim} ${ok ? 'ok' : 'FAILED'}`);
		const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
		const pane = box('.tree');
		const panel = box('[data-testid="ideacad-materials-panel"]');
		const tick = () => new Promise((res) => setTimeout(res, 80));
		const railText = () => document.querySelector('.readouts')?.textContent ?? '';
		const massOf = () => {
			const m = /Mass([\d.]+)\s*g/.exec(railText().replace(/\s+/g, ''));
			return m ? Number(m[1]) : NaN;
		};
		const selects = () => [...document.querySelectorAll('[data-testid="ideacad-materials-panel"] select')] as HTMLSelectElement[];
		const pick = async (index: number, value: string) => {
			const el = selects()[index];
			if (!el) return false;
			el.value = value;
			el.dispatchEvent(new Event('change', { bubbles: true }));
			await tick();
			return true;
		};

		say('the Materials panel is on screen', !!panel && panel.width > 0 && panel.height > 0);
		say('it replaced the feature tree rather than joining it', document.querySelectorAll('.tree [role="tree"]').length === 0);
		say('it is inside the pane the tree was in', !!panel && !!pane && panel.left >= pane.left - 0.5 && panel.right <= pane.right + 0.5);
		say('every control is inside that pane', [...document.querySelectorAll('[data-testid="ideacad-materials-panel"] select, [data-testid="ideacad-materials-panel"] input, [data-testid="ideacad-materials-panel"] button')].every((el) => {
			const r = el.getBoundingClientRect();
			return r.width > 0 && r.left >= (pane?.left ?? 0) - 0.5 && r.right <= (pane?.right ?? 0) + 0.5;
		}));
		say('there are four choices: body material, blade material, blade thickness, spin', selects().length === 4);
		say('the panel names the thickness rule in words', /You pick one; you do not get to type a number/.test(document.querySelector('[data-testid="ideacad-materials-panel"]')?.textContent ?? ''));
		say('nothing is wider than the window', document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5);

		/* THE PHYSICS MOVES. Body material only: polycarbonate, then stainless,
		   at the SAME geometry, and the mass rule has to flip with it. */
		await pick(0, 'polycarbonate');
		const light = massOf();
		const lightPass = /PASS/.test(railText());
		await pick(0, 'stainless-steel');
		const heavy = massOf();
		say('changing the body material changes the mass', Number.isFinite(light) && Number.isFinite(heavy) && Math.abs(heavy - light) > 1);
		say('polycarbonate passes the mass rule at this geometry', lightPass && light <= 680);
		say('stainless steel fails it at the same geometry', heavy > 680);

		/* AND THE THICKNESS CONTROL MOVES IT ON ITS OWN, which is the half a
		   material-only check would pass over. */
		await pick(0, 'polycarbonate');
		await pick(1, 'steel');
		await pick(2, 'steel-00625');
		const thin = massOf();
		await pick(2, 'steel-025');
		const thick = massOf();
		say('changing only the blade thickness changes the mass', Number.isFinite(thin) && Number.isFinite(thick) && thick > thin);
		return out;
	}

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

		/* THE CONFIRM PAIR CAN ACTUALLY BE PRESSED, WHICH IS A DIFFERENT QUESTION
		   FROM EVERY ONE ASKED ABOVE IT AND IS THE ONE THAT WAS FAILING.

		   At 375 the media query set `position: static` on the footer, which
		   silently discards its `z-index: 2` -- `z-index` applies to positioned
		   elements only -- so `Viewport`'s own `position: absolute; inset: 0`
		   root and the view toolbar painted straight over it. Measured before
		   the fix: the footer had a real 373x68 box, `presence` counted it
		   present 2 / visible 2, the tap-target check measured it over 44px, the
		   contrast check read it fine, and an `elementFromPoint` sweep answered
		   `Accept 0/11, Cancel 0/11`. Not one existing check could see it,
		   because none of them asks what is on TOP.

		   Eleven points across each control rather than the centre alone: a
		   control half-covered is still a control a student misses, and a
		   single centre probe is exactly what a toolbar that wraps differently
		   at another width would slip past. */
		say(
			'every pixel of the confirm pair is reachable rather than painted over',
			(() => {
				const controls = [...document.querySelectorAll('footer button')];
				if (!controls.length) return false;
				return controls.every((control) => {
					const r = control.getBoundingClientRect();
					if (r.width <= 0 || r.height <= 0) return false;
					for (let i = 0; i <= 10; i++) {
						const x = r.left + 2 + (r.width - 4) * (i / 10);
						const hit = document.elementFromPoint(x, r.top + r.height / 2);
						if (!hit || !(hit === control || control.contains(hit))) return false;
					}
					return true;
				});
			})()
		);
		/* AND IT DOES NOT BUY THAT BY COVERING THE VIEWPORT'S OWN MARKS. The
		   reference triad and the view name are the two things at the bottom of
		   the graphics area; a footer that reaches by sitting on one of them has
		   traded one unreadable thing for another. */
		say(
			'the confirm pair clears the reference triad and the view name',
			(() => {
				const f = box('footer');
				if (!f) return true;
				const clear = (o: DOMRect | undefined) =>
					!o || f.left >= o.right - 0.5 || f.right <= o.left + 0.5 || f.top >= o.bottom - 0.5 || f.bottom <= o.top + 0.5;
				return clear(box('.triad')) && clear(box('.view'));
			})()
		);

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

	/**
	 * THE STANDARD-VIEW LIST, OPENED THROUGH ITS OWN CONTROL AND CLOSED AGAIN.
	 *
	 * It is a probe of its own rather than a block inside `verdicts` because
	 * the list is CLOSED in every state this harness renders -- `verdicts` runs
	 * over the surface as it opens, and a check written there would have
	 * measured an element that is not on screen and passed vacuously for it.
	 *
	 * WHAT IT IS FOR: at 375 the list is capped at `calc(100% - 5rem)` of a
	 * 360px viewport, and seven 44px rows measured 345px of content in a 278px
	 * box -- so `Isometric (Ctrl+7)`, which is the view a student most wants to
	 * get back to, sat below a fold this container's Chromium paints no
	 * scrollbar for, and `Bottom` was sliced through its glyphs. Every existing
	 * check passed: the rows were present, visible, over 44px and correctly
	 * labelled. Only a fold measurement and a hit test tell it apart.
	 *
	 * IT PUTS THE LIST BACK, so every measurement taken after it is taken on the
	 * surface as it opens.
	 */
	/**
	 * THE SEVEN VIEWS, WRITTEN DOWN HERE RATHER THAN READ OFF THE EDITOR'S OWN
	 * `STANDARD`. That constant lives inside `BladeEditor.svelte` and is not in
	 * this module's scope at all -- the first version of this probe referenced
	 * it and threw `ReferenceError: STANDARD is not defined`, which the harness
	 * reported as `CANNOT COMPARE` rather than as a pass, which is the
	 * instrument working. Importing it would be worse than the error: a test
	 * whose expected value comes from the thing under test cannot fail, so a
	 * view quietly dropped from the editor's list would take this claim down
	 * with it and nothing would say so.
	 */
	const EXPECTED_VIEWS = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom', 'Isometric'];

	async function orientationVerdicts(): Promise<string[]> {
		const out: string[] = [];
		const say = (claim: string, ok: boolean) => out.push(`${claim} ${ok ? 'ok' : 'FAILED'}`);
		const control = [...document.querySelectorAll('.viewport nav button')].find(
			(b) => b.textContent?.trim() === 'Orientation'
		) as HTMLButtonElement | undefined;
		if (!control) {
			say('the Orientation control is on screen to be pressed', false);
			return out;
		}
		control.click();
		await new Promise((res) => setTimeout(res, 120));
		const list = document.querySelector('.orient') as HTMLElement | null;
		const rows = [...document.querySelectorAll('.orient button')] as HTMLElement[];
		const pane = document.querySelector('.viewport')?.getBoundingClientRect();
		say('the list opens', !!list && rows.length === EXPECTED_VIEWS.length);
		if (list && pane) {
			/* BY NAME, not by count: seven rows is satisfied by seven copies of
			   the same view, and Isometric -- the one that was falling off -- is
			   the last of them. */
			say(
				'every standard view has a row',
				EXPECTED_VIEWS.every((view) => rows.some((row) => (row.textContent ?? '').trim().startsWith(view)))
			);
			/* THE FOLD. Not "can it be scrolled to" -- the list is
			   `overflow: auto`, so every row trivially can be. The claim is that
			   there is no fold at all, because a fold with no scrollbar painted
			   is a row a student never learns is there. */
			say('nothing is below an invisible fold', list.scrollHeight <= list.clientHeight + 1);
			say(
				'every row can be pressed where it is drawn',
				rows.every((row) => {
					const r = row.getBoundingClientRect();
					if (r.width <= 0 || r.height <= 0) return false;
					const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
					return !!hit && (hit === row || row.contains(hit));
				})
			);
			/* THE SHORTCUT HINT IS PART OF THE ROW. The first arrangement that
			   cleared the fold did it by halving each cell, which sliced
			   "Ctrl+1" to "Ctrl+" -- a clipped row traded for a clipped hint. */
			say(
				'no row has its own text clipped',
				rows.every((row) => row.scrollWidth <= row.clientWidth + 1)
			);
			say(
				'the list stays inside the graphics area',
				(() => {
					const b = list.getBoundingClientRect();
					return b.left >= pane.left - 0.5 && b.right <= pane.right + 0.5 && b.bottom <= pane.bottom + 0.5 && b.top >= pane.top - 0.5;
				})()
			);
			say('every row clears 44px', rows.every((row) => {
				const r = row.getBoundingClientRect();
				return r.height >= 43.5 && r.width >= 43.5;
			}));
		} else {
			say('every standard view has a row', false);
			say('nothing is below an invisible fold', false);
			say('every row can be pressed where it is drawn', false);
			say('no row has its own text clipped', false);
			say('the list stays inside the graphics area', false);
			say('every row clears 44px', false);
		}
		say('nothing is wider than the window', document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5);
		control.click();
		await new Promise((res) => setTimeout(res, 120));
		say('the control closes it again', document.querySelectorAll('.orient').length === 0);
		return out;
	}

	/**
	 * Open the History the way a student does: by pressing the control in the
	 * header. A prop that put the timeline on screen directly would measure an
	 * arrangement the surface has no path to -- the same rule
	 * `openPropertyManager` and `openMaterials` already follow.
	 */
	function openHistory(): boolean {
		const btn = document.querySelector('[data-testid="ideacad-history-toggle"]');
		if (!(btn instanceof HTMLElement)) return false;
		btn.click();
		return true;
	}

	/**
	 * THE TIMELINE'S OWN CLAIMS, AND THEY ARE GEOMETRIC BECAUSE THE CONTENT ONES
	 * CANNOT SEE THE FAILURE. Ledger 0171 lost two rows below an invisible fold
	 * on this same rail, and this Chromium paints NO SCROLLBAR into a screenshot
	 * at any colour (ledger 0186 proved it with a magenta-on-green control) -- so
	 * "the row is in the DOM" and "the row is reachable" are different questions
	 * and only the second one matters.
	 */
	async function timelineVerdicts(): Promise<string[]> {
		const out: string[] = [];
		const say = (claim: string, ok: boolean) => out.push(`${claim} ${ok ? 'ok' : 'FAILED'}`);
		const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
		const rows = [...document.querySelectorAll('[data-testid="ideacad-timeline-row"]')];
		const list = document.querySelector('[data-testid="ideacad-timeline-rows"]');
		const pane = box('.tree');
		say('the timeline is on screen', !!box('[data-testid="ideacad-timeline"]'));
		say('every step of the log has a row', rows.length === history.length);
		say(
			'it is inside the pane the feature tree was in',
			!!pane &&
				rows.every((r) => {
					const b = r.getBoundingClientRect();
					return b.left >= pane.left - 0.5 && b.right <= pane.right + 0.5;
				})
		);
		/* EVERY ROW IS REACHABLE BY SCROLLING, which is the fold check. A row
		   below the list's own scrollport is fine; a row that cannot be brought
		   INTO it is the 0171 defect. */
		if (list instanceof HTMLElement && pane) {
			/* MEASURED AGAINST THE PANE, NOT THE LIST, AND THAT DISTINCTION IS THE
			   WHOLE CHECK. The first version of this asked whether each row was
			   inside the LIST's own box after scrolling it -- which every row
			   trivially is, because scrolling a box brings a row into that box by
			   definition. It passed while the list itself hung 200px below the
			   pane's bottom edge with three rows under the fold, which is ledger
			   0171's defect reproduced exactly, and a rasterized screenshot is
			   what found it rather than this function. The honest question is
			   whether a row ends up inside the box the STUDENT can see. */
			const reachable = rows.every((r) => {
				(r as HTMLElement).scrollIntoView({ block: 'nearest' });
				const b = r.getBoundingClientRect();
				const l = list.getBoundingClientRect();
				const p2 = pane;
				return (
					b.top >= l.top - 1 &&
					b.bottom <= l.bottom + 1 &&
					b.top >= p2.top - 1 &&
					b.bottom <= p2.bottom + 1
				);
			});
			say('every row can be scrolled into view', reachable);
			/* AND THE LIST ITSELF IS INSIDE THE PANE, which is the condition that
			   makes the per-row answer above mean anything: a scroll region
			   hanging out of its own container is two nested scroll regions, and
			   the outer one has no cue at all in a browser that paints no
			   scrollbar. */
			const l = list.getBoundingClientRect();
			say('the list is inside the pane rather than hanging out of it', l.bottom <= pane.bottom + 1 && l.top >= pane.top - 1);
			say('there is exactly one scroll region, and it is the list', list.scrollHeight > list.clientHeight ? pane.height >= l.height - 1 : true);
			/* THE GUTTER IS RESERVED RATHER THAN PAINTED. With no scrollbar in a
			   screenshot, content running under one is invisible; `scrollbar-gutter`
			   is what keeps the row's right edge clear of it whether or not the
			   list overflows. */
			say('the list reserves room for its scrollbar', getComputedStyle(list).scrollbarGutter === 'stable');
			const widest = Math.max(...rows.map((r) => r.getBoundingClientRect().right));
			say('no row runs past the list box', widest <= list.getBoundingClientRect().right + 0.5);
		} else {
			say('every row can be scrolled into view', false);
			say('the list is inside the pane rather than hanging out of it', false);
			say('there is exactly one scroll region, and it is the list', false);
			say('the list reserves room for its scrollbar', false);
			say('no row runs past the list box', false);
		}
		/* A ROW NAMES A PART AND A PARAMETER, NEVER A JSON POINTER. This is the
		   whole point of the surface: `/features/1/acrossFlats` is not something a
		   fifteen-year-old reads. */
		const text = rows.map((r) => r.textContent ?? '').join(' ');
		say('no row prints a JSON pointer', !/\/features\/|\/materials\//.test(text));
		/* A STORED ID IS NOT A NAME EITHER, and this is the half the pointer
		   sweep had nothing to say about: "Blade stock steel-0125 to
		   aluminum-0125" was on screen and passed every check written above it. */
		say('no row prints a stored stock id', !/[a-z]+-0\d{3,}/.test(text));
		say('a material change names the material a picker offers', text.includes('6061 aluminum'));
		say('a row names a feature in the words the controls use', text.includes('Hex Extension'));
		say('a row names a parameter in the words the controls use', text.includes('Extension height'));
		say('the origin says the part was created', text.includes('Part created'));
		/* THE APPEND-ONLY SHAPE IS ON SCREEN: an undone step is still a row. */
		say('an undone step is still listed', !!document.querySelector('[data-state="undone"]'));
		say('a redone step is still listed', /Redid/.test(text));
		say('nothing is wider than the window', document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5);
		return out;
	}

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		w.__ideacadOpenHistory = openHistory;
		w.__ideacadTimelineVerdicts = timelineVerdicts;
		w.__ideacadVerdicts = verdicts;
		w.__ideacadFrameProbe = frameProbe;
		w.__ideacadFrameVerdicts = frameVerdicts;
		w.__ideacadRunFrameProbe = runFrameProbe;
		w.__ideacadCamera = () => probe;
		w.__ideacadOpenPropertyManager = openPropertyManager;
		w.__ideacadPaneVerdicts = paneVerdicts;
		w.__ideacadPhysicsProbe = physicsProbe;
		w.__ideacadOpenMaterials = openMaterials;
		w.__ideacadMaterialVerdicts = materialVerdicts;
		w.__ideacadOrientationVerdicts = orientationVerdicts;
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
	materials={LIBRARY}
	{history}
	viewerEmail={HARNESS_VIEWER}
	undoStep={historyWrites.undo}
	redoStep={historyWrites.redo}
	saveCustomMaterial={role === 'teacher' ? undefined : saveCustomMaterial}
	{onFrame}
	onViewportReady={(p) => (probe = p)}
/>
