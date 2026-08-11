<script lang="ts">
	/**
	 * Placeholder only. The legacy Sheets migration wizard lands here in the
	 * next phase of the coin-system consolidation; this route exists now so
	 * the sub-nav is complete and the URL is settled before anything is built
	 * against it. No functionality, no data loading, no writes.
	 */
</script>

<svelte:head>
	<title>Migrate // Coin Desk</title>
</svelte:head>

<section class="card">
	<h2>Legacy Sheets migration</h2>
	<p class="note">
		The migration wizard for bringing balances over from the old Google Sheets ledger lands here in
		the next phase. Nothing here writes anything yet.
	</p>
	<p class="note">
		Until then, a legacy balance is attached the same way it always has been: look the student up
		under <a href="/coin-desk/students">Students</a> and apply one signed adjustment for whatever
		their old balance was, with the reason recorded. No conversion math, and it works whether or not
		that email has ever signed in.
	</p>
</section>

<style>
	h2 {
		margin-top: 0;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
</style>
