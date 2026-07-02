<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import '@fontsource/rajdhani/300.css';
	import '@fontsource/rajdhani/400.css';
	import '@fontsource/rajdhani/500.css';
	import '@fontsource/rajdhani/600.css';
	import '@fontsource/rajdhani/700.css';
	import '@fontsource/share-tech-mono/400.css';
	// Orbitron powers the landing page's original IDEA aesthetic (display type) and
	// the GAUNTLET Speedrun race timer (500 for centiseconds, 700 for mm:ss).
	import '@fontsource/orbitron/400.css';
	import '@fontsource/orbitron/500.css';
	import '@fontsource/orbitron/600.css';
	import '@fontsource/orbitron/700.css';
	import '@fontsource/orbitron/900.css';
	import '../app.css';
	import InstallPrompt from '$lib/InstallPrompt.svelte';

	let { data, children } = $props();
	let { claims, supabase } = $derived(data);

	onMount(() => {
		const { data: authData } = supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== claims?.exp) {
				invalidate('supabase:auth');
			}
		});

		return () => authData.subscription.unsubscribe();
	});
</script>

<div class="bg-fx" aria-hidden="true"></div>
{@render children()}
<InstallPrompt />
