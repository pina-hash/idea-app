<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '$lib/Avatar.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import { PATHWAYS, pathwayInk } from '$lib/pathways';
	import { displayName, type UserProfile } from '$lib/profile';
	import { store } from './store';
	/**
	 * THE GAUNTLET ROOM'S OWN STYLESHEET, imported for the `.gt-root` stage
	 * below and for nothing else. `/gauntlet/+layout.svelte` imports the same
	 * file, and without it `.gt-root` is a class with no rules -- a wrapper that
	 * looks like a room in the markup and paints nothing, which is a worse
	 * fixture than no wrapper at all. Every selector in it is scoped under
	 * `.gt-root`, so the roomless stages above are untouched.
	 */
	import '$lib/gauntlet/viewport/viewport.css';

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
				<!-- The INK, not the identity: this is a NAME, and the harness has to
				     demonstrate what ships. At the raw identity CSEE measured 4.01:1
				     and MSET 4.09:1 here. -->
				<span class="id-name" style="color:{pathwayInk(p.id)}">{displayName(sp)}</span>
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

	<!--
		THE SAME TWO COMPONENTS IN THE ROOM THEY ALSO SHIP IN.

		`Avatar` and `PathwayChip` are mounted directly by exactly two routes:
		`/dashboard`, which carries no scoped theme (the stages above are that
		one), and `/gauntlet/leaderboard`, which renders inside
		`/gauntlet/+layout.svelte`'s `.gt-root`. Every reading this harness had
		ever taken was the portal one -- CLAUDE.md's rule is to MEASURE when a
		shared component enters a new room, and the GAUNTLET viewport re-points
		`--bg0`, `--bg1`, `--bg2`, `--white`, `--dim`, `--green`, `--cyan` and
		`--gold` on `.gt-root` itself, so a chip whose fill is 12% alpha over
		whatever is behind it is a different colour in there.

		A SECOND STAGE, NOT A REPLACEMENT. The component genuinely ships in both
		rooms, so one harness cannot stand for both -- and the roomless stages
		are the ones `/dashboard` and `ProfileMenu` are read from. `.gt-root >
		main.gauntlet > table.board` is the leaderboard's own chain, not an
		approximation of it: `viewport.css` has rules keyed on `.gt-root
		.gauntlet`, so a stage that skipped `main.gauntlet` would be a third
		plate belonging to nobody.

		WHAT THIS STAGE DOES NOT REPRODUCE, and it changes what the number means:
		the real room mounts `ViewportBackground`, a WebGL canvas painting over
		`.gt-root`'s own `background: var(--void)`. This stage measures the solid
		void base, which viewport.css describes as the state that "stands alone
		while the volumetric scene loads (and if WebGL is unavailable, when the
		canvas stays empty)" -- a real state of the real room, and the one a
		contrast reading can be taken against at all, since a ratio over a live
		canvas is a ratio against whatever frame it was on.
	-->
	<h2>The same pair inside GAUNTLET's room (/gauntlet/leaderboard)</h2>
	<div class="stage gt-stage">
		<div class="gt-root">
			<main class="gauntlet">
				<table class="board lb-board">
					<thead>
						<tr><th class="rank-col">#</th><th>Student</th><th class="num-col">XP</th></tr>
					</thead>
					<tbody>
						{#each PATHWAYS as p, i (p.id)}
							{@const sp = sampleProfile(p.id)}
							<tr>
								<td class="rank-col">{i + 1}</td>
								<td>
									<span class="lb-who">
										<Avatar profile={sp} size={26} />
										<span class="lb-name">{displayName(sp)}</span>
										<PathwayChip pathway={p.id} size="sm" />
									</span>
								</td>
								<td class="num-col">{(6 - i) * 120}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</main>
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
	/* The room stage is given a real box and nothing else: `.gt-root` brings its
	   own plate (`background: var(--void)`) and its own token set, and a harness
	   rule that painted over either would be measuring this file instead of the
	   room. */
	.gt-stage {
		padding: 0;
	}
	.gt-stage .gt-root {
		padding: 1rem;
		border-radius: 6px;
	}
	.gt-stage .lb-who {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.gt-stage table {
		width: 100%;
		border-collapse: collapse;
	}
	.gt-stage :is(th, td) {
		text-align: left;
		padding: 0.35rem 0.5rem;
	}
	.gt-stage .num-col,
	.gt-stage .rank-col {
		text-align: right;
		width: 3rem;
	}
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
		/*
			44px, AND THIS IS THE HARNESS'S OWN CHROME RATHER THAN A STUDENT
			SURFACE. These two buttons measured 194.7x26.2 and were the whole of
			`/dev/pathways`'s standing tap-target finding at BOTH widths, for
			weeks -- a row every prompt had to warn the next session to ignore.
			Nothing on this page but these two was ever under the floor: the real
			first-login picker's controls measure 140.1x79.4 (options),
			143.6x44.0 (confirm) and 128.4x44.0 ("Choose later"), all clear.

			So the row was correct about the pixels and pointed at a page nobody
			signs in to. Decision 09 (2026-09-02) puts the 44px floor on every
			student surface and 24px only on an instructor density surface
			declaring a named class; a dev harness's own controls are neither, so
			the honest answer is not a threshold exemption -- it is that a
			harness page has no reason to be under a floor the rest of the app
			holds. `min-height`, never `height`: CLAUDE.md's floor rounds only
			one way.
		*/
		min-height: 44px;
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
