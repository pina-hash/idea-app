<script lang="ts">
	/**
	 * Teacher review queue for GREENLINE custom decal uploads (Phase 6c).
	 * Presentation + callbacks only, mirroring FrcReviewQueue exactly (so it is
	 * harness-testable in memory and used on the dashboard wired to the real
	 * review write): approve-or-request-revision, never a blunt reject, feedback
	 * text required for a revision. The dashboard wires both callbacks to the
	 * greenline_decal_review SECURITY DEFINER RPC (via reviewDecal in decals.ts),
	 * the only write path onto another user's decal row. Styled for the dark
	 * IDEA dashboard theme like FrcReviewQueue.
	 */
	type ReviewItem = {
		userId: string;
		studentName: string;
		studentEmail?: string | null;
		/** Resolved (signed) image URL, or null when unavailable. */
		imageUrl: string | null;
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
		onApprove: (userId: string) => void;
		onRequestRevision: (userId: string, feedback: string) => void;
	} = $props();

	// Per-item revision UI: which item's feedback box is open, and its text.
	let revisingKey = $state('');
	let feedback = $state('');

	function openRevision(i: ReviewItem) {
		revisingKey = i.userId;
		feedback = '';
	}
	function sendRevision(i: ReviewItem) {
		if (!feedback.trim()) return;
		onRequestRevision(i.userId, feedback.trim());
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
	<p class="gdq-empty">No decals awaiting review.</p>
{:else}
	<ul class="gdq">
		{#each items as i (i.userId)}
			{@const busy = busyKey === i.userId}
			<li class="gdq-item">
				<div class="gdq-main">
					{#if i.imageUrl}
						<img class="gdq-image" src={i.imageUrl} alt="Decal submitted by {i.studentName}" />
					{:else}
						<div class="gdq-image gdq-image-missing">image unavailable</div>
					{/if}
					<div class="gdq-body">
						<div class="gdq-who">
							<span class="gdq-student">{i.studentName}</span>
							{#if i.studentEmail}<span class="gdq-email">{i.studentEmail}</span>{/if}
						</div>
						{#if i.submittedAt}<span class="gdq-time">Sent {fmt(i.submittedAt)}</span>{/if}

						{#if revisingKey === i.userId}
							<div class="gdq-revise">
								<textarea
									class="gdq-feedback"
									rows="2"
									placeholder="What needs changing before this can be approved?"
									bind:value={feedback}
								></textarea>
								<div class="gdq-actions">
									<button class="gdq-btn danger" type="button" disabled={busy || !feedback.trim()} onclick={() => sendRevision(i)}>
										Send revision
									</button>
									<button class="gdq-btn" type="button" disabled={busy} onclick={() => (revisingKey = '')}>
										Cancel
									</button>
								</div>
							</div>
						{:else}
							<div class="gdq-actions">
								<button class="gdq-btn approve" type="button" disabled={busy} onclick={() => onApprove(i.userId)}>
									{busy ? 'Working...' : 'Approve'}
								</button>
								<button class="gdq-btn" type="button" disabled={busy} onclick={() => openRevision(i)}>
									Request revision
								</button>
							</div>
						{/if}
					</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.gdq-empty {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		color: var(--dim, #4a7a52);
		padding: 0.4rem 0 0.2rem;
	}
	.gdq {
		list-style: none;
		margin: 0;
		padding: 0.4rem 0 0.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.gdq-item {
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 6px;
		padding: 0.6rem 0.7rem;
	}
	.gdq-main {
		display: flex;
		gap: 0.8rem;
		align-items: flex-start;
	}
	/* The image IS the submission: shown at review size on a neutral dark
	   backdrop so the teacher judges exactly what would render on the car. */
	.gdq-image {
		width: 108px;
		height: 108px;
		object-fit: contain;
		background: var(--bg0, #020a04);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 4px;
		flex-shrink: 0;
	}
	.gdq-image-missing {
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.58rem;
		color: var(--dim, #4a7a52);
		text-align: center;
	}
	.gdq-body {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
		flex: 1;
	}
	.gdq-who {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.gdq-student {
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-weight: 600;
		color: var(--white, #e8ffe8);
	}
	.gdq-email {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		color: var(--dim, #4a7a52);
	}
	.gdq-time {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		color: var(--dim, #4a7a52);
	}
	.gdq-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.gdq-btn {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		color: var(--green, #00ff41);
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 3px;
		padding: 0.35rem 0.6rem;
		cursor: pointer;
	}
	.gdq-btn:hover:not(:disabled) {
		border-color: var(--green, #00ff41);
	}
	.gdq-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.gdq-btn.approve {
		color: var(--bg0, #020a04);
		background: var(--green, #00ff41);
		border-color: var(--green, #00ff41);
		font-weight: 700;
	}
	.gdq-btn.danger {
		color: var(--amber, #ffb300);
		border-color: rgba(255, 179, 0, 0.4);
	}
	.gdq-revise {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.gdq-feedback {
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
	.gdq-feedback:focus-visible {
		outline: none;
		border-color: var(--green, #00ff41);
	}
	@media (max-width: 520px) {
		.gdq-main {
			flex-direction: column;
		}
	}
</style>
