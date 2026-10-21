<script lang="ts">
	/**
	 * VIEW AS / ACT AS, the pair of keys beside a person (ledger 0422). Each is
	 * a plain form post to `/admin/view-as?/start`, never an enhanced one, so
	 * the browser does a full page load and starts over as that person.
	 * Shown only to an admin; the action re-checks.
	 */
	let {
		userId,
		name,
		next = '/',
		act = true,
		tiny = false
	}: { userId: string; name: string; next?: string; act?: boolean; tiny?: boolean } = $props();
</script>

<span class="vab" data-testid="view-as-buttons">
	<form method="POST" action="/admin/view-as?/start">
		<input type="hidden" name="user" value={userId} />
		<input type="hidden" name="mode" value="view" />
		<input type="hidden" name="next" value={next} />
		<button class="btn secondary" class:tiny type="submit" data-testid="view-as-view" title={`See the site exactly as ${name} does. Read-only.`}>View as</button>
	</form>
	{#if act}
		<form method="POST" action="/admin/view-as?/start">
			<input type="hidden" name="user" value={userId} />
			<input type="hidden" name="mode" value="act" />
			<input type="hidden" name="next" value={next} />
			<button class="btn secondary" class:tiny type="submit" data-testid="view-as-act" title={`Make changes on ${name}'s account. Every change is logged under your name and ${name} is told.`}>Act as</button>
		</form>
	{/if}
</span>

<style>
	.vab {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.vab form {
		margin: 0;
	}
	.vab .btn:not(.tiny) {
		min-height: 44px;
	}
</style>
