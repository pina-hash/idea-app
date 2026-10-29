<script lang="ts">
	/**
	 * THE SIGN-OFF QUEUE ON A PHONE (ledger 0436, 0304; decision 71; ledger
	 * 0456, 0323). The oldest request is open at the top, decided on the one
	 * sign-off card (`SignoffCard`, the same card the teams panel on a team post
	 * mounts): the checklist with who is missing what, Approve, Send back, and
	 * Approve anyway with a note. The rest of the queue waits underneath,
	 * oldest first.
	 */
	import SignoffCard from './SignoffCard.svelte';
	import { signoffWaited, type SignoffRequest } from './signoffs';

	type Out = { ok: boolean; reason?: string } | null;
	let {
		requests,
		ondecide,
		onoverride = null,
		now = Date.now()
	}: {
		requests: SignoffRequest[];
		ondecide: (id: string, results: Record<string, boolean>, approve: boolean) => Promise<Out>;
		/** Approve over a failed item with a note (`classroom_signoff_teacher_decide`); null hides it. */
		onoverride?: ((req: SignoffRequest, results: Record<string, boolean>, note: string) => Promise<Out>) | null;
		now?: number;
	} = $props();

	let said = $state<string | null>(null);
	let picked = $state<string | null>(null);
	const current = $derived(requests.find((r) => r.id === picked) ?? requests[0] ?? null);
	const rest = $derived(requests.filter((r) => r.id !== current?.id));
</script>

<section class="sq" data-testid="signoff-queue" aria-label="Sign-off queue">
	{#if said}<p class="sq-said" role="status">{said}</p>{/if}
	{#if !current}
		<p class="card sq-empty" data-testid="signoff-queue-empty">No team is waiting for a sign-off.</p>
	{:else}
		{@const req = current}
		<SignoffCard
			{req}
			{now}
			ondecide={(results, approve) => ondecide(req.id, results, approve)}
			onoverride={onoverride ? (results, note) => onoverride(req, results, note) : null}
			ondone={(words) => {
				said = words;
				picked = null;
			}}
		/>
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
