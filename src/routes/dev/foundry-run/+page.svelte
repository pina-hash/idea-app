<script lang="ts">
	/**
	 * The harness mounts the REAL `AppStage`, which mounts the REAL `AppFrame`,
	 * which writes the one sandbox attribute in the repo. Nothing here is a copy
	 * of anything: the only thing this page contributes is the two ids and, when
	 * asked, a different Supabase origin.
	 */
	import AppStage from '$lib/foundry/AppStage.svelte';
	import { foundryBundleUrl } from '$lib/foundry/bundle-url';

	let { data } = $props();

	const src = $derived(foundryBundleUrl(data.origin, data.appId, data.versionId));
</script>

<svelte:head><title>Foundry run harness</title></svelte:head>

<div class="cr-root harness">
	<header>
		<h1>Run a published bundle</h1>
		<p class="note">
			Give it <code>?app=&lt;uuid&gt;&amp;version=&lt;uuid&gt;</code>, and
			<code>&amp;origin=</code> when the project holding them is not the one
			<code>.env</code> names.
		</p>
		<dl>
			<dt>app</dt>
			<dd><code data-testid="app">{data.appId || '(none given)'}</code></dd>
			<dt>version</dt>
			<dd><code data-testid="version">{data.versionId || '(none given)'}</code></dd>
			<dt>origin</dt>
			<dd>
				<code data-testid="origin">{data.origin}</code>
				{#if data.origin !== data.defaultOrigin}
					<span class="override">overridden; .env names {data.defaultOrigin}</span>
				{/if}
			</dd>
			<dt>frame src</dt>
			<dd><code data-testid="src">{src ?? '(cannot be built)'}</code></dd>
		</dl>
	</header>

	<AppStage
		appId={data.appId}
		versionId={data.versionId}
		appsOrigin={data.origin}
		title={data.title}
		height="60vh"
		runningLabel="Running {data.title}"
	/>
</div>

<style>
	.harness {
		padding: var(--space-4, 1rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-4, 1rem);
	}

	h1 {
		margin: 0 0 0.25rem;
	}

	.note {
		margin: 0 0 var(--space-3, 0.75rem);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2, var(--dim));
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.2rem var(--space-3, 0.75rem);
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	dt {
		color: var(--text-2, var(--dim));
	}

	dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.override {
		color: var(--amber);
	}
</style>
