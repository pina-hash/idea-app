<script lang="ts">
	/**
	 * Dev harness for the REAL BladeEditor -- never a copy of its markup.
	 * States by query string, per the bundle's own verification plan:
	 *   role=student                    one seeded concept (default)
	 *   role=student&state=three        three concepts, one failing diameter
	 *   role=student&state=compare      the compare surface open, gate CLOSED
	 *   role=student&state=committed    three concepts, the active one committed
	 *   role=teacher                    the same component, read-only
	 * `commitConceptCard` is handed in only where a state wants the control: its
	 * ABSENCE is what removes it, which is the rule the real page relies on too.
	 */
	import BladeEditor from '$lib/ideacad/BladeEditor.svelte';
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
			: state === 'compare' || state === 'committed'
				? many
				: undefined;
	const commits: string[] = [];

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
		return out;
	}
	if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__ideacadVerdicts = verdicts;
</script>

<svelte:head><title>IdeaCAD harness</title></svelte:head>
<BladeEditor
	tree={DEFAULT_BLADE_TREE}
	config={DEFAULT_BLADE_CONFIG}
	{concepts}
	openCompare={state === 'compare'}
	readOnly={role === 'teacher'}
	conceptName={role === 'teacher' ? 'Student concept' : 'Concept 1'}
	commitConceptCard={role === 'teacher' ? undefined : async (id: string) => void commits.push(id)}
/>
