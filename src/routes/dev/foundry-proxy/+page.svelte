<script lang="ts">
	import AppFrame from '$lib/foundry/AppFrame.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Each case is driven from the page rather than only linked, so a drive
	 * records the STATUS the browser actually got. The requests are cross-origin
	 * to the apps host and carry no credentials; a 404 with no body reads here as
	 * a status number, which is exactly what is being asserted.
	 *
	 * `mode: 'no-cors'` is deliberately NOT used -- an opaque response reports
	 * status 0 for everything and would make a 404 and a 200 indistinguishable,
	 * which is the one thing this table exists to tell apart. A real CORS request
	 * is used instead: the apps host sends no CORS headers, so a SUCCESSFUL fetch
	 * is rejected by the browser and a refused one is too. That is why the table
	 * reports `fetch blocked (CORS)` as its own outcome -- for a bundle URL that
	 * means the response arrived and the browser would not show it to this page,
	 * which is itself the origin split working.
	 */
	let results = $state<Record<string, string>>({});
	let running = $state(false);

	/**
	 * What the FRAMED bundle reports about itself.
	 *
	 * It cannot be read any other way: the frame is cross-origin and on an
	 * opaque origin, so the parent cannot reach into its document, and its
	 * console is not this page's console. The fixture posts its verdicts out and
	 * this listens.
	 *
	 * TREATED AS UNTRUSTED TEXT, because it is a string a student's program
	 * wrote. It is rendered through Svelte's own text interpolation and nothing
	 * else -- no {@html}, no parsing, no dispatch on its contents. The gallery
	 * will have the same obligation if it ever listens to a bundle.
	 */
	let framedProbe = $state<Record<string, string>>({});

	$effect(() => {
		const onMessage = (e: MessageEvent) => {
			const payload = (e.data as { foundryProbe?: unknown } | null)?.foundryProbe;
			if (!payload || typeof payload !== 'object') return;
			const next: Record<string, string> = {};
			for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
				next[String(k)] = String(v);
			}
			framedProbe = next;
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	async function drive() {
		running = true;
		results = {};
		for (const c of data.cases) {
			try {
				const res = await fetch(c.url, { credentials: 'omit', redirect: 'manual' });
				results[c.url] = `status ${res.status}${res.type === 'opaque' ? ' (opaque)' : ''}`;
			} catch (e) {
				results[c.url] = `fetch blocked (${(e as Error).name})`;
			}
		}
		running = false;
	}
</script>

<svelte:head><title>Foundry bundle proxy harness</title></svelte:head>

<main class="fdy-dev">
	<h1>Foundry bundle proxy</h1>

	{#if !data.configured}
		<p class="fdy-warn">
			PUBLIC_FOUNDRY_APPS_HOST is not set, so there is no second origin and nothing here can
			load. Set it in <code>.env</code> to <code>127.0.0.1:5173</code> and reach this page on
			<code>http://localhost:5173/dev/foundry-proxy</code>, so the two are genuinely different
			origins to the browser.
		</p>
	{/if}

	<dl class="fdy-facts">
		<dt>this host (main)</dt>
		<dd>{data.mainHost}</dd>
		<dt>bundle host</dt>
		<dd>{data.appsHost || '(unset)'}</dd>
		<dt>frame-ancestors</dt>
		<dd>{data.appOrigin || "(unset, so 'none')"}</dd>
	</dl>

	<h2>The frame</h2>
	<p class="fdy-note">
		The real component the gallery will mount, against a real token. The page inside is
		deliberately hostile: it reports the result of every escape it attempts.
	</p>
	{#if data.configured}
		<AppFrame
			src={data.frameSrc}
			title="Foundry hostile probe"
			height="60vh"
			loading="eager"
			notice="sandbox=allow-scripts allow-modals allow-pointer-lock, and never allow-same-origin"
		/>
	{/if}

	<h2>What the framed bundle reports about itself</h2>
	<p class="fdy-note">
		Posted out of the frame, because nothing on this page can read into it. Untrusted text: a
		student's program wrote every one of these strings.
	</p>
	{#if Object.keys(framedProbe).length === 0}
		<p class="fdy-note">(nothing yet)</p>
	{:else}
		<ul class="fdy-probe">
			{#each Object.entries(framedProbe) as [name, verdict] (name)}
				<li><span class="fdy-probe-name">{name}</span> {verdict}</li>
			{/each}
		</ul>
	{/if}

	<h2>Refusals</h2>
	<p class="fdy-note">
		Open each in a tab to see the response, or drive them all from here for their statuses.
	</p>
	<button class="fdy-run tap-44" onclick={drive} disabled={running}>
		{running ? 'Driving...' : 'Drive every case'}
	</button>

	<table class="fdy-table">
		<thead>
			<tr><th>case</th><th>expected</th><th>measured</th><th>open</th></tr>
		</thead>
		<tbody>
			{#each data.cases as c (c.url + c.label)}
				<tr>
					<td>{c.label}</td>
					<td>{c.expect}</td>
					<td class="fdy-measured">{results[c.url] ?? '-'}</td>
					<td><a href={c.url} target="_blank" rel="noreferrer noopener">open</a></td>
				</tr>
			{/each}
		</tbody>
	</table>
</main>

<style>
	.fdy-dev {
		max-width: 68rem;
		margin: 0 auto;
		padding: var(--space-5, 1.5rem);
		min-width: 0;
	}

	h1,
	h2 {
		font-family: var(--font-display);
	}

	.fdy-note,
	.fdy-warn {
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}

	.fdy-warn {
		border: 1px solid var(--amber);
		border-radius: var(--radius-md, 8px);
		padding: var(--space-3, 0.75rem);
		color: var(--amber);
	}

	.fdy-facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.fdy-facts dt {
		color: var(--cyan);
	}

	.fdy-facts dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.fdy-run {
		font-family: var(--font-mono);
		background: var(--bg2);
		color: var(--white);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		padding: 0 var(--space-4, 1rem);
		cursor: pointer;
	}

	.fdy-table {
		width: 100%;
		border-collapse: collapse;
		margin-top: var(--space-4, 1rem);
		font-size: 0.85rem;
	}

	.fdy-table th,
	.fdy-table td {
		text-align: left;
		vertical-align: top;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--hairline);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.fdy-table th {
		font-family: var(--font-mono);
		color: var(--cyan);
	}

	.fdy-measured {
		font-family: var(--font-mono);
	}

	.fdy-probe {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		padding-left: 1.2rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.fdy-probe-name {
		color: var(--cyan);
	}
</style>
