<script lang="ts">
	import VerifyPage from '$lib/certifications/student/VerifyPage.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<VerifyPage view={data.view} />
