<script lang="ts">
	/**
	 * The list the badge opens (ledger 0391): every notification newest first,
	 * an unread one bold with a dot and the word "New", each a link to its page,
	 * and one "Mark all read" key posting the `read` action with every unread
	 * id. The route invalidates after the write, so the badge in the profile
	 * menu and the shell's key fall to the new count.
	 */
	import { formatCertDateTime } from '$lib/certifications/status';
	import type { CertNotification } from '$lib/certifications/types';
	import type { CertActionPost } from './actions';
	import CertNotice from './CertNotice.svelte';

	let { rows, post = null }: { rows: CertNotification[]; post?: CertActionPost | null } = $props();

	const ordered = $derived(rows.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
	const unreadIds = $derived(ordered.filter((r) => !r.read_at).map((r) => r.id));

	let sending = $state(false);
	let refusal = $state<string | null>(null);

	async function markAll(event: SubmitEvent) {
		if (!post) return;
		event.preventDefault();
		if (sending || unreadIds.length === 0) return;
		sending = true;
		refusal = null;
		try {
			const answer = await post('read', { ids: unreadIds.join(',') });
			if (!answer.ok) refusal = answer.message;
		} finally {
			sending = false;
		}
	}
</script>

<div class="cert-notifications" data-testid="cert-notifications">
	<div class="cert-notifications-bar">
		<span class="cert-readout" class:is-ok={unreadIds.length > 0} data-testid="cert-notifications-unread">{unreadIds.length} new</span>
		<form method="POST" action="?/read" onsubmit={markAll} class="cert-notifications-form">
			<input type="hidden" name="ids" value={unreadIds.join(',')} />
			<button type="submit" class="btn secondary cert-btn" aria-disabled={unreadIds.length === 0 || sending} data-testid="cert-mark-all-read">{sending ? 'Marking' : 'Mark all read'}</button>
		</form>
	</div>
	{#if refusal}
		<CertNotice tone="bad" testId="cert-notifications-refusal">{refusal}</CertNotice>
	{/if}
	{#if ordered.length === 0}
		<CertNotice tone="quiet" title="Nothing yet." testId="cert-notifications-empty">A part checked off, a review returned, a seat approved and an award all land here.</CertNotice>
	{:else}
		<ul class="cert-well cert-notifications-list" data-testid="cert-notifications-list">
			{#each ordered as n (n.id)}
				<li class="cert-notification" class:is-unread={!n.read_at} data-testid="cert-notification" data-read={n.read_at ? 'yes' : 'no'}>
					<a class="cert-notification-link" href={n.href}>
						<span class="cert-notification-head">
							{#if !n.read_at}<span class="cert-notification-dot" aria-hidden="true"></span><span class="cert-readout is-ok">New</span>{/if}
							<span class="cert-notification-title">{n.title}</span>
							<span class="cert-notification-when">{formatCertDateTime(n.created_at)}</span>
						</span>
						<span class="cert-notification-body">{n.body}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.cert-notifications-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		margin: 0 0 1rem;
	}
	.cert-notifications-form {
		margin: 0;
	}
	.cert-notifications-list {
		margin: 0;
	}
	.cert-notification-link {
		display: grid;
		gap: 0.2rem;
		padding: 0.6rem 0;
		min-height: 44px;
		color: var(--text-1);
	}
	.cert-notification-link:hover .cert-notification-title {
		color: var(--hover-ink, var(--green));
	}
	.cert-notification-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 0.6rem;
	}
	.cert-notification-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		background: var(--green);
		flex: none;
	}
	.cert-notification-title {
		flex: 1 1 auto;
		min-width: 0;
	}
	.is-unread .cert-notification-title {
		font-weight: 700;
	}
	.cert-notification-when {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
	.cert-notification-body {
		color: var(--text-2);
		line-height: 1.45;
	}
	.btn[aria-disabled='true'] {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
