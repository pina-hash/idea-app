<script lang="ts">
	import FrcInterestForm from '$lib/fsp/FrcInterestForm.svelte';
	import FrcInterestAdmin from '$lib/fsp/FrcInterestAdmin.svelte';
	import type { FrcInterestRow, FrcInterestSubmission } from '$lib/fsp/frc-interest';

	/**
	 * Dev harness: the REAL FrcInterestForm (public form, both a signed-out and
	 * a signed-in-prefill entry state) and the REAL FrcInterestAdmin table
	 * (sample rows + the pre-migration "not ready" state), no auth / Supabase.
	 */

	const SIGNED_IN_EMAIL = 'freshman.test@boscotech.net';

	type EntryState = 'anon' | 'signed-in';
	let entryState = $state<EntryState>('anon');
	let mountKey = $state(0);

	let log = $state<string[]>([]);
	function pushLog(line: string) {
		const t = new Date().toISOString().slice(11, 23);
		log = [`${t}  ${line}`, ...log].slice(0, 40);
	}

	async function fakeSubmit(s: FrcInterestSubmission): Promise<{ error: string | null }> {
		pushLog(
			`→ submit  name="${s.fullName}"  email=${s.email}  phone=${s.phone || '(none)'}  parentEmail=${s.parentEmail || '(none)'}  areas=[${s.interestAreas.join(', ')}]`
		);
		await new Promise((r) => setTimeout(r, 400));
		pushLog('✓ inserted OK');
		return { error: null };
	}

	function switchEntry(state: EntryState) {
		entryState = state;
		mountKey += 1;
	}

	// Admin table sample data.
	const SAMPLE_ROWS: FrcInterestRow[] = [
		{
			id: '1',
			fullName: 'Alex Rivera',
			email: 'alex.rivera@example.com',
			phone: '(555) 111-2222',
			parentEmail: 'rivera.parent@example.com',
			interestAreas: ['Mechanical & Build', 'CAD & Design'],
			priorExperience: 'Built a go-kart with my dad, some SolidWorks in a summer class.',
			createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
		},
		{
			id: '2',
			fullName: 'Kai Nguyen',
			email: 'kai.nguyen@example.com',
			phone: '',
			parentEmail: '',
			interestAreas: ['Programming & Controls'],
			priorExperience: '',
			createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString()
		},
		{
			id: '3',
			fullName: 'Jordan Park',
			email: 'jordan.park@example.com',
			phone: '(555) 333-4444',
			parentEmail: '',
			interestAreas: ['Not sure yet'],
			priorExperience: 'None yet, just curious!',
			createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString()
		}
	];

	let adminReady = $state(true);
</script>

<svelte:head><title>FRC interest form harness</title></svelte:head>

<div class="harness">
	<h1>FRC interest form harness</h1>
	<p class="note">
		Dev-only (no auth / real network). Verify the public form's required-field validation, the
		interest-area chip toggle, the confirmation state, and (via the entry-state switch) that the
		email field pre-fills but stays editable for a "signed in" visitor while staying blank for an
		anonymous one. Below, verify the admin roster's sort toggle and its "not ready" pre-migration
		note.
	</p>

	<section>
		<h2>Public form</h2>
		<div class="controls">
			<fieldset>
				<legend>Entry state</legend>
				<button type="button" onclick={() => switchEntry('anon')} class:active={entryState === 'anon'}>
					Signed out
				</button>
				<button
					type="button"
					onclick={() => switchEntry('signed-in')}
					class:active={entryState === 'signed-in'}
				>
					Signed in ({SIGNED_IN_EMAIL})
				</button>
			</fieldset>
		</div>

		<div class="split">
			<div class="device">
				{#key mountKey}
					<FrcInterestForm
						initialEmail={entryState === 'signed-in' ? SIGNED_IN_EMAIL : ''}
						submit={fakeSubmit}
					/>
				{/key}
			</div>
			<div class="logpane">
				<h3>Submit log (newest first)</h3>
				<ol>
					{#each log as line, i (i)}
						<li class:ok={line.includes('✓')}>{line}</li>
					{/each}
					{#if log.length === 0}<li class="muted">No submits yet.</li>{/if}
				</ol>
			</div>
		</div>
	</section>

	<section>
		<h2>Admin roster</h2>
		<div class="controls">
			<fieldset>
				<legend>Migration state</legend>
				<label><input type="radio" bind:group={adminReady} value={true} /> Applied (sample rows)</label>
				<label><input type="radio" bind:group={adminReady} value={false} /> Not applied</label>
			</fieldset>
		</div>
		<div class="admin-wrap">
			<FrcInterestAdmin rows={adminReady ? SAMPLE_ROWS : []} ready={adminReady} />
		</div>
	</section>
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
	h2 {
		font-size: 1.05rem;
		color: var(--green, #00ff41);
		margin: 2rem 0 0.6rem;
	}
	.note {
		color: var(--dim, #8aa);
		font-size: 0.9rem;
		line-height: 1.5;
		max-width: 70ch;
	}
	.controls {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin: 0.8rem 0 1rem;
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
	fieldset button.active {
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
	}
	fieldset label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
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
	.logpane h3 {
		font-size: 0.85rem;
		color: var(--green, #00ff41);
		margin: 0 0 0.6rem;
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
	.logpane li.muted {
		color: var(--dim, #567);
	}
	.admin-wrap {
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid var(--line, #16242c);
	}
	@media (max-width: 780px) {
		.split {
			grid-template-columns: 1fr;
		}
	}
</style>
