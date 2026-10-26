<script lang="ts">
	/**
	 * THE SIGN-OFF QUEUE ON A PHONE (ledger 0436, 0304; decision 71). The oldest
	 * request is open at the top: the team, its members, the checkpoint and its
	 * shop gate, then the checklist, an auto item showing what the site found
	 * and a tap item two 44px keys, Pass and Fail. Approve lights only when
	 * every item passes; Send back only when every tap is made and one fails,
	 * and the failed items ARE the note. Nothing to type. The rest of the queue
	 * waits underneath, oldest first.
	 */
	import {
		signoffCanApprove,
		signoffCanSendBack,
		signoffMarks,
		signoffSendBackNote,
		signoffWaited,
		type SignoffRequest
	} from './signoffs';
	import { teamDayWords } from './team-plan';

	let {
		requests,
		ondecide,
		now = Date.now()
	}: {
		requests: SignoffRequest[];
		ondecide: (id: string, results: Record<string, boolean>, approve: boolean) => Promise<{ ok: boolean; reason?: string } | null>;
		now?: number;
	} = $props();

	let taps = $state<Record<string, Record<string, boolean>>>({});
	let busy = $state<string | null>(null);
	let said = $state<string | null>(null);
	let picked = $state<string | null>(null);
	const current = $derived(requests.find((r) => r.id === picked) ?? requests[0] ?? null);
	const rest = $derived(requests.filter((r) => r.id !== current?.id));
	const autos = $derived(current ? current.items.filter((i) => i.kind === 'auto') : []);
	/** Every check the site makes passes: they fold to one line, so the taps are in reach. */
	const autosPass = $derived(autos.length > 0 && autos.every((i) => i.autoOk));

	function tap(req: SignoffRequest, itemId: string, pass: boolean) {
		taps = { ...taps, [req.id]: { ...(taps[req.id] ?? {}), [itemId]: pass } };
	}
	async function decide(req: SignoffRequest, approve: boolean) {
		busy = req.id;
		said = null;
		const mine = taps[req.id] ?? {};
		const results = Object.fromEntries(req.items.filter((i) => i.kind === 'tap').map((i) => [i.id, mine[i.id] === true]));
		const out = await ondecide(req.id, results, approve).catch(() => null);
		busy = null;
		if (!out?.ok) {
			said = out?.reason === 'decided' ? 'Somebody already decided this one.' : 'That did not save. Try again.';
			return;
		}
		said = approve ? `${req.team.name}: approved.` : `${req.team.name}: sent back.`;
		picked = null;
	}
</script>

<section class="sq" data-testid="signoff-queue" aria-label="Sign-off queue">
	{#if said}<p class="sq-said" role="status">{said}</p>{/if}
	{#if !current}
		<p class="card sq-empty" data-testid="signoff-queue-empty">No team is waiting for a sign-off.</p>
	{:else}
		{@const marks = signoffMarks(current, taps[current.id] ?? {})}
		<article class="card sq-req" data-testid="signoff-request" aria-label={`${current.team.name}, ${current.checkpoint.title}`}>
			<header class="sq-head">
				<p class="sq-where">{current.section.label} · {signoffWaited(current.requestedAt, now)}</p>
				<h2 class="sq-team">{current.team.name}</h2>
				<p class="sq-people">{current.team.members.join(', ')}</p>
				<p class="sq-cp">
					<strong>{current.checkpoint.date ? `${current.checkpoint.title}, ${teamDayWords(current.checkpoint.date)}` : current.checkpoint.title}</strong>
					{#if current.ownerOnly}<span class="chip sq-owner">Yours only</span>{/if}
				</p>
				{#if current.checkpoint.gate}<p class="sq-gate">{current.checkpoint.gate}</p>{/if}
			</header>
			{#if autosPass}
				<!-- Every check the site makes passes: one line, so the taps are in reach. -->
				<p class="sq-autos" data-testid="signoff-autos-pass">
					<span class="sq-tick" aria-hidden="true">✓</span>
					{autos.length === 1 ? 'The check the site makes passes' : `All ${autos.length} checks the site makes pass`}:
					{autos.map((i) => i.text).join('; ')}
				</p>
			{/if}
			<ol class="sq-items">
				{#each current.items.filter((i) => !(autosPass && i.kind === 'auto')) as item (item.id)}
					<li class="sq-item" class:fail={marks[item.id] === false} class:pass={marks[item.id] === true}>
						<p class="sq-text">
							{item.text}
							{#if item.owner}<span class="sq-role">{item.owner}</span>{/if}
						</p>
						{#if item.kind === 'auto'}
							<p class="sq-auto">{item.autoOk ? 'Checked by the site: passes' : 'Checked by the site: not yet'}</p>
						{:else}
							<div class="sq-keys" role="group" aria-label={item.text}>
								<button type="button" class="btn secondary sq-key" aria-pressed={marks[item.id] === true} onclick={() => tap(current, item.id, true)}>Pass</button>
								<button type="button" class="btn secondary sq-key sq-fail" aria-pressed={marks[item.id] === false} onclick={() => tap(current, item.id, false)}>Fail</button>
							</div>
						{/if}
					</li>
				{/each}
			</ol>
			<div class="sq-act">
				{#if signoffCanSendBack(current, taps[current.id] ?? {})}
					<p class="sq-note">Sends back: {signoffSendBackNote(current, taps[current.id] ?? {})}</p>
				{/if}
				<button
					type="button"
					class="btn sq-approve"
					data-testid="signoff-approve"
					disabled={busy !== null || !signoffCanApprove(current, taps[current.id] ?? {})}
					onclick={() => decide(current, true)}>Approve</button
				>
				<button
					type="button"
					class="btn secondary sq-back"
					data-testid="signoff-send-back"
					disabled={busy !== null || !signoffCanSendBack(current, taps[current.id] ?? {})}
					onclick={() => decide(current, false)}>Send back</button
				>
			</div>
		</article>
		{#if rest.length}
			<h2 class="section-label sq-next">Waiting after this ({rest.length})</h2>
			<ul class="sq-rest">
				{#each rest as r (r.id)}
					<li>
						<button type="button" class="btn ghost sq-rest-key" onclick={() => (picked = r.id)}>
							<span>{r.team.name}, {r.checkpoint.title}</span>
							<span class="sq-rest-meta">{r.section.label} · {signoffWaited(r.requestedAt, now)}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<style>
	.sq {
		display: grid;
		gap: 0.75rem;
		padding-bottom: var(--feedback-clear-block, 0px);
	}
	.sq-said {
		margin: 0;
		font-family: var(--font-display);
		color: var(--green);
	}
	.sq-empty {
		margin: 0;
		padding: 1.1rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
	}
	.sq-req {
		display: grid;
		gap: 0.7rem;
		padding: 0.9rem;
	}
	.sq-head p,
	.sq-team {
		margin: 0;
	}
	.sq-where,
	.sq-people {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.sq-team {
		font-family: var(--font-display);
		font-size: 1.45rem;
		color: var(--text-1, var(--white));
	}
	.sq-cp {
		margin-top: 0.3rem !important;
		font-family: var(--font-display);
		font-size: 1.05rem;
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
		font-size: 1.02rem;
		color: var(--text-1, var(--white));
	}
	.sq-role {
		margin-left: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2, var(--dim));
	}
	.sq-auto {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.sq-item.fail .sq-auto {
		color: var(--amber);
	}
	.sq-keys {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.sq-key {
		min-height: 48px;
	}
	.sq-autos {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.92rem;
		color: var(--text-2, var(--dim));
	}
	.sq-tick {
		color: var(--green);
		margin-right: 0.3rem;
	}
	.sq-act {
		position: sticky;
		/* Rests above the site's floating feedback key, never under it. */
		bottom: var(--feedback-clear-block, 0px);
		z-index: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		padding-top: 0.6rem;
		background: var(--bg1, #1b2026);
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
	.sq-next {
		margin: 0.4rem 0 0;
	}
	.sq-rest {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	.sq-rest-key {
		width: 100%;
		min-height: 48px;
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--font-display);
	}
	.sq-rest-meta {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, var(--dim));
	}
</style>
