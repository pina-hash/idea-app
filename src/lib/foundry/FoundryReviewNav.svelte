<script lang="ts">
	/**
	 * THE REVIEW LANE'S TWO PLACES (ledger 0360, report 647d1201): the apps
	 * waiting for a decision, and the people (publisher applications and the
	 * trusted roster).
	 *
	 * WHY THEY ARE TWO PAGES. The trusted-publisher roster used to sit under
	 * the queue on the same full-height page, and that page is a 100dvh column
	 * that does not scroll: the roster kept its own height and the queue's
	 * split got whatever was left, about 145px at 1440x953 in the screenshot,
	 * with the rest of the roster clipped off the bottom. A list of people is
	 * an ordinary document; the queue is an application. Each now gets the
	 * shape it needs.
	 *
	 * KEYS, AND THE ONE THAT IS LIT IS THE PLACE YOU ARE. `class:on` beside
	 * `aria-current`, because `aria-current` is not one of the plate's seven
	 * state spellings and `.on` is. The counts are words beside numbers, and
	 * NULL renders nothing (not asked is not zero).
	 */
	let {
		active,
		pendingApps = null,
		pendingApplications = null
	}: {
		active: 'apps' | 'publishers';
		/** Apps waiting for review, from the same arithmetic the queue renders. */
		pendingApps?: number | null;
		/** Publisher applications waiting. Null on a database without 0230. */
		pendingApplications?: number | null;
	} = $props();
</script>

<nav class="fdy-rnav" aria-label="Review">
	<a
		class="btn fdy-rnav-key tap-44"
		class:on={active === 'apps'}
		href="/foundry/review"
		aria-current={active === 'apps' ? 'page' : undefined}
		data-testid="foundry-review-nav-apps"
	>
		Apps
		{#if pendingApps !== null}
			<span class="fdy-rnav-count">{pendingApps}</span>
		{/if}
	</a>
	<a
		class="btn fdy-rnav-key tap-44"
		class:on={active === 'publishers'}
		href="/foundry/review/publishers"
		aria-current={active === 'publishers' ? 'page' : undefined}
		data-testid="foundry-review-nav-publishers"
	>
		Publishers
		{#if pendingApplications !== null}
			<span class="fdy-rnav-count">{pendingApplications}</span>
		{/if}
	</a>
</nav>

<style>
	.fdy-rnav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}

	.fdy-rnav-key {
		text-decoration: none;
	}

	.fdy-rnav-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.3rem;
		padding: 0.05rem 0.35rem;
		border-radius: 999px;
		border: 1px solid var(--fg-st-draft-edge, var(--hairline));
		background: var(--fg-st-draft-fill, var(--surface-2));
		color: var(--fg-st-draft-ink, var(--text-2));
		font-size: 0.75rem;
		letter-spacing: 0;
	}
</style>
