<script lang="ts">
	import ClassroomFeed from '$lib/classroom/ClassroomFeed.svelte';
	import { buildFeed, type FeedSubmission } from '$lib/classroom/feed';
	import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';

	/**
	 * Dev harness for the home-page classroom feed (404 in production; no auth,
	 * no Supabase). Mounts the REAL ClassroomFeed inside `.legacy-index` -- the
	 * wrapper the home page uses -- so the shared app.css chrome applies exactly
	 * as it does in production, and drives it through the REAL buildFeed so the
	 * ranking on screen is the shipping ranking, not a hand-ordered list.
	 *
	 * Collapse is local state here; the real page persists the same toggle to
	 * profiles.preferences.classroomFeed.
	 */

	const NOW = new Date('2026-10-15T12:00:00Z');
	const iso = (d: string) => new Date(d).toISOString();

	const course = { id: 'c1', code: 'IDEA100', title: 'Intro to Engineering Design', active: true };
	const p1: ClassroomSection = {
		id: 'sec-p1',
		course_id: 'c1',
		label: 'Period 1',
		block: 'Block A',
		teacher_email: 'tvargas@boscotech.edu',
		active: true,
		course
	};
	const p2: ClassroomSection = {
		id: 'sec-p2',
		course_id: 'c1',
		label: 'Period 2',
		block: null,
		teacher_email: 'tvargas@boscotech.edu',
		active: true,
		course
	};
	const p4: ClassroomSection = {
		id: 'sec-p4',
		course_id: 'c1',
		label: 'Period 4',
		block: null,
		teacher_email: 'tvargas@boscotech.edu',
		active: true,
		course
	};

	let seq = 0;
	function item(partial: Partial<ClassroomItem> & { id: string; section: string }): ClassroomItem {
		seq += 1;
		return {
			kind: 'assignment',
			title: null,
			body: '',
			points: 10,
			due_at: null,
			category: null,
			author_email: 'tvargas@boscotech.edu',
			author_name: 'T. Vargas',
			published: true,
			pinned: false,
			sort_order: 0,
			first_published_at: iso('2026-09-01T08:00:00Z'),
			edited_at: null,
			// Created oldest-first in declaration order, so anything ranked above a
			// later item is genuinely ranked, not merely newer.
			created_at: new Date(Date.parse('2026-09-01T08:00:00Z') + seq * 3600_000).toISOString(),
			updated_at: iso('2026-09-01T08:00:00Z'),
			links: [],
			attachments: [],
			viewed_at: null,
			...partial,
			postings: [{ section_id: partial.section }]
		} as ClassroomItem;
	}

	const ME = 'alice@boscotech.net';

	// A deliberate mix: overdue, due soon, handed back, never handed in, an
	// edited announcement, a pinned notice and a pinned syllabus.
	const items: ClassroomItem[] = [
		item({ id: 'i-overdue', section: p1.id, title: 'Truss bridge sketch', due_at: iso('2026-10-10T07:00:00Z') }),
		item({ id: 'i-returned', section: p1.id, title: 'Material ID checkpoint' }),
		item({ id: 'i-soon', section: p1.id, title: 'Tolerance worksheet', due_at: iso('2026-10-18T07:00:00Z') }),
		item({ id: 'i-unsub', section: p1.id, title: 'Shop safety quiz' }),
		item({
			id: 'i-updated',
			section: p1.id,
			kind: 'post',
			title: 'Field trip permission slips',
			points: null,
			edited_at: iso('2026-10-14T09:00:00Z')
		}),
		item({
			id: 'i-pinned',
			section: p1.id,
			kind: 'post',
			title: 'How this class runs',
			points: null,
			pinned: true
		}),
		item({
			id: 'i-syllabus',
			section: p1.id,
			kind: 'material',
			title: 'Course syllabus 2026-27',
			points: null,
			pinned: true
		}),
		item({
			id: 'i-safety',
			section: p1.id,
			kind: 'material',
			title: 'Shop safety reference card',
			points: null
		}),
		item({ id: 'i-p2-soon', section: p2.id, title: 'CAD warmup', due_at: iso('2026-10-16T07:00:00Z') }),
		item({
			id: 'i-p2-draft',
			section: p2.id,
			title: 'Draft: unit 2 exam review',
			published: false
		})
	];

	const submissions: FeedSubmission[] = [
		// Handed back and never opened -> "Returned".
		{
			item_id: 'i-returned',
			student_email: ME,
			state: 'returned',
			submitted_at: iso('2026-10-05T10:00:00Z'),
			graded_at: iso('2026-10-08T10:00:00Z'),
			returned_at: iso('2026-10-08T10:00:00Z')
		},
		// Two classmates waiting on a grade -> the teacher's queue.
		{
			item_id: 'i-overdue',
			student_email: 'bruno@boscotech.net',
			state: 'submitted',
			submitted_at: iso('2026-10-09T10:00:00Z'),
			graded_at: null,
			returned_at: null
		},
		{
			item_id: 'i-overdue',
			student_email: 'carla@boscotech.net',
			state: 'submitted',
			submitted_at: iso('2026-10-09T11:00:00Z'),
			graded_at: null,
			returned_at: null
		},
		// A resubmission after grading: back in the queue, not silently dropped.
		{
			item_id: 'i-soon',
			student_email: 'bruno@boscotech.net',
			state: 'submitted',
			submitted_at: iso('2026-10-14T10:00:00Z'),
			graded_at: iso('2026-10-12T10:00:00Z'),
			returned_at: iso('2026-10-12T10:00:00Z')
		}
	];

	type Mode = 'student' | 'teacher' | 'empty' | 'notready';
	const MODES: { id: Mode; label: string }[] = [
		{ id: 'student', label: 'Student' },
		{ id: 'teacher', label: 'Teacher' },
		{ id: 'empty', label: 'No classes' },
		{ id: 'notready', label: 'Migrations off' }
	];
	let mode = $state<Mode>('student');

	let collapsed = $state<string[]>([]);
	let log = $state<string[]>([]);

	const feeds = $derived.by(() => {
		if (mode === 'empty' || mode === 'notready') return [];
		const teacher = mode === 'teacher';
		return buildFeed({
			sections: [p1, p2, p4],
			// Mirrors what RLS actually hands each caller: classroom_can_read_item
			// never gives a student a draft, so neither does the harness. feed.ts
			// deliberately does no privacy filtering of its own.
			items: teacher ? items : items.filter((i) => i.published),
			// Same rule for submissions: own-row-or-reviewer, so a student's read
			// carries nobody else's work.
			submissions: teacher ? submissions : submissions.filter((s) => s.student_email === ME),
			myEmail: teacher ? 'tvargas@boscotech.edu' : ME,
			now: NOW
		});
	});

	const onToggle = (id: string) => {
		collapsed = collapsed.includes(id)
			? collapsed.filter((c) => c !== id)
			: [...collapsed, id];
		log = [`toggle ${id} -> ${collapsed.includes(id) ? 'collapsed' : 'open'}`, ...log].slice(0, 12);
	};
</script>

<svelte:head><title>Home feed harness</title></svelte:head>

<div class="hf-bar">
	<strong>HOME FEED HARNESS</strong>
	{#each MODES as m (m.id)}
		<button type="button" class:active={mode === m.id} onclick={() => (mode = m.id)}>
			{m.label}
		</button>
	{/each}
	<button type="button" onclick={() => (collapsed = [])}>Expand all</button>
	<span class="hf-state">collapsed=[{collapsed.join(', ')}]</span>
</div>

<div class="legacy-index">
	<div class="courses" style="margin-top:1rem">
		<div class="year-label">Your Classes</div>
		<ClassroomFeed {feeds} {collapsed} {onToggle} ready={mode !== 'notready'} now={NOW} />
	</div>
</div>

<div class="hf-log">
	{#each log as line, i (line + i)}<div>{line}</div>{/each}
</div>

<style>
	.hf-bar {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.6rem 1rem;
		background: #101010;
		border-bottom: 1px solid #2a2a2a;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: #9fb;
	}
	.hf-bar button {
		font: inherit;
		padding: 0.3rem 0.7rem;
		background: transparent;
		border: 1px solid #345;
		border-radius: 4px;
		color: #9fb;
		cursor: pointer;
	}
	.hf-bar button.active {
		border-color: #0f4;
		color: #0f4;
	}
	.hf-state {
		margin-left: auto;
		color: #678;
	}
	.hf-log {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: #678;
		padding: 0.8rem 1rem 2rem;
	}
</style>
