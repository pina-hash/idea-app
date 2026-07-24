<script lang="ts">
	import PieceChainBuilder from '$lib/greenline/piece-builder/PieceChainBuilder.svelte';

	/**
	 * Harness for the v3 piece-chain builder. Nothing is stubbed: the component
	 * runs the real compiler (`diagnoseChain`) and the real export, and the
	 * document persists to localStorage exactly as it would anywhere else.
	 * `window.__glPieceBuilder` drives it from the console.
	 *
	 * The REAL route is /greenline/piece-builder (signed-in, submits into the
	 * moderation queue). This harness keeps `playtestTarget="harness"` so
	 * PLAYTEST drives the dev movement harness rather than the portal flow, and
	 * wires an in-memory publish fake so the submit affordance is drivable with
	 * no auth and no Supabase — it never reaches a database.
	 *
	 * `backHref` is passed for the same reason the real route passes it: the
	 * top-right corner of the header holds the status flag, the back link, and
	 * (just below) PLAYTEST, and a floated back link used to cover the flag and
	 * take its clicks. Mounting it here keeps that corner browser-verifiable
	 * without a signed-in session.
	 */
	const submissions = $state<{ name: string; bytes: number }[]>([]);
	async function fakePublish(name: string, trackJson: string) {
		submissions.push({ name, bytes: trackJson.length });
		(window as unknown as Record<string, unknown>).__glPieceSubmissions = submissions;
		return { ok: true, trackId: `community:dev-${submissions.length}`, error: null };
	}
</script>

<svelte:head>
	<title>GREENLINE piece-chain builder (dev)</title>
</svelte:head>

<PieceChainBuilder onPublish={fakePublish} playtestTarget="harness" backHref="/greenline" />
