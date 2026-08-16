<script lang="ts">
	import {
		revisionAuthorLabel,
		revisionSummary,
		revisionTargetLabel,
		sortRevisions,
		type ContentRevision,
		type RevisionHistory,
		type RevisionTransports
	} from '$lib/classroom/revisions';
	import { shortWhen } from '$lib/classroom/classroom';

	/**
	 * Every version of this item's content, newest first.
	 *
	 * ONE CHRONOLOGICAL LIST ACROSS ALL FOUR TARGETS -- the post's own content,
	 * the assignment spec, the reference document and the rubric interleaved by
	 * when they were replaced, not grouped by which column they came from. What
	 * a teacher is reconstructing is a sequence of events ("I swapped the spec,
	 * then fixed the rubric, then the title"), and four separate lists would
	 * make them merge it in their head. The target is a chip on the row.
	 *
	 * WHAT A ROW SAYS, and the wording matters: a revision holds the content
	 * that was DISPLACED, and its author and timestamp are the write that
	 * displaced it. So the row reads "Replaced by T. Vargas, 12 Aug" and NOT
	 * "By T. Vargas" -- the latter would attribute the old content to whoever
	 * happened to overwrite it. See 0110's header.
	 *
	 * LOADED LAZILY, on first open. An item page should not pay for a history
	 * nobody asked to see, and the panel is collapsed by default because on a
	 * long-lived item it is the longest thing on the page.
	 *
	 * PRESENTATION + INJECTED TRANSPORTS (the ReviewConsole convention), so the
	 * dev harness drives the identical component against an in-memory store.
	 */
	let {
		itemId,
		transports,
		onchanged = null
	}: {
		itemId: string;
		transports: RevisionTransports;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	let open = $state(false);
	let loaded = $state(false);
	let loading = $state(false);
	let history = $state<RevisionHistory | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let expanded = $state<string | null>(null);
	let armRestore = $state<string | null>(null);
	let busy = $state(false);

	const rows = $derived(history ? sortRevisions(history.revisions) : []);

	async function load() {
		loading = true;
		error = null;
		const res = await transports.load(itemId);
		loading = false;
		loaded = true;
		if (!res.ok) {
			error = res.message;
			history = null;
			return;
		}
		history = res.data;
	}

	function toggle() {
		open = !open;
		if (open && !loaded) void load();
	}

	/**
	 * "r3 of 5" -- which version this is, and how many there have been. The head
	 * is not a row in the table, so `head_revisions` carries its number; without
	 * it a reader has no way to tell how far back a revision sits.
	 */
	function positionLabel(rev: ContentRevision): string {
		const head = history?.head_revisions?.[rev.target];
		return head ? `r${rev.revision} of ${head}` : `r${rev.revision}`;
	}

	function restoredLabel(rev: ContentRevision): string | null {
		if (!rev.restored_from_id) return null;
		const source = rows.find((r) => r.id === rev.restored_from_id);
		return source ? `Replaced by a restore of r${source.revision}` : 'Replaced by a restore';
	}

	async function restore(rev: ContentRevision) {
		if (armRestore !== rev.id) {
			armRestore = rev.id;
			return;
		}
		armRestore = null;
		busy = true;
		notice = null;
		error = null;
		const res = await transports.restore(rev.id);
		busy = false;
		if (!res.ok) {
			error = res.message;
			return;
		}
		notice = res.data.changed
			? `Restored ${revisionTargetLabel(rev.target).toLowerCase()} r${rev.revision}. What it replaced is kept below.`
			: `That version is already live -- nothing changed.`;
		await load();
		await onchanged?.();
	}

	function payloadText(rev: ContentRevision): string {
		try {
			return JSON.stringify(rev.payload, null, 2);
		} catch {
			return 'This version could not be displayed.';
		}
	}
</script>

<div class="history">
	<button
		type="button"
		class="history-toggle"
		aria-expanded={open}
		aria-controls="revision-list"
		data-testid="history-toggle"
		onclick={toggle}
	>
		<span class="chev" class:on={open} aria-hidden="true">▸</span>
		<span class="history-title">History</span>
		{#if history}
			<span class="spec-meta">
				{rows.length} earlier version{rows.length === 1 ? '' : 's'}
			</span>
		{/if}
	</button>

	{#if open}
		<div id="revision-list" class="history-body">
			{#if loading}
				<p class="note">Loading…</p>
			{:else if error}
				<p class="feedback error" data-testid="history-error">{error}</p>
			{:else if !rows.length}
				<p class="note" data-testid="history-empty">
					No earlier versions yet. From now on, every change to this item's content, spec, document
					or rubric keeps a copy of what it replaced.
				</p>
			{/if}

			{#if notice}<p class="feedback ok" data-testid="history-notice">{notice}</p>{/if}

			{#each rows as rev (rev.id)}
				<div class="rev" class:expanded={expanded === rev.id}>
					<div class="rev-row">
						<button
							type="button"
							class="rev-open"
							aria-expanded={expanded === rev.id}
							data-testid="rev-open-{rev.id}"
							onclick={() => (expanded = expanded === rev.id ? null : rev.id)}
						>
							<span class="chev" class:on={expanded === rev.id} aria-hidden="true">▸</span>
							<span class="rev-main">
								<span class="rev-head">
									<span class="kind-chip">{revisionTargetLabel(rev.target)}</span>
									<span class="rev-summary">{revisionSummary(rev)}</span>
								</span>
								<span class="rev-meta spec-meta">
									{positionLabel(rev)} &middot; {restoredLabel(rev) ?? revisionAuthorLabel(rev)}
									&middot;
									{shortWhen(rev.created_at)}
								</span>
							</span>
						</button>
						<span class="tool-actions">
							<button
								type="button"
								class="btn secondary tiny"
								disabled={busy}
								data-testid="rev-restore-{rev.id}"
								onclick={() => restore(rev)}
							>
								{armRestore === rev.id ? 'Really restore?' : 'Restore'}
							</button>
						</span>
					</div>
					{#if armRestore === rev.id}
						<p class="note restore-note">
							This puts {revisionTargetLabel(rev.target).toLowerCase()} r{rev.revision} back as the live
							version. Nothing is lost: what is live now is kept as a new entry here.
						</p>
					{/if}
					{#if expanded === rev.id}
						<pre class="payload" data-testid="rev-payload-{rev.id}">{payloadText(rev)}</pre>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.history {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	/* A real button, in the tab order, with aria-expanded -- not a div with a
	   click handler. The same rule the classroom feed's collapse follows. */
	.history-toggle {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font: inherit;
		color: var(--text-1);
		cursor: pointer;
		text-align: left;
		min-height: 2.75rem;
	}
	.history-title {
		font-family: 'Rajdhani', sans-serif;
		font-weight: 600;
		font-size: 0.95rem;
	}
	.chev {
		display: inline-block;
		transition: transform 0.12s ease;
		color: var(--text-2);
		font-size: 0.7rem;
	}
	.chev.on {
		transform: rotate(90deg);
	}

	.history-body {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.rev {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.45rem 0.55rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.rev-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.rev-open {
		display: flex;
		align-items: flex-start;
		gap: 0.45rem;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
		text-align: left;
		/* A grid/flex item's automatic minimum is its min-content, so without
		   this a long summary pushes the row wider than the card it sits in. */
		flex: 1 1 14rem;
		min-width: 0;
		min-height: 2.75rem;
	}
	.rev-main {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.rev-head {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.rev-summary {
		font-size: 0.85rem;
	}
	.rev-meta {
		display: block;
	}
	.restore-note {
		margin: 0;
	}

	/**
	 * RESTORE IS A 44px TARGET, unlike the .btn.tiny controls it sits beside.
	 *
	 * It is a two-step destructive control -- it replaces what a class is
	 * currently reading with an older version -- so it does not get the 23px
	 * house size the row's other actions use. Scoped HERE, to this button, on
	 * purpose: `.btn.tiny` is the classroom's shared control size and lives in
	 * classroom.css, where changing it would inflate every Edit, Publish, Pin
	 * and Copy in the manage console to match. The exception is the button, not
	 * the class.
	 *
	 * `:global` because .btn is an app-shell class this component's scoped CSS
	 * cannot otherwise reach; the selector is anchored inside .tool-actions so
	 * it can affect nothing outside this panel.
	 */
	.tool-actions :global(.btn.tiny) {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.payload {
		margin: 0;
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.5rem 0.6rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		line-height: 1.5;
		color: var(--text-2);
		max-height: 22rem;
		overflow: auto;
		white-space: pre;
	}

	@media (prefers-reduced-motion: reduce) {
		.chev {
			transition: none;
		}
	}
</style>
