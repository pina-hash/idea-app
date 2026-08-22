<script lang="ts">
	import { page } from '$app/state';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
	import { describeBuild, FEEDBACK_EXCLUSIONS } from '$lib/feedback/context';
	import { submitAnonymousFeedback } from '$lib/feedback/feedback';
	import type { FeedbackEntry, FeedbackRow, FeedbackStatus } from '$lib/feedback/feedback';

	/**
	 * THE HARNESS MOUNTS THE REAL THING, never a copy: SiteFeedback, the
	 * FeedbackBox behind it and the FeedbackConsole are the same components the
	 * shell, the deck bar and /classroom/feedback mount. Only the transport
	 * differs, which is the whole point of injecting it.
	 *
	 * What it exists to make drivable with no backend:
	 * - the capture (open the box, send, read the meta the row carries);
	 * - the two failure kinds, which behave DIFFERENTLY now: a refusal is
	 *   reported once, a network failure backs off and retries;
	 * - the exclusion registry, per category, with a positive control beside it;
	 * - the console's filters and both exports, on the same rows.
	 *
	 * THE ANONYMOUS LANE IS NOT SIMULATED. Everything above runs against an
	 * in-memory sink; the signed-out lane below posts to the REAL
	 * /api/feedback through the REAL `submitAnonymousFeedback`, because the
	 * three things worth driving there are all on the far side of that fetch:
	 * that the body cap answers as a REFUSAL rather than a retryable failure,
	 * that the refusal is reported ONCE, and that no second request is made.
	 * A stubbed transport would prove none of them. The attempt counter beside
	 * it wraps `fetch` itself, so "no retry" is a measurement rather than a
	 * reading of the indicator.
	 */
	const build = describeBuild({ sha: 'a1b2c3d', complete: true }, '1755735000000');
	const buildFallback = describeBuild(null, '1755735000000');

	let mode = $state<'ok' | 'refusal' | 'network'>('ok');
	let sink = $state<FeedbackRow[]>(seedRows());
	let seq = 0;

	/**
	 * Hostile and ordinary rows side by side, so the console's rendering of an
	 * authorless report is drivable with nothing sent. The two markup fixtures
	 * are the browser-side half of tests/feedback-untrusted-render.test.ts: a
	 * public write feeding an admin screen is the exact shape that property
	 * exists to defeat, and it should be visible as text on the page, not only
	 * green in a test run.
	 */
	function seedRows(): FeedbackRow[] {
		const base = {
			app: 'portal',
			context: '/',
			kind: 'bug' as const,
			meta: { route: '/', path: '/', viewport: '1440x900' },
			status: 'new' as const,
			created_at: '2026-08-21T09:02:00.000Z',
			reviewed_at: null,
			reviewed_by: null
		};
		return [
			{
				...base,
				id: 'seed-anon-contact',
				message: 'Sign in bounces me back to the home page every time.',
				anonymous: true,
				contact: 'ask me in 4th period',
				submitter_name: null,
				submitter_email: null
			},
			{
				...base,
				id: 'seed-anon-bare',
				message: 'The QR code on the handout goes nowhere.',
				anonymous: true,
				contact: null,
				submitter_name: null,
				submitter_email: null
			},
			{
				...base,
				id: 'seed-anon-hostile',
				message:
					'<script>alert(1)<\/script><img src=x onerror=alert(1)><b>bold</b> and a <a href="javascript:alert(1)">link</a>',
				anonymous: true,
				contact: '<script>alert(2)<\/script><b>me</b>',
				submitter_name: null,
				submitter_email: null
			},
			{
				...base,
				id: 'seed-signed',
				message: 'The notebook plate switch is hard to hit on a phone.',
				anonymous: false,
				contact: null,
				submitter_name: 'Harness User',
				submitter_email: 'harness@boscotech.net'
			}
		];
	}

	/**
	 * THE REAL ROUTE, COUNTED. `attempts` wraps fetch rather than reading the
	 * save indicator, so "reported once, no retry" is measured at the transport.
	 */
	let attempts = $state(0);
	let lastOutcome = $state<string | null>(null);
	const countingFetch: typeof fetch = (input, init) => {
		attempts += 1;
		return fetch(input, init);
	};

	async function realAnonymous(entry: FeedbackEntry) {
		const res = await submitAnonymousFeedback(entry, countingFetch);
		lastOutcome = res.error
			? `refused/failed: ${res.error} (retryable: ${res.retryable})`
			: 'accepted by the route';
		return res;
	}

	/**
	 * The same real path with a meta blob past FEEDBACK_MAX_BODY_BYTES, which is
	 * the only honest way to reach the cap from a browser: the message field is
	 * capped at 2000 characters by the box itself, so the body can only be
	 * pushed over 16 KB by the captured context.
	 */
	const oversized = (entry: FeedbackEntry) =>
		realAnonymous({ ...entry, meta: { ...(entry.meta ?? {}), pad: 'x'.repeat(24_000) } });

	const submit = async (entry: FeedbackEntry) => {
		await new Promise((r) => setTimeout(r, 180));
		if (mode === 'refusal')
			return { error: 'Simulated refusal: the database rejected that row.', retryable: false };
		if (mode === 'network')
			return { error: 'Simulated network failure.', retryable: true };
		seq += 1;
		sink = [
			{
				id: `f-${seq}`,
				app: entry.app,
				context: entry.context ?? null,
				kind: entry.kind,
				message: entry.message,
				meta: (entry.meta ?? {}) as Record<string, unknown>,
				status: 'new',
				created_at: new Date().toISOString(),
				reviewed_at: null,
				reviewed_by: null,
				submitter_name: 'Harness User',
				submitter_email: 'harness@boscotech.net'
			},
			...sink
		];
		return { error: null, retryable: false };
	};

	const setStatus = async (id: string, status: FeedbackStatus) => {
		sink = sink.map((r) =>
			r.id === id ? { ...r, status, reviewed_at: new Date().toISOString(), reviewed_by: 'harness' } : r
		);
		return { ok: true };
	};

	/**
	 * Every excluded category, driven at `place="shell"` (nothing renders) and
	 * again at `place="relocated"` (the same component does render).
	 *
	 * A rule with no samples is not a rule with no case: the `error` category is
	 * asked for with the status flag rather than by route, so it is driven that
	 * way here instead of quietly dropping out of the table.
	 */
	const cases = FEEDBACK_EXCLUSIONS.flatMap((rule) =>
		rule.samples.length
			? rule.samples.map((routeId) => ({ rule, routeId, status: null as number | null }))
			: [{ rule, routeId: '/notebook', status: 500 as number | null }]
	);

	let view = $state<'capture' | 'exclusions' | 'console'>('capture');
</script>

<svelte:head><title>Feedback harness // dev</title></svelte:head>

<main class="hx">
	<h1>Report affordance harness</h1>
	<p class="hx-lead">
		The real SiteFeedback, FeedbackBox and FeedbackConsole against one in-memory sink. The
		floating control at the bottom right of this page is the SHELL's, mounted by the root layout,
		not by anything here.
	</p>

	<div class="hx-row">
		{#each ['capture', 'exclusions', 'console'] as v (v)}
			<button class="hx-btn" class:on={view === v} onclick={() => (view = v as typeof view)}>
				{v}
			</button>
		{/each}
	</div>

	{#if view === 'capture'}
		<section class="hx-card">
			<h2>Transport</h2>
			<div class="hx-row">
				{#each [{ id: 'ok' as const, label: 'writes land' }, { id: 'refusal' as const, label: 'REFUSED (reported once, no retry)' }, { id: 'network' as const, label: 'network FAILS (backs off, retries)' }] as m (m.id)}
					<button class="hx-btn" class:on={mode === m.id} onclick={() => (mode = m.id)}>
						{m.label}
					</button>
				{/each}
			</div>
		</section>

		<section class="hx-card">
			<h2>Relocated placement</h2>
			<p class="hx-note">
				What the deck bar, the GAUNTLET footer and the error boundary mount. Same component,
				same box, no floating position.
			</p>
			<div class="hx-row">
				<SiteFeedback
					place="relocated"
					routeId="/dev/feedback"
					pathname="/dev/feedback"
					role="teacher"
					sectionId="s-1"
					{build}
					{submit}
				/>
				<SiteFeedback
					place="relocated"
					routeId="/dev/feedback"
					pathname="/dev/feedback"
					role="student"
					{build}
					{submit}
					status={500}
					errorMessage="Harness: this load fails on purpose."
					errorId="00000000-0000-4000-8000-000000000000"
					label="Report this 500"
				/>
			</div>
			<p class="hx-note">
				No transport, so no control renders here (absence is the mechanism, not a disabled
				button):
				<span class="hx-slot"
					><SiteFeedback
						place="relocated"
						routeId="/dev/feedback"
						pathname="/dev/feedback"
						{build}
						submit={null}
					/></span
				>
			</p>
		</section>

		<section class="hx-card">
			<h2>Signed out: the REAL /api/feedback</h2>
			<p class="hx-note">
				These two post to the real route. Locally there is no
				SUPABASE_SERVICE_ROLE_KEY, so an ordinary send comes back
				<code>not_configured</code>; the oversized one is refused by the body cap before
				the key is ever read. Both are REFUSALS: reported once, never retried, which the
				attempt counter is here to show.
			</p>
			<div class="hx-row">
				<SiteFeedback
					place="relocated"
					routeId="/"
					pathname="/"
					{build}
					anonymous
					submit={realAnonymous}
					label="Report (signed out, real route)"
				/>
				<SiteFeedback
					place="relocated"
					routeId="/"
					pathname="/"
					{build}
					anonymous
					submit={oversized}
					label="Report with an oversized body"
				/>
				<button class="hx-btn" onclick={() => { attempts = 0; lastOutcome = null; }}>
					reset counter
				</button>
			</div>
			<dl class="hx-facts">
				<div><dt>fetch attempts</dt><dd data-testid="attempts">{attempts}</dd></div>
				<div><dt>last outcome</dt><dd data-testid="outcome">{lastOutcome ?? 'nothing sent yet'}</dd></div>
			</dl>
		</section>

		<section class="hx-card">
			<h2>Build identifier, both sources</h2>
			<dl class="hx-facts">
				<div><dt>git commit present</dt><dd>{build.source} &middot; {build.value}</dd></div>
				<div><dt>means</dt><dd>{build.means}</dd></div>
				<div>
					<dt>no git commit</dt>
					<dd>{buildFallback.source} &middot; {buildFallback.value}</dd>
				</div>
				<div><dt>means</dt><dd>{buildFallback.means}</dd></div>
			</dl>
		</section>

		<section class="hx-card">
			<h2>What landed ({sink.length})</h2>
			{#if sink.length === 0}
				<p class="hx-note">Nothing yet. Send one above.</p>
			{:else}
				<pre class="hx-pre">{JSON.stringify(sink[0].meta, null, 2)}</pre>
			{/if}
		</section>

		<section class="hx-card">
			<h2>Error boundary</h2>
			<p class="hx-note">
				These navigate to a load that really fails, so the root +error.svelte renders for real.
			</p>
			<div class="hx-row">
				<a class="hx-btn" href="/dev/feedback/boom">throw a 500</a>
				<a class="hx-btn" href="/dev/feedback/boom?raw=1">throw an unexpected error</a>
				<a class="hx-btn" href="/dev/feedback/nope">a 404</a>
			</div>
		</section>
	{:else if view === 'exclusions'}
		<section class="hx-card">
			<h2>Exclusions, by category ({cases.length} cases)</h2>
			<p class="hx-note">
				Left column is <code>place="shell"</code>: an excluded route renders nothing. Right column
				is <code>place="relocated"</code>, the SAME component, which is the positive control that
				this test can see the affordance when it should be present.
			</p>
			<table class="hx-table">
				<thead>
					<tr><th>category</th><th>route id</th><th>shell</th><th>relocated</th></tr>
				</thead>
				<tbody>
					{#each cases as c (c.rule.id + c.routeId)}
						<tr>
							<td>{c.rule.id}</td>
							<td><code>{c.routeId}</code></td>
							<td class="hx-cell">
								<SiteFeedback
									place="shell"
									routeId={c.routeId}
									pathname={c.routeId}
									{build}
									{submit}
									status={c.status}
								/>
							</td>
							<td class="hx-cell">
								<SiteFeedback
									place="relocated"
									routeId={c.routeId}
									pathname={c.routeId}
									{build}
									{submit}
									status={c.status}
								/>
							</td>
						</tr>
					{/each}
					<tr>
						<td>none (control)</td>
						<td><code>/notebook</code></td>
						<td class="hx-cell">
							<SiteFeedback
								place="shell"
								routeId="/notebook"
								pathname="/notebook"
								{build}
								{submit}
							/>
						</td>
						<td class="hx-cell">
							<SiteFeedback
								place="relocated"
								routeId="/notebook"
								pathname="/notebook"
								{build}
								{submit}
							/>
						</td>
					</tr>
				</tbody>
			</table>
		</section>
	{:else}
		<div class="cr-root">
			<FeedbackConsole rows={sink} {setStatus} />
		</div>
	{/if}

	<p class="hx-note">Current route id: <code>{page.route.id}</code></p>
</main>

<style>
	.hx {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem 1.2rem 6rem;
	}
	.hx-lead {
		color: var(--dim);
		max-width: 46rem;
	}
	.hx-card {
		border: 1px solid var(--hairline, rgba(120, 200, 140, 0.2));
		border-radius: var(--radius-sm, 4px);
		padding: 1rem;
		margin-bottom: 1rem;
	}
	.hx-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.6rem;
	}
	.hx-btn {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0 0.9rem;
		background: transparent;
		border: 1px solid var(--dim);
		border-radius: var(--radius-sm, 4px);
		color: var(--white);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-decoration: none;
		cursor: pointer;
	}
	.hx-btn.on {
		color: var(--green);
		border-color: var(--green);
	}
	.hx-note {
		color: var(--dim);
		font-size: 0.85rem;
	}
	.hx-slot {
		display: inline-flex;
		min-width: 2rem;
	}
	.hx-pre {
		background: var(--bg1, #06120a);
		padding: 0.7rem;
		overflow-x: auto;
		font-size: 0.72rem;
	}
	.hx-facts {
		display: grid;
		gap: 0.3rem;
		font-size: 0.8rem;
	}
	.hx-facts div {
		display: flex;
		gap: 0.7rem;
	}
	.hx-facts dt {
		min-width: 11rem;
		color: var(--dim);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}
	.hx-facts dd {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.hx-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}
	.hx-table th,
	.hx-table td {
		border-bottom: 1px solid var(--hairline, rgba(120, 200, 140, 0.2));
		padding: 0.4rem 0.5rem;
		text-align: left;
		vertical-align: middle;
	}
	.hx-cell {
		min-width: 12rem;
	}
</style>
