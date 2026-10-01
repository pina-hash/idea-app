<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import { page } from '$app/state';
	import { displayName, profileStyleReady } from '$lib/profile';
	import type { UserProfile } from '$lib/profile';

	/**
	 * Manual verification harness for ProfileMenu (dev-only). Mounts the REAL
	 * component with mock session data from +page.ts.
	 *
	 * THE NAME EDIT: open the menu, click Edit next to the name. The panel STAYS
	 * open and reveals the inline field; type a name and Save, the panel stays
	 * open and the name updates; a click outside still closes it.
	 *
	 * THE PATHWAY: the Pathway section's six tiles each write
	 * `profiles.pathway` through the component's own `saveProfile`. Tap one and
	 * the readout below, the chip on the trigger, the chip in the menu's meta
	 * row and the tint on the display name all move together with no reload,
	 * because the write ends in `invalidateAll()` and the readout is the LOAD'S
	 * value rather than a copy the page kept.
	 *
	 * THE READOUT IS THE STORED ROW, NOT THE CHIP. `PathwayChip` renders nothing
	 * at all for an unset pathway, so a chip-only check cannot tell "unset" from
	 * "the component failed to mount", and it cannot tell a refused write from a
	 * successful one that happened to write the same value. The readout prints
	 * what the stub's store now holds, which is the thing a real row would be.
	 *
	 * THE REFUSAL: `?refuse=rls` makes the stub answer zero rows with no error
	 * (the silent-success trap `saveProfile` selects the row back to catch) and
	 * `?refuse=error` makes it answer a PostgREST error. In both the readout and
	 * every chip must stay on the OLD value and the panel must say why.
	 * `?pathway=none` seeds the unset state a student who deferred the
	 * first-login sheet arrives in.
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
	<p class="note">
		Pathway: open the menu and tap a tile under <strong>Pathway</strong>. The readout below and
		every chip move together, with no reload. Add <code>?refuse=rls</code> (zero rows, no error) or
		<code>?refuse=error</code> to force a refused write: the readout must NOT move and the panel
		must say why. <code>?pathway=none</code> starts from the unset state.
	</p>

	<div class="stage">
		<div class="fake-header">
			<span class="brand">IDEA</span>
			<ProfileMenu />
		</div>
	</div>

	<p class="readout">Current display name: <strong data-testid="name">{displayName(profile)}</strong></p>
	<p class="readout">
		Stored pathway: <strong data-testid="pathway">{profile?.pathway ?? 'unset'}</strong>
	</p>
	<!-- THE STORED ROW, NOT THE BANNER. `IdentityBanner` renders nothing at all
	     for an uncustomized identity, so a banner-only check cannot tell "chose
	     nothing" from "the component failed to mount", and cannot tell a refused
	     write from a successful one that wrote the same value. Same argument the
	     pathway readout above is here for. -->
	<p class="readout">
		Stored accent: <strong data-testid="accent">{profile?.style_accent_color ?? 'unset'}</strong>
	</p>
	<p class="readout">
		Stored badge: <strong data-testid="badge">{profile?.style_badge ?? 'unset'}</strong>
	</p>
	<p class="readout">
		Stored banner:
		<strong data-testid="bg">{profile?.style_background_type ?? 'unset'}</strong>
	</p>
	<p class="readout">
		Stored tagline: <strong data-testid="tagline">{profile?.style_tagline ?? 'unset'}</strong>
	</p>
	<p class="readout">
		0220 applied (columns present):
		<strong data-testid="style-ready">{profileStyleReady(profile) ? 'yes' : 'no'}</strong>
	</p>
	<p class="note">
		Identity: open the menu and expand <strong>Identity</strong>. Every control writes through the
		same <code>saveProfile</code> the name and the pathway use, so <code>?refuse=rls</code> and
		<code>?refuse=error</code> work here too and the readouts above must NOT move.
		<code>?style=set</code> starts customized; <code>?style=absent</code> is the pre-0220
		deployment, where the whole section must be gone.
	</p>
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
	code {
		font-family: 'Share Tech Mono', monospace;
		color: var(--cyan, #00f0ff);
	}
</style>
