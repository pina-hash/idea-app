<script lang="ts">
	/**
	 * "My computers": the computers the signed-in person has connected, each
	 * with when it was last heard from. There is no heartbeat in the schema, so
	 * "heard from" is the last thing it wrote to a project (or the moment it
	 * connected), never a claim that it is on right now.
	 */
	import { lastSeenWords, type ArmoryDevice } from './view';

	let { devices, now }: { devices: ArmoryDevice[]; now: number } = $props();
</script>

<section class="ar-panel" aria-labelledby="ar-devices-h" data-testid="armory-devices">
	<h2 id="ar-devices-h">My computers</h2>
	{#if devices.length === 0}
		<p class="ar-message" data-testid="armory-no-devices">
			No computer is connected yet. <a href="/armory/start">Set up Armory on this computer</a>.
		</p>
	{:else}
		<ul class="ar-list">
			{#each devices as device (device.id)}
				<li class="ar-list-row" data-testid="armory-device">
					<span class="ar-file-glyph ar-tone-synced" aria-hidden="true">▣</span>
					<span class="ar-list-main">
						<span class="ar-list-title">{device.name}</span>
						<span class="ar-list-sub">{lastSeenWords(device, now)}</span>
					</span>
				</li>
			{/each}
		</ul>
		<p class="ar-message"><a href="/armory/start">Set up another computer</a></p>
	{/if}
</section>
