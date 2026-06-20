<script lang="ts">
	import { goto } from '$app/navigation';

	let { data } = $props();
	let { supabase, claims } = $derived(data);
	let loading = $state(false);
	let errorMessage = $state('');

	const signInWithGoogle = async () => {
		loading = true;
		errorMessage = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback`
			}
		});
		if (error) {
			errorMessage = error.message;
			loading = false;
		}
	};
</script>

<main>
	<h1>IDEA</h1>
	<p class="lead">
		The unified portal for IDEA at Bosco Tech. Sign in with your Bosco Tech account to reach your
		dashboard. More features are on the way.
	</p>

	<div class="card">
		{#if claims}
			<p>You are signed in.</p>
			<button class="btn" onclick={() => goto('/dashboard')}>Go to dashboard</button>
		{:else}
			<button class="btn" onclick={signInWithGoogle} disabled={loading}>
				{loading ? 'Redirecting...' : 'Sign in with Google'}
			</button>
			{#if errorMessage}
				<p class="lead" style="color: #ff8a8a; margin-top: 1rem;">{errorMessage}</p>
			{/if}
		{/if}
	</div>
</main>
