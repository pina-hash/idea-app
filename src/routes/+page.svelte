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
	<section class="hero">
		<span class="eyebrow">Don Bosco Technical Institute // Technology Pathway</span>
		<a class="wordmark" href="/">IDEA<span>.</span></a>
		<p class="lead">
			Integrated Design, Engineering and Art. The unified portal for the IDEA pathway. Sign in
			with your Bosco Tech account to reach your dashboard.
		</p>
	</section>

	<div class="card">
		{#if claims}
			<p>You are signed in.</p>
			<div class="btn-row">
				<button class="btn" onclick={() => goto('/dashboard')}>Go to dashboard</button>
			</div>
		{:else}
			<div class="btn-row">
				<button class="btn" onclick={signInWithGoogle} disabled={loading}>
					{loading ? 'Redirecting...' : 'Sign in with Google'}
				</button>
			</div>
			{#if errorMessage}
				<p class="warn mono" style="margin-top: 1rem;">{errorMessage}</p>
			{/if}
		{/if}
	</div>

	<h2>Public access</h2>
	<a class="callout" href="/vanguard/index.html">
		<div>
			<div class="callout-title">IDEA // VANGUARD</div>
			<div class="callout-sub">Arcade shooter. Playable now, no login required.</div>
		</div>
		<span class="btn secondary">Launch &#9658;</span>
	</a>
	<a class="callout" href="/coins/index.html">
		<div>
			<div class="callout-title">IDEA Coin Leaderboard</div>
			<div class="callout-sub">Live balances and rankings across all sections.</div>
		</div>
		<span class="btn secondary">View &#9658;</span>
	</a>
</main>
