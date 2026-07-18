<script lang="ts">
	import './brand/brand';
	import {
		ARCHETYPES,
		describeEffects,
		describeStats,
		PART_SLOTS,
		partsForSlot,
		resolveLoadout,
		type ArchetypeId,
		type Loadout,
		type PartSlot
	} from './loadout';
	import GaragePreview from './GaragePreview.svelte';

	/**
	 * GREENLINE garage / loadout screen. Pure presentation over the loadout
	 * catalog, the Minimap convention: state in via props, intent out via
	 * callbacks; this component never touches physics, rigs, or storage.
	 * Everything is unlocked (the economy layer comes later).
	 *
	 * Visual language (per the art-direction reference): near-black night base,
	 * chrome/steel material, Saira Condensed labels. Each archetype carries its
	 * own line-art silhouette glyph so the four builds read as distinct machines
	 * at a glance, before any stat is read; the SELECTED build is marked by the
	 * green signature line (green = "your line", used nowhere else here).
	 */
	const {
		loadout,
		baselineHealth,
		baselineMass,
		baselineEngine,
		baselineDrag,
		onselect,
		onequip,
		onclose,
		note = 'all parts unlocked (dev) · applies live to the player vehicle',
		closeLabel = 'CLOSE (G)',
		onback,
		backLabel = 'BACK',
		preview = true
	}: {
		loadout: Loadout;
		/** Current tuning-panel baselines the multipliers apply over. */
		baselineHealth: number;
		baselineMass: number;
		baselineEngine: number;
		baselineDrag: number;
		onselect: (id: ArchetypeId) => void;
		onequip: (slot: PartSlot, partId: string) => void;
		onclose: () => void;
		/** Sub-title copy (defaults to the dev-harness note). */
		note?: string;
		/** Primary action label (defaults to the dev-harness "CLOSE (G)"). */
		closeLabel?: string;
		/** Optional secondary action; renders a header button when provided. */
		onback?: () => void;
		backLabel?: string;
		/**
		 * Mount the isolated 3D build preview (GaragePreview) beside the
		 * archetype cards. On by default for the pre-race garage flow; the
		 * race's dev-only G-key overlay passes false, since the live race
		 * scene behind it already shows the actual machine and a second WebGL
		 * context over a running sim is pure cost.
		 */
		preview?: boolean;
	} = $props();

	const stats = $derived(resolveLoadout(loadout));
	const summary = $derived(describeStats(stats));

	// Hero numbers: what the build actually means in this session's tuning.
	// Physics stays metric (baselineMass in kg, the speed proxy in m/s); these
	// convert to US customary at the display layer only.
	const hull = $derived(Math.round(baselineHealth * stats.maxHealth));
	// Mass in pounds (1 kg = 2.2046226 lb).
	const massLb = $derived(Math.round(baselineMass * stats.chassisMass * 2.2046226));
	// Top speed proxy: quadratic-drag terminal speed sqrt(engine / drag), m/s,
	// shown in mph (1 m/s = 2.236936 mph).
	const topSpeedMph = $derived(
		Math.sqrt(
			(baselineEngine * stats.engineForce) / Math.max(0.01, baselineDrag * stats.aeroDrag)
		) * 2.236936
	);
	const cooldownPct = $derived(Math.round(stats.weaponCooldown * 100));

	const fmtPct = (pct: number) => `${pct > 0 ? '+' : ''}${pct}%`;
</script>

<div class="glb gg-scrim" role="presentation">
	<div class="gg-panel" role="dialog" aria-label="Garage loadout">
		<div class="gg-head">
			<span class="gg-title">GARAGE</span>
			<span class="gg-note">{note}</span>
			{#if onback}
				<button class="gg-btn" onclick={onback}>{backLabel}</button>
			{/if}
			<button class="gg-btn gg-btn-primary" onclick={onclose}>{closeLabel}</button>
		</div>

		{#snippet archetypeSection()}
		<div class="gg-section-label">Archetype</div>
		<div class="gg-archs">
			{#each ARCHETYPES as a (a.id)}
				<button
					class="gg-arch"
					class:sel={a.id === loadout.archetype}
					onclick={() => onselect(a.id)}
				>
					<svg class="gg-glyph" viewBox="0 0 64 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						{#if a.id === 'armor'}
							<!-- Juggernaut: heavy slab hull, plated seams -->
							<path d="M6 21 L10 12 L22 7 L42 7 L54 12 L58 21 Z" />
							<path d="M19 8.2 V21 M32 7 V21 M45 8.2 V21" stroke-width="1" opacity="0.7" />
							<path d="M2 24 H62" stroke-width="1" opacity="0.35" />
						{:else if a.id === 'velocity'}
							<!-- Missile: low dart wedge, speed lines -->
							<path d="M10 19 L30 9 L60 15.5 L46 19 Z" />
							<path d="M2 11 H16 M2 15 H11 M2 19 H6" stroke-width="1" opacity="0.7" />
						{:else if a.id === 'handling'}
							<!-- Scalpel: the apex line through a corner -->
							<path d="M4 23 Q28 23 40 13 Q47 7 60 6" />
							<path d="M34 21 L41 14 M40 24 L47 17" stroke-width="1.2" opacity="0.8" />
							<circle cx="40" cy="13" r="2.4" stroke-width="1.2" />
						{:else}
							<!-- Warlock: hardened electronics, live antenna -->
							<path d="M12 20 L18 11 L46 11 L52 20 Z" />
							<path d="M32 11 V4.5" stroke-width="1.2" />
							<circle cx="32" cy="3.4" r="1.5" stroke-width="1.2" />
							<path d="M18 16 h8 l3 -3 h9 l3 3 h5" stroke-width="1" opacity="0.8" />
						{/if}
					</svg>
					<span class="gg-arch-name">{a.name}</span>
					<span class="gg-arch-role">{a.role}</span>
					<span class="gg-chips">
						{#each describeEffects(a.effects) as c (c.key)}
							<span class="gg-chip {c.tone}">{c.label} {fmtPct(c.pct)}</span>
						{/each}
					</span>
					<span class="gg-sel-line" aria-hidden="true"></span>
				</button>
			{/each}
		</div>
		{/snippet}

		{#if preview}
			<!-- The missing visual half: the resolved build in an isolated 3D
			     viewport beside the archetype cards, rebuilt live off the same
			     shared builder the race scene uses. -->
			<div class="gg-top">
				<div class="gg-preview">
					<div class="gg-preview-frame"><GaragePreview {loadout} /></div>
					<div class="gg-preview-hint">live build · drag to orbit · scroll to zoom</div>
				</div>
				<div class="gg-top-right">{@render archetypeSection()}</div>
			</div>
		{:else}
			{@render archetypeSection()}
		{/if}

		<div class="gg-slots">
			{#each PART_SLOTS as slot (slot.id)}
				<div class="gg-slot">
					<div class="gg-section-label">{slot.label}</div>
					{#each partsForSlot(slot.id) as part (part.id)}
						<button
							class="gg-part"
							class:sel={loadout.parts[slot.id] === part.id}
							onclick={() => onequip(slot.id, part.id)}
						>
							<span class="gg-part-name">{part.name}</span>
							<span class="gg-part-blurb">{part.blurb}</span>
							{#if describeEffects(part.effects).length}
								<span class="gg-chips">
									{#each describeEffects(part.effects) as c (c.key)}
										<span class="gg-chip {c.tone}">{c.label} {fmtPct(c.pct)}</span>
									{/each}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			{/each}
		</div>

		<div class="gg-section-label">Resolved build</div>
		<div class="gg-summary">
			<div class="gg-heroes">
				<span class="gg-hero">HULL <b>{hull}</b></span>
				<span class="gg-hero">MASS <b>{massLb}<i>lb</i></b></span>
				<span class="gg-hero">TOP SPEED <b>{topSpeedMph.toFixed(1)}<i>mph</i></b></span>
				<span class="gg-hero">COOLDOWNS <b>{cooldownPct}<i>%</i></b></span>
			</div>
			<div class="gg-chips">
				{#each summary as c (c.key)}
					<span class="gg-chip {c.tone}">{c.label} {fmtPct(c.pct)}</span>
				{:else}
					<span class="gg-part-blurb">neutral build, identical to the tuning-panel baseline</span>
				{/each}
			</div>
			<div class="gg-foot">
				multipliers apply over the live tuning baseline · mass is character, not a stat: heavy
				builds physically resist tethers, rams, and spins, and pay in acceleration
			</div>
		</div>
	</div>
</div>

<style>
	.gg-scrim {
		position: absolute;
		inset: 0;
		background: rgba(2, 3, 4, 0.78);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 30;
	}
	.gg-panel {
		width: min(94vw, 74rem);
		max-height: 92vh;
		overflow-y: auto;
		background:
			radial-gradient(120% 50% at 50% -10%, rgba(120, 165, 205, 0.06), transparent 60%),
			linear-gradient(180deg, #0b1016 0%, #070a0e 42%, #04060a 100%);
		border: 1px solid var(--glb-line);
		border-top-color: var(--glb-line-strong);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.08),
			0 30px 80px rgba(0, 0, 0, 0.6);
		padding: 1rem 1.2rem 1.1rem;
		color: var(--glb-ink);
	}
	.gg-head {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin-bottom: 0.7rem;
		padding-bottom: 0.6rem;
		border-bottom: 1px solid var(--glb-line);
	}
	.gg-title {
		font-family: var(--glb-font-display);
		font-size: 1.15rem;
		letter-spacing: -0.01em;
		transform: skewX(-7deg);
		background: var(--glb-chrome-grad);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		user-select: none;
	}
	.gg-note {
		color: var(--glb-ink-faint);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		flex: 1;
	}
	.gg-btn {
		background: linear-gradient(180deg, rgba(23, 30, 37, 0.85), rgba(9, 13, 17, 0.9));
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		color: var(--glb-steel);
		font: 600 0.72rem var(--glb-font-ui);
		letter-spacing: 0.18em;
		padding: 0.34rem 0.8rem;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}
	.gg-btn:hover,
	.gg-btn:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: var(--glb-line-strong);
		outline: none;
	}
	.gg-btn-primary {
		color: var(--glb-chrome-mid);
		border-color: var(--glb-line-strong);
		box-shadow: inset 0 1px 0 rgba(247, 251, 254, 0.12);
	}
	.gg-btn-primary:hover,
	.gg-btn-primary:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: rgba(42, 229, 126, 0.7);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.16),
			0 0 14px rgba(42, 229, 126, 0.25);
	}
	.gg-section-label {
		color: var(--glb-ink-dim);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.26em;
		font-size: 0.66rem;
		border-bottom: 1px solid var(--glb-line);
		padding-bottom: 0.2rem;
		margin: 0.7rem 0 0.4rem;
	}
	.gg-archs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 0.55rem;
	}
	/* Preview viewport beside the archetype cards; stacks on narrow screens. */
	.gg-top {
		display: grid;
		grid-template-columns: minmax(19rem, 24rem) 1fr;
		gap: 0.9rem;
		align-items: stretch;
	}
	.gg-preview {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-top: 0.7rem;
	}
	.gg-preview-frame {
		position: relative;
		flex: 1;
		min-height: 16rem;
		border: 1px solid var(--glb-line);
		border-top-color: var(--glb-line-strong);
		box-shadow: inset 0 1px 0 rgba(247, 251, 254, 0.06);
		overflow: hidden;
	}
	.gg-preview-hint {
		color: var(--glb-ink-faint);
		font-size: 0.62rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	@media (max-width: 900px) {
		.gg-top {
			grid-template-columns: 1fr;
		}
		.gg-preview-frame {
			min-height: 0;
			aspect-ratio: 16 / 10;
		}
	}
	.gg-arch,
	.gg-part {
		position: relative;
		text-align: left;
		background: linear-gradient(180deg, rgba(16, 22, 28, 0.85), rgba(7, 10, 14, 0.9));
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		color: inherit;
		font-family: inherit;
		padding: 0.5rem 0.6rem;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
		transition:
			border-color 140ms ease,
			background 140ms ease;
		overflow: hidden;
	}
	.gg-arch:hover,
	.gg-part:hover {
		border-color: var(--glb-line-strong);
	}
	.gg-arch.sel,
	.gg-part.sel {
		border-color: rgba(207, 218, 226, 0.5);
		background: linear-gradient(180deg, rgba(24, 32, 40, 0.95), rgba(9, 13, 17, 0.95));
		box-shadow: inset 0 1px 0 rgba(247, 251, 254, 0.1);
	}
	.gg-glyph {
		width: 4rem;
		height: 1.75rem;
		color: var(--glb-steel-dim);
		transition: color 140ms ease;
	}
	.gg-arch:hover .gg-glyph {
		color: var(--glb-steel);
	}
	.gg-arch.sel .gg-glyph {
		color: var(--glb-chrome-mid);
	}
	.gg-arch-name {
		font-family: var(--glb-font-display);
		font-size: 0.82rem;
		letter-spacing: 0.02em;
		color: var(--glb-chrome-mid);
	}
	.gg-arch.sel .gg-arch-name {
		background: var(--glb-chrome-grad);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.gg-arch-role {
		color: var(--glb-ink-dim);
		font-size: 0.7rem;
		line-height: 1.3;
	}
	/* The green signature line marks the chosen machine, nothing else. */
	.gg-sel-line {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2px;
		background: linear-gradient(90deg, rgba(42, 229, 126, 0), #2ae57e 30%, #c8ffe2 55%, #2ae57e 80%, rgba(42, 229, 126, 0));
		box-shadow: 0 0 10px rgba(42, 229, 126, 0.8);
		opacity: 0;
		transition: opacity 160ms ease;
	}
	.gg-arch.sel .gg-sel-line {
		opacity: 1;
	}
	.gg-slots {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.35rem 0.7rem;
		margin-top: 0.2rem;
	}
	.gg-slot {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.gg-part {
		padding: 0.42rem 0.55rem 0.42rem 0.7rem;
	}
	.gg-part::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2px;
		background: linear-gradient(180deg, #2ae57e, #c8ffe2);
		box-shadow: 0 0 8px rgba(42, 229, 126, 0.8);
		opacity: 0;
		transition: opacity 140ms ease;
	}
	.gg-part.sel::before {
		opacity: 1;
	}
	.gg-part-name {
		color: var(--glb-ink);
		font-weight: 600;
		font-size: 0.78rem;
		letter-spacing: 0.05em;
	}
	.gg-part.sel .gg-part-name {
		color: var(--glb-chrome-hi);
	}
	.gg-part-blurb {
		color: var(--glb-ink-faint);
		font-size: 0.68rem;
		line-height: 1.35;
	}
	.gg-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.gg-chip {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		padding: 0.05rem 0.34rem;
		border: 1px solid;
		border-radius: 1px;
		white-space: nowrap;
	}
	.gg-chip.good {
		color: var(--glb-green-ui);
		border-color: rgba(143, 255, 196, 0.35);
		background: rgba(42, 229, 126, 0.06);
	}
	.gg-chip.bad {
		color: #d9906a;
		border-color: rgba(217, 144, 106, 0.35);
		background: rgba(217, 144, 106, 0.05);
	}
	.gg-chip.neutral {
		color: #9fb0bd;
		border-color: rgba(159, 176, 189, 0.3);
		background: rgba(159, 176, 189, 0.05);
	}
	.gg-summary {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.gg-heroes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.2rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		color: var(--glb-ink-dim);
	}
	.gg-hero b {
		font-family: var(--glb-font-data);
		font-weight: normal;
		font-size: 0.92rem;
		letter-spacing: 0;
		color: var(--glb-chrome-hi);
		margin-left: 0.25rem;
	}
	.gg-hero i {
		font-style: normal;
		font-size: 0.68rem;
		color: var(--glb-steel-dim);
	}
	.gg-foot {
		color: var(--glb-ink-faint);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		line-height: 1.45;
	}
</style>
