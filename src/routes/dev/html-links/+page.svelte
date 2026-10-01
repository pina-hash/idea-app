<script lang="ts">
	import { page } from '$app/state';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import '$lib/classroom/classroom.css';
	import HtmlLinkCheck from '$lib/classroom/html-assignment/HtmlLinkCheck.svelte';
	import HtmlAnswerList from '$lib/classroom/html-assignment/HtmlAnswerList.svelte';
	import AnswerLinks from '$lib/classroom/AnswerLinks.svelte';
	import { studentLinks } from '$lib/classroom/answer-links';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import type { StudentWork } from '$lib/classroom/assignment-spec';

	/** `valid` (default), `invalid` or `none`: the student's link field's three readings. */
	const viewState = $derived(page.url.searchParams.get('state') ?? 'valid');

	const MANIFEST = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Shop Trophy Presentation',
		course: 'IDEA209H',
		points: 0,
		header: [{ id: 'who', field: 'studentName', type: 'text', prompt: 'Your name' }],
		modules: [
			{
				id: 'deck',
				title: 'Presentation',
				points: 0,
				blocks: [
					{ id: 'deck-link', field: 'deckLink', type: 'text', link: 'presentation', prompt: 'Link to your slides' },
					{ id: 'deck-notes', field: 'notes', type: 'longText' }
				],
				criteria: []
			}
		]
	} as unknown as HtmlAssignmentManifest;

	const STUDENT_VALUE: Record<string, string> = {
		valid: 'https://docs.google.com/presentation/d/trophy-deck/edit?usp=sharing',
		invalid: 'my slides',
		none: ''
	};
	const values = $derived<Record<string, string | boolean>>({
		studentName: 'Avery Alder',
		deckLink: STUDENT_VALUE[viewState] ?? STUDENT_VALUE.valid,
		notes: 'The trophy base is walnut.'
	});

	/** A grader's view of two students: one link that opens, one that does not. */
	const work = (email: string, name: string, deck: string, notes: string): StudentWork =>
		({
			email,
			displayName: name,
			active: true,
			submission: null,
			responses: [
				{ item_id: 'i', student_email: email, block_id: 'who', value: { text: name } },
				{ item_id: 'i', student_email: email, block_id: 'deck-link', value: { text: deck } },
				{ item_id: 'i', student_email: email, block_id: 'deck-notes', value: { text: notes } }
			],
			files: [],
			approvals: []
		}) as StudentWork;
	const AVERY = work(
		'avery@boscotech.net',
		'Avery Alder',
		'https://docs.google.com/presentation/d/trophy-deck/edit?usp=sharing',
		'Reference photos are at https://www.canva.com/design/trophy-refs/view.'
	);
	const BLAKE = work('blake@boscotech.net', 'Blake Birch', 'my slides', 'Not finished.');
</script>

<svelte:head><title>dev: link hand-ins</title></svelte:head>

<div class="cr-root {CLASSROOM_PLATE} harness" data-testid="html-links-harness">
	<h1 class="hl-title">Link hand-ins on a ported worksheet</h1>
	<nav class="hl-states">
		<a class="hl-state" class:is-on={viewState === 'valid'} href="/dev/html-links">valid link</a>
		<a class="hl-state" class:is-on={viewState === 'invalid'} href="/dev/html-links?state=invalid">not a link</a>
		<a class="hl-state" class:is-on={viewState === 'none'} href="/dev/html-links?state=none">empty field</a>
	</nav>

	<section class="card hl-section" aria-label="The student's check" data-testid="hl-student">
		<h2 class="hl-head">Student, under the progress rail</h2>
		<HtmlLinkCheck manifest={MANIFEST} {values} />
		{#if viewState === 'none'}
			<p class="hl-empty-note" data-testid="hl-none-note">The field is empty, so nothing above is drawn.</p>
		{/if}
	</section>

	<section class="card hl-section" aria-label="The grader's links" data-testid="hl-grader">
		<h2 class="hl-head">Grader, the work head</h2>
		<AnswerLinks links={studentLinks(AVERY, { manifest: MANIFEST })} heading="Links in their answers" testId="hl-links-avery" />
		<AnswerLinks links={studentLinks(BLAKE, { manifest: MANIFEST })} heading="Links in their answers" testId="hl-links-blake" />
	</section>

	<section class="hl-section" aria-label="The answers view" data-testid="hl-answers">
		<HtmlAnswerList manifest={MANIFEST} student={AVERY} />
	</section>
</div>

<style>
	.harness {
		padding: var(--space-4, 1.2rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 1rem);
		max-width: 60rem;
	}
	.hl-title {
		font-family: var(--font-title, var(--font-display));
		font-size: 1.1rem;
		margin: 0;
	}
	.hl-states {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.hl-state {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		text-decoration: none;
	}
	.hl-state.is-on {
		color: var(--green);
		border-color: var(--green);
	}
	.hl-head {
		margin: 0 0 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.hl-empty-note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2);
	}
</style>
