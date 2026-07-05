<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/Avatar.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import { PATHWAYS, pathwayColor } from '$lib/pathways';
	import { displayName, type UserProfile } from '$lib/profile';
	import { store } from './store';

	/**
	 * Manual verification harness for the pathway identity system (dev-only).
	 * Verify here, per pathway: the chip (icon + label + color), the display
	 * name tint, and the REAL first-login picker flow. The picker on this page
	 * is the actual root-layout mount seeing this page's mock student profile,
	 * so choosing a pathway exercises the exact production path (stubbed save,
	 * invalidateAll, picker disappears, chips appear).
	 */

	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);

	// Sample identities, one per pathway, for the chip-beside-avatar rows.
	const SAMPLE_NAMES: Record<string, string> = {
		IDEA: 'Alex Rivera',
		ACE: 'Maya Trujillo',
		BMET: 'Daniel Okafor',
		CSEE: 'Priya Natarajan',
		MSET: 'Sam Delgado',
		MAT: 'Jordan Lee'
	};
	const sampleProfile = (id: string): UserProfile => ({
		id: `sample-${id}`,
		email: null,
		full_name: SAMPLE_NAMES[id] ?? id,
		display_name: null,
		avatar_url: null,
		avatar: null,
		role: 'student',
		section_id: null,
		pathway: id,
		preferences: {}
	});

	const resetPathway = async () => {
		store.profile.pathway = null;
		await invalidateAll();
	};
	const clearDismissal = () => {
		try {
			sessionStorage.removeItem('pathway-picker-dismissed');
		} catch {
			/* nothing to clear */
		}
		location.reload();
	};
</script>

<svelte:head><title>Pathway identity harness</title></svelte:head>

<div class="harness">
	<h1>Pathway identity harness</h1>
	<p class="note">
		Dev-only (no auth / network). Verify: (1) each chip pairs color with icon and label, (2) the
		display name tints in the pathway color beside an untinted avatar, (3) the first-login picker
		appears for this mock student, persists a choice, and never re-prompts, (4) MSET identity red
		stays distinct from the status crimson.
	</p>

	<div class="controls">
		<span class="readout">
			Mock student pathway: <strong>{profile?.pathway ?? 'not set'}</strong>
		</span>
		<button type="button" onclick={resetPathway}>Reset pathway (re-arm picker)</button>
		<button type="button" onclick={clearDismissal}>Clear "Choose later" + reload</button>
	</div>

	<h2>Chips, all six pathways</h2>
	<div class="stage">
		<div class="chip-grid">
			{#each PATHWAYS as p (p.id)}
				<div class="chip-cell">
					<PathwayChip pathway={p.id} size="sm" />
					<PathwayChip pathway={p.id} size="md" />
					<span class="chip-meta">{p.iconName} &middot; {p.color}</span>
				</div>
			{/each}
		</div>
		<p class="mini">Unset pathway renders nothing: [<PathwayChip pathway={null} size="sm" />]</p>
	</div>

	<h2>Identity rows: chip beside the image, tinted name</h2>
	<div class="stage">
		{#each PATHWAYS as p (p.id)}
			{@const sp = sampleProfile(p.id)}
			<div class="id-row">
				<Avatar profile={sp} size={30} />
				<PathwayChip pathway={p.id} size="sm" />
				<span class="id-name" style="color:{pathwayColor(p.id)}">{displayName(sp)}</span>
				<span class="id-note">avatar stays; chip + tint added</span>
			</div>
		{/each}
	</div>

	<h2>Color discipline: MSET identity vs status crimson</h2>
	<div class="stage">
		<div class="discipline">
			<span class="disc-item">
				<PathwayChip pathway="MSET" size="md" />
				<span class="disc-label">identity #FF2E2E (icon + label, never status)</span>
			</span>
			<span class="disc-item">
				<span class="live-badge">&#9679; LIVE</span>
				<span class="disc-label">status crimson #FF3355 (LIVE / REC / error only)</span>
			</span>
		</div>
	</div>

	<h2>ProfileMenu with the mock student</h2>
	<p class="note">
		No chip until a pathway is chosen in the picker; afterwards the chip sits beside the avatar in
		the trigger and in the open panel, with the name tinted.
	</p>
	<div class="stage">
		<div class="fake-header">
			<span class="brand">IDEA</span>
			<ProfileMenu />
		</div>
	</div>
</div>

<style>
	.harness {
		max-width: 760px;
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
	h2 {
		font-size: 1rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		margin: 2rem 0 0.5rem;
		color: var(--green, #00ff41);
	}
	.note {
		color: var(--dim, #5f8a78);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		margin: 1rem 0;
	}
	.controls button {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--green, #00ff41);
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 3px;
		padding: 0.35rem 0.7rem;
		cursor: pointer;
	}
	.readout {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--cyan, #00f0ff);
	}
	.stage {
		border: 1px solid var(--line, #16242c);
		border-radius: 8px;
		background: var(--bg1, #050f07);
		padding: 1rem 1.2rem;
	}
	.chip-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.9rem;
	}
	.chip-cell {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.chip-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		color: var(--dim, #5f8a78);
	}
	.mini {
		margin: 0.9rem 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim, #5f8a78);
	}
	.id-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0;
	}
	.id-name {
		font-weight: 600;
		font-size: 1.05rem;
	}
	.id-note {
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		color: var(--dim, #5f8a78);
	}
	.discipline {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
	}
	.disc-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.disc-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim, #5f8a78);
	}
	.live-badge {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		color: #ff3355;
		border: 1px solid rgba(255, 51, 85, 0.45);
		background: rgba(255, 51, 85, 0.12);
		border-radius: 999px;
		padding: 0.22rem 0.6rem;
	}
	.fake-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.8rem 1.2rem;
	}
	.brand {
		font-family: 'Orbitron', sans-serif;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--green, #00ff41);
	}
</style>
