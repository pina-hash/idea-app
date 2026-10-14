<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import '$lib/classroom/classroom.css';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import HtmlAssignmentFrame from '$lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
	import FeedbackPanel from '$lib/classroom/feedback/FeedbackPanel.svelte';
	import FeedbackDrawing from '$lib/classroom/feedback/FeedbackDrawing.svelte';
	import FeedbackInbox from '$lib/classroom/feedback/FeedbackInbox.svelte';
	import { FeedbackSession } from '$lib/classroom/feedback/session.svelte';
	import { createMemoryFeedback } from '$lib/classroom/feedback/transports';
	import { fieldNotes, marksByField, type FeedbackThread } from '$lib/classroom/feedback/notes';
	import { registerLocalSubmissionFileUrl, submissionFileSrc } from '$lib/classroom/assignment-spec';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const view = $derived(page.url.searchParams.get('view') ?? 'student');
	const wantDraw = $derived(page.url.searchParams.get('draw') === '1');

	/** The `/hx/feedback` fixture's manifest, mirrored (its block ids are the fixture's). */
	const MANIFEST = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Feedback fixture',
		modules: [
			{
				id: 'mod-1',
				title: 'One module, with a picture block',
				blocks: [
					{ id: 'mod-1.a.team', field: 'teamName', type: 'text', prompt: 'Your team name' },
					{ id: 'mod-1.b.reflection', field: 'reflection', type: 'longText', prompt: 'What did you change, and why?' },
					{ id: 'mod-1.c.done', field: 'checkedOff', type: 'checkbox' },
					{ id: 'mod-1.d.photo', field: 'photo', type: 'image', prompt: 'A photo of your part' }
				]
			}
		]
	} as unknown as HtmlAssignmentManifest;

	/** A picture with something to point at: a bracket with a hole too close to the edge. */
	const PICTURE =
		'data:image/svg+xml;charset=utf-8,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
				'<rect width="800" height="600" fill="#cfd6dc"/>' +
				'<path d="M140 460 L140 180 L300 180 L300 380 L660 380 L660 460 Z" fill="#7d8a96" stroke="#3a434b" stroke-width="6"/>' +
				'<circle cx="220" cy="230" r="26" fill="#cfd6dc" stroke="#3a434b" stroke-width="5"/>' +
				'<circle cx="610" cy="420" r="22" fill="#cfd6dc" stroke="#3a434b" stroke-width="5"/>' +
				'</svg>'
		);
	const FILE_ID = 'f-photo-1';
	registerLocalSubmissionFileUrl(FILE_ID, PICTURE);
	const IMAGES = { photo: { url: submissionFileSrc(FILE_ID), name: 'bracket.png', caption: 'My bracket' } };

	const ITEM = 'item-1';
	const STUDENT = 'alice@boscotech.net';
	const T0 = Date.parse('2026-10-14T17:00:00Z');
	const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

	function thread(over: Partial<FeedbackThread> & Pick<FeedbackThread, 'id' | 'blockId'>): FeedbackThread {
		return {
			itemId: ITEM,
			itemTitle: 'Bracket redesign',
			studentEmail: STUDENT,
			studentName: 'Alice Alvarez',
			fileId: null,
			marks: null,
			authorName: 'Mr. Pina',
			createdAt: at(0),
			updatedAt: at(0),
			editedAt: null,
			fixedAt: null,
			resolvedAt: null,
			studentSeenAt: null,
			teacherSeenAt: at(0),
			viewer: 'teacher',
			sections: ['s1'],
			messages: [],
			...over
		};
	}
	const msg = (id: string, role: 'teacher' | 'student', body: string, min: number) => ({
		id,
		role,
		name: role === 'teacher' ? 'Mr. Pina' : 'Alice Alvarez',
		body,
		createdAt: at(min),
		editedAt: null,
		mine: role === 'teacher'
	});

	const SEED: FeedbackThread[] = [
		thread({
			id: 't-reflection',
			blockId: 'mod-1.b.reflection',
			updatedAt: at(5),
			messages: [msg('m1', 'teacher', 'Good start. Say WHY you moved the hole, not only that you did.', 5)]
		}),
		thread({
			id: 't-photo',
			blockId: 'mod-1.d.photo',
			fileId: FILE_ID,
			updatedAt: at(8),
			marks: {
				v: 1,
				shapes: [
					{ t: 'ellipse', c: 'red', w: 2, p: [2400, 3200, 3100, 4500] },
					{ t: 'arrow', c: 'yellow', w: 3, p: [4300, 2200, 3150, 3650] },
					{ t: 'text', c: 'white', w: 2, p: [4400, 2000], s: 'Too close to the edge' }
				]
			},
			messages: [msg('m2', 'teacher', 'This hole will tear out. Move it at least two diameters in.', 8)]
		}),
		thread({
			id: 't-team',
			blockId: 'mod-1.a.team',
			updatedAt: at(2),
			resolvedAt: at(3),
			studentSeenAt: at(3),
			messages: [msg('m3', 'teacher', 'Add your team number to the name.', 2), msg('m4', 'student', 'Done, it is Team 4 now.', 3)]
		}),
		thread({
			id: 't-other',
			itemId: 'item-2',
			itemTitle: 'Gear train worksheet',
			studentEmail: 'ben@boscotech.net',
			studentName: 'Ben Brooks',
			blockId: null,
			updatedAt: at(12),
			fixedAt: at(12),
			studentSeenAt: at(12),
			teacherSeenAt: at(6),
			messages: [msg('m5', 'teacher', 'Show the gear ratio as a fraction.', 6), msg('m6', 'student', 'Fixed, it is 3/1 now.', 12)]
		})
	];

	const memory = createMemoryFeedback({ now: () => Date.now(), seed: SEED, itemTitle: () => 'Bracket redesign', studentName: () => 'Alice Alvarez' });

	const studentSession = new FeedbackSession({ transports: memory.student(STUDENT), side: 'student', itemId: ITEM });
	const teacherSession = new FeedbackSession({ transports: memory.teacher, side: 'teacher', itemId: ITEM, studentEmail: STUDENT });
	const inboxSession = new FeedbackSession({ transports: memory.teacher, side: 'teacher', itemId: null });
	// IN THE BROWSER ONLY: a read started during the server render would land
	// after it, outside the request, where `page` cannot be read at all.
	onMount(() => {
		const draw = wantDraw;
		void studentSession.refresh();
		void teacherSession.refresh().then(() => {
			if (draw)
				teacherSession.startDrawing({ src: IMAGES.photo.url, alt: 'My bracket', fileId: FILE_ID, blockId: 'mod-1.d.photo' });
		});
		void inboxSession.refresh();
	});

	const studentNotes = $derived(fieldNotes(MANIFEST, studentSession.threads, 'student'));
	const studentMarks = $derived(marksByField(IMAGES, studentSession.threads, submissionFileSrc));
	const teacherNotes = $derived(fieldNotes(MANIFEST, teacherSession.threads, 'teacher'));
	const teacherMarks = $derived(marksByField(IMAGES, teacherSession.threads, submissionFileSrc));
</script>

<svelte:head><title>Progressive feedback harness</title></svelte:head>

<div class="cr-root {CLASSROOM_PLATE}" data-testid="feedback-harness" data-view={view}>
	{#if view === 'inbox'}
		<FeedbackInbox
			session={inboxSession}
			sections={[{ id: 's1', label: 'IDEA209H · Block 2' }]}
			manifests={{ [ITEM]: MANIFEST }}
			workHref={async (t) => `/dev/html-assignment-grading?feedback=1&student=${encodeURIComponent(t.studentName)}`}
		/>
	{:else if view === 'teacher'}
		<main class="classroom-page fh-page">
			<h1>Teacher: notes on Alice's work</h1>
			<FeedbackPanel
				session={teacherSession}
				manifest={MANIFEST}
				studentName="Alice Alvarez"
				pictures={{ [FILE_ID]: 'My bracket' }}
				annotateField={() =>
					teacherSession.startDrawing({ src: IMAGES.photo.url, alt: 'My bracket', fileId: FILE_ID, blockId: 'mod-1.d.photo' })}
				annotateThread={(t) =>
					teacherSession.startDrawing({
						src: IMAGES.photo.url,
						alt: 'My bracket',
						fileId: FILE_ID,
						blockId: t.blockId,
						threadId: t.id,
						initialMarks: t.marks,
						initialBody: t.messages.find((m) => m.role === 'teacher')?.body ?? ''
					})}
				drawable={[{ field: 'photo', label: 'My bracket' }]}
				inboxHref="/dev/progressive-feedback?view=inbox"
			/>
			<FeedbackDrawing session={teacherSession} />
			<HtmlAssignmentFrame
				src="/hx/feedback"
				title="Feedback fixture (teacher)"
				fieldToBlockId={data.fieldToBlockId}
				values={{ teamName: 'Team 4', reflection: 'I moved the hole.' }}
				images={IMAGES}
				readOnly
				notes={teacherNotes}
				marks={teacherMarks}
				onnote={(_f, id) => teacherSession.show(id)}
				onannotate={() =>
					teacherSession.startDrawing({ src: IMAGES.photo.url, alt: 'My bracket', fileId: FILE_ID, blockId: 'mod-1.d.photo' })}
			/>
		</main>
	{:else}
		<main class="classroom-page fh-page">
			<h1>Student: Bracket redesign</h1>
			<FeedbackPanel session={studentSession} manifest={MANIFEST} />
			<HtmlAssignmentFrame
				src="/hx/feedback"
				title="Feedback fixture"
				fieldToBlockId={data.fieldToBlockId}
				values={{ teamName: 'Team 4', reflection: 'I moved the hole.' }}
				images={IMAGES}
				notes={studentNotes}
				marks={studentMarks}
				onnote={(_f, id) => studentSession.show(id)}
				onchange={() => {}}
			/>
		</main>
	{/if}
	<p class="fh-calls" data-testid="feedback-calls">{memory.calls.join(' ')}</p>
</div>

<style>
	.fh-page {
		padding: 1rem;
		max-width: 64rem;
		margin: 0 auto;
	}
	.fh-calls {
		padding: 0 1rem 1rem;
		font: 12px/1.4 var(--font-mono);
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
</style>
