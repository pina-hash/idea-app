<script lang="ts">
	import { onMount } from 'svelte';
	import ported from './idea100-blade-01.ported.html?raw';
	import { HX_SANDBOX_FLAGS } from '$lib/classroom/html-assignment/bridge.ts';

	/**
	 * THE CONTRACT'S CSP, VERBATIM, MINUS THE ONE DIRECTIVE A META TAG CANNOT
	 * CARRY. `frame-ancestors` is ignored in a `<meta http-equiv>` policy by
	 * specification, so it is left out rather than written down in a form that
	 * silently does nothing. Everything else is exactly what the served document
	 * is contracted to carry, and applying it here is how this harness measures
	 * what the policy costs a real document.
	 */
	const CONTRACT_CSP = [
		"default-src 'none'",
		"script-src 'unsafe-inline'",
		"style-src 'unsafe-inline'",
		'img-src data: blob:',
		"connect-src 'none'",
		"form-action 'none'"
	].join('; ');

	type LogRow = { n: number; dir: 'in' | 'out'; text: string };

	let applyCsp = $state(true);
	let readOnly = $state(false);
	let log = $state<LogRow[]>([]);
	let frame = $state<HTMLIFrameElement | null>(null);
	let src = $state('');
	let seq = 0;

	/**
	 * The whole point of the log is that it is VERBATIM. A pretty-printer that
	 * reshaped a message would be this harness agreeing with itself about the
	 * contract instead of reporting what crossed the bridge, so an image's base64
	 * is elided by LENGTH and nothing else is touched.
	 */
	function record(dir: 'in' | 'out', msg: unknown) {
		const shown =
			msg && typeof msg === 'object' && 'bytes' in (msg as Record<string, unknown>)
				? { ...(msg as Record<string, unknown>), bytes: `<${String((msg as { bytes: string }).bytes).length} base64 chars>` }
				: msg;
		log = [...log, { n: ++seq, dir, text: JSON.stringify(shown) }];
	}

	function send(msg: Record<string, unknown>) {
		record('out', msg);
		frame?.contentWindow?.postMessage(msg, '*');
	}

	function build() {
		let html = ported;
		if (applyCsp) {
			html = html.replace(
				'<meta charset="UTF-8">',
				`<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="${CONTRACT_CSP}">`
			);
		}
		if (src) URL.revokeObjectURL(src);
		src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
		log = [];
		seq = 0;
	}

	onMount(() => {
		const onMessage = (e: MessageEvent) => {
			if (!frame || e.source !== frame.contentWindow) return;
			record('in', e.data);
			const m = e.data as { type?: string };
			// The stub answers `idea:ready` with an EMPTY state, which is what a
			// student opening the assignment for the first time gets.
			if (m?.type === 'idea:ready') send({ type: 'idea:state', values: {}, readOnly });
			if (m?.type === 'idea:change' || m?.type === 'idea:image') {
				send({ type: 'idea:saved', at: new Date().toISOString(), ok: true });
			}
		};
		window.addEventListener('message', onMessage);
		build();
		return () => {
			window.removeEventListener('message', onMessage);
			if (src) URL.revokeObjectURL(src);
		};
	});
</script>

<svelte:head><title>Dev: HTML assignment port fixture</title></svelte:head>

<div class="harness">
	<header>
		<h1>idea100-blade-01, ported</h1>
		<p>
			A stub bridge listener answering a real <code>sandbox="{HX_SANDBOX_FLAGS}"</code> frame over a
			<code>blob:</code> URL, which is an opaque origin. Nothing here writes to a database.
		</p>
		<div class="controls">
			<label><input type="checkbox" bind:checked={applyCsp} onchange={build} /> Apply the contract CSP</label>
			<label><input type="checkbox" bind:checked={readOnly} /> Answer <code>idea:ready</code> with readOnly</label>
			<button type="button" onclick={build}>Reload frame</button>
		</div>
	</header>

	<div class="split">
		<section class="doc">
			{#if src}
				<!--
					THE REAL FRAME'S OWN FLAGS, NOT A SECOND SPELLING OF THEM. This used to
					be the literal `sandbox="allow-scripts"`, which was green and STRICTER
					than `HtmlAssignmentFrame`, so it failed safe and said nothing when the
					constant was widened with the two popup flags. A harness that frames a
					document under a different sandbox from the one the portal uses is a
					harness measuring something nobody ships. The RULE about which flags
					may be in that string lives on the constant, in
					`tests/html-assignment-bridge.test.ts`.
				-->
				<iframe bind:this={frame} {src} sandbox={HX_SANDBOX_FLAGS} title="Ported assignment"></iframe>
			{/if}
		</section>
		<section class="log" data-bridge-log>
			<h2>Bridge traffic ({log.length})</h2>
			<ol>
				{#each log as row (row.n)}
					<li class={row.dir}><span class="dir">{row.dir === 'in' ? 'frame to parent' : 'parent to frame'}</span><code>{row.text}</code></li>
				{/each}
			</ol>
		</section>
	</div>
</div>

<style>
	.harness { padding: 16px; font-family: var(--font-display, sans-serif); }
	header p { color: var(--text-2, #666); max-width: 60ch; }
	.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 12px 0; }
	.controls label { display: flex; align-items: center; gap: 6px; min-height: 44px; }
	.controls button { min-height: 44px; padding: 0 14px; }
	.split { display: grid; grid-template-columns: minmax(min(48rem, 100%), 1fr) minmax(min(28rem, 100%), 1fr); gap: 16px; }
	@media (max-width: 1023px) { .split { grid-template-columns: 1fr; } }
	.doc iframe { width: 100%; height: 78vh; border: 1px solid var(--boundary, #888); background: #020a04; }
	.log { min-width: 0; }
	.log ol { list-style: none; margin: 0; padding: 0; max-height: 78vh; overflow: auto; }
	.log li { display: grid; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--hairline, #ddd); }
	.log li.in { background: rgba(0, 240, 255, 0.06); }
	.log .dir { font-family: var(--font-mono, monospace); font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-2, #666); }
	.log code { font-family: var(--font-mono, monospace); font-size: 11px; overflow-wrap: anywhere; }
</style>
