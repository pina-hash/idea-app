<script lang="ts">
	/**
	 * THE REQUEST BOARD, AS A STUDENT AND AS AN ADMIN (report b2ba6d74). The
	 * real `FoundryRequestBoard`, twice, over one fixture: three open requests
	 * (one the viewer's own, one carrying an offer), and one closed request that
	 * a published app answered. Posting adds to the fixture in memory, so the
	 * form can be driven.
	 */
	import '$lib/foundry/forge.css';
	import FoundryPage from '$lib/foundry/FoundryPage.svelte';
	import FoundryRequestBoard from '$lib/foundry/FoundryRequestBoard.svelte';
	import FoundryShell from '$lib/foundry/FoundryShell.svelte';
	import type { FoundryGameRequest } from '$lib/foundry/requests';
	import type { FoundryRequestTransports } from '$lib/foundry/transports';

	function req(over: Partial<FoundryGameRequest> & { id: string }): FoundryGameRequest {
		return {
			title: 'A tower defense game',
			body: 'Robots attack the school and you build defenses out of lab equipment.',
			offer: null,
			status: 'open',
			created_at: '2026-09-30T15:00:00Z',
			closed_at: null,
			owner: 'owner-1',
			owner_display_name: null,
			owner_full_name: 'Ana Reyes',
			mine: false,
			fulfilled: null,
			...over
		};
	}

	let requests = $state<FoundryGameRequest[]>([
		req({ id: 'r1', offer: '20 IDEA Coins if it is done by Friday' }),
		req({
			id: 'r2',
			title: 'A typing race',
			body: 'Two players, the same sentence, whoever finishes first wins.\nWith a leaderboard.',
			owner_full_name: 'Sam Cruz',
			mine: true,
			hidden: false
		}),
		req({ id: 'r3', title: 'Flappy gear', body: 'Like that bird game but a gear.', owner_display_name: 'gearhead' }),
		req({
			id: 'r4',
			title: 'A periodic table quiz',
			status: 'closed',
			closed_at: '2026-09-30T18:00:00Z',
			fulfilled: { slug: 'element-quiz', title: 'Element Quiz' },
			offer: 'Lunch on me'
		})
	]);
	let last = $state('(nothing yet)');

	const student: FoundryRequestTransports = {
		async post(title, body, offer) {
			last = JSON.stringify({ post: title });
			requests = [req({ id: `new-${requests.length}`, title, body, offer, mine: true }), ...requests];
			return { ok: true, id: 'new' };
		},
		async close(id, slug) {
			last = JSON.stringify({ close: id, slug });
			requests = requests.map((r) =>
				r.id === id ? { ...r, status: 'closed', closed_at: '2026-10-01T16:00:00Z' } : r
			);
			return { ok: true };
		}
	};
	const admin: FoundryRequestTransports = {
		...student,
		async setHidden(id, hidden) {
			last = JSON.stringify({ hide: id, hidden });
			requests = requests.map((r) => (r.id === id ? { ...r, hidden } : r));
			return { ok: true };
		}
	};
</script>

<svelte:head><title>dev: Foundry request board</title></svelte:head>

<div class="fg-root">
	<FoundryShell active="requests" isAdmin={false} reviewPending={null}>
		<p class="note">Last transport call: <code data-testid="last-call">{last}</code></p>
		<section data-view="student">
			<FoundryPage heading="Game requests" lead="As a student sees it." testid="harness-student">
				<FoundryRequestBoard {requests} transports={student} />
			</FoundryPage>
		</section>
		<section data-view="admin">
			<FoundryPage heading="Game requests" lead="As a site administrator sees it." testid="harness-admin">
				<FoundryRequestBoard {requests} transports={admin} />
			</FoundryPage>
		</section>
	</FoundryShell>
</div>

<style>
	.note {
		margin: 0.5rem var(--cr-gutter, 1rem) 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
</style>
