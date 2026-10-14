<script lang="ts">
	/**
	 * ONE NOTE AND ITS CONVERSATION (0238, decision 60). Mr. Pina, 2026-10-14:
	 * "back and forth and a 'fixed it' button and seen".
	 *
	 * The same component on both sides and in the instructor's inbox, and what
	 * differs is what the session's transports carry: a student's have no `post`
	 * and no `update`, so Edit, Draw again and Remove note are not rendered for
	 * them at all, and Fixed it is the student's key where Resolve is the
	 * instructor's. The database re-checks every one.
	 *
	 * TEXT ONLY, NEVER `{@html}`: a message is a string either side typed, drawn
	 * as text with its line breaks kept. A drawing is vector data over the
	 * picture, with the note's words beside it, so it is never the only thing
	 * that says what is wrong.
	 */
	import { tick } from 'svelte';
	import MarkedPicture from './MarkedPicture.svelte';
	import {
		seenReceipt,
		shortTime,
		threadStatus,
		threadStatusWords,
		threadUnseen,
		type FeedbackThread
	} from './notes';
	import type { FeedbackSession } from './session.svelte';

	let {
		thread,
		session,
		place,
		picture = null,
		onannotate = null,
		focused = false,
		showStudent = false,
		openHref = null
	}: {
		thread: FeedbackThread;
		session: FeedbackSession;
		/** Where the note is, in words ("Module 2: Sketch of the bracket"). */
		place: string;
		/** The picture the drawing is on, when the note has one and it is still there. */
		picture?: { src: string; alt: string } | null;
		/** Draw on the picture again. An instructor's only; absent removes the key. */
		onannotate?: (() => void) | null;
		/** A pin asked for this note; it scrolls into view and takes focus. */
		focused?: boolean;
		/** The inbox names the student and the assignment; a per-student panel does not. */
		showStudent?: boolean;
		/** The inbox's way into the work itself. */
		openHref?: string | null;
	} = $props();

	const side = $derived(session.side);
	const teacher = $derived(side === 'teacher');
	const status = $derived(threadStatus(thread, side));
	const statusWords = $derived(threadStatusWords(thread, side));
	const unseen = $derived(threadUnseen(thread, side));
	const resolved = $derived(!!thread.resolvedAt);
	const firstTeacherMessage = $derived(thread.messages.find((m) => m.role === 'teacher') ?? null);

	let root = $state<HTMLElement | null>(null);
	let reply = $state('');
	let editing = $state(false);
	let editText = $state('');
	let armedRemove = $state(false);
	let busy = $state(false);
	let problem = $state<string | null>(null);
	let viewer = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (!focused || !root) return;
		const el = root;
		void tick().then(() => {
			el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
			el.focus({ preventScroll: true });
		});
	});

	async function act(run: () => Promise<string | null>, after?: () => void) {
		if (busy) return;
		busy = true;
		problem = null;
		try {
			problem = await run();
			if (!problem) after?.();
		} finally {
			busy = false;
		}
	}

	function send() {
		const words = reply;
		void act(
			() => session.reply(thread.id, words),
			() => (reply = '')
		);
	}

	function startEdit() {
		editText = firstTeacherMessage?.body ?? '';
		editing = true;
	}

	function saveEdit() {
		const words = editText;
		void act(
			() => session.update(thread.id, words),
			() => (editing = false)
		);
	}

	function openViewer() {
		viewer?.showModal();
	}

	/* A click on the backdrop closes the enlarged drawing, as the Lightbox does. */
	$effect(() => {
		const d = viewer;
		if (!d) return;
		const click = (e: MouseEvent) => {
			if (e.target === d) d.close();
		};
		d.addEventListener('click', click);
		return () => d.removeEventListener('click', click);
	});
</script>

<article
	bind:this={root}
	class="fb-thread"
	class:unseen
	class:resolved
	class:focused
	tabindex="-1"
	data-testid="feedback-thread"
	data-thread-id={thread.id}
	data-status={status}
	aria-label="Note on {place}"
>
	<header class="fb-head">
		<div class="fb-where">
			{#if showStudent}
				<span class="fb-who person-name" title={thread.studentName}>{thread.studentName}</span>
				<span class="fb-item">{thread.itemTitle}</span>
			{/if}
			<span class="fb-place">{place}</span>
		</div>
		<div class="fb-state">
			{#if unseen}<span class="fb-new" data-testid="feedback-new">New</span>{/if}
			<span class="fb-status" data-testid="feedback-status">{statusWords}</span>
		</div>
	</header>

	{#if thread.marks && picture}
		<button type="button" class="fb-picture" onclick={openViewer} aria-label="Open the drawing on {picture.alt} larger">
			<MarkedPicture src={picture.src} alt={picture.alt} marks={thread.marks} />
			<span class="fb-enlarge">Enlarge</span>
		</button>
		<dialog bind:this={viewer} class="fb-viewer" aria-label="The drawing on {picture.alt}">
			<div class="fb-viewer-body">
				<MarkedPicture src={picture.src} alt={picture.alt} marks={thread.marks} />
			</div>
			<form method="dialog" class="fb-viewer-bar">
				<button class="btn secondary tiny" type="submit">Close</button>
			</form>
		</dialog>
	{:else if thread.marks}
		<p class="fb-gone">
			{teacher
				? 'This drawing was on a picture the student has since replaced.'
				: 'Your teacher drew on a picture you have since replaced.'}
		</p>
	{/if}

	<ol class="fb-messages">
		{#each thread.messages as m (m.id)}
			<li class="fb-message" class:mine={m.mine} data-role={m.role}>
				<div class="fb-meta">
					<span class="fb-name">{m.mine ? 'You' : m.name}</span>
					<time datetime={m.createdAt}>{shortTime(m.createdAt)}</time>
					{#if m.editedAt}<span class="fb-edited">edited</span>{/if}
				</div>
				{#if editing && teacher && firstTeacherMessage && m.id === firstTeacherMessage.id}
					<label class="fb-field">
						<span class="fb-sr">Edit the note</span>
						<textarea bind:value={editText} rows="3" maxlength="2000" disabled={busy}></textarea>
					</label>
					<div class="fb-keys">
						<button type="button" class="btn tiny" disabled={busy} onclick={saveEdit}>Save note</button>
						<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => (editing = false)}
							>Cancel</button
						>
					</div>
				{:else}
					<p class="fb-body">{m.body}</p>
					{#if m.mine || teacher}
						<button
							type="button"
							class="fb-link"
							disabled={busy}
							onclick={() => act(() => session.remove(thread.id, m.id))}
							>Remove message</button
						>
					{/if}
				{/if}
			</li>
		{:else}
			<li class="fb-message fb-drawing-only">
				<p class="fb-body">{teacher ? 'A drawing with no words.' : 'Your teacher drew on your picture.'}</p>
			</li>
		{/each}
	</ol>

	{#if teacher}
		<p class="fb-receipt" data-testid="feedback-receipt">{seenReceipt(thread)}</p>
	{/if}

	{#if !resolved}
		<div class="fb-reply">
			<label class="fb-field">
				<span class="fb-label">{teacher ? 'Reply to the student' : 'Reply to your teacher'}</span>
				<textarea
					bind:value={reply}
					rows="2"
					maxlength="2000"
					disabled={busy}
					data-testid="feedback-reply-box"
					onkeydown={(e) => {
						if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && reply.trim()) {
							e.preventDefault();
							send();
						}
					}}
				></textarea>
			</label>
		</div>
	{/if}

	<div class="fb-keys">
		{#if !resolved}
			<button
				type="button"
				class="btn tiny"
				disabled={busy || !reply.trim()}
				data-testid="feedback-send"
				onclick={send}>Send reply</button
			>
		{/if}
		{#if !teacher && !resolved}
			{#if thread.fixedAt}
				<button
					type="button"
					class="btn secondary tiny"
					disabled={busy}
					data-testid="feedback-not-fixed"
					onclick={() => act(() => session.setState(thread.id, 'open'))}>Not fixed yet</button
				>
			{:else}
				<button
					type="button"
					class="btn tiny"
					disabled={busy}
					data-testid="feedback-fixed"
					onclick={() => act(() => session.setState(thread.id, 'fixed'))}>Fixed it</button
				>
			{/if}
		{/if}
		{#if teacher}
			{#if resolved}
				<button
					type="button"
					class="btn secondary tiny"
					disabled={busy}
					data-testid="feedback-reopen"
					onclick={() => act(() => session.setState(thread.id, 'open'))}>Reopen</button
				>
			{:else}
				<button
					type="button"
					class="btn secondary tiny"
					disabled={busy}
					data-testid="feedback-resolve"
					onclick={() => act(() => session.setState(thread.id, 'resolved'))}>Resolve</button
				>
			{/if}
			{#if session.transports.update && !editing}
				<button type="button" class="btn secondary tiny" disabled={busy} data-testid="feedback-edit" onclick={startEdit}
					>Edit note</button
				>
			{/if}
			{#if onannotate}
				<button
					type="button"
					class="btn secondary tiny"
					disabled={busy}
					data-testid="feedback-redraw"
					onclick={() => onannotate?.()}>Draw again</button
				>
			{/if}
			{#if session.transports.post}
				{#if armedRemove}
					<button
						type="button"
						class="btn danger tiny"
						disabled={busy}
						data-testid="feedback-remove-confirm"
						onclick={() => act(() => session.remove(thread.id))}>Remove this note and its replies</button
					>
					<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => (armedRemove = false)}
						>Keep it</button
					>
				{:else}
					<button
						type="button"
						class="btn secondary tiny"
						disabled={busy}
						data-testid="feedback-remove"
						onclick={() => (armedRemove = true)}>Remove note</button
					>
				{/if}
			{/if}
		{/if}
		{#if openHref}
			<a class="btn secondary tiny" href={openHref} data-testid="feedback-open-work">Open the work</a>
		{/if}
	</div>

	{#if problem}
		<p class="fb-problem" role="alert" data-testid="feedback-problem">{problem}</p>
	{/if}
</article>

<style>
	.fb-thread {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		min-width: 0;
		padding: 0.8rem 0.9rem;
		border: 1px solid var(--boundary);
		border-left: 4px solid var(--hover-ink, var(--green));
		border-radius: var(--radius-md, 8px);
		background: var(--surface-1, var(--bg1));
		scroll-margin: 6rem;
	}
	/* Decoration: the accent edge says "ended", and the words say it too. */
	.fb-thread.resolved {
		border-left-color: var(--hairline);
	}
	.fb-thread.focused {
		outline: 2px solid var(--hover-ink, var(--green));
		outline-offset: 2px;
	}
	.fb-thread:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.fb-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.4rem 0.8rem;
	}
	.fb-where {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.fb-who {
		font-weight: 700;
		color: var(--text-1);
	}
	.fb-item {
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.fb-place {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.03em;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.fb-state {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.fb-new,
	.fb-status {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		/* A static tag, not a control: the hairline (CLAUDE.md, --boundary). */
		border: 1px solid var(--hairline);
		color: var(--text-1);
	}
	.fb-new {
		border-color: var(--hover-ink, var(--green));
		font-weight: 700;
	}
	.fb-picture {
		position: relative;
		display: block;
		width: 100%;
		max-width: 28rem;
		height: 14rem;
		padding: 0;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
		background: var(--surface-2, var(--bg2));
		cursor: zoom-in;
		overflow: hidden;
	}
	.fb-picture:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.fb-enlarge {
		position: absolute;
		right: 0.4rem;
		bottom: 0.4rem;
		padding: 0.15rem 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-1);
		background: var(--surface-1, var(--bg1));
		border: 1px solid var(--hairline);
		border-radius: 999px;
	}
	.fb-viewer {
		width: min(96vw, 80rem);
		height: min(92vh, 60rem);
		padding: 0;
		/* A modal over a dimmed backdrop: the backdrop separates it, the edge decorates. */
		border: 1px solid var(--hairline);
		border-radius: var(--radius-md, 8px);
		background: var(--surface-0, var(--bg0));
		color: var(--text-1);
	}
	.fb-viewer[open] {
		display: flex;
		flex-direction: column;
	}
	.fb-viewer::backdrop {
		background: rgb(0 0 0 / 0.7);
	}
	.fb-viewer-body {
		flex: 1;
		min-height: 0;
		padding: 0.6rem;
	}
	.fb-viewer-bar {
		display: flex;
		justify-content: flex-end;
		padding: 0.5rem 0.6rem;
		border-top: 1px solid var(--hairline);
	}
	.fb-gone {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.fb-messages {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.fb-message {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.45rem 0.6rem;
		border-radius: var(--radius-sm, 4px);
		background: var(--surface-2, var(--bg2));
	}
	.fb-message[data-role='student'] {
		margin-left: 1.2rem;
	}
	.fb-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.fb-name {
		font-weight: 700;
		color: var(--text-1);
	}
	.fb-edited {
		font-style: italic;
	}
	.fb-body {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--text-1);
		line-height: 1.45;
	}
	.fb-link {
		align-self: flex-start;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-size: 0.78rem;
		color: var(--text-2);
		text-decoration: underline;
		cursor: pointer;
	}
	.fb-receipt {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.fb-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.fb-label {
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.fb-field textarea {
		width: 100%;
		min-height: 3.2rem;
		resize: vertical;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0, var(--bg0));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		padding: 0.45rem 0.55rem;
	}
	.fb-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.fb-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.fb-problem {
		margin: 0;
		color: var(--amber);
		font-size: 0.9rem;
	}
</style>
