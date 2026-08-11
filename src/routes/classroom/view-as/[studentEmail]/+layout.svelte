<script lang="ts">
	import ImpersonationBanner from '$lib/classroom/ImpersonationBanner.svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<ImpersonationBanner
	email={data.studentEmail}
	displayName={data.displayName}
	exitHref="/classroom/view-as"
/>
{@render children()}
