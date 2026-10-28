<script lang="ts">
	import '$lib/classroom/classroom.css';
	import { page } from '$app/state';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import GradingQueue from '$lib/classroom/GradingQueue.svelte';
	import GradesPanel from '$lib/classroom/GradesPanel.svelte';
	import { parseNeedsGrading } from '$lib/classroom/grading-queue';
	import type { ClassroomSection } from '$lib/classroom/classroom';

	/** Fixed instants: a fixture that moves cannot be asserted. */
	const due = (d: number) => new Date(Date.parse('2026-10-28T06:59:00Z') - d * 86_400_000).toISOString();
	const student = (name: string, answers: number, late = false, files = 0) => ({
		email: `${name.toLowerCase().replace(/\W+/g, '.')}@boscotech.net`,
		name,
		turned_in: false,
		answers,
		files,
		last_saved: due(1),
		saved_after_due: late
	});
	const CLASSES = [
		{ section_id: 's-b2', course: 'IDEA209H', course_title: 'Engineering I Honors', label: '1', block: '2' },
		{ section_id: 's-b3', course: 'IDEA209H', course_title: 'Engineering I Honors', label: '2', block: '3' },
		{ section_id: 's-b4', course: 'IDEA209H', course_title: 'Engineering I Honors', label: '3', block: '4' },
		{ section_id: 's-f1', course: 'IDEA 100', course_title: 'Technology Rotation', label: '2', block: '1' }
	];
	const ITEMS: Record<string, unknown[]> = {
		's-b2': [
			{ item_id: 'i-shop', title: 'Shop Fix: Design', points: 25, due_at: due(6), html: true, team: false, waiting: 3, students: [student('Reyes, Mateo', 9), student('Ruiz, Daniel', 7, true), student('Okafor, Chidi', 4, true)] },
			{ item_id: 'i-tol', title: 'Tolerance Check', points: 10, due_at: due(2), html: false, team: false, waiting: 1, students: [{ ...student('Lee, Leo', 0, false, 2), turned_in: true }] }
		],
		's-b3': [{ item_id: 'i-shop3', title: 'Shop Fix: Design', points: 25, due_at: due(6), html: true, team: false, waiting: 2, students: [student('Vega, Daniel', 9), student('Nguyen, Anh', 9, true)] }],
		's-b4': [{ item_id: 'i-shop4', title: 'Shop Fix: Design', points: 25, due_at: due(6), html: true, team: false, waiting: 4, students: [student('Park, Jay', 9), student('Wong, Ivy', 8), student('Diaz, Kai', 2, true), student('Cruz, Sam', 9)] }],
		's-f1': [{ item_id: 'i-blade', title: 'IDEA-Blade 01: Design', points: 120, due_at: due(9), html: true, team: true, waiting: 6, students: ['Ana', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay'].map((n) => student(`Student, ${n}`, 12)) }]
	};
	function answer(exclude: string[]) {
		const classes = CLASSES.filter((c) => !exclude.includes(c.section_id)).map((c) => ({
			...c,
			waiting: (ITEMS[c.section_id] as Array<{ waiting: number }>).reduce((n, i) => n + i.waiting, 0),
			items: ITEMS[c.section_id]
		}));
		return parseNeedsGrading({ ok: true, classes, excluded: CLASSES.filter((c) => exclude.includes(c.section_id)) });
	}
	const names = CLASSES.map((c) => ({ id: c.section_id, title: `${c.course} · Section ${c.label} · Block ${c.block}` }));

	const view = $derived(page.url.searchParams.get('view') ?? 'queue');
	const section: ClassroomSection = {
		id: 's-b4',
		course_id: 'c-1',
		label: '3',
		block: '4',
		teacher_email: 'wcosso@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};
	let protection = $state({
		on: true,
		kept: [
			{ id: 'k1', itemId: 'i-shop4', itemTitle: 'Shop Fix: Design', student: 'Park, Jay', action: 'grade', keptScore: 22, keptBy: 'wcosso@boscotech.edu', at: '2026-10-28T19:12:00Z' },
			{ id: 'k2', itemId: 'i-shop4', itemTitle: 'Shop Fix: Design', student: 'Cruz, Sam', action: 'typed score', keptScore: 25, keptBy: 'wcosso@boscotech.edu', at: '2026-10-28T19:12:00Z' }
		]
	});
	async function onprotection(on: boolean) {
		protection = { ...protection, on };
		return null;
	}
</script>

<div class="cr-root {CLASSROOM_PLATE}">
	{#if view === 'grades'}
		<GradesPanel {section} standings={[]} {protection} {onprotection} basePath="/dev" />
	{:else}
		<GradingQueue read={async (exclude) => ({ ok: true, data: answer(exclude) })} classes={names} basePath="/dev" />
	{/if}
</div>
