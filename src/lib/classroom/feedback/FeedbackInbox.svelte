<script lang="ts">
	/**
	 * THE ONE PLACE TO MANAGE EVERY NOTE FROM (0238, decision 60). Mr. Pina,
	 * 2026-10-14: "I need some kind of interface to see everything at once. I
	 * should have a single place that I can manage things from."
	 *
	 * Every note this instructor may read, across every class and assignment,
	 * in one list with five views (Needs you, Student says fixed, Waiting on
	 * student, Resolved, All), a class and an assignment filter and a search;
	 * opening one shows the whole conversation with every control the grading
	 * console offers (reply, Resolve, Reopen, Edit, Remove) and a way into the
	 * work itself. It is the SAME `FeedbackThreadView` the console and the
	 * student's page mount, so a note reads and behaves identically in all
	 * three.
	 *
	 * THE LIST IS THE DATABASE'S. `classroom_feedback_list` with no item
	 * answers the threads of every student this caller reviews, newest activity
	 * first, at most 500; the views and filters are `inboxThreads` over that,
	 * in the browser. The filter state stays out of the address: it is a
	 * working view, and a reloaded inbox opening on "Needs you" is the default
	 * that costs nobody a note.
	 */
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import FeedbackThreadView from './FeedbackThreadView.svelte';
	import {
		INBOX_VIEWS,
		feedbackPlace,
		inboxCounts,
		inboxThreads,
		lastMessage,
		shortTime,
		threadStatusWords,
		threadUnseen,
		type FeedbackThread,
		type InboxView
	} from './notes';
	import type { FeedbackSession } from './session.svelte';
	import { startPoller, type Poller } from '$lib/classroom/poll';
	import { pollSessionKey, pollSignedOut } from '$lib/classroom/poll-session';
	import { submissionFileSrc } from '$lib/classroom/assignment-spec';

	interface ManifestLike {
		header?: readonly { id: string; field: string; prompt?: unknown }[];
		modules?: readonly { id: string; title: string; blocks?: readonly { id: string; field: string; prompt?: unknown }[] }[];
	}

	let {
		session,
		sections,
		manifests = {},
		workHref,
		pollMs = 60_000
	}: {
		session: FeedbackSession;
		/** The classes this instructor manages, for the class filter. */
		sections: readonly { id: string; label: string }[];
		/** Each assignment's manifest by item id, so a note's place reads in words. */
		manifests?: Readonly<Record<string, ManifestLike | null>>;
		/** Where the work behind a note opens (the grading console on that student). */
		workHref: (thread: FeedbackThread) => Promise<string | null>;
		pollMs?: number;
	} = $props();

	let view = $state<InboxView>('attention');
	let sectionId = $state('');
	let itemId = $state('');
	let query = $state('');
	let selectedId = $state<string | null>(null);
	let openHref = $state<string | null>(null);

	const filter = $derived({ itemId: itemId || null, sectionId: sectionId || null, query });
	const shown = $derived(inboxThreads(session.threads, { ...filter, view }));
	const counts = $derived(inboxCounts(session.threads, filter));
	const items = $derived(
		[...new Map(session.threads.map((t) => [t.itemId, t.itemTitle || 'Untitled'])).entries()].sort((a, b) =>
			a[1].localeCompare(b[1])
		)
	);
	const selected = $derived(session.threads.find((t) => t.id === selectedId) ?? null);

	function open(t: FeedbackThread) {
		selectedId = t.id;
		openHref = null;
		void session.markThreadSeen(t);
		void workHref(t).then((href) => {
			if (selectedId === t.id) openHref = href;
		});
	}

	/* The floor: every note this instructor may read, once a minute while the tab is open. */
	let poller: Poller | null = null;
	$effect(() => {
		const sessionNow = session;
		const p = untrack(() =>
			startPoller({
				intervalMs: pollMs,
				run: async () => ((await sessionNow.refresh()) ? 'ok' : 'failed'),
				onSignedOut: pollSignedOut
			})
		);
		poller = p;
		return () => {
			p.stop();
			if (poller === p) poller = null;
		};
	});
	$effect(() => {
		const key = pollSessionKey(page.data.claims);
		untrack(() => poller?.authChanged(key));
	});

	function placeOf(t: FeedbackThread) {
		return feedbackPlace(manifests[t.itemId] ?? null, t.blockId);
	}
</script>

<main class="classroom-page fb-inbox" data-testid="feedback-inbox">
	<header class="fb-inbox-head">
		<h1>Student feedback</h1>
		<p class="fb-inbox-lede">
			Every note you have written on student work, in one place. Open one to read the conversation, reply, or
			resolve it.
		</p>
	</header>

	{#if session.state === 'unavailable'}
		<p class="note card" data-testid="feedback-inbox-unavailable">
			Feedback is not switched on for this site yet. Once it is, every note you write on a worksheet appears here.
		</p>
	{:else}
		<ClassSplit hasDetail={!!selected} nav={list} narrow="swap" detailWidth="roomy">
			{#if selected}
				<div class="fb-inbox-detail">
					<button type="button" class="btn secondary tiny fb-back" onclick={() => (selectedId = null)}
						>Back to the list</button
					>
					{#key selected.id}
						<FeedbackThreadView
							thread={selected}
							{session}
							place={placeOf(selected)}
							picture={selected.fileId
								? { src: submissionFileSrc(selected.fileId), alt: 'the picture this note is about' }
								: null}
							showStudent
							{openHref}
						/>
					{/key}
				</div>
			{/if}
		</ClassSplit>
	{/if}
</main>

{#snippet list()}
	<div class="fb-inbox-list">
		<div class="fb-views" role="group" aria-label="Show">
			{#each INBOX_VIEWS as v (v.id)}
				<button
					type="button"
					class="btn secondary tiny"
					aria-pressed={view === v.id}
					data-testid="inbox-view-{v.id}"
					onclick={() => (view = v.id)}
				>
					{v.label} <span class="fb-view-count">{counts[v.id]}</span>
				</button>
			{/each}
		</div>
		<div class="fb-filters">
			<label class="fb-filter">
				<span>Class</span>
				<select bind:value={sectionId} data-testid="inbox-class">
					<option value="">Every class</option>
					{#each sections as s (s.id)}
						<option value={s.id}>{s.label}</option>
					{/each}
				</select>
			</label>
			<label class="fb-filter">
				<span>Assignment</span>
				<select bind:value={itemId} data-testid="inbox-item">
					<option value="">Every assignment</option>
					{#each items as [id, title] (id)}
						<option value={id}>{title}</option>
					{/each}
				</select>
			</label>
			<label class="fb-filter fb-search">
				<span>Search</span>
				<input type="search" bind:value={query} placeholder="A name, an assignment or a word" data-testid="inbox-search" />
			</label>
		</div>

		{#if session.state === 'failed' && !session.threads.length}
			<p class="fb-inbox-note">The notes could not be loaded. It will try again shortly.</p>
		{:else if !shown.length}
			<p class="fb-inbox-note" data-testid="inbox-empty">
				{session.threads.length ? 'Nothing in this view.' : 'No notes yet. Notes you write from the grading console appear here.'}
			</p>
		{:else}
			<ol class="fb-rows" data-testid="inbox-rows">
				{#each shown as t (t.id)}
					{@const last = lastMessage(t)}
					<li>
						<button
							type="button"
							class="fb-row"
							class:on={selectedId === t.id}
							class:unseen={threadUnseen(t, 'teacher')}
							aria-current={selectedId === t.id ? 'true' : undefined}
							data-testid="inbox-row"
							onclick={() => open(t)}
						>
							<span class="fb-row-top">
								<span class="fb-row-name person-name" title={t.studentName}>{t.studentName}</span>
								<time datetime={t.updatedAt}>{shortTime(t.updatedAt)}</time>
							</span>
							<span class="fb-row-item">{t.itemTitle}</span>
							<span class="fb-row-place">{placeOf(t)}</span>
							{#if last}<span class="fb-row-last">{last.mine ? 'You' : last.name}: {last.body}</span>{/if}
							<span class="fb-row-state">
								{#if threadUnseen(t, 'teacher')}<span class="fb-row-new">New</span>{/if}
								{threadStatusWords(t, 'teacher')}
							</span>
						</button>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
{/snippet}

<style>
	.fb-inbox-head h1 {
		margin: 0 0 0.3rem;
	}
	.fb-inbox-lede {
		margin: 0 0 0.9rem;
		color: var(--text-2);
		max-width: var(--measure-reading, 42rem);
	}
	.fb-inbox-list {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		min-width: 0;
	}
	.fb-views {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.fb-view-count {
		font-weight: 700;
		margin-left: 0.25rem;
	}
	.fb-filters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
		gap: 0.5rem;
	}
	.fb-filter {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
		font-size: var(--fs-meta);
		color: var(--text-2);
	}
	.fb-filter select,
	.fb-filter input {
		min-height: 44px;
		width: 100%;
		font: inherit;
		font-size: var(--fs-ui);
		color: var(--text-1);
		background: var(--surface-0, var(--bg0));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		padding: 0 0.55rem;
	}
	.fb-inbox-note {
		margin: 0;
		color: var(--text-2);
	}
	.fb-rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.fb-row {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 100%;
		min-width: 0;
		min-height: 44px;
		padding: 0.55rem 0.7rem;
		text-align: left;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1, var(--bg1));
		border: 1px solid var(--boundary);
		/* The thick left edge is an accent (lit for an unread note), not the row's boundary. */
		border-left: 4px solid var(--hairline);
		border-radius: var(--radius-md, 8px);
		cursor: pointer;
	}
	.fb-row.unseen {
		border-left-color: var(--hover-ink, var(--green));
	}
	.fb-row.on {
		outline: 2px solid var(--hover-ink, var(--green));
		outline-offset: 1px;
	}
	.fb-row:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.fb-row-top {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		min-width: 0;
	}
	.fb-row-name {
		font-weight: 700;
	}
	.fb-row-top time {
		flex: none;
		font-size: var(--fs-meta);
		color: var(--text-2);
	}
	.fb-row-item {
		font-size: var(--fs-caption);
		color: var(--text-1);
	}
	.fb-row-place {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.fb-row-last {
		font-size: var(--fs-caption);
		color: var(--text-2);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.fb-row-state {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-1);
	}
	.fb-row-new {
		font-weight: 700;
		padding: 0.05rem 0.4rem;
		border: 1px solid var(--hover-ink, var(--green));
		border-radius: 999px;
	}
	.fb-inbox-detail {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}
	.fb-back {
		align-self: flex-start;
	}
	@media (min-width: 1025px) {
		.fb-back {
			display: none;
		}
	}
</style>
