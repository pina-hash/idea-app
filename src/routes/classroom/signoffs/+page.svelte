<script lang="ts">
	/**
	 * THE SIGN-OFF QUEUE PAGE (ledger 0436). Reads `classroom_signoff_queue` on
	 * open, on any listed class's `signoffs` notice (a request made or decided),
	 * and on the poller's floor; a decision re-reads at once.
	 */
	import { untrack } from 'svelte';
	import { invalidate } from '$app/navigation';
	import SignoffQueue from '$lib/classroom/SignoffQueue.svelte';
	import TeamNameHolds from '$lib/classroom/TeamNameHolds.svelte';
	import { parseSignoffQueue, type SignoffRequest } from '$lib/classroom/signoffs';
	import { createClassroomLive, TEAM_NOTICE_JITTER_MS } from '$lib/classroom/live';
	import { startPoller } from '$lib/classroom/poll';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	let requests = $state<SignoffRequest[] | null>(null);
	let failed = $state(false);
	let now = $state(Date.now());

	async function read(): Promise<'failed' | void> {
		const { data: raw, error } = await supabase.rpc('classroom_signoff_queue');
		now = Date.now();
		if (error) {
			failed = true;
			return 'failed';
		}
		failed = false;
		requests = parseSignoffQueue(raw) ?? [];
	}

	$effect(() => {
		const poller = untrack(() => startPoller({ intervalMs: 60_000, immediate: true, run: read }));
		const live = untrack(() => createClassroomLive(supabase));
		let wait: ReturnType<typeof setTimeout> | null = null;
		const offs = untrack(() =>
			data.sections.map((id) =>
				live.subscribe(id, (topic) => {
					if (topic !== 'signoffs' || wait) return;
					wait = setTimeout(() => {
						wait = null;
						poller.runNow();
					}, Math.random() * TEAM_NOTICE_JITTER_MS);
				})
			)
		);
		return () => {
			poller.stop();
			for (const off of offs) off();
			if (wait) clearTimeout(wait);
		};
	});

	async function decide(id: string, results: Record<string, boolean>, approve: boolean) {
		const { data: out, error } = await supabase.rpc('classroom_signoff_decide', {
			p_request_id: id,
			p_results: results,
			p_approve: approve
		});
		await read();
		void invalidate('classroom:signoffs');
		return error ? null : (out as { ok: boolean; reason?: string });
	}

	/** Approve over a failed item, with the instructor's note (0323's teams-panel decide). */
	async function override(req: SignoffRequest, results: Record<string, boolean>, note: string) {
		const { data: out, error } = await supabase.rpc('classroom_signoff_teacher_decide', {
			p_team_id: req.team.id,
			p_checkpoint_key: req.checkpoint.key,
			p_results: results,
			p_approve: true,
			p_note: note
		});
		await read();
		void invalidate('classroom:signoffs');
		return error ? null : (out as { ok: boolean; reason?: string });
	}
</script>

<svelte:head><title>Sign-offs</title></svelte:head>

<div class="so-page">
	<header class="so-head">
		<h1 class="so-title">Sign-offs</h1>
		{#if data.isAdmin}<a class="btn ghost" href="/classroom/signoffs/checklists">Checklists</a>{/if}
		<a class="btn ghost" href="/classroom/board">Board</a>
		<a class="btn ghost" href="/classroom/board/machines">Machines</a>
	</header>
	{#if failed && !requests}
		<p class="card so-wait">The queue could not be read. It tries again on its own.</p>
	{:else if !requests}
		<p class="card so-wait">Reading the queue.</p>
	{:else}
		<SignoffQueue {requests} ondecide={decide} onoverride={override} {now} />
	{/if}
	<!-- Team names and taglines (ledger 0456), tournament entries and market listings (ledger 0471) that name a classmate, held for an OK. -->
	<TeamNameHolds
		sources={[
			{
				read: async () => {
					const { data: raw, error } = await supabase.rpc('classroom_team_text_holds_list');
					return error ? null : raw;
				},
				decide: async (id, approve) => {
					const { data: out, error } = await supabase.rpc('classroom_team_text_hold_decide', { p_hold_id: id, p_approve: approve });
					return error ? null : (out as { ok?: boolean });
				}
			},
			{
				read: async () => {
					const { data: raw, error } = await supabase.rpc('idea_text_holds_list');
					return error ? null : raw;
				},
				decide: async (id, approve) => {
					const { data: out, error } = await supabase.rpc('idea_text_hold_decide', { p_hold_id: id, p_approve: approve });
					return error ? null : (out as { ok?: boolean });
				}
			}
		]}
	/>
</div>

<style>
	.so-page {
		display: grid;
		gap: 0.75rem;
		max-width: 44rem;
		margin: 0 auto;
		padding: 0.5rem 0 2rem;
	}
	.so-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.so-title {
		margin: 0 auto 0 0;
		font-family: var(--font-display);
		font-size: 1.6rem;
		color: var(--text-1, var(--white));
	}
	.so-wait {
		margin: 0;
		padding: 1rem;
		font-family: var(--font-display);
	}
</style>
