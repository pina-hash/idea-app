<script lang="ts">
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

	/**
	 * GREENLINE garage / loadout screen (dev harness UI). Pure presentation
	 * over the loadout catalog, the Minimap convention: state in via props,
	 * intent out via callbacks; this component never touches physics, rigs,
	 * or storage. Everything is unlocked (the economy layer comes later).
	 */
	const {
		loadout,
		baselineHealth,
		baselineMass,
		baselineEngine,
		baselineDrag,
		onselect,
		onequip,
		onclose
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
	} = $props();

	const stats = $derived(resolveLoadout(loadout));
	const summary = $derived(describeStats(stats));

	// Hero numbers: what the build actually means in this session's tuning.
	const hull = $derived(Math.round(baselineHealth * stats.maxHealth));
	const mass = $derived(Math.round(baselineMass * stats.chassisMass));
	// Top speed proxy: quadratic drag terminal speed sqrt(engine / drag).
	const topSpeed = $derived(
		Math.sqrt((baselineEngine * stats.engineForce) / Math.max(0.01, baselineDrag * stats.aeroDrag))
	);
	const cooldownPct = $derived(Math.round(stats.weaponCooldown * 100));

	const fmtPct = (pct: number) => `${pct > 0 ? '+' : ''}${pct}%`;
</script>

<div class="gg-scrim" role="presentation">
	<div class="gg-panel" role="dialog" aria-label="Garage loadout">
		<div class="gg-head">
			<span class="gg-title">GARAGE // LOADOUT</span>
			<span class="gg-note">all parts unlocked (dev) · applies live to the player vehicle</span>
			<button class="gg-close" onclick={onclose}>CLOSE (G)</button>
		</div>

		<div class="gg-section-label">archetype</div>
		<div class="gg-archs">
			{#each ARCHETYPES as a (a.id)}
				<button
					class="gg-arch"
					class:sel={a.id === loadout.archetype}
					onclick={() => onselect(a.id)}
				>
					<span class="gg-arch-name">{a.name}</span>
					<span class="gg-arch-role">{a.role}</span>
					<span class="gg-chips">
						{#each describeEffects(a.effects) as c (c.key)}
							<span class="gg-chip {c.tone}">{c.label} {fmtPct(c.pct)}</span>
						{/each}
					</span>
				</button>
			{/each}
		</div>

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

		<div class="gg-section-label">resolved build</div>
		<div class="gg-summary">
			<div class="gg-heroes">
				<span class="gg-hero">HULL <b>{hull}</b></span>
				<span class="gg-hero">MASS <b>{mass}kg</b></span>
				<span class="gg-hero">TOP SPEED ≈ <b>{topSpeed.toFixed(1)}m/s</b></span>
				<span class="gg-hero">COOLDOWNS <b>{cooldownPct}%</b></span>
			</div>
			<div class="gg-chips">
				{#each summary as c (c.key)}
					<span class="gg-chip {c.tone}">{c.label} {fmtPct(c.pct)}</span>
				{:else}
					<span class="gg-part-blurb">neutral build, identical to the tuning-panel baseline</span>
				{/each}
			</div>
			<div class="gg-foot">
				multipliers apply over the live tuning panel baseline · mass is character, not a stat:
				heavy builds physically resist tethers, rams, and spins, and pay in acceleration
			</div>
		</div>
	</div>
</div>

<style>
	.gg-scrim {
		position: absolute;
		inset: 0;
		background: rgba(3, 6, 4, 0.72);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 30;
		font-family: 'Share Tech Mono', monospace;
	}
	.gg-panel {
		width: min(94vw, 66rem);
		max-height: 92vh;
		overflow-y: auto;
		background: rgba(6, 12, 8, 0.97);
		border: 1px solid rgba(0, 255, 65, 0.4);
		padding: 0.9rem 1rem 1rem;
		color: #b9d9c2;
	}
	.gg-head {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
		margin-bottom: 0.5rem;
	}
	.gg-title {
		color: #00ff41;
		letter-spacing: 0.14em;
		font-size: 0.95rem;
	}
	.gg-note {
		color: #5f7f6a;
		font-size: 0.7rem;
		flex: 1;
	}
	.gg-close {
		background: rgba(0, 255, 65, 0.1);
		border: 1px solid rgba(0, 255, 65, 0.4);
		color: #00ff41;
		font-family: inherit;
		font-size: 0.7rem;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	.gg-close:hover {
		background: rgba(0, 255, 65, 0.2);
	}
	.gg-section-label {
		color: #7fbf8f;
		letter-spacing: 0.12em;
		font-size: 0.72rem;
		border-bottom: 1px solid rgba(0, 255, 65, 0.15);
		margin: 0.6rem 0 0.35rem;
	}
	.gg-archs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 0.5rem;
	}
	.gg-arch,
	.gg-part {
		text-align: left;
		background: rgba(10, 20, 14, 0.8);
		border: 1px solid rgba(0, 255, 65, 0.18);
		color: inherit;
		font-family: inherit;
		padding: 0.45rem 0.55rem;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.gg-arch:hover,
	.gg-part:hover {
		border-color: rgba(0, 255, 65, 0.45);
	}
	.gg-arch.sel,
	.gg-part.sel {
		border-color: #00ff41;
		background: rgba(0, 255, 65, 0.09);
		box-shadow: 0 0 10px rgba(0, 255, 65, 0.18) inset;
	}
	.gg-arch-name {
		color: #00ff41;
		letter-spacing: 0.12em;
		font-size: 0.85rem;
	}
	.gg-arch-role {
		color: #7fbf8f;
		font-size: 0.68rem;
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
	.gg-part-name {
		color: #e8ffe8;
		font-size: 0.76rem;
	}
	.gg-part-blurb {
		color: #5f7f6a;
		font-size: 0.66rem;
		line-height: 1.35;
	}
	.gg-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.gg-chip {
		font-size: 0.62rem;
		padding: 0.06rem 0.32rem;
		border: 1px solid;
		white-space: nowrap;
	}
	.gg-chip.good {
		color: #00ff41;
		border-color: rgba(0, 255, 65, 0.45);
		background: rgba(0, 255, 65, 0.07);
	}
	.gg-chip.bad {
		color: #ff8f6a;
		border-color: rgba(255, 143, 106, 0.45);
		background: rgba(255, 143, 106, 0.06);
	}
	.gg-chip.neutral {
		color: #ffb347;
		border-color: rgba(255, 179, 71, 0.45);
		background: rgba(255, 179, 71, 0.06);
	}
	.gg-summary {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.gg-heroes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem;
		font-size: 0.74rem;
		color: #7fbf8f;
	}
	.gg-hero b {
		color: #00f0ff;
		font-weight: normal;
	}
	.gg-foot {
		color: #5f7f6a;
		font-size: 0.64rem;
		line-height: 1.4;
	}
</style>
