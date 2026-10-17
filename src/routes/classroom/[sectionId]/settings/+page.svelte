<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ClassSettingsPanel from '$lib/classroom/ClassSettingsPanel.svelte';
	import { createClassroomTransports } from '$lib/classroom/transports';
	import { createClassThemeTransports } from '$lib/classroom/class-theme';
	import { createSectionThumbShapeWriter } from '$lib/classroom/thumbnail-transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The same transports the rest of the module uses; every one of them is
	// re-authorized by the RPC it calls, so this is plumbing, never a boundary.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const themeTransports = createClassThemeTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const setThumbShape = createSectionThumbShapeWriter(data.supabase);
</script>

<ClassSettingsPanel
	section={data.section}
	{transports}
	{themeTransports}
	thumbShape={data.thumbShape ?? null}
	{setThumbShape}
	onchanged={() => invalidateAll()}
	ondeleted={() => goto('/classroom')}
/>
