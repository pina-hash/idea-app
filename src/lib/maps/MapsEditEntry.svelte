<script lang="ts">
	/**
	 * THE ENTRY CONTROL ON THE PUBLIC MAP. Renders the one link into the
	 * editor for a caller `mapsCanEnterEditor` admits, and NOTHING for anyone
	 * else -- not a disabled control, not a sign-in prompt: the existence of an
	 * editor lane is not something the public map advertises, which is the same
	 * posture the route's own 404 takes.
	 *
	 * It is not the guard. `/maps/edit/+layout.server.ts` refuses a caller who
	 * typed the address regardless of what this rendered.
	 */
	import type { MapsEditorScope } from './grants';
	import { MAPS_EDITOR_ENTRY_LABEL, MAPS_EDITOR_PATH, mapsCanEnterEditor } from './entry';

	let { scope }: { scope: MapsEditorScope | null | undefined } = $props();

	const visible = $derived(mapsCanEnterEditor(scope));
</script>

{#if visible}
	<a class="btn maps-edit-entry" href={MAPS_EDITOR_PATH} data-testid="maps-edit-entry">
		{MAPS_EDITOR_ENTRY_LABEL}
	</a>
{/if}

<style>
	.maps-edit-entry {
		min-height: 44px;
	}
</style>
