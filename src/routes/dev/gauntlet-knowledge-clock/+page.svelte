<script lang="ts">
	import '$lib/gauntlet/viewport/viewport.css';
	import KnowledgePlay from '$lib/gauntlet/KnowledgePlay.svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';

	/**
	 * Dev-only harness for the knowledge-mode clock (0148).
	 *
	 * WHAT IS WORTH LOOKING AT HERE, and why it is five mounts rather than one.
	 * `startKnowledgeClock` has four outcomes and each changes what a student is
	 * told BEFORE they answer, which is the half no automated test can judge:
	 *
	 *   server, timed    the ordinary run. Nothing extra is said, and that is
	 *                    correct: a first attempt needs no explanation.
	 *   server, closed   the student has answered this question before. The note
	 *                    is shown AHEAD of the attempt, because telling somebody
	 *                    their run did not count after they spent it on one is
	 *                    the failure this whole bundle is about.
	 *   client           0148 is not applied on this deployment. The surface must
	 *                    look EXACTLY like the ordinary run, because the student
	 *                    is not the person who needs to know.
	 *   failed           the start genuinely failed. Say so before the answer,
	 *                    since the submit is going to refuse.
	 *   starting         the RPC has not settled. Submit is disabled. It lasts
	 *                    milliseconds in production, so the only way to see it is
	 *                    a client that never answers.
	 *
	 * THE CLIENT IS INJECTED, which is the whole reason this is drivable with
	 * nothing running: `KnowledgePlay` takes `supabase` as a prop and calls it
	 * exactly once, from onMount.
	 */
	const client = (
		result: { data: unknown; error: { code?: string; message?: string } | null } | 'never'
	) =>
		({
			rpc: async () => {
				if (result === 'never') return await new Promise(() => {});
				return result;
			}
		}) as unknown as SupabaseClient;

	const CHALLENGE = {
		id: '00000000-0000-0000-0000-0000000000aa',
		title: 'Which view is the section?',
		difficulty: 2,
		prompt: {
			instructions: 'Read the drawing, then pick the view the cut plane produces.',
			question: 'Which of these is section A-A?',
			options: [
				{ id: 'a', label: 'The top view' },
				{ id: 'b', label: 'The front view' },
				{ id: 'c', label: 'The hatched view on the right' }
			]
		}
	};

	const BOARD = [
		{ user_id: 'u-2', player: 'Ana Reyes', is_correct: true, score_metric: 18.4, rank: 1 },
		{ user_id: 'u-3', player: 'Sam Okafor', is_correct: true, score_metric: 33.9, rank: 2 }
	];

	const MOUNTS = [
		{
			key: 'server-timed',
			title: 'server clock, first attempt (says nothing extra)',
			client: client({ data: { ok: true, started_at: new Date().toISOString(), timed: true }, error: null })
		},
		{
			key: 'server-closed',
			title: 'server clock, already answered (says so BEFORE the attempt)',
			client: client({ data: { ok: true, started_at: new Date().toISOString(), timed: false }, error: null })
		},
		{
			key: 'client-rung',
			title: '0148 not applied here (must be indistinguishable from the first)',
			client: client({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
		},
		{
			key: 'failed',
			title: 'the start failed (warn before the answer, not after)',
			client: client({ data: null, error: { code: 'P0001', message: 'boom' } })
		},
		{
			key: 'starting',
			title: 'start still in flight (Submit stays disabled)',
			client: client('never')
		}
	];
</script>

<svelte:head><title>GAUNTLET knowledge clock harness</title></svelte:head>

<div class="gt-root">
	<div class="gt-content">
		<main class="gauntlet harness">
			<h1>Knowledge clock harness</h1>
			<p class="note">
				The real KnowledgePlay, once per outcome of the 0148 start call. Answer C is correct. The
				harness action closes its own clock the way the database does, so the FIRST answer you
				give anywhere on this page is the timed one and every later answer is a review: press
				Submit twice to see both notes.
			</p>

			{#each MOUNTS as mount (mount.key)}
				<section class="mount" data-mount={mount.key}>
					<h2>{mount.title}</h2>
					<KnowledgePlay
						supabase={mount.client}
						challenge={CHALLENGE}
						board={BOARD}
						myUserId="u-1"
						myBest={null}
						backHref="/dev/gauntlet-knowledge-clock"
					/>
				</section>
			{/each}
		</main>
	</div>
</div>

<style>
	.harness {
		display: grid;
		gap: var(--space-6, 2rem);
	}
	.note {
		max-width: 60ch;
		color: var(--text-2);
	}
	.mount {
		border-top: 1px solid var(--boundary);
		padding-top: var(--space-4, 1rem);
	}
	.mount h2 {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
</style>
