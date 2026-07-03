<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import { page } from '$app/state';
	import { displayName } from '$lib/profile';
	import type { UserProfile } from '$lib/profile';

	/**
	 * Manual verification harness for the ProfileMenu display-name edit bug
	 * (dev-only). Mounts the REAL component with mock session data from +page.ts.
	 * Verify: open the menu, click Edit, the panel STAYS open and shows the inline
	 * name field; type a name, Save, the panel stays open and the name updates;
	 * clicking outside the panel still closes it.
	 */
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);
</script>

<svelte:head><title>ProfileMenu harness</title></svelte:head>

<div class="harness">
	<h1>ProfileMenu verification harness</h1>
	<p class="note">
		Dev-only (no auth / network; a stub Supabase simulates the save). Steps: open the avatar menu
		(top right of this box), click <strong>Edit</strong> next to the name. The panel must stay open
		and reveal the name field. Change the name and Save: the panel stays open and the name updates.
		A click on the empty page area still closes the panel.
	</p>

	<div class="stage">
		<div class="fake-header">
			<span class="brand">IDEA</span>
			<ProfileMenu />
		</div>
	</div>

	<p class="readout">Current display name: <strong data-testid="name">{displayName(profile)}</strong></p>
</div>

<style>
	.harness {
		max-width: 720px;
		margin: 0 auto;
		padding: 2rem 1.5rem 6rem;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
	}
	h1 {
		font-family: 'Orbitron', sans-serif;
		font-size: 1.2rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.note {
		color: var(--dim, #5f8a78);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.stage {
		margin: 1.5rem 0;
		border: 1px solid var(--line, #16242c);
		border-radius: 8px;
		background: var(--bg1, #050f07);
		padding: 0;
	}
	.fake-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.8rem 1.2rem;
		border-bottom: 1px solid var(--line, #16242c);
	}
	.brand {
		font-family: 'Orbitron', sans-serif;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--green, #00ff41);
	}
	.readout {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		color: var(--cyan, #00f0ff);
	}
</style>
