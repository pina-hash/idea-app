<script lang="ts">
	/**
	 * The connector's consent card (docs/connector/DESIGN.md section 1). It wears
	 * the site plate through `SITE_PLATE`, the site's one revert switch, so it
	 * reads as the rest of the admin tier does.
	 */
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import { SITE_PLATE } from '$lib/shell/site-plate';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let busy = $state(false);
	const problem = $derived(form?.problem ?? data.problem);
</script>

<svelte:head><title>Connect Claude // IDEA</title></svelte:head>

<div class="cn-root {SITE_PLATE}">
	<div class="app-header">
		<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
		<div class="header-right"><ProfileMenu /></div>
	</div>

	<main class="cn-page">
		<section class="card cn-card" data-testid="connector-consent">
			<div class="eyebrow">IDEA Website connector</div>
			{#if problem}
				<h1>This sign-in request cannot be used</h1>
				<p class="cn-lead" data-testid="connector-problem">{problem}</p>
				<p class="cn-small">Start again from Claude: Settings, Connectors, IDEA Website, Connect.</p>
			{:else if !data.signedIn}
				<h1>Sign in to connect Claude</h1>
				<p class="cn-lead">
					Sign in with your school Google account. You come straight back here to approve the connection.
				</p>
				<div class="cn-actions">
					<button class="btn" type="button" data-testid="connector-signin" onclick={() => armorySignIn(data.supabase)}>
						Sign in with Google
					</button>
				</div>
			{:else if data.request}
				<h1>Let Claude use the site as you?</h1>
				<dl class="cn-facts">
					<div><dt class="section-label">App</dt><dd data-testid="connector-client">{data.request.clientName}</dd></div>
					<div><dt class="section-label">Returns to</dt><dd data-testid="connector-host">{data.request.redirectHost}</dd></div>
					<div><dt class="section-label">Acting as</dt><dd>{data.email}</dd></div>
				</dl>
				<ul class="cn-points">
					<li><span class="cn-mark" aria-hidden="true">1</span>It can do what your account can do here: read classes, post, grade and give coins.</li>
					<li><span class="cn-mark" aria-hidden="true">2</span>Every change is recorded as yours and logged as made through Claude.</li>
					<li><span class="cn-mark" aria-hidden="true">3</span>Deleting, removing and other big changes are previewed and asked about in the chat first.</li>
					<li><span class="cn-mark" aria-hidden="true">4</span>Disconnect it, or switch it off for everyone, at <a href="/admin/connector">Admin, Connector</a>.</li>
				</ul>
				<form method="POST" class="cn-actions" onsubmit={() => (busy = true)}>
					<input type="hidden" name="q" value={data.query} />
					<button class="btn" type="submit" formaction="?/connect" disabled={busy} data-testid="connector-connect">Connect</button>
					<button class="btn secondary" type="submit" formaction="?/deny" disabled={busy} data-testid="connector-deny">Not now</button>
				</form>
			{/if}
		</section>
	</main>
</div>

<style>
	.cn-page {
		max-width: 40rem;
		margin: 0 auto;
		padding: 2rem 1rem 4rem;
	}
	.cn-card {
		padding: 1.6rem 1.6rem 1.4rem;
	}
	.cn-card h1 {
		margin: 0.4rem 0 0.8rem;
		font-size: 1.7rem;
		line-height: 1.15;
	}
	.cn-lead {
		color: var(--text-2);
		margin: 0 0 1rem;
		font-size: 1.05rem;
	}
	.cn-small {
		color: var(--text-2);
		font-size: 0.95rem;
		margin: 0;
	}
	.cn-facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr));
		gap: 0.6rem;
		margin: 0 0 1.1rem;
	}
	.cn-facts div {
		min-width: 0;
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: 0.6rem;
		background: var(--surface-2, var(--bg2));
	}
	.cn-facts dt {
		margin: 0 0 0.15rem;
	}
	.cn-facts dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.95rem;
		overflow-wrap: anywhere;
	}
	.cn-points {
		list-style: none;
		margin: 0 0 1.3rem;
		padding: 0;
		display: grid;
		gap: 0.55rem;
	}
	.cn-points li {
		display: grid;
		grid-template-columns: 1.6rem 1fr;
		gap: 0.6rem;
		align-items: start;
		line-height: 1.4;
	}
	.cn-mark {
		display: inline-grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		border: 1px solid var(--boundary);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.cn-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
	}
	.cn-actions .btn {
		min-height: 44px;
		min-width: 8rem;
	}
</style>
