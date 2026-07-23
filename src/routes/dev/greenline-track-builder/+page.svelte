<script lang="ts">
	import TrackBuilder from '$lib/greenline/builder/TrackBuilder.svelte';
	import { validatePublishTrack } from '$lib/greenline/builder/validate';

	/**
	 * Harness publish fake: no network, no auth, but the REAL authoritative
	 * validator — the same validatePublishTrack the server endpoint gates on —
	 * runs against the submitted JSON, so the whole publish UI flow (disabled
	 * until valid, busy, success, rejection with real reasons) is drivable
	 * here. Published tracks go nowhere (this is the point of a harness).
	 */
	let published = $state<{ name: string; bytes: number }[]>([]);
	const fakePublish = async (name: string, trackJson: string) => {
		await new Promise((r) => setTimeout(r, 250));
		const v = validatePublishTrack(trackJson);
		if (!v.ok) return { ok: false, error: `rejected by validation: ${v.errors.join('; ')}` };
		published = [...published, { name, bytes: trackJson.length }];
		return { ok: true, trackId: `community:dev-${published.length}`, error: null };
	};
</script>

<svelte:head>
	<title>GREENLINE track builder (dev)</title>
</svelte:head>

{#if published.length}
	<div class="dev-published">
		harness publishes (in-memory): {published.map((p) => `${p.name} (${p.bytes} B)`).join(' · ')}
	</div>
{/if}
<TrackBuilder onPublish={fakePublish} />

<style>
	.dev-published {
		position: fixed;
		bottom: 0.5rem;
		left: 0.5rem;
		z-index: 50;
		max-width: 40rem;
		background: #04120a;
		border: 1px solid rgba(0, 255, 65, 0.35);
		color: #7fbf8f;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		padding: 0.3rem 0.5rem;
	}
</style>
