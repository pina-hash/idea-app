<script lang="ts">
	/**
	 * /foundry/classes -- close the Foundry for a class, and open it again.
	 *
	 * THE ROUTE OWNS THE LOAD AND THE TRANSPORT; the component owns the
	 * arrangement and the intent. `setOpen` is a plain RPC call made from the
	 * browser client, which is what the convention asks for: one RPC and three
	 * arguments is not work that needs a server route.
	 */
	import FoundryClassAccess from '$lib/foundry/FoundryClassAccess.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Foundry access for your classes</title></svelte:head>

<div class="fdy-classes-page">
	<FoundryClassAccess
		sections={data.sections}
		setOpen={async (sectionId, open, note) => {
			const { error } = await data.supabase.rpc('foundry_set_section_open', {
				p_section_id: sectionId,
				p_open: open,
				p_note: note
			});
			// THE DATABASE'S OWN SENTENCE, VERBATIM. A refusal rewritten here
			// is a second vocabulary for the same rule.
			if (error) return { ok: false, message: error.message };
			return { ok: true };
		}}
	/>
</div>

<style>
	.fdy-classes-page {
		max-width: 60rem;
		margin: 1.5rem auto;
		padding: 0 var(--fg-gutter, 1rem);
	}
</style>
