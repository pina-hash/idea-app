<script lang="ts">
	/**
	 * Dev harness for the FSP live Q&A pair. Mounts the REAL /fsp/ask and
	 * /fsp/live routes in side-by-side iframes so the end-to-end flow can be
	 * eyeballed: submit a question on the left (ask) and watch it animate into the
	 * feed on the right (live) over Supabase Realtime.
	 *
	 * Unlike the fully-mockable harnesses elsewhere, this one exercises real auth
	 * and a real DB by design (Realtime cannot be faked). To use it: apply
	 * migration 0043, then sign into BOTH iframes — the ask side wants a
	 * @boscotech.net student, the live side wants a @boscotech.edu staff account
	 * (open each iframe's "pop out" to sign in if the OAuth popup is blocked
	 * inside the frame). Then submit on the left and confirm it lands on the right.
	 */
	let reloadKey = $state(0);
	function reloadBoth() {
		reloadKey += 1;
	}
</script>

<svelte:head><title>FSP Q&amp;A harness</title></svelte:head>

<div class="harness">
	<h1>FSP live Q&amp;A harness</h1>
	<p class="note">
		Dev-only. The two panes below are the REAL <code>/fsp/ask</code> and
		<code>/fsp/live</code> routes. This flow uses real Google auth + Supabase Realtime (nothing to
		mock), so: apply migration <code>0043</code>, sign the <strong>ask</strong> pane in as a
		<code>@boscotech.net</code> student and the <strong>live</strong> pane in as a
		<code>@boscotech.edu</code> staff account, then submit on the left and verify the card appears
		live on the right. If an OAuth popup is blocked inside a frame, use the "Open in new tab" link
		to sign in there first (cookies are shared same-origin).
	</p>

	<div class="toolbar">
		<button type="button" onclick={reloadBoth}>Reload both panes</button>
		<a href="/fsp/ask" target="_blank" rel="noreferrer">Open /fsp/ask ↗</a>
		<a href="/fsp/live" target="_blank" rel="noreferrer">Open /fsp/live ↗</a>
	</div>

	{#key reloadKey}
		<div class="split">
			<section>
				<h2>/fsp/ask &mdash; student</h2>
				<div class="frame phone">
					<iframe src="/fsp/ask" title="fsp ask"></iframe>
				</div>
			</section>
			<section>
				<h2>/fsp/live &mdash; staff feed</h2>
				<div class="frame">
					<iframe src="/fsp/live" title="fsp live"></iframe>
				</div>
			</section>
		</div>
	{/key}
</div>

<style>
	.harness {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 4rem;
		color: var(--white, #e8ffe8);
		font-family: system-ui, sans-serif;
	}
	h1 {
		font-size: 1.3rem;
	}
	.note {
		color: var(--dim, #8aa);
		font-size: 0.9rem;
		line-height: 1.55;
		max-width: 90ch;
	}
	code {
		font-family: 'Share Tech Mono', monospace;
		color: var(--cyan, #00f0ff);
	}
	.toolbar {
		display: flex;
		gap: 0.8rem;
		align-items: center;
		margin: 1rem 0 1.2rem;
		flex-wrap: wrap;
	}
	.toolbar button {
		font: inherit;
		font-size: 0.85rem;
		background: none;
		border: 1px solid var(--line, #2a3a44);
		color: var(--white, #e8ffe8);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		cursor: pointer;
	}
	.toolbar a {
		font-size: 0.85rem;
		color: var(--green, #00ff41);
	}
	.split {
		display: grid;
		grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
		gap: 1.2rem;
		align-items: start;
	}
	section h2 {
		font-size: 0.9rem;
		color: var(--green, #00ff41);
		margin-bottom: 0.5rem;
	}
	.frame {
		border: 1px solid var(--line, #16242c);
		border-radius: 12px;
		overflow: hidden;
		background: #0a0a0a;
	}
	.frame iframe {
		width: 100%;
		height: 720px;
		border: 0;
		display: block;
	}
	.frame.phone iframe {
		height: 720px;
	}
	@media (max-width: 900px) {
		.split {
			grid-template-columns: 1fr;
		}
	}
</style>
