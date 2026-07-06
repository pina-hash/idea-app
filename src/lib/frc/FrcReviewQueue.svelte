<script lang="ts">
	/**
	 * Teacher review queue for FRC modeling-gate submissions. Presentation +
	 * callbacks only (like FrcUnitOverride), so it is harness-testable in memory
	 * and used on the dashboard wired to the real approve / request-revision
	 * writes. Approving calls back into `onApprove`, which the dashboard wires to
	 * frc_mark_complete (the single completion-write path) + the row update.
	 * Styled for the dark IDEA dashboard theme.
	 */
	type ReviewItem = {
		userId: string;
		unitId: string;
		unitLabel: string;
		studentName: string;
		studentEmail?: string | null;
		link: string;
		notes: string;
		submittedAt: string | null;
	};
	let {
		items,
		busyKey = '',
		onApprove,
		onRequestRevision
	}: {
		items: ReviewItem[];
		busyKey?: string;
		onApprove: (userId: string, unitId: string) => void;
		onRequestRevision: (userId: string, unitId: string, feedback: string) => void;
	} = $props();

	// Per-item revision UI: which item's feedback box is open, and its text.
	let revisingKey = $state('');
	let feedback = $state('');

	const keyOf = (i: ReviewItem) => `${i.userId}:${i.unitId}`;

	function openRevision(i: ReviewItem) {
		revisingKey = keyOf(i);
		feedback = '';
	}
	function sendRevision(i: ReviewItem) {
		if (!feedback.trim()) return;
		onRequestRevision(i.userId, i.unitId, feedback.trim());
		revisingKey = '';
		feedback = '';
	}
	function fmt(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

{#if items.length === 0}
	<p class="frq-empty">No submissions awaiting review.</p>
{:else}
	<ul class="frq">
		{#each items as i (keyOf(i))}
			{@const busy = busyKey === keyOf(i)}
			<li class="frq-item">
				<div class="frq-top">
					<div class="frq-who">
						<span class="frq-student">{i.studentName}</span>
						{#if i.studentEmail}<span class="frq-email">{i.studentEmail}</span>{/if}
					</div>
					<span class="frq-unit">{i.unitLabel}</span>
				</div>
				<div class="frq-body">
					<a class="frq-link" href={i.link} target="_blank" rel="noopener noreferrer">
						Open model &rsaquo;
					</a>
					{#if i.submittedAt}<span class="frq-time">Sent {fmt(i.submittedAt)}</span>{/if}
				</div>
				{#if i.notes}<p class="frq-notes">{i.notes}</p>{/if}

				{#if revisingKey === keyOf(i)}
					<div class="frq-revise">
						<textarea
							class="frq-feedback"
							rows="2"
							placeholder="What needs fixing before this can pass?"
							bind:value={feedback}
						></textarea>
						<div class="frq-actions">
							<button class="frq-btn danger" type="button" disabled={busy || !feedback.trim()} onclick={() => sendRevision(i)}>
								Send revision
							</button>
							<button class="frq-btn" type="button" disabled={busy} onclick={() => (revisingKey = '')}>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<div class="frq-actions">
						<button class="frq-btn approve" type="button" disabled={busy} onclick={() => onApprove(i.userId, i.unitId)}>
							{busy ? 'Working...' : 'Approve & complete'}
						</button>
						<button class="frq-btn" type="button" disabled={busy} onclick={() => openRevision(i)}>
							Request revision
						</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.frq-empty {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		color: var(--dim, #4a7a52);
		padding: 0.4rem 0 0.2rem;
	}
	.frq {
		list-style: none;
		margin: 0;
		padding: 0.4rem 0 0.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.frq-item {
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 6px;
		padding: 0.6rem 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.frq-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.frq-who {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.frq-student {
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-weight: 600;
		color: var(--white, #e8ffe8);
	}
	.frq-email {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		color: var(--dim, #4a7a52);
	}
	.frq-unit {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		color: var(--cyan, #00f0ff);
	}
	.frq-body {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.frq-link {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--green, #00ff41);
		text-decoration: none;
	}
	.frq-link:hover {
		text-decoration: underline;
	}
	.frq-time {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		color: var(--dim, #4a7a52);
	}
	.frq-notes {
		margin: 0;
		font-size: 0.82rem;
		color: var(--white, #e8ffe8);
		line-height: 1.45;
	}
	.frq-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.frq-btn {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		color: var(--green, #00ff41);
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 3px;
		padding: 0.35rem 0.6rem;
		cursor: pointer;
	}
	.frq-btn:hover:not(:disabled) {
		border-color: var(--green, #00ff41);
	}
	.frq-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.frq-btn.approve {
		color: var(--bg0, #020a04);
		background: var(--green, #00ff41);
		border-color: var(--green, #00ff41);
		font-weight: 700;
	}
	.frq-btn.danger {
		color: var(--amber, #ffb300);
		border-color: rgba(255, 179, 0, 0.4);
	}
	.frq-revise {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.frq-feedback {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		background: var(--bg0, #020a04);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.85rem;
		padding: 0.4rem 0.5rem;
	}
	.frq-feedback:focus-visible {
		outline: none;
		border-color: var(--green, #00ff41);
	}
</style>
