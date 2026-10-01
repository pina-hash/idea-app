<script lang="ts">
	/**
	 * ANSWERS BY QUESTION: one question at a time, every student's answer to it
	 * (ledger 0360, report 41c7fcd5).
	 *
	 * "A quick view first of all that I can see like the just the questions and
	 * answers from the HTML in a more compact area." On the left, every question
	 * the worksheet asks, with how many students have answered it; on the right,
	 * each student's answer to the chosen one. A name opens that student's work
	 * for grading.
	 *
	 * IT READS NOTHING. The questions are the stored manifest's (`htmlQaQuestions`)
	 * and the answers are the rows the console already holds (`htmlQaColumn`), so
	 * opening this, switching questions and switching students cost no request --
	 * and no read of the stored document, which ledger 0357 forbids.
	 *
	 * Up and Down move between questions while the list has focus; the console's
	 * own keys stand down for a key this panel has already handled.
	 */
	import type { StudentWork } from '$lib/classroom/assignment-spec';
	import AnswerLinks from '$lib/classroom/AnswerLinks.svelte';
	import type { HtmlAssignmentManifest } from './manifest';
	import { htmlQaAnsweredCount, htmlQaColumn, htmlQaQuestions } from './qa';

	let {
		manifest,
		students,
		onopen,
		onexportcsv = null
	}: {
		manifest: HtmlAssignmentManifest;
		/** The roster on screen, in its order. */
		students: readonly StudentWork[];
		/** Open this student's work for grading. */
		onopen: (email: string) => void;
		/** Download every answer as a CSV, or null for no control. */
		onexportcsv?: (() => void) | null;
	} = $props();

	const questions = $derived(htmlQaQuestions(manifest));
	let chosenId = $state<string | null>(null);
	const chosen = $derived(questions.find((q) => q.blockId === chosenId) ?? questions[0] ?? null);
	const column = $derived(chosen ? htmlQaColumn(manifest, students, chosen.blockId) : []);
	/** Answered counts for every question, so the list says where the gaps are. */
	const counts = $derived(
		new Map(questions.map((q) => [q.blockId, htmlQaAnsweredCount(htmlQaColumn(manifest, students, q.blockId))]))
	);

	let listEl = $state<HTMLElement | null>(null);

	function choose(blockId: string) {
		chosenId = blockId;
	}

	function onListKey(event: KeyboardEvent) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
		const buttons = [...(listEl?.querySelectorAll<HTMLButtonElement>('.qa-q') ?? [])];
		if (!buttons.length) return;
		const at = buttons.indexOf(event.target as HTMLButtonElement);
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? buttons.length - 1
					: Math.max(0, Math.min(buttons.length - 1, (at < 0 ? 0 : at) + (event.key === 'ArrowDown' ? 1 : -1)));
		event.preventDefault();
		buttons[next].focus();
		buttons[next].scrollIntoView({ block: 'nearest', behavior: 'instant' });
		const id = buttons[next].dataset.blockId;
		if (id) choose(id);
	}
</script>

<section class="qa card" aria-label="Answers by question" data-testid="qa-panel">
	<header class="qa-head">
		<h2 class="qa-title">Answers by question</h2>
		<p class="qa-sub">
			{questions.length}
			{questions.length === 1 ? 'question' : 'questions'}, {students.length}
			{students.length === 1 ? 'student' : 'students'}. Read from saved work; nothing here
			changes it.
		</p>
		{#if onexportcsv}
			<button type="button" class="btn secondary tiny" data-testid="qa-export-csv" onclick={() => onexportcsv?.()}>
				Download every answer as CSV
			</button>
		{/if}
	</header>
	{#if !questions.length}
		<p class="qa-empty" data-testid="qa-empty">This worksheet declares no questions to read.</p>
	{:else}
		<div class="qa-body">
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<ol class="qa-questions" bind:this={listEl} onkeydown={onListKey} data-testid="qa-questions">
				{#each questions as q, i (q.blockId)}
					<li>
						<button
							type="button"
							class="qa-q"
							class:on={chosen?.blockId === q.blockId}
							aria-pressed={chosen?.blockId === q.blockId}
							data-block-id={q.blockId}
							data-testid="qa-question"
							onclick={() => choose(q.blockId)}
						>
							<span class="qa-num">{i + 1}</span>
							<span class="qa-label">{q.label}</span>
							<span class="qa-count" data-testid="qa-count"
								>{counts.get(q.blockId) ?? 0} of {students.length}</span
							>
						</button>
					</li>
				{/each}
			</ol>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="qa-answers" tabindex="0" role="region" aria-label="Answers to the chosen question">
				{#if chosen}
					<h3 class="qa-chosen" data-testid="qa-chosen">{chosen.label}</h3>
					{#if chosen.prompted}<p class="qa-field">{chosen.field}</p>{/if}
					<ul class="qa-list">
						{#each column as a (a.email)}
							<li class="qa-row" class:inactive={!a.active} data-testid="qa-answer">
								<button
									type="button"
									class="qa-who"
									data-testid="qa-open"
									onclick={() => onopen(a.email)}
								>
									{a.displayName}
								</button>
								<div class="qa-text">
									{#if a.text === null && !a.image}
										<span class="qa-none">No answer saved</span>
									{:else if a.text === '' && !a.image}
										<span class="qa-none">Left blank</span>
									{:else if a.text}
										<span class="qa-value">{a.text}</span>
									{/if}
									{#if a.image}
										<span class="qa-image">Photo: {a.image.name}{a.image.caption ? `, ${a.image.caption}` : ''}</span>
									{/if}
									{#if a.links.length}
										<AnswerLinks links={a.links} showLabel={false} testId="qa-links" />
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.qa {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.qa-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
	}
	.qa-title {
		margin: 0;
		font-size: 0.8rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.qa-sub {
		margin: 0;
		flex: 1 1 16rem;
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.qa-empty {
		margin: 0;
		color: var(--text-2);
	}
	/* TWO REGIONS SIDE BY SIDE ABOVE A NARROW PANE, EACH ITS OWN SCROLL, so a
	   long question list never pushes the answers off screen and the reverse.
	   Below 1024px they stack and the document scrolls, the console's own rule. */
	.qa-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-3);
		min-width: 0;
	}
	@media (min-width: 1024px) {
		.qa {
			min-height: 0;
			height: 100%;
		}
		.qa-body {
			grid-template-columns: minmax(14rem, 22rem) minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr);
			flex: 1 1 auto;
			min-height: 0;
		}
		.qa-questions,
		.qa-answers {
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
		}
	}
	.qa-questions {
		list-style: none;
		margin: 0;
		padding: 0 0.2rem 0 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.qa-q {
		appearance: none;
		width: 100%;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
		min-height: 44px;
		padding: var(--space-1) 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.85rem;
		text-align: left;
		cursor: pointer;
	}
	.qa-q.on {
		background: var(--surface-0);
		border-color: var(--line-strong);
	}
	/* The key's own ink, never `--text-2`: the question is a plate key, and on
	   the IDEA key face `--text-2` measured 4.21:1 (ledger 0360). The mono face
	   and the size are what set the number and the count apart. */
	.qa-num,
	.qa-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: inherit;
		white-space: nowrap;
	}
	.qa-label {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.qa-answers {
		min-width: 0;
	}
	.qa-chosen {
		margin: 0;
		font-size: 1rem;
		line-height: 1.35;
		color: var(--text-1);
	}
	.qa-field {
		margin: 0.15rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.qa-list {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.qa-row {
		display: grid;
		grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
		align-items: start;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--hairline);
	}
	@media (max-width: 40rem) {
		.qa-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	/* 0.8 is the console's own inactive step: clears 4.5 on both grounds. */
	.qa-row.inactive {
		opacity: 0.8;
	}
	/* A NAME IS A KEY THAT OPENS THEIR WORK, in the name's own case: `.btn` would
	   print it in uppercase mono, which is how a label reads, not a person. The
	   plate draws it as a key through its key list (`.qa-who`, `.qa-q`). */
	.qa-who {
		appearance: none;
		justify-self: start;
		max-width: 100%;
		min-height: 44px;
		padding: var(--space-1) 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
		text-align: left;
		cursor: pointer;
	}
	.qa-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	/* The student's own line breaks survive, as on every answer surface. */
	.qa-value {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-1);
	}
	.qa-none,
	.qa-image {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
</style>
