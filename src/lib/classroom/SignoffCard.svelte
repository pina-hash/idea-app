<script lang="ts">
	/**
	 * ONE SIGN-OFF, DECIDED ON A PHONE (ledger 0436, 0304; ledger 0456, 0323).
	 * The team, its members, the checkpoint and its shop gate, then the
	 * checklist: an auto item shows what the site found and, when it fails,
	 * WHO IS MISSING WHAT; a tap item is two 44px keys, Pass and Fail. Approve
	 * lights only when every item passes; Send back when every tap is made and
	 * one fails, and the failed items ARE the note. Approve anyway (report
	 * f10cfa95) lights at the same moment as Send back and asks for a short
	 * note first, because the database keeps one with the decision.
	 *
	 * The queue page and the teams panel on a team post both mount this card,
	 * so the two can never decide a sign-off differently.
	 */
	import {
		signoffCanApprove,
		signoffCanApproveAnyway,
		signoffCanSendBack,
		signoffMarks,
		signoffMissingLines,
		signoffSendBackNote,
		signoffWaited,
		type SignoffRequest
	} from './signoffs';
	import { teamDayWords } from './team-plan';

	type Out = { ok: boolean; reason?: string } | null;
	let {
		req,
		ondecide,
		onoverride = null,
		now = Date.now(),
		showTeam = true,
		ondone = null
	}: {
		req: SignoffRequest;
		ondecide: (results: Record<string, boolean>, approve: boolean) => Promise<Out>;
		onoverride?: ((results: Record<string, boolean>, note: string) => Promise<Out>) | null;
		now?: number;
		showTeam?: boolean;
		ondone?: ((words: string) => void) | null;
	} = $props();

	let taps = $state<Record<string, boolean>>({});
	let busy = $state(false);
	let said = $state<string | null>(null);
	let noteOpen = $state(false);
	let note = $state('');
	let shownFor = $state('');
	$effect(() => {
		if (req.id === shownFor) return;
		shownFor = req.id;
		taps = {};
		said = null;
		noteOpen = false;
		note = '';
	});

	const marks = $derived(signoffMarks(req, taps));
	const autos = $derived(req.items.filter((i) => i.kind === 'auto'));
	/** Every check the site makes passes: they fold to one line, so the taps are in reach. */
	const autosPass = $derived(autos.length > 0 && autos.every((i) => i.autoOk));

	function tap(itemId: string, pass: boolean) {
		taps = { ...taps, [itemId]: pass };
	}
	function results(): Record<string, boolean> {
		return Object.fromEntries(req.items.filter((i) => i.kind === 'tap').map((i) => [i.id, taps[i.id] === true]));
	}
	function words(out: Out, approve: boolean, anyway = false): string {
		if (out?.ok) return anyway ? `${req.team.name}: approved anyway.` : approve ? `${req.team.name}: approved.` : `${req.team.name}: sent back.`;
		switch (out?.reason) {
			case 'decided':
			case 'approved':
				return 'Somebody already decided this one.';
			case 'owner_only':
				return 'This checkpoint is Mr. Pina’s to decide.';
			case 'note_needed':
				return 'Write a short note to approve anyway.';
			default:
				return 'That did not save. Try again.';
		}
	}
	async function decide(approve: boolean) {
		busy = true;
		said = null;
		const out = await ondecide(results(), approve).catch(() => null);
		busy = false;
		said = words(out, approve);
		if (out?.ok) ondone?.(said);
	}
	async function anyway() {
		if (!onoverride || !note.trim()) return;
		busy = true;
		said = null;
		const out = await onoverride(results(), note.trim()).catch(() => null);
		busy = false;
		said = words(out, true, true);
		if (out?.ok) ondone?.(said);
	}
</script>

<article class="card sq-req" data-testid="signoff-request" aria-label={`${req.team.name}, ${req.checkpoint.title}`}>
	<header class="sq-head">
		{#if showTeam}
			<p class="sq-where">{req.section.label}{req.requestedAt ? ` · ${signoffWaited(req.requestedAt, now)}` : ''}</p>
			<h2 class="sq-team">{req.team.name}</h2>
			<p class="sq-people">{req.team.members.join(', ')}</p>
		{/if}
		<p class="sq-cp">
			<strong>{req.checkpoint.date ? `${req.checkpoint.title}, ${teamDayWords(req.checkpoint.date)}` : req.checkpoint.title}</strong>
			{#if req.ownerOnly}<span class="chip sq-owner">Yours only</span>{/if}
			{#if !req.requestedAt}<span class="chip">Not requested</span>{/if}
		</p>
		{#if req.checkpoint.gate}<p class="sq-gate">{req.checkpoint.gate}</p>{/if}
	</header>
	{#if autosPass}
		<p class="sq-autos" data-testid="signoff-autos-pass">
			<span class="sq-tick" aria-hidden="true">✓</span>
			{autos.length === 1 ? 'The check the site makes passes' : `All ${autos.length} checks the site makes pass`}:
			{autos.map((i) => i.text).join('; ')}
		</p>
	{/if}
	<ol class="sq-items">
		{#each req.items.filter((i) => !(autosPass && i.kind === 'auto')) as item (item.id)}
			<li class="sq-item" class:fail={marks[item.id] === false} class:pass={marks[item.id] === true}>
				<p class="sq-text">
					{item.text}
					{#if item.owner}<span class="sq-role">{item.owner}</span>{/if}
				</p>
				{#if item.kind === 'auto'}
					<p class="sq-auto">{item.autoOk ? 'Checked by the site: passes' : 'Checked by the site: not yet'}</p>
					{#if !item.autoOk && item.missing.length}
						<ul class="sq-missing" data-testid="signoff-missing" aria-label="Missing">
							{#each signoffMissingLines(item.missing) as line (line)}<li>{line}</li>{/each}
						</ul>
					{/if}
				{:else}
					<div class="sq-keys" role="group" aria-label={item.text}>
						<button type="button" class="btn secondary sq-key" aria-pressed={marks[item.id] === true} onclick={() => tap(item.id, true)}>Pass</button>
						<button type="button" class="btn secondary sq-key sq-fail" aria-pressed={marks[item.id] === false} onclick={() => tap(item.id, false)}>Fail</button>
					</div>
				{/if}
			</li>
		{/each}
	</ol>
	{#if said}<p class="sq-said" role="status">{said}</p>{/if}
	<div class="sq-act">
		{#if signoffCanSendBack(req, taps)}
			<p class="sq-note">Sends back: {signoffSendBackNote(req, taps)}</p>
		{/if}
		<button
			type="button"
			class="btn sq-approve"
			data-testid="signoff-approve"
			disabled={busy || !signoffCanApprove(req, taps)}
			onclick={() => decide(true)}>Approve</button
		>
		<button
			type="button"
			class="btn secondary sq-back"
			data-testid="signoff-send-back"
			disabled={busy || !signoffCanSendBack(req, taps)}
			onclick={() => decide(false)}>Send back</button
		>
		{#if onoverride && signoffCanApproveAnyway(req, taps)}
			{#if !noteOpen}
				<button type="button" class="btn ghost sq-anyway" data-testid="signoff-anyway" disabled={busy} onclick={() => (noteOpen = true)}
					>Approve anyway…</button
				>
			{:else}
				<label class="sq-anyway-note">
					<span>Why it is approved anyway (kept with the sign-off; each student's own grade still counts their empty boxes)</span>
					<input class="sq-note-input" maxlength="300" bind:value={note} placeholder="Ben was out Oct 30" data-testid="signoff-anyway-note" />
				</label>
				<button
					type="button"
					class="btn sq-anyway"
					data-testid="signoff-anyway-go"
					disabled={busy || !note.trim()}
					onclick={anyway}>Approve anyway</button
				>
			{/if}
		{/if}
	</div>
</article>

<style>
	.sq-req {
		display: grid;
		gap: 0.7rem;
		padding: 0.9rem;
		min-width: 0;
	}
	.sq-head p,
	.sq-team {
		margin: 0;
	}
	.sq-where,
	.sq-people {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2, var(--dim));
	}
	.sq-team {
		font-family: var(--font-display);
		font-size: var(--fs-h2);
		color: var(--text-1, var(--white));
	}
	.sq-cp {
		margin-top: 0.3rem !important;
		font-family: var(--font-display);
		font-size: var(--fs-body);
		color: var(--text-1, var(--white));
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.sq-gate {
		font-family: var(--font-display);
		color: var(--amber);
	}
	.sq-items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.sq-item {
		display: grid;
		gap: 0.4rem;
		padding: 0.55rem 0.6rem;
		border-radius: 0.6rem;
		border: 1px solid color-mix(in srgb, var(--dim) 28%, transparent);
		background: color-mix(in srgb, var(--bg0) 55%, transparent);
	}
	.sq-item.pass {
		border-color: color-mix(in srgb, var(--green) 55%, transparent);
	}
	.sq-item.fail {
		border-color: var(--amber);
	}
	.sq-text {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--fs-base);
		color: var(--text-1, var(--white));
	}
	.sq-role {
		margin-left: 0.4rem;
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		color: var(--text-2, var(--dim));
	}
	.sq-auto {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2, var(--dim));
	}
	.sq-item.fail .sq-auto {
		color: var(--amber);
	}
	.sq-missing {
		margin: 0;
		padding-left: 1.1rem;
		font-family: var(--font-display);
		font-size: var(--fs-ui);
		color: var(--text-1, var(--white));
	}
	.sq-keys {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.sq-key {
		min-height: 48px;
	}
	.sq-key[aria-pressed='true'] {
		border-color: var(--green);
		color: var(--green);
		background: color-mix(in srgb, var(--green) 14%, transparent);
	}
	.sq-fail[aria-pressed='true'] {
		border-color: var(--amber);
		color: var(--amber);
		background: color-mix(in srgb, var(--amber) 14%, transparent);
	}
	.sq-autos {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--fs-sm);
		color: var(--text-2, var(--dim));
	}
	.sq-tick {
		color: var(--green);
		margin-right: 0.3rem;
	}
	.sq-said {
		margin: 0;
		font-family: var(--font-display);
		color: var(--green);
	}
	.sq-act {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		padding-top: 0.6rem;
	}
	.sq-note {
		grid-column: 1 / -1;
		margin: 0;
		font-family: var(--font-display);
		color: var(--amber);
	}
	.sq-approve,
	.sq-back {
		min-height: 52px;
	}
	.sq-anyway {
		grid-column: 1 / -1;
		min-height: 48px;
	}
	.sq-anyway-note {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.3rem;
		font-family: var(--font-display);
		font-size: var(--fs-sm);
		color: var(--text-2, var(--dim));
	}
	.sq-note-input {
		width: 100%;
		min-height: 44px;
	}
</style>
