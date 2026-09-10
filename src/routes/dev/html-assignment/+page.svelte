<script lang="ts">
	/**
	 * THE BOUNDARY HARNESS, AND ITS WHOLE JOB IS TO BE ATTACKED.
	 *
	 * It mounts the REAL `HtmlAssignmentFrame`, pointed at the REAL `/hx/` route,
	 * and renders what came back: every message the gate accepted, every message
	 * it dropped and why, and every containment probe the document inside the
	 * frame managed to run.
	 *
	 * THE SENTINEL IS THE SHARPEST PART OF IT. Before the frame is mounted this
	 * page writes `hx-parent-sentinel` into the PORTAL ORIGIN's `localStorage`,
	 * and the probe document tries to read it back. That turns a vague control
	 * ("storage is unavailable in there") into a specific one ("this document
	 * did not read a value the parent put there") -- and it is what makes the
	 * weakening demonstration unambiguous: grant `allow-same-origin` and the
	 * probe reports `REACHED: read PARENT-SECRET`, in words, on screen.
	 *
	 * `window.__hx` IS THE HARNESS HOOK the browser-verify `orderResult` checks
	 * read. It is a plain snapshot of what is already rendered -- a probe that
	 * had its own idea of the state would be measuring itself.
	 */
	import { onMount } from 'svelte';
	import HtmlAssignmentFrame from '$lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
	import { HX_SANDBOX_FLAGS, HX_SCHEMA_VERSION, hxExpectedOrigin } from '$lib/classroom/html-assignment/bridge.ts';

	let { data } = $props();

	/** The value the probe document tries to read out of the parent's store. A
	    REACHED report naming this string is the escape, in words. */
	const SENTINEL = 'PARENT-SECRET';

	type Accepted = { kind: string; detail: string };
	type Dropped = { reason: string; detail: string };

	let accepted = $state<Accepted[]>([]);
	let dropped = $state<Dropped[]>([]);
	let probes = $state<{ blockId: string; outcome: string }[]>([]);
	let reportedHeight = $state(0);
	let readySchema = $state<number | null>(null);
	let synthetic = $state<{ label: string; verdict: string }[]>([]);

	const src = $derived(`${data.sandboxOrigin}/hx/${data.docId}`);
	const expectedOrigin = $derived(hxExpectedOrigin(data.sandboxOrigin, HX_SANDBOX_FLAGS));

	/** A probe REACHED means the boundary leaked. This is the number the whole
	    lane is about, and it is rendered as a word beside the count so nobody has
	    to read a zero as good news by inference. */
	const reached = $derived(probes.filter((p) => p.outcome.startsWith('REACHED')));
	const refused = $derived(probes.filter((p) => p.outcome.startsWith('REFUSED')));

	/**
	 * THE DOCUMENT'S OWN ORIGIN IS REPORTED, NOT COUNTED. Reading your own origin
	 * is not an escape attempt, and an earlier draft ran it through the same
	 * REACHED/REFUSED helper as the four that are -- so the row read
	 * "REACHED: origin=null", filing the strongest evidence of containment under
	 * the word for its opposite. OPAQUE is what the sandbox holding looks like.
	 */
	const originProbe = $derived(probes.find((p) => p.blockId === 'hx-probe.origin')?.outcome ?? '');
	const originIsOpaque = $derived(originProbe.startsWith('OPAQUE'));

	/**
	 * TOP-LEVEL NAVIGATION, WHICH TAKES TWO ANSWERS BECAUSE BROWSERS GIVE TWO.
	 * Measured here, Chrome THROWS, so the document reports its own refusal and
	 * there is nothing to add. An engine that instead BLOCKED WITHOUT RAISING --
	 * which Chrome's own "Unsafe attempt to initiate navigation" console line is
	 * what that looks like -- would return normally and be indistinguishable from
	 * success to the document. Only the parent can settle that one: had the
	 * navigation been honoured, this page would BE example.com and there would be
	 * no snapshot to read.
	 */
	const topNav = $derived.by(() => {
		const outcome = probes.find((p) => p.blockId === 'hx-probe.topnav')?.outcome ?? '';
		if (outcome === '') return 'not reported';
		if (outcome.startsWith('REFUSED')) return `REFUSED by the browser (${outcome.slice(9)})`;
		if (typeof location === 'undefined') return 'cannot say';
		return location.pathname === '/dev/html-assignment'
			? 'REFUSED (blocked without raising; this page is still its own URL)'
			: 'THE FRAME NAVIGATED THE TOP-LEVEL PAGE';
	});

	function note(list: Accepted[], kind: string, detail: string) {
		return [...list, { kind, detail }];
	}

	onMount(() => {
		// Written before anything else so the frame, which loads after this
		// component mounts, always finds it there. A quota refusal is said out
		// loud rather than thrown -- a throw in here would take the harness down
		// and read as a broken boundary.
		try {
			localStorage.setItem('hx-parent-sentinel', SENTINEL);
		} catch (err) {
			synthetic = [
				...synthetic,
				{ label: 'parent sentinel', verdict: `NOT WRITTEN: ${(err as Error)?.name ?? 'error'}` }
			];
		}
	});

	$effect(() => {
		const snapshot = {
			accepted: accepted.map((a) => `${a.kind}:${a.detail}`),
			dropped: dropped.map((d) => `${d.reason}:${d.detail}`),
			droppedReasons: dropped.map((d) => d.reason),
			probes: probes.map((p) => `${p.blockId}=${p.outcome}`),
			reachedCount: reached.length,
			refusedCount: refused.length,
			originProbe,
			originIsOpaque,
			topNav,
			readySchema,
			reportedHeight,
			synthetic: synthetic.map((s) => `${s.label}:${s.verdict}`),
			expectedOrigin,
			sandboxFlags: HX_SANDBOX_FLAGS,
			src
		};
		(window as unknown as { __hx: unknown }).__hx = snapshot;
	});

	/**
	 * THE SYNTHETIC MESSAGES: the half of the origin rule no document can
	 * demonstrate about itself.
	 *
	 * A real frame cannot post from an origin it is not on, so "the parent drops
	 * a message from the wrong origin" needs an event the harness constructs.
	 * `MessageEvent`'s constructor takes both `origin` and `source`, so all four
	 * combinations are reachable -- including the POSITIVE CONTROL, which is what
	 * stops the three refusals passing vacuously. A listener that had simply
	 * stopped listening would refuse all four, and the positive control is the
	 * only thing that can tell that apart from the boundary working.
	 */
	function fireSynthetic() {
		const frameEl = document.querySelector('iframe[data-hx-frame]') as HTMLIFrameElement | null;
		const frameWindow = frameEl?.contentWindow ?? null;
		const goodField = Object.keys(data.fieldToBlockId)[0] ?? 'teamName';
		const cases: { label: string; origin: string; source: Window | null; data: unknown }[] = [
			{
				label: 'wrong origin, right source',
				origin: 'https://evil.example',
				source: frameWindow,
				data: { type: 'idea:change', field: goodField, value: 'forged from elsewhere' }
			},
			{
				label: 'right origin, no source',
				origin: expectedOrigin,
				source: null,
				data: { type: 'idea:change', field: goodField, value: 'forged with no window' }
			},
			{
				label: 'right origin, wrong source (this window)',
				origin: expectedOrigin,
				source: window,
				data: { type: 'idea:change', field: goodField, value: 'forged by the page itself' }
			},
			{
				label: 'POSITIVE CONTROL: right origin, right source',
				origin: expectedOrigin,
				source: frameWindow,
				data: { type: 'idea:change', field: goodField, value: 'synthetic but well formed' }
			}
		];

		const before = accepted.length;
		const results: { label: string; verdict: string }[] = [];
		for (const c of cases) {
			const seen = accepted.length;
			window.dispatchEvent(
				new MessageEvent('message', { origin: c.origin, source: c.source, data: c.data })
			);
			results.push({ label: c.label, verdict: accepted.length > seen ? 'ACCEPTED' : 'DROPPED' });
		}
		synthetic = [
			...synthetic,
			...results,
			{ label: 'net accepted by the four', verdict: String(accepted.length - before) }
		];
	}
</script>

<svelte:head><title>HTML assignment boundary harness</title></svelte:head>

<div class="harness">
	<header>
		<h1>HTML assignment boundary</h1>
		<p class="note">
			The REAL frame, pointed at the REAL <code>/hx/</code> route. Add
			<code>?doc=worksheet</code> for the ordinary document.
		</p>
		<dl>
			<dt>document</dt>
			<dd><code data-testid="doc">{data.docId}</code> of {data.documentIds.join(', ')}</dd>
			<dt>frame src</dt>
			<dd><code data-testid="src">{src}</code></dd>
			<dt>sandbox</dt>
			<dd><code data-testid="sandbox">{HX_SANDBOX_FLAGS}</code></dd>
			<dt>expected event.origin</dt>
			<dd><code data-testid="expected-origin">{expectedOrigin}</code></dd>
			<dt>schema</dt>
			<dd><code data-testid="schema">{HX_SCHEMA_VERSION}</code></dd>
			<dt>sandbox origin</dt>
			<dd>
				<code>{data.sandboxOrigin}</code>
				{#if !data.configuredSandboxOrigin}
					<span class="same-host">
						PUBLIC_HX_SANDBOX_ORIGIN is unset, so this is one host answering both
						roles. The source check is what separates the frame here.
					</span>
				{/if}
			</dd>
		</dl>
		<div class="h-buttons">
			<button type="button" class="btn tap-44" data-drive="synthetic" onclick={fireSynthetic}>
				Fire the four synthetic messages
			</button>
		</div>
	</header>

	<section class="panel" data-testid="verdict">
		<h2>Containment</h2>
		<p class="verdict" class:leaked={reached.length > 0} data-testid="containment">
			{refused.length} probe(s) refused, <strong data-testid="reached-count">{reached.length}</strong>
			reached out of the frame.
			{reached.length === 0 ? 'Nothing escaped.' : 'THE BOUNDARY LEAKED.'}
		</p>
		<p class="verdict" data-testid="topnav">top navigation: {topNav}</p>
		<p class="verdict" class:leaked={probes.length > 0 && !originIsOpaque} data-testid="origin-probe">
			the document's own origin: {originProbe || 'not reported'}
		</p>
		<ul class="results">
			<!--
				KEYED BY INDEX, NOT BY BLOCK ID. A probe field can legitimately be
				written twice -- the synthetic positive control below sends a change
				on one of them on purpose -- and a block-id key threw
				`each_key_duplicate`, which in Svelte 5 takes the WHOLE PAGE down.
				Measured: the containment panel, the counts and the synthetic results
				all disappeared at once, so the harness reported nothing rather than
				reporting a duplicate.
			-->
			{#each probes as probe, i (i)}
				<li data-probe-result={probe.blockId} class:leaked={probe.outcome.startsWith('REACHED')}>
					<code>{probe.blockId}</code> {probe.outcome}
				</li>
			{/each}
		</ul>
	</section>

	<section class="panel">
		<h2>Accepted <span class="count" data-testid="accepted-count">{accepted.length}</span></h2>
		<ul class="results">
			{#each accepted as item, i (i)}
				<li data-accepted><code>{item.kind}</code> {item.detail}</li>
			{/each}
		</ul>
	</section>

	<section class="panel">
		<h2>Dropped <span class="count" data-testid="dropped-count">{dropped.length}</span></h2>
		<p class="note">
			Each of these is a message the document sent and the parent refused. A
			<code>field</code> drop is a frame that named a block id, or a field no
			block declares.
		</p>
		<ul class="results">
			{#each dropped as item, i (i)}
				<li data-dropped={item.reason}><code>{item.reason}</code> {item.detail}</li>
			{/each}
		</ul>
	</section>

	<section class="panel">
		<h2>Synthetic messages <span class="count" data-testid="synthetic-count">{synthetic.length}</span></h2>
		<ul class="results">
			{#each synthetic as item, i (i)}
				<li data-synthetic><code>{item.verdict}</code> {item.label}</li>
			{/each}
		</ul>
	</section>

	<HtmlAssignmentFrame
		{src}
		title="Ported HTML assignment"
		fieldToBlockId={data.fieldToBlockId}
		values={{ teamName: 'Seeded from the parent' }}
		readOnly={false}
		minHeight={240}
		onready={(v) => {
			readySchema = v;
			accepted = note(accepted, 'ready', `schemaVersion ${v}`);
		}}
		onchange={(c) => {
			accepted = note(accepted, 'change', `${c.blockId} = ${String(c.value).slice(0, 80)}`);
			if (c.blockId.startsWith('hx-probe.')) {
				probes = [...probes, { blockId: c.blockId, outcome: String(c.value) }];
			}
		}}
		onimage={(im) => {
			accepted = note(accepted, 'image', `${im.blockId} ${im.name}`);
		}}
		onheight={(px) => {
			reportedHeight = px;
			accepted = note(accepted, 'height', `${px}px`);
		}}
		ondropped={(d) => {
			dropped = [...dropped, { reason: d.reason, detail: d.detail }];
		}}
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

	h2 {
		margin: 0 0 0.4rem;
		font-size: 1rem;
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
		margin: 0 0 var(--space-3, 0.75rem);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	dt {
		color: var(--text-2, var(--dim));
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
		min-width: 0;
	}

	.same-host {
		display: block;
		color: var(--text-2, var(--dim));
	}

	.panel {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		padding: var(--space-3, 0.75rem);
		min-width: 0;
	}

	.count {
		font-family: var(--font-mono);
		color: var(--text-2, var(--dim));
	}

	.results {
		margin: 0;
		padding-left: 1.1rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}

	.verdict {
		margin: 0 0 var(--space-2, 0.5rem);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-1, var(--white));
	}

	/* Colour is never the only signal: a leak also says THE BOUNDARY LEAKED in
	   words, and every leaked row keeps its REACHED prefix. */
	.verdict.leaked,
	li.leaked {
		color: var(--crimson);
		font-weight: 700;
	}

	.h-buttons {
		display: flex;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
	}
</style>
