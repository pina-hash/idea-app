<script lang="ts">
	/**
	 * THE NOTES ON ONE STUDENT'S WORK ON ONE ASSIGNMENT, AS A LIST (0238,
	 * decision 60): the list half of "in place and in a list". It sits beside the
	 * worksheet on the student's item page and in the grading console's work
	 * column, and the pins the frame draws open a note here.
	 *
	 * THE INSTRUCTOR'S COMPOSER IS HERE AND ABSENCE IS THE MECHANISM: it renders
	 * only when the session's transports carry `post`, which a student's never
	 * do. A note goes on a place in the worksheet (any block the manifest
	 * declares, or the whole worksheet) and may carry a drawing, started from a
	 * picture's own "Draw on this" key or from the list here.
	 *
	 * A STUDENT WITH NO NOTES SEES NOTHING, not an empty box: a section saying
	 * "no feedback yet" on every worksheet is a line people learn not to read.
	 * Where 0238 is not applied the session reads `unavailable` and nothing
	 * renders on either side.
	 */
	import { untrack } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import Pending from '$lib/Pending.svelte';
	import FeedbackThreadView from './FeedbackThreadView.svelte';
	import { attentionCount, feedbackPlace, feedbackPlaces, type FeedbackThread } from './notes';
	import type { FeedbackSession } from './session.svelte';
	import { submissionFileSrc } from '$lib/classroom/assignment-spec';

	interface ManifestLike {
		header?: readonly { id: string; field: string; prompt?: unknown }[];
		modules?: readonly { id: string; title: string; blocks?: readonly { id: string; field: string; prompt?: unknown }[] }[];
	}

	let {
		session,
		manifest,
		studentName = '',
		pictures = {},
		annotateField = null,
		annotateThread = null,
		drawable = [],
		inboxHref = null
	}: {
		session: FeedbackSession;
		manifest: ManifestLike | null;
		/** Whose work this is, for the instructor's heading. */
		studentName?: string;
		/** The words for each handed-in picture, by file id; the picture itself is the file's own proxy URL. */
		pictures?: Readonly<Record<string, string>>;
		/** Start a drawing on the picture a field holds. An instructor's only. */
		annotateField?: ((field: string) => void) | null;
		/** Draw on a note's picture again. An instructor's only. */
		annotateThread?: ((thread: FeedbackThread) => void) | null;
		/** The fields holding a picture that can be drawn on, with words for each. */
		drawable?: readonly { field: string; label: string }[];
		/** The instructor's one place for every note, linked from the heading. */
		inboxHref?: string | null;
	} = $props();

	const teacher = $derived(session.side === 'teacher');
	const open = $derived(session.threads.filter((t) => !t.resolvedAt));
	const done = $derived(session.threads.filter((t) => !!t.resolvedAt));
	const needs = $derived(attentionCount(session.threads, session.side));
	const places = $derived(feedbackPlaces(manifest));

	/* The composer (an instructor's). */
	let place = $state<string>('');
	let body = $state('');
	let busy = $state(false);
	let problem = $state<string | null>(null);
	let sent = $state<string | null>(null);

	async function sendNote() {
		if (busy) return;
		busy = true;
		problem = null;
		sent = null;
		try {
			const result = await session.post({ blockId: place || null, fileId: null, body, marks: null });
			if (result) problem = result;
			else {
				body = '';
				sent = 'Sent. The student sees it on their worksheet straight away.';
			}
		} finally {
			busy = false;
		}
	}

	/**
	 * SEEN IS STAMPED WHEN THE LIST IS ON SCREEN IN A VISIBLE TAB, never on a
	 * hidden one: a receipt that said "seen" for a tab nobody was looking at is
	 * the false fact this exists to avoid. Untracked call, tracked inputs.
	 */
	$effect(() => {
		const count = session.unseenCount;
		const ready = session.state === 'ready';
		if (!ready || count === 0) return;
		const stamp = () => {
			if (document.visibilityState === 'visible') untrack(() => void session.markSeen());
		};
		const timer = setTimeout(stamp, 1200);
		const onVisible = () => {
			if (document.visibilityState === 'visible') setTimeout(stamp, 600);
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	/** The picture a note was drawn on, from the file the note names, so a
	    replaced photograph never takes an old drawing. */
	function pictureOf(t: FeedbackThread) {
		return t.fileId ? { src: submissionFileSrc(t.fileId), alt: pictures[t.fileId] ?? 'the picture this note is about' } : null;
	}
</script>

{#if session.state !== 'unavailable' && (teacher || session.threads.length || session.state === 'failed')}
	<section class="fb-panel" data-testid="feedback-panel" data-side={session.side}>
		<header class="fb-panel-head">
			<h3 class="fb-panel-title">
				{teacher ? `Feedback${studentName ? ` to ${studentName}` : ''}` : 'Feedback from your teacher'}
			</h3>
			{#if needs > 0}
				<span class="fb-panel-count" data-testid="feedback-needs">
					{needs}
					{teacher ? (needs === 1 ? 'needs you' : 'need you') : needs === 1 ? 'needs your attention' : 'need your attention'}
				</span>
			{/if}
			{#if inboxHref}
				<a class="fb-panel-inbox" href={inboxHref} data-testid="feedback-inbox-link">Every note, every class</a>
			{/if}
		</header>

		{#if session.state === 'pending'}
			<Pending label="Loading feedback" />
		{:else if session.state === 'failed'}
			<p class="fb-panel-note">The feedback could not be loaded. It will try again shortly.</p>
		{/if}

		{#if teacher && session.canPost}
			<div class="fb-compose" data-testid="feedback-compose">
				<label class="fb-compose-field">
					<span class="fb-compose-label">Where</span>
					<select bind:value={place} disabled={busy} data-testid="feedback-place">
						{#each places as p (p.blockId ?? '')}
							<option value={p.blockId ?? ''}>{p.label}</option>
						{/each}
					</select>
				</label>
				<label class="fb-compose-field">
					<span class="fb-compose-label">Note</span>
					<textarea
						bind:value={body}
						rows="3"
						maxlength="2000"
						disabled={busy}
						data-testid="feedback-note-box"
						placeholder="What to look at, and what to try next."
					></textarea>
				</label>
				<div class="fb-compose-keys">
					<button
						type="button"
						class="btn tiny"
						disabled={busy || !body.trim()}
						data-testid="feedback-post"
						onclick={sendNote}>Send note</button
					>
					{#if annotateField}
						{#each drawable as d (d.field)}
							<button
								type="button"
								class="btn secondary tiny"
								disabled={busy}
								data-testid="feedback-draw-on"
								onclick={() => annotateField?.(d.field)}>Draw on {d.label}</button
							>
						{/each}
					{/if}
				</div>
				{#if problem}
					<p class="fb-panel-problem" role="alert">{problem}</p>
				{:else if sent}
					<p class="fb-panel-ok" role="status">{sent}</p>
				{/if}
			</div>
		{/if}

		{#if open.length}
			<ol class="fb-list" data-testid="feedback-open-list">
				{#each open as t (t.id)}
					<li>
						<FeedbackThreadView
							thread={t}
							{session}
							place={feedbackPlace(manifest, t.blockId)}
							picture={pictureOf(t)}
							onannotate={annotateThread && t.fileId && pictureOf(t) ? () => annotateThread?.(t) : null}
							focused={session.focus?.id === t.id}
						/>
					</li>
				{/each}
			</ol>
		{:else if teacher && session.state === 'ready'}
			<p class="fb-panel-note">No open notes on this work.</p>
		{/if}

		{#if done.length}
			<Disclosure label="Resolved notes ({done.length})" collapseWhen={true} testId="feedback-resolved">
				<ol class="fb-list">
					{#each done as t (t.id)}
						<li>
							<FeedbackThreadView
								thread={t}
								{session}
								place={feedbackPlace(manifest, t.blockId)}
								picture={pictureOf(t)}
								focused={session.focus?.id === t.id}
							/>
						</li>
					{/each}
				</ol>
			</Disclosure>
		{/if}
	</section>
{/if}

<style>
	.fb-panel {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		min-width: 0;
		margin: 0 0 var(--space-3, 0.9rem);
	}
	.fb-panel-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem 0.8rem;
	}
	.fb-panel-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-1);
	}
	.fb-panel-count {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text-1);
	}
	.fb-panel-inbox {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-left: auto;
		font-size: 0.85rem;
	}
	.fb-panel-note {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.fb-compose {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.8rem 0.9rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		background: var(--surface-1, var(--bg1));
	}
	.fb-compose-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.fb-compose-label {
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.fb-compose select,
	.fb-compose textarea {
		width: 100%;
		min-height: 44px;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0, var(--bg0));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		padding: 0.4rem 0.55rem;
	}
	.fb-compose textarea {
		resize: vertical;
	}
	.fb-compose-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.fb-panel-problem {
		margin: 0;
		color: var(--amber);
	}
	.fb-panel-ok {
		margin: 0;
		color: var(--text-2);
	}
	.fb-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
</style>
