<script lang="ts">
	/**
	 * /foundry/apply. The route owns the load and the one write; the component
	 * owns the arrangement. The write is one RPC with one argument straight
	 * from the browser client: `foundry_publisher_apply` takes no identity and
	 * re-checks everything in its own body, so there is nothing a server would
	 * add.
	 */
	import { invalidateAll } from '$app/navigation';

	import FoundryPage from '$lib/foundry/FoundryPage.svelte';
	import FoundryPublisherApply from '$lib/foundry/FoundryPublisherApply.svelte';
	import { foundryRpcOutcome, type FoundryPublisherTransports } from '$lib/foundry/transports';

	let { data } = $props();

	const now = new Date();

	const apply: FoundryPublisherTransports['apply'] = async (answers) => {
		try {
			const { data: r, error } = await data.supabase.rpc('foundry_publisher_apply', {
				p_answers: answers
			});
			const out = foundryRpcOutcome(r, error);
			if (!out.ok) return out;
			return {
				ok: true,
				submittedAt: typeof out.row.submitted_at === 'string' ? out.row.submitted_at : null
			};
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : undefined };
		}
	};
</script>

<svelte:head>
	<title>Apply to be a trusted publisher // IDEA Foundry</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<FoundryPage heading="Trusted publisher" measure="52rem" testid="foundry-apply-page">
	<p class="fdy-apply-back"><a class="tap-44" href="/foundry/mine">Back to My apps</a></p>
	<FoundryPublisherApply read={data.publisher} {apply} {now} onApplied={() => invalidateAll()} />
</FoundryPage>

<style>
	.fdy-apply-back {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
</style>
