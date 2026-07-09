<script lang="ts">
	import '$lib/fsp/fsp-theme.css';
	import FspTechSelection from '$lib/fsp/FspTechSelection.svelte';
	import type { FspPayload, FspSelection } from '$lib/fsp/client';

	/**
	 * Dev harness: the real FspTechSelection with a fake signed-in student and a
	 * fake save endpoint. Toggle failure modes and latency to verify the debounce
	 * (rapid changes collapse to one save), the saving/saved/error indicator, the
	 * retry/backoff, last-write-wins, and the duplicate-pick guard.
	 */

	const MOCK_EMAIL = 'freshman.test@boscotech.net';

	type Mode = 'normal' | 'down';
	let mode = $state<Mode>('normal');
	let latency = $state(500);
	let failNext = $state(0);

	let callSeq = 0;
	let saveCount = $state(0);
	let lastSaved = $state<FspPayload | null>(null);
	let log = $state<string[]>([]);

	function pushLog(line: string) {
		const t = new Date().toISOString().slice(11, 23);
		log = [`${t}  ${line}`, ...log].slice(0, 40);
	}

	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function saveOnce(payload: FspPayload): Promise<void> {
		const id = ++callSeq;
		pushLog(`→ #${id} POST  ${payload.choices.join(' > ') || '(none)'}  [${payload.firstName} ${payload.lastName}]`);
		await wait(latency);
		if (mode === 'down') {
			pushLog(`✗ #${id} failed (simulated: endpoint down)`);
			throw new Error('simulated-down');
		}
		if (failNext > 0) {
			failNext -= 1;
			pushLog(`✗ #${id} failed (simulated flaky, ${failNext} more will fail)`);
			throw new Error('simulated-flaky');
		}
		saveCount += 1;
		lastSaved = payload;
		pushLog(`✓ #${id} saved OK`);
	}

	// Remount the component with fresh initial data to test the two entry states.
	let mountKey = $state(0);
	let initial = $state<FspSelection | null>(null);

	function loadFirstTime() {
		initial = null;
		reset();
	}
	function loadReturning() {
		initial = {
			lastName: 'Rivera',
			firstName: 'Alex',
			studentId: '20344',
			choices: ['IDEA', 'CSEE', 'MAT', 'ACE'],
			complete: true
		};
		reset();
	}
	function loadReturningPartial() {
		initial = {
			lastName: 'Nguyen',
			firstName: 'Kai',
			studentId: '',
			choices: ['BMET', 'MSET'],
			complete: false
		};
		reset();
	}
	function reset() {
		callSeq = 0;
		saveCount = 0;
		lastSaved = null;
		log = [];
		mountKey += 1;
	}
</script>

<svelte:head><title>FSP tech-selection harness</title></svelte:head>

<div class="harness">
	<h1>FSP tech-selection harness</h1>
	<p class="note">
		Dev-only (no auth / real network). The panel on the right is the REAL
		<code>FspTechSelection</code> component with a mock signed-in student and a fake save endpoint.
		Verify: duplicate-pick guard (a chosen chip cannot be re-added), removing/reordering, drag to
		reorder, the 800ms debounce (rapid edits collapse to one POST), the saving → saved indicator,
		error + retry with backoff (set "endpoint down" or queue failures), and the persistent "N of 4
		ranked" indicator, including that "Returning (partial, 2/4)" seeds it correctly from the mock
		GET's <code>complete: false</code> before any local edit.
	</p>

	<div class="controls">
		<fieldset>
			<legend>Entry state</legend>
			<button type="button" onclick={loadFirstTime}>First-time (empty)</button>
			<button type="button" onclick={loadReturning}>Returning (complete, 4/4)</button>
			<button type="button" onclick={loadReturningPartial}>Returning (partial, 2/4)</button>
		</fieldset>
		<fieldset>
			<legend>Fake endpoint</legend>
			<label><input type="radio" bind:group={mode} value="normal" /> Normal</label>
			<label><input type="radio" bind:group={mode} value="down" /> Always fail (down)</label>
			<label class="inline">
				Latency
				<input type="number" bind:value={latency} min="0" step="100" /> ms
			</label>
			<button type="button" onclick={() => (failNext = 2)}>Queue 2 failures (test backoff)</button>
			<span class="fail-badge" class:on={failNext > 0}>failNext = {failNext}</span>
		</fieldset>
		<fieldset>
			<legend>Observed</legend>
			<div>Successful POSTs: <strong>{saveCount}</strong></div>
			<div class="last">
				Last saved: <code>{lastSaved ? JSON.stringify(lastSaved.choices) : '—'}</code>
			</div>
		</fieldset>
	</div>

	<div class="split">
		<div class="fsp-root device">
			{#key mountKey}
				<FspTechSelection email={MOCK_EMAIL} {initial} execUrl="https://example.invalid/exec" {saveOnce} />
			{/key}
		</div>
		<div class="logpane">
			<h2>Endpoint log (newest first)</h2>
			<ol>
				{#each log as line, i (i)}
					<li class:ok={line.includes('✓')} class:bad={line.includes('✗')}>{line}</li>
				{/each}
				{#if log.length === 0}<li class="muted">No calls yet.</li>{/if}
			</ol>
		</div>
	</div>
</div>

<style>
	.harness {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 5rem;
		color: var(--white, #e8ffe8);
		font-family: system-ui, sans-serif;
	}
	h1 {
		font-size: 1.3rem;
	}
	.note {
		color: var(--dim, #8aa);
		font-size: 0.9rem;
		line-height: 1.5;
		max-width: 70ch;
	}
	code {
		font-family: 'Share Tech Mono', monospace;
		color: var(--cyan, #00f0ff);
	}
	.controls {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin: 1rem 0 1.4rem;
	}
	fieldset {
		border: 1px solid var(--line, #16242c);
		border-radius: 8px;
		padding: 0.7rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		font-size: 0.85rem;
	}
	legend {
		color: var(--green, #00ff41);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0 0.3rem;
	}
	fieldset button {
		font: inherit;
		font-size: 0.8rem;
		background: none;
		border: 1px solid var(--line, #2a3a44);
		color: var(--white, #e8ffe8);
		border-radius: 5px;
		padding: 0.35rem 0.6rem;
		cursor: pointer;
	}
	fieldset label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	label.inline input {
		width: 5rem;
		background: #0b1418;
		color: var(--white, #e8ffe8);
		border: 1px solid var(--line, #2a3a44);
		border-radius: 4px;
		padding: 0.2rem 0.3rem;
	}
	.fail-badge {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim, #8aa);
	}
	.fail-badge.on {
		color: #ff8c00;
	}
	.last code {
		word-break: break-all;
	}
	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1.2rem;
		align-items: start;
	}
	.device {
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid var(--line, #16242c);
	}
	.logpane {
		border: 1px solid var(--line, #16242c);
		border-radius: 10px;
		padding: 0.8rem 1rem;
		background: #060d10;
	}
	.logpane h2 {
		font-size: 0.85rem;
		color: var(--green, #00ff41);
		margin-bottom: 0.6rem;
	}
	.logpane ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
	}
	.logpane li {
		color: var(--white, #cfe);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.logpane li.ok {
		color: #3ad17a;
	}
	.logpane li.bad {
		color: #ff6b6b;
	}
	.logpane li.muted {
		color: var(--dim, #567);
	}
	@media (max-width: 780px) {
		.split {
			grid-template-columns: 1fr;
		}
	}
</style>
