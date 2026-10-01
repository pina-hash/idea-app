<script lang="ts">
	/**
	 * THE APPLICATION'S QUESTIONS, EDITABLE BY A SITE ADMINISTRATOR (report
	 * 6d076258: Claude drafts them, Mr. Pina edits them later). Mounted only on
	 * /foundry/review/publishers.
	 *
	 * THE WHOLE SET SAVES AT ONCE, through `foundry_publisher_set_questions`,
	 * which validates every entry before it writes any. A question taken off the
	 * list is RETIRED, never deleted: past applications carry a snapshot of
	 * what they answered, keyed by the question's id, and nothing may orphan it.
	 *
	 * THE CHECKS ARE `publisherQuestionsValid`, mirroring the RPC's, so Save is
	 * never offered for a set the database refuses; the button is
	 * `aria-disabled` with the reason beside it, never silently dead. Nothing
	 * here is a draft mirror: an admin edits a handful of short questions in one
	 * sitting, and the Save is explicit.
	 *
	 * THE LOADED LIST IS READ LAZILY. The working copy starts null and takes a
	 * copy of the loaded questions on the first edit, so the prop is never read
	 * into state at mount (Svelte's `state_referenced_locally`), and a reload
	 * after Save replaces the copy cleanly.
	 */
	import ForgeStatus from './ForgeStatus.svelte';
	import {
		PUBLISHER_CHOICES_MAX,
		PUBLISHER_PROMPT_MAX,
		PUBLISHER_QUESTIONS_MAX,
		PUBLISHER_REVIEWER_NOTE_MAX,
		PUBLISHER_UNAVAILABLE_NOTE,
		publisherDraftOf,
		publisherNorm,
		publisherQuestionsPayload,
		publisherQuestionsValid,
		type FoundryPublisherQuestionAdmin,
		type FoundryPublisherQuestionDraft,
		type PublisherRead
	} from './publisher.ts';
	import type { FoundryPublisherTransports } from './transports.ts';

	let {
		read,
		save = undefined,
		onChanged = undefined
	}: {
		read: PublisherRead<FoundryPublisherQuestionAdmin[]>;
		save?: FoundryPublisherTransports['saveQuestions'];
		onChanged?: () => void;
	} = $props();

	const loaded = $derived(
		read.state === 'ready' ? read.value.filter((q) => q.active).map(publisherDraftOf) : []
	);
	const retiredCount = $derived(
		read.state === 'ready' ? read.value.filter((q) => !q.active).length : 0
	);

	let working = $state<FoundryPublisherQuestionDraft[] | null>(null);
	const list = $derived(working ?? loaded);
	const dirty = $derived(working !== null);
	const verdict = $derived(publisherQuestionsValid(list));

	let busy = $state(false);
	let problem = $state<string | null>(null);
	let saved = $state<string | null>(null);

	function edit(mutate: (copy: FoundryPublisherQuestionDraft[]) => void) {
		const copy = (working ?? loaded).map((q) => ({
			...q,
			choices: [...q.choices],
			flag_choices: [...q.flag_choices]
		}));
		mutate(copy);
		working = copy;
		saved = null;
	}

	function move(i: number, by: -1 | 1) {
		const j = i + by;
		// At an end the key is `aria-disabled` and pressing it changes nothing,
		// including whether there is anything to save.
		if (j < 0 || j >= list.length) return;
		edit((c) => {
			[c[i], c[j]] = [c[j]!, c[i]!];
		});
	}

	function choicesText(q: FoundryPublisherQuestionDraft): string {
		return q.choices.join('\n');
	}

	async function send() {
		if (busy) return;
		if (!verdict.ok) {
			problem = verdict.message;
			return;
		}
		if (!save) return;
		busy = true;
		problem = null;
		try {
			const r = await save(publisherQuestionsPayload(list));
			if (!r.ok) {
				problem =
					r.reason === 'unavailable'
						? PUBLISHER_UNAVAILABLE_NOTE
						: r.reason === 'unknown_question'
							? 'One of these questions is not there any more. Reload the page and try again.'
							: (r.message ?? 'That did not save. Try again.');
				return;
			}
			saved = `Saved. ${r.active} question${r.active === 1 ? '' : 's'} asked${r.retired > 0 ? `, ${r.retired} retired` : ''}.`;
			working = null;
			onChanged?.();
		} catch (err) {
			problem = err instanceof Error ? err.message : 'That did not save. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="fdy-block fdy-pq" data-testid="foundry-publisher-questions">
	<header class="fdy-pq-head">
		<h2>Application questions</h2>
		<p class="fdy-pq-lead">
			Students see the questions and the choices, nothing else. Whether a question is a trick, which
			answers are red flags and the note on what to look for are for you alone. A question you take
			off the list is retired rather than deleted, so past applications still show what was asked.
		</p>
	</header>

	{#if read.state === 'unavailable'}
		<p class="fdy-pq-note">{PUBLISHER_UNAVAILABLE_NOTE}</p>
	{:else if read.state === 'failed'}
		<p class="fdy-pq-problem" role="status">{read.message}</p>
	{:else}
		<ol class="fdy-pq-list">
			{#each list as q, i (q.id ?? `new-${i}`)}
				<li class="fdy-pq-row" data-testid="foundry-publisher-question">
					<div class="fdy-pq-row-head">
						<span class="fdy-pq-n">Question {i + 1}</span>
						{#if q.is_trick}<ForgeStatus tone="waiting" word="Trick" />{/if}
						{#if q.id === null}<ForgeStatus tone="quiet" word="New" />{/if}
						<span class="fdy-pq-row-do">
							<button
								type="button"
								class="btn tap-44"
								aria-disabled={i === 0 ? 'true' : undefined}
								onclick={() => move(i, -1)}
							>
								Up
							</button>
							<button
								type="button"
								class="btn tap-44"
								aria-disabled={i === list.length - 1 ? 'true' : undefined}
								onclick={() => move(i, 1)}
							>
								Down
							</button>
							<button
								type="button"
								class="btn tap-44"
								onclick={() => edit((c) => c.splice(i, 1))}
							>
								Retire
							</button>
						</span>
					</div>

					<label class="fdy-pq-field">
						<span>What the student reads</span>
						<textarea
							rows="2"
							maxlength={PUBLISHER_PROMPT_MAX}
							value={q.prompt}
							oninput={(e) => {
								const v = e.currentTarget.value;
								edit((c) => (c[i]!.prompt = v));
							}}
						></textarea>
					</label>

					<label class="fdy-pq-field fdy-pq-kind">
						<span>Kind of answer</span>
						<select
							value={q.kind}
							onchange={(e) => {
								const v = e.currentTarget.value === 'choice' ? 'choice' : 'text';
								edit((c) => {
									c[i]!.kind = v;
									if (v === 'text') {
										c[i]!.choices = [];
										c[i]!.flag_choices = [];
									}
								});
							}}
						>
							<option value="text">A written answer</option>
							<option value="choice">Pick one of several choices</option>
						</select>
					</label>

					{#if q.kind === 'choice'}
						<label class="fdy-pq-field">
							<span>Choices, one per line (2 to {PUBLISHER_CHOICES_MAX})</span>
							<textarea
								rows={Math.max(2, q.choices.length)}
								value={choicesText(q)}
								oninput={(e) => {
									const lines = e.currentTarget.value.split('\n');
									edit((c) => {
										c[i]!.choices = lines;
										c[i]!.flag_choices = c[i]!.flag_choices.filter((f) =>
											lines.map(publisherNorm).includes(publisherNorm(f))
										);
									});
								}}
							></textarea>
						</label>
						{#if q.choices.some((c) => publisherNorm(c))}
							<fieldset class="fdy-pq-flags">
								<legend>Red-flag answers (a student who picks one is marked for you)</legend>
								{#each q.choices.map(publisherNorm).filter(Boolean) as choice (choice)}
									<label class="fdy-pq-check tap-44">
										<input
											type="checkbox"
											checked={q.flag_choices.map(publisherNorm).includes(choice)}
											onchange={(e) => {
												const on = e.currentTarget.checked;
												edit((c) => {
													const rest = c[i]!.flag_choices.filter((f) => publisherNorm(f) !== choice);
													c[i]!.flag_choices = on ? [...rest, choice] : rest;
												});
											}}
										/>
										<span>{choice}</span>
									</label>
								{/each}
							</fieldset>
						{/if}
					{/if}

					<label class="fdy-pq-check tap-44">
						<input
							type="checkbox"
							checked={q.is_trick}
							onchange={(e) => {
								const on = e.currentTarget.checked;
								edit((c) => (c[i]!.is_trick = on));
							}}
						/>
						<span>This is a trick question</span>
					</label>

					<label class="fdy-pq-field">
						<span>What to look for, for you (optional)</span>
						<textarea
							rows="2"
							maxlength={PUBLISHER_REVIEWER_NOTE_MAX}
							value={q.reviewer_note ?? ''}
							oninput={(e) => {
								const v = e.currentTarget.value;
								edit((c) => (c[i]!.reviewer_note = v));
							}}
						></textarea>
					</label>
				</li>
			{/each}
		</ol>

		<div class="fdy-pq-do">
			<button
				type="button"
				class="btn tap-44"
				aria-disabled={list.length >= PUBLISHER_QUESTIONS_MAX ? 'true' : undefined}
				onclick={() => {
					if (list.length >= PUBLISHER_QUESTIONS_MAX) {
						problem = `Keep it to ${PUBLISHER_QUESTIONS_MAX} questions or fewer.`;
						return;
					}
					edit((c) =>
						c.push({
							id: null,
							prompt: '',
							kind: 'text',
							choices: [],
							flag_choices: [],
							is_trick: false,
							reviewer_note: null
						})
					);
				}}
			>
				Add a question
			</button>
			{#if save}
				<button
					type="button"
					class="btn tap-44"
					data-testid="foundry-publisher-questions-save"
					aria-disabled={!verdict.ok || !dirty ? 'true' : undefined}
					disabled={busy}
					onclick={() => {
						if (!dirty) {
							problem = 'Nothing has changed yet.';
							return;
						}
						void send();
					}}
				>
					{busy ? 'Saving' : 'Save questions'}
				</button>
			{/if}
			{#if dirty}
				<button
					type="button"
					class="btn tap-44"
					onclick={() => {
						working = null;
						problem = null;
					}}
				>
					Undo changes
				</button>
			{/if}
		</div>
		{#if dirty && !verdict.ok}
			<p class="fdy-pq-note">{verdict.message}</p>
		{/if}
		{#if retiredCount > 0}
			<p class="fdy-pq-note">
				{retiredCount} retired question{retiredCount === 1 ? ' is' : 's are'} kept for the applications
				that answered {retiredCount === 1 ? 'it' : 'them'}.
			</p>
		{/if}
		{#if saved}<p class="fdy-pq-saved" role="status">{saved}</p>{/if}
		{#if problem}<p class="fdy-pq-problem" role="status">{problem}</p>{/if}
	{/if}
</section>

<style>
	.fdy-pq {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		min-width: 0;
	}

	.fdy-pq-head h2 {
		margin: 0 0 0.4rem;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	.fdy-pq-lead,
	.fdy-pq-note {
		margin: 0;
		color: var(--text-2);
		max-width: var(--measure-prose, 42rem);
	}

	.fdy-pq-list {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.fdy-pq-row {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.85rem 1rem;
		background: var(--surface-2);
		/* A card inside the panel: decoration, the panel's edge carries it. */
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
		min-width: 0;
	}

	.fdy-pq-row-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}

	.fdy-pq-n {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-1);
	}

	.fdy-pq-row-do {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-left: auto;
	}

	.fdy-pq-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	.fdy-pq-field > span,
	.fdy-pq-flags legend {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-pq-field textarea,
	.fdy-pq-field select {
		min-height: 44px;
		padding: 0.45rem 0.65rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1, 4px);
		background: var(--surface-1);
		color: var(--text-1);
		font: inherit;
	}

	.fdy-pq-field textarea {
		resize: vertical;
	}

	.fdy-pq-kind {
		max-width: 22rem;
	}

	.fdy-pq-field :is(textarea, select):focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.fdy-pq-flags {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
	}

	.fdy-pq-check {
		gap: 0.55rem;
		color: var(--text-1);
		cursor: pointer;
	}

	.fdy-pq-check input {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
		accent-color: var(--green);
	}

	.fdy-pq-check:has(input:focus-visible) {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.fdy-pq-do {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.fdy-pq-saved {
		margin: 0;
		color: var(--text-1);
		padding-left: 0.6rem;
		border-left: 3px solid var(--green);
	}

	.fdy-pq-problem {
		margin: 0;
		color: var(--text-1);
		padding-left: 0.6rem;
		border-left: 3px solid var(--crimson);
	}
</style>
