<script lang="ts">
	/**
	 * PRESENTATION CHECK-OFF (ledger 0438): the REAL PresentationQueue over
	 * in-memory transports that keep 0310's rules a surface can see (who is
	 * up is the entry marked up, else the first redo, else the first waiting).
	 *
	 *   ?state=empty   no list yet: the start form
	 *   ?state=list    a roster list for an assignment with a rubric
	 *   ?state=team    a team list
	 *   &notes=0       no feedback transport: no notes box
	 *
	 * `tools/browser-verify/routes/presentation-queue*.mjs` measures it.
	 */
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import PresentationQueue from '$lib/classroom/PresentationQueue.svelte';
	import type { FeedbackTransports } from '$lib/classroom/feedback/transports';
	import type {
		PresentationEntry,
		PresentationQueueData,
		PresentationScoring,
		PresentationTransports
	} from '$lib/classroom/presentations';
	import { SECTION } from '../classroom-palette/fixture';

	const q = page.url.searchParams;
	const view = q.get('state') ?? 'list';
	const STUDENTS = ['Cho, Dan', 'Diaz, Fay', 'Lim, Cara', 'Ortiz, Ben', 'Park, Eli', 'Reyes, Ana'];
	const person = (name: string, i: number) => ({ email: `s${i}@example.test`, name });
	let store = $state<PresentationQueueData | null>(
		view === 'empty'
			? null
			: view === 'team'
				? {
						id: 'q1',
						title: 'Unit 4 launcher pitches',
						itemId: 'i-tonight',
						itemTitle: 'Unit 4 launcher',
						up: null,
						entries: [0, 1].map((t) => ({
							id: `e${t}`,
							position: t + 1,
							status: 'waiting',
							markedAt: null,
							kind: 'team',
							teamId: `t${t}`,
							name: t === 0 ? 'Torque' : 'The Gearheads',
							members: STUDENTS.slice(t * 3, t * 3 + 3).map((n, i) => person(n, t * 3 + i))
						}))
					}
				: {
						id: 'q1',
						title: 'Load test talks',
						itemId: 'i-tonight',
						itemTitle: 'Load test log',
						up: null,
						entries: STUDENTS.map((n, i) => ({
							id: `e${i}`,
							position: i + 1,
							status: i < 2 ? (i === 0 ? 'presented' : 'absent') : 'waiting',
							markedAt: null,
							kind: 'student',
							teamId: null,
							name: n,
							members: [person(n, i)]
						}))
					}
	);
	let notesSaved = $state(0);
	let scored = $state(0);

	function withUp(d: PresentationQueueData | null): PresentationQueueData | null {
		if (!d) return null;
		const up =
			d.entries.find((e) => e.status === 'up') ??
			d.entries.filter((e) => e.status === 'redo').sort((a, b) => a.position - b.position)[0] ??
			d.entries.filter((e) => e.status === 'waiting').sort((a, b) => a.position - b.position)[0];
		return { ...d, up: up?.id ?? null, entries: [...d.entries].sort((a, b) => a.position - b.position) };
	}

	const transports: PresentationTransports = {
		async load() {
			return { ok: true, data: withUp($state.snapshot(store) as PresentationQueueData | null) };
		},
		async start(_s, input) {
			store = {
				id: 'q2',
				title: 'Presentations',
				itemId: input.itemId,
				itemTitle: input.itemId ? 'Load test log' : null,
				up: null,
				entries: STUDENTS.map((n, i) => ({ id: `n${i}`, position: i + 1, status: 'waiting', markedAt: null, kind: 'student', teamId: null, name: n, members: [person(n, i)] }))
			};
			return { ok: true, data: null };
		},
		async mark(id, status) {
			if (!store) return { ok: false, message: 'No list.' };
			store = {
				...store,
				entries: store.entries.map((e): PresentationEntry =>
					e.id === id ? { ...e, status } : status === 'up' && e.status === 'up' ? { ...e, status: 'waiting' } : e
				)
			};
			return { ok: true, data: null };
		},
		async move(id, position) {
			if (!store) return { ok: false, message: 'No list.' };
			const list = [...store.entries].sort((a, b) => a.position - b.position);
			const from = list.findIndex((e) => e.id === id);
			const [it] = list.splice(from, 1);
			list.splice(position - 1, 0, it);
			store = { ...store, entries: list.map((e, i) => ({ ...e, position: i + 1 })) };
			return { ok: true, data: null };
		},
		async close() {
			store = null;
			return { ok: true, data: null };
		}
	};
	const feedback =
		q.get('notes') === '0'
			? null
			: ({
					post: async () => {
						notesSaved += 1;
						return { ok: true, thread: null };
					}
				} as unknown as FeedbackTransports);
	const scoring: PresentationScoring = {
		async rubric() {
			return {
				ok: true,
				data: {
					teamCriteria: null,
					criteria: [
						{ id: 'c1', criterion: 'Explains the design', points: 10, levels: [{ label: 'Strong', points: 10 }, { label: 'Some', points: 6 }, { label: 'None', points: 0 }] },
						{ id: 'c2', criterion: 'Answers questions', points: 5, levels: [{ label: 'Strong', points: 5 }, { label: 'Some', points: 3 }, { label: 'None', points: 0 }] }
					]
				}
			};
		},
		async score() {
			scored += 1;
			return { ok: true, data: null };
		}
	};
</script>

<div class="cr-root {CLASSROOM_PLATE}" data-notes-saved={notesSaved} data-scored={scored}>
	<PresentationQueue
		section={SECTION}
		assignments={[{ id: 'i-tonight', title: 'Load test log' }]}
		{transports}
		{feedback}
		{scoring}
	/>
</div>
