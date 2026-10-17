<script lang="ts">
	/*
	 * A HOST FOR THE REAL StudentOverview WITH THE CLASSROOM STORE IN CONTEXT,
	 * the way the classroom layout provides it on the real route. Not a copy of
	 * any markup: it provides the store (or none) and renders the component.
	 */
	import type { ComponentProps } from 'svelte';
	import StudentOverview from '$lib/classroom/StudentOverview.svelte';
	import { provideClassroomPreferences } from '$lib/preferences/context';
	import type { PreferenceStore } from '$lib/preferences/store';
	import type { ClassroomPreferences } from '$lib/preferences/classroom';

	let {
		store,
		props
	}: {
		store: PreferenceStore<ClassroomPreferences> | null;
		props: ComponentProps<typeof StudentOverview>;
	} = $props();

	// svelte-ignore state_referenced_locally
	provideClassroomPreferences(store);
</script>

<StudentOverview {...props} />
