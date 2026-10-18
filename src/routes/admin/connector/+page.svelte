<script lang="ts">
	/**
	 * The connector's admin page: the switch, every connection, and the log of
	 * every change made through Claude. Rendered under the site plate (it is
	 * under /admin), so keys are raised plate keys and chips are recessed tags.
	 */
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let armOff = $state(false);
	let armAll = $state(false);

	const live = $derived(data.ready ? data.state.connections.filter((c) => !c.revoked_at) : []);
	const past = $derived(data.ready ? data.state.connections.filter((c) => c.revoked_at) : []);
	const tools = $derived([...new Set(data.audit.map((a) => a.tool))].sort());

	const when = (iso: string | null) =>
		iso
			? new Date(iso).toLocaleString('en-US', {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
					timeZone: 'America/Los_Angeles'
				})
			: 'never';

	let requestView = $state<'all' | 'failed' | 'new'>('all');
	const requests = $derived(data.evals ?? []);
	const failedCount = $derived(requests.filter((r) => r.last_run && !r.last_run.passed).length);
	const newCount = $derived(requests.filter((r) => r.source === 'request').length);
	const shownRequests = $derived(
		requestView === 'failed'
			? requests.filter((r) => r.last_run && !r.last_run.passed)
			: requestView === 'new'
				? requests.filter((r) => r.source === 'request')
				: requests
	);
	const LEVEL_WORDS: Record<string, string> = { read: 'Read', undo: 'Runs', confirm: 'Asks first', refuse: 'Refuses or asks' };

	/** The whole list as JSON, for tools/connector/evals/export.mjs --json to rewrite EVALS.md from. */
	function downloadRequests() {
		const blob = new Blob([JSON.stringify(requests, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `connector-requests-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	function argsLine(args: Record<string, unknown>): string {
		return Object.entries(args)
			.filter(([k]) => !['p_document', 'p_manifest', 'p_body_doc'].includes(k))
			.map(([k, v]) => `${k.replace(/^p_/, '').replace(/_/g, ' ')}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
			.join(' · ')
			.slice(0, 220);
	}
</script>

<svelte:head><title>Connector // IDEA</title></svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/dashboard">&lsaquo; Admin console</a>
		<ProfileMenu />
	</div>
</div>

<main class="cx-page" data-testid="connector-admin">
	<section class="hero">
		<div class="eyebrow">Admin console</div>
		<h1>IDEA Website connector</h1>
		<p class="cx-lede">Claude acting as you on this site, from any chat. Every change it makes is listed below.</p>
	</section>

	{#if form?.message}
		<p class="cx-note" role="status" data-testid="connector-admin-note">{form.message}</p>
	{/if}

	{#if !data.ready}
		<section class="card cx-card"><p>The connector is not available on this database yet.</p></section>
	{:else}
		<div class="cx-top">
			<section class="card cx-card" aria-labelledby="cx-switch">
				<h2 id="cx-switch" class="section-label">Switch</h2>
				<p class="cx-state" data-testid="connector-enabled">
					<span class="cx-lamp" class:on={data.state.enabled} aria-hidden="true"></span>
					{data.state.enabled ? 'On' : 'Off'}
				</p>
				<p class="cx-small">
					{data.state.enabled
						? 'Connections work. Switching off makes every one of them answer signed out until it is back on.'
						: 'Every connection answers signed out. Nothing is disconnected; switching on brings them all back.'}
					{#if data.state.updated_by}<br />Last changed {when(data.state.updated_at)} by {data.state.updated_by}.{/if}
				</p>
				<form method="POST" action="?/enabled" class="cx-row">
					{#if data.state.enabled}
						{#if armOff}
							<input type="hidden" name="enabled" value="false" />
							<button class="btn danger" type="submit" data-testid="connector-off-confirm">Switch off for everyone</button>
							<button class="btn secondary" type="button" onclick={() => (armOff = false)}>Keep it on</button>
						{:else}
							<button class="btn secondary" type="button" onclick={() => (armOff = true)} data-testid="connector-off">Switch off</button>
						{/if}
					{:else}
						<input type="hidden" name="enabled" value="true" />
						<button class="btn" type="submit" data-testid="connector-on">Switch on</button>
					{/if}
				</form>
			</section>

			<section class="card cx-card" aria-labelledby="cx-add">
				<h2 id="cx-add" class="section-label">Add it to Claude</h2>
				<ol class="cx-steps">
					<li>Open claude.ai, Settings, Connectors.</li>
					<li>Add custom connector. Name it IDEA Website; the address is <code>https://ideabosco.com/mcp</code>. Leave the other fields blank.</li>
					<li>Press Connect, sign in here if asked, then Connect on the card.</li>
					<li>For the nightly replay, do the same once more: name it IDEA Website (practice), address <code>https://ideabosco.com/mcp/practice</code>. Nothing is ever written through it.</li>
				</ol>
			</section>
		</div>

		<section class="card cx-card" aria-labelledby="cx-conn">
			<div class="cx-head">
				<h2 id="cx-conn" class="section-label">Connections <span class="cx-count">{live.length}</span></h2>
				{#if live.length > 0}
					<form method="POST" action="?/disconnectAll" class="cx-row">
						{#if armAll}
							<button class="btn danger" type="submit" data-testid="connector-all-confirm">Disconnect all {live.length}</button>
							<button class="btn secondary" type="button" onclick={() => (armAll = false)}>Cancel</button>
						{:else}
							<button class="btn secondary" type="button" onclick={() => (armAll = true)} data-testid="connector-all">Disconnect all</button>
						{/if}
					</form>
				{/if}
			</div>
			{#if live.length === 0}
				<p class="cx-small">Nothing is connected.</p>
			{:else}
				<ul class="cx-list" data-testid="connector-connections">
					{#each live as c (c.id)}
						<li class="cx-conn">
							<div class="cx-conn-main">
								<span class="cx-conn-label">{c.label}</span>
								<span class="cx-small">{c.email} · connected {when(c.created_at)} · last used {when(c.last_used_at)}</span>
							</div>
							<form method="POST" action="?/disconnect">
								<input type="hidden" name="id" value={c.id} />
								<button class="btn secondary" type="submit">Disconnect</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
			{#if past.length > 0}
				<p class="cx-small">{past.length} earlier {past.length === 1 ? 'connection was' : 'connections were'} disconnected.</p>
			{/if}
		</section>

		<section class="card cx-card" aria-labelledby="cx-requests" data-testid="connector-requests">
			<div class="cx-head">
				<h2 id="cx-requests" class="section-label">Requests <span class="cx-count">{requests.length}</span></h2>
				{#if data.evals}
					<div class="cx-row" role="group" aria-label="Which requests">
						<button type="button" class="btn secondary" class:on={requestView === 'all'} aria-pressed={requestView === 'all'} onclick={() => (requestView = 'all')}>All</button>
						<button type="button" class="btn secondary" class:on={requestView === 'failed'} aria-pressed={requestView === 'failed'} onclick={() => (requestView = 'failed')}>
							Failed last replay <span class="cx-count">{failedCount}</span>
						</button>
						<button type="button" class="btn secondary" class:on={requestView === 'new'} aria-pressed={requestView === 'new'} onclick={() => (requestView = 'new')}>
							Added from your requests <span class="cx-count">{newCount}</span>
						</button>
						<button type="button" class="btn secondary" onclick={downloadRequests} data-testid="connector-requests-download">Download the list</button>
					</div>
				{/if}
			</div>
			{#if !data.evals}
				<p class="cx-small">The saved requests arrive with the next database update.</p>
			{:else}
				<p class="cx-small">
					Everything you have asked Claude here, saved so the practice connector can replay it each night. Each shows its last
					replay: whether it did what the list says must happen.
				</p>
				{#if shownRequests.length === 0}
					<p class="cx-small">None {requestView === 'failed' ? 'failed' : 'here'}.</p>
				{:else}
					<ul class="cx-list cx-log" data-testid="connector-request-list">
						{#each shownRequests as r (r.seq)}
							<li class="cx-entry">
								<Disclosure label={`#${r.seq} ${r.said}`} collapseWhen={true} showWord="Details" hideWord="Hide">
									{#snippet meta()}
										<span class="cx-tag">{LEVEL_WORDS[r.level] ?? r.level}</span>
										<span class="cx-tag" class:bad={r.last_run !== null && !r.last_run.passed} class:good={r.last_run?.passed === true}>
											{r.last_run === null ? 'Not replayed' : r.last_run.passed ? 'Passed' : 'Failed'}
										</span>
									{/snippet}
									<div class="cx-detail">
										{#if r.must_happen}<p><span class="section-label">Must happen</span> {r.must_happen}</p>{/if}
										<p class="cx-small">
											Expected: {r.expected_path.length ? r.expected_path.map((t) => t.replace(/^site_call:/, '').replace(/_/g, ' ')).join(', then ') : 'no tool'}
											· asked {r.requests} {r.requests === 1 ? 'time' : 'times'}{r.last_request_at ? `, last ${when(r.last_request_at)}` : ''}
											{#if r.last_run}· last replay {when(r.last_run.run_at)}{r.last_run.model ? ` on ${r.last_run.model}` : ''}{/if}
											{#if r.open_gaps}· {r.open_gaps} open {r.open_gaps === 1 ? 'gap' : 'gaps'}{/if}
										</p>
										{#if r.last_run && !r.last_run.passed && r.last_run.detail?.note}
											<p class="cx-err">{String(r.last_run.detail.note)}</p>
										{/if}
										{#if r.proof_query}
											<p class="section-label">Proof, read-only, in the SQL editor</p>
											<pre class="cx-pre">{r.proof_query}</pre>
										{/if}
									</div>
								</Disclosure>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>

		<section class="card cx-card" aria-labelledby="cx-log">
			<div class="cx-head">
				<h2 id="cx-log" class="section-label">Changes made through Claude</h2>
				<form method="GET" class="cx-row cx-filter">
					<label>
						<span class="cx-small">Tool</span>
						<select name="tool" value={data.tool ?? ''}>
							<option value="">All tools</option>
							{#each tools as t (t)}<option value={t}>{t.replace(/_/g, ' ')}</option>{/each}
							{#if data.tool && !tools.includes(data.tool)}<option value={data.tool}>{data.tool}</option>{/if}
						</select>
					</label>
					<label>
						<span class="cx-small">Day</span>
						<input type="date" name="day" value={data.day ?? ''} />
					</label>
					<button class="btn secondary" type="submit">Show</button>
					{#if data.tool || data.day}<a class="btn secondary" href="/admin/connector">Clear</a>{/if}
				</form>
			</div>
			{#if data.audit.length === 0}
				<p class="cx-small">No changes {data.tool || data.day ? 'match that filter' : 'have been made through Claude yet'}.</p>
			{:else}
				<ul class="cx-list cx-log" data-testid="connector-audit">
					{#each data.audit as a (a.id)}
						<li class="cx-entry">
							<Disclosure label={`${a.tool.replace(/_/g, ' ')}, ${when(a.started_at)}`} collapseWhen={true} showWord="Details" hideWord="Hide">
								{#snippet meta()}
									<span class="cx-tag" class:bad={a.status === 'failed'}>{a.status === 'failed' ? 'Failed' : a.undone_by ? 'Undone' : a.undo_of ? 'Undo' : a.level === 'confirm' ? 'Asked first' : 'Done'}</span>
								{/snippet}
								<div class="cx-detail">
									<p class="cx-small">{a.email} · {a.function_name.replace(/_/g, ' ')} · {argsLine(a.args)}</p>
									{#if a.error}<p class="cx-err">{a.error}</p>{/if}
									{#if a.rows_written.length > 0}
										<p class="section-label">Rows written</p>
										<ul class="cx-rows">
											{#each a.rows_written as r, i (i)}
												<li><code>{r.table}</code> {r.id ?? ''}</li>
											{/each}
										</ul>
									{/if}
									<p class="section-label">Arguments</p>
									<pre class="cx-pre">{JSON.stringify(a.args, null, 2).slice(0, 4000)}</pre>
								</div>
							</Disclosure>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<footer class="cx-footer"><VersionBadge app="portal" /></footer>
</main>

<style>
	.cx-page {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1rem 3rem;
	}
	.cx-lede {
		color: var(--text-2);
		margin: 0.3rem 0 0;
	}
	.cx-top {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(22rem, 100%), 1fr));
		gap: 1rem;
	}
	.cx-card {
		padding: 1.1rem 1.2rem;
		margin: 0 0 1rem;
		min-width: 0;
	}
	.cx-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.cx-head h2,
	.cx-card h2 {
		margin: 0 0 0.6rem;
	}
	.cx-count {
		margin-left: 0.4rem;
		color: var(--text-2);
	}
	.cx-state {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-family: var(--font-mono);
		font-size: 1.4rem;
		margin: 0 0 0.4rem;
	}
	.cx-lamp {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
		background: var(--text-3);
		box-shadow: inset 0 0 0 1px var(--boundary);
	}
	.cx-lamp.on {
		background: var(--green);
		box-shadow: 0 0 8px 1px color-mix(in srgb, var(--green) 55%, transparent);
	}
	.cx-small {
		color: var(--text-2);
		font-size: 0.92rem;
		margin: 0 0 0.6rem;
	}
	.cx-note {
		margin: 0 0 1rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: 0.6rem;
	}
	.cx-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: end;
	}
	.cx-row .btn {
		min-height: 44px;
	}
	.cx-filter label {
		display: grid;
		gap: 0.2rem;
	}
	.cx-filter select,
	.cx-filter input {
		min-height: 44px;
	}
	.cx-steps {
		margin: 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 0.4rem;
		line-height: 1.4;
	}
	.cx-steps code {
		overflow-wrap: anywhere;
	}
	.cx-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.cx-conn {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.6rem 0;
		border-top: 1px solid var(--hairline);
	}
	.cx-conn-main {
		display: grid;
		min-width: 0;
	}
	.cx-conn-label {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.cx-conn .cx-small {
		margin: 0;
	}
	.cx-entry {
		border-top: 1px solid var(--hairline);
		padding-top: 0.3rem;
	}
	.cx-tag {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border-radius: 0.4rem;
		border: 1px solid var(--boundary);
		color: var(--text-2);
	}
	.cx-tag.bad {
		color: var(--amber);
	}
	.cx-tag.good {
		color: var(--green);
	}
	.cx-detail {
		padding: 0.3rem 0 0.6rem;
		min-width: 0;
	}
	.cx-err {
		color: var(--amber);
		margin: 0 0 0.5rem;
	}
	.cx-rows {
		margin: 0 0 0.6rem;
		padding-left: 1.1rem;
	}
	.cx-pre {
		margin: 0;
		padding: 0.6rem;
		max-height: 18rem;
		overflow: auto;
		border: 1px solid var(--hairline);
		border-radius: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.cx-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
