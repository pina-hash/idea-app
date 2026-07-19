<script lang="ts">
	import './brand/brand';
	import {
		abilityCapacityFor,
		abilityCostUsed,
		abilityLoadoutIssue,
		abilitySlotCost,
		archetypeById,
		ARCHETYPES,
		COSMETIC_COLORS,
		COSMETIC_PATTERNS,
		describeEffects,
		describeStats,
		mountCapacityFor,
		mountCostUsed,
		PART_SLOTS,
		partsForSlot,
		resolveLoadout,
		resolveWeaponSockets,
		slotSocketChoices,
		STAT_META,
		weaponLoadoutIssue,
		weaponMountCost,
		type ArchetypeId,
		type Cosmetics,
		type Loadout,
		type PartSlot,
		type StatKey
	} from './loadout';
	import {
		WEAPON_NONE,
		WEAPON_SOCKET_LABELS,
		WEAPONS,
		type WeaponSlotId,
		type WeaponSocketId
	} from './combat';
	import { ABILITIES, ABILITY_NONE, type AbilitySlotId } from './abilities';
	import { GREENLINE_MAX_SLOTS, type LoadoutSlot } from './persistence';
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
		onsocket,
		oncosmetic,
		onclose,
		note = 'all parts unlocked (dev) · applies live to the player vehicle',
		closeLabel = 'CLOSE (G)',
		onback,
		backLabel = 'BACK',
		preview = true,
		onSettings,
		slots,
		activeSlot = null,
		onSaveSlot,
		onLoadSlot,
		onDeleteSlot
	}: {
		loadout: Loadout;
		/** Current tuning-panel baselines the multipliers apply over. */
		baselineHealth: number;
		baselineMass: number;
		baselineEngine: number;
		baselineDrag: number;
		onselect: (id: ArchetypeId) => void;
		onequip: (slot: PartSlot, partId: string) => void;
		/** Pick a mount socket for an equipped weapon slot (Phase 4c). The
		 * parent sanitizes + persists exactly like an equip. */
		onsocket?: (slot: WeaponSlotId, socket: WeaponSocketId) => void;
		/** Patch the preset livery (Phase 6b): color / pattern / number. The
		 * parent merges + re-normalizes + persists, exactly like an equip. */
		oncosmetic?: (patch: Partial<Cosmetics>) => void;
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
		/** Optional: renders a gear button that opens the settings overlay. */
		onSettings?: () => void;
		/**
		 * Named build slots (index = slot number, null = empty), up to
		 * GREENLINE_MAX_SLOTS. When provided, the BUILD SLOTS section renders. The
		 * garage stays storage-agnostic: the parent owns persistence and passes
		 * these + the callbacks below (the Minimap convention).
		 */
		slots?: (LoadoutSlot | null)[];
		/** Which slot the working build is tied to (null = custom / unsaved). */
		activeSlot?: number | null;
		onSaveSlot?: (slot: number, name: string) => void;
		onLoadSlot?: (slot: number) => void;
		onDeleteSlot?: (slot: number) => void;
	} = $props();

	const stats = $derived(resolveLoadout(loadout));

	// --- Livery (Phase 6b): preset color / pattern / number. Presentation only;
	// the number input clamps 0-99 and an empty value clears it. ---
	const livery = $derived(loadout.cosmetics);
	const swHex = (n: number) => '#' + n.toString(16).padStart(6, '0');
	const onNumberInput = (e: Event) => {
		const raw = (e.currentTarget as HTMLInputElement).value.trim();
		if (raw === '') {
			oncosmetic?.({ number: undefined });
			return;
		}
		const n = parseInt(raw, 10);
		if (Number.isNaN(n)) return;
		oncosmetic?.({ number: Math.max(0, Math.min(99, n)) });
	};

	// --- Weapon mounts: the flat capacity budget (never a multiplier). The
	// picker blocks any invalid pairing OUTRIGHT with the reason shown, so an
	// over-budget or duplicate fit can never be saved from this UI; the
	// loadout.ts sanitizer backs it up for every non-UI path. ---
	const mountCapacity = $derived(mountCapacityFor(loadout));
	const mountUsed = $derived(mountCostUsed(loadout));
	const WEAPON_SLOT_UI: { id: WeaponSlotId; label: string; allowNone: boolean }[] = [
		{ id: 'weaponPrimary', label: 'PRIMARY WEAPON', allowNone: false },
		{ id: 'weaponSecondary', label: 'SECONDARY WEAPON', allowNone: true }
	];
	/** The effective socket per equipped weapon slot (explicit pick or auto). */
	const resolvedSockets = $derived(resolveWeaponSockets(loadout));
	/** Why this candidate cannot go in this slot right now (null = allowed). */
	function weaponBlockReason(slot: WeaponSlotId, id: string): string | null {
		if (id === WEAPON_NONE) return null;
		if (loadout.parts[slot] === id) return null;
		const otherSlot: WeaponSlotId = slot === 'weaponPrimary' ? 'weaponSecondary' : 'weaponPrimary';
		if (loadout.parts[otherSlot] === id)
			return `already equipped as ${otherSlot === 'weaponPrimary' ? 'primary' : 'secondary'}`;
		const free = mountCapacity - weaponMountCost(loadout.parts[otherSlot]);
		if (weaponMountCost(id) > free)
			return `over budget — needs ${weaponMountCost(id)}, ${Math.max(0, free)} free`;
		// Socket assignability (4c): duplicates and capacity are handled above,
		// so any remaining issue on the candidate build is a mount-socket
		// collision ("both weapons need the same mount socket" — e.g. a second
		// nose-only gun on the two-socket VELOCITY dart) or a chassis with no
		// compatible socket at all. Blocked outright, reason shown, never left
		// to clip.
		return weaponLoadoutIssue({
			...loadout,
			parts: { ...loadout.parts, [slot]: id }
		});
	}

	// --- Abilities: the drift-charged active slots. A SEPARATE flat capacity
	// budget from weapons, with the INVERTED archetype ordering (VELOCITY high,
	// SYSTEMS low). Same no-duplicate / over-budget blocking as weapons; no
	// sockets. Ability picks route through the shared onequip callback (ability
	// slots are PartSlot values), so no extra prop is needed. ---
	const abilityCapacity = $derived(abilityCapacityFor(loadout));
	const abilityUsed = $derived(abilityCostUsed(loadout));
	const ABILITY_SLOT_UI: { id: AbilitySlotId; label: string; allowNone: boolean }[] = [
		{ id: 'abilityPrimary', label: 'PRIMARY ABILITY', allowNone: false },
		{ id: 'abilitySecondary', label: 'SECONDARY ABILITY', allowNone: true }
	];
	/** Why this candidate cannot go in this slot right now (null = allowed). */
	function abilityBlockReason(slot: AbilitySlotId, id: string): string | null {
		if (id === ABILITY_NONE) return null;
		if (loadout.parts[slot] === id) return null;
		const otherSlot: AbilitySlotId =
			slot === 'abilityPrimary' ? 'abilitySecondary' : 'abilityPrimary';
		if (loadout.parts[otherSlot] === id)
			return `already equipped as ${otherSlot === 'abilityPrimary' ? 'primary' : 'secondary'}`;
		const free = abilityCapacity - abilitySlotCost(loadout.parts[otherSlot]);
		if (abilitySlotCost(id) > free)
			return `over budget — needs ${abilitySlotCost(id)}, ${Math.max(0, free)} free`;
		return abilityLoadoutIssue({ ...loadout, parts: { ...loadout.parts, [slot]: id } });
	}

	const fmtPct = (pct: number) => `${pct > 0 ? '+' : ''}${Math.round(pct)}%`;

	/** Tone a signed delta by which direction reads as an upgrade. */
	function toneByDelta(deltaPct: number, better: 'higher' | 'lower' | 'neutral') {
		if (better === 'neutral' || Math.abs(deltaPct) < 0.5) return 'neutral';
		return (better === 'higher') === deltaPct > 0 ? 'good' : 'bad';
	}

	/**
	 * The four headline numbers, each with its real delta from the neutral
	 * baseline and a tone, so the build reads at a glance without parsing a wall
	 * of multipliers. Physics stays metric (kg, m/s); US-customary conversion is
	 * display-only.
	 */
	const heroes = $derived.by(() => {
		const s = stats;
		const baseTop = Math.sqrt(baselineEngine / Math.max(0.01, baselineDrag)) * 2.236936;
		const top =
			Math.sqrt((baselineEngine * s.engineForce) / Math.max(0.01, baselineDrag * s.aeroDrag)) *
			2.236936;
		const speedDelta = baseTop > 0 ? (top / baseTop - 1) * 100 : 0;
		return [
			{
				label: 'HULL',
				value: String(Math.round(baselineHealth * s.maxHealth)),
				unit: '',
				delta: (s.maxHealth - 1) * 100,
				tone: toneByDelta((s.maxHealth - 1) * 100, STAT_META.maxHealth.better)
			},
			{
				label: 'TOP SPEED',
				value: top.toFixed(1),
				unit: 'mph',
				delta: speedDelta,
				tone: toneByDelta(speedDelta, 'higher')
			},
			{
				label: 'MASS',
				value: String(Math.round(baselineMass * s.chassisMass * 2.2046226)),
				unit: 'lb',
				delta: (s.chassisMass - 1) * 100,
				tone: 'neutral' as const
			},
			{
				label: 'COOLDOWNS',
				value: String(Math.round(s.weaponCooldown * 100)),
				unit: '%',
				delta: (s.weaponCooldown - 1) * 100,
				tone: toneByDelta((s.weaponCooldown - 1) * 100, STAT_META.weaponCooldown.better)
			}
		];
	});

	// The headline heroes already cover these five stats; the secondary list
	// shows only the REST (grip, steering, resistances, EMP reach, ...), grouped
	// by what you gain vs what it costs.
	const HERO_KEYS: StatKey[] = [
		'maxHealth',
		'chassisMass',
		'engineForce',
		'aeroDrag',
		'weaponCooldown'
	];
	const secondary = $derived(describeStats(stats).filter((c) => !HERO_KEYS.includes(c.key)));
	const gains = $derived(secondary.filter((c) => c.tone === 'good'));
	const costs = $derived(secondary.filter((c) => c.tone === 'bad'));
	const character = $derived(secondary.filter((c) => c.tone === 'neutral'));

	// --- Build slots (only rendered when the parent passes `slots`) ---
	const slotList = $derived(
		slots
			? Array.from({ length: GREENLINE_MAX_SLOTS }, (_, i) => slots.find((s) => s?.slot === i) ?? null)
			: []
	);
	let slotName = $state('');
	let confirmDelete = $state<number | null>(null);

	function doSave(i: number) {
		const existing = slotList[i];
		const name = slotName.trim() || existing?.name || `Build ${i + 1}`;
		onSaveSlot?.(i, name);
		slotName = '';
		confirmDelete = null;
	}
	function doDelete(i: number) {
		onDeleteSlot?.(i);
		confirmDelete = null;
	}
</script>

<div class="glb gg-scrim" role="presentation">
	<div class="gg-panel" role="dialog" aria-label="Garage loadout">
		<div class="gg-head">
			<span class="gg-title">GARAGE</span>
			<span class="gg-note">{note}</span>
			{#if onSettings}
				<button class="gg-btn gg-gear" onclick={onSettings} aria-label="Settings" title="Settings">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="12" r="3.2" />
						<path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
					</svg>
				</button>
			{/if}
			{#if onback}
				<button class="gg-btn" onclick={onback}>{backLabel}</button>
			{/if}
			<button class="gg-btn gg-btn-primary" onclick={onclose}>{closeLabel}</button>
		</div>

		{#snippet partIcon(id: string)}
			<svg class="gg-part-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				{#if id === 'plating-stock'}
					<!-- Factory panel with bolt heads -->
					<rect x="4" y="6" width="16" height="12" rx="1" />
					<circle cx="7" cy="9" r="0.7" fill="currentColor" stroke="none" />
					<circle cx="17" cy="9" r="0.7" fill="currentColor" stroke="none" />
					<circle cx="7" cy="15" r="0.7" fill="currentColor" stroke="none" />
					<circle cx="17" cy="15" r="0.7" fill="currentColor" stroke="none" />
				{:else if id === 'plating-composite'}
					<!-- Laminated layers -->
					<rect x="4" y="5" width="16" height="14" rx="1" />
					<path d="M4 9.5h16M4 13h16M4 16.5h16" stroke-width="1" opacity="0.85" />
				{:else if id === 'plating-reactive'}
					<!-- Exo-cage hexagon -->
					<path d="M12 3l7 4v10l-7 4-7-4V7z" />
					<path d="M12 3v18M5 7l14 10M19 7L5 17" stroke-width="1" opacity="0.7" />
				{:else if id === 'plating-stripped'}
					<!-- Bare frame: corner brackets only -->
					<path d="M4 9V6h3M17 6h3v3M20 15v3h-3M7 18H4v-3" />
					<path d="M9 12h6" stroke-width="1" opacity="0.6" />
				{:else if id === 'drive-stock'}
					<!-- Gear -->
					<circle cx="12" cy="12" r="3.4" />
					<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
				{:else if id === 'drive-overbored'}
					<!-- Piston + crank: raw power -->
					<rect x="9" y="3" width="6" height="7" rx="1" />
					<path d="M12 10v6" />
					<rect x="7" y="16" width="10" height="4" rx="1" />
				{:else if id === 'drive-slipstream'}
					<!-- Streamline arrow -->
					<path d="M3 12h13" />
					<path d="M12 8l5 4-5 4" />
					<path d="M3 8h6M3 16h6" stroke-width="1" opacity="0.7" />
				{:else if id === 'drive-hotintake'}
					<!-- Intake trumpet + heat -->
					<path d="M3 9l8 2v2l-8 2z" />
					<path d="M11 12h4" />
					<path d="M17 7c1.6 1 1.6 3 .4 4.2M19.5 8c1.6 1.2 1.6 3.4.2 5" stroke-width="1.3" />
				{:else if id === 'tires-stock'}
					<!-- Tire + hub -->
					<circle cx="12" cy="12" r="8" />
					<circle cx="12" cy="12" r="3" />
				{:else if id === 'tires-slick'}
					<!-- Smooth tire + gloss highlight -->
					<circle cx="12" cy="12" r="8" />
					<circle cx="12" cy="12" r="3" />
					<path d="M7 6.5A8 8 0 0 1 12 4.2" stroke-width="1.3" opacity="0.9" />
				{:else if id === 'tires-terrain'}
					<!-- Knobby tire: lugs around the tread -->
					<circle cx="12" cy="12" r="7" />
					<circle cx="12" cy="12" r="2.6" />
					<path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" stroke-width="1.2" />
				{:else if id === 'tires-hardwall'}
					<!-- Reinforced: double sidewall ring -->
					<circle cx="12" cy="12" r="8" />
					<circle cx="12" cy="12" r="5.6" stroke-width="1" opacity="0.85" />
					<circle cx="12" cy="12" r="2.4" />
				{:else if id === 'sys-stock'}
					<!-- Factory chip + pins -->
					<rect x="7" y="7" width="10" height="10" rx="1" />
					<path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M4 10h3M4 14h3M17 10h3M17 14h3" stroke-width="1.1" />
				{:else if id === 'sys-capacitor'}
					<!-- Charge cell + bolt -->
					<rect x="4" y="6" width="9" height="12" rx="1" />
					<path d="M6.5 6V4h4v2" stroke-width="1.1" />
					<path d="M17 6l-3 6h3l-3 6" />
				{:else if id === 'sys-faraday'}
					<!-- Shield dome mesh -->
					<path d="M4 17a8 8 0 0 1 16 0z" />
					<path d="M8 17V10M12 17V8M16 17v-7M6 13.5h12" stroke-width="1" opacity="0.8" />
				{:else if id === 'sys-targeting'}
					<!-- Reticle -->
					<circle cx="12" cy="12" r="7" />
					<path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
					<circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
				{:else if id === 'autocannon'}
					<!-- Barrel + receiver + muzzle flash ticks -->
					<rect x="3" y="10" width="7" height="5" rx="1" />
					<path d="M10 12.5h9" stroke-width="2" />
					<path d="M21 10.5l1.6-1.2M21 14.5l1.6 1.2M22 12.5h1.6" stroke-width="1.1" />
				{:else if id === 'homing-rocket'}
					<!-- Missile + guidance arc -->
					<path d="M4 14l9-1.5 3.5-1 3 2-3 2-3.5-1L4 14z" />
					<path d="M4 14l-1.5 2.5M6 13.7L5 16.6" stroke-width="1.1" />
					<path d="M13 6a7 7 0 0 1 6 3" stroke-width="1.1" stroke-dasharray="2 1.6" />
					<circle cx="20.4" cy="9.6" r="0.8" fill="currentColor" stroke="none" />
				{:else if id === 'railgun'}
					<!-- Breech + twin rails + charge tick -->
					<rect x="2.5" y="9.5" width="6" height="6" rx="1" />
					<path d="M8.5 10.8h13M8.5 14.2h13" stroke-width="1.4" />
					<path d="M21.5 12.5h1.6" stroke-width="1.2" />
					<path d="M4.5 7.5l1.2-2 1 1.6" stroke-width="1.1" />
				{:else if id === 'shotgun-burst'}
					<!-- Flared muzzle + four-bore spread -->
					<path d="M3 10h8l4-2v9l-4-2H3z" />
					<circle cx="18.5" cy="8.5" r="0.8" fill="currentColor" stroke="none" />
					<circle cx="20" cy="11" r="0.8" fill="currentColor" stroke="none" />
					<circle cx="20" cy="14" r="0.8" fill="currentColor" stroke="none" />
					<circle cx="18.5" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
				{:else if id === 'cluster-missile'}
					<!-- Battery pod: tube-mouth grid -->
					<rect x="4" y="6" width="16" height="12" rx="1" />
					<circle cx="9" cy="10" r="1.4" />
					<circle cx="14" cy="10" r="1.4" />
					<circle cx="9" cy="14.5" r="1.4" />
					<circle cx="14" cy="14.5" r="1.4" />
					<path d="M18 9.5v5.5" stroke-width="1.1" opacity="0.7" />
				{:else if id === 'caltrops'}
					<!-- Spike star trio -->
					<path d="M8 18l-2-4 3 1z" />
					<path d="M14 19l1-4.5 2 3.5z" />
					<path d="M12 10l-1.5-4L14 8z" />
					<path d="M4 20h16" stroke-width="1" opacity="0.5" />
				{:else if id === 'auto-turret'}
					<!-- Drum + barrel + sweep arc -->
					<path d="M6 17a6 6 0 0 1 12 0z" />
					<path d="M12 11V8" stroke-width="1.2" />
					<path d="M14.5 12.5l6-3" stroke-width="1.6" />
					<path d="M6 6a8.5 8.5 0 0 1 5-2.4" stroke-width="1" stroke-dasharray="1.8 1.5" />
				{:else if id === 'energy-shield'}
					<!-- Emitter dot inside the bubble -->
					<circle cx="12" cy="12" r="8" stroke-dasharray="3.2 2.2" />
					<circle cx="12" cy="12" r="4.6" />
					<circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
				{:else if id === 'radar-jammer'}
					<!-- Dish + broken waves (denied lock) -->
					<path d="M6 14l6-6 3 3-6 6z" />
					<path d="M9 17l-2.5 3.5" stroke-width="1.2" />
					<path d="M16 7a6 6 0 0 1 2 2M18.5 4.5a9.5 9.5 0 0 1 2.4 2.4" stroke-width="1.1" stroke-dasharray="1.6 1.6" />
				{:else if id === 'deployable-blades'}
					<!-- Hub + swept fins -->
					<circle cx="12" cy="12" r="2.6" />
					<path d="M14.5 11L21 8.5 16 13z" />
					<path d="M9.5 13L3 15.5 8 11z" />
					<circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
				{:else if id === 'weapon-none'}
					<!-- Empty hardpoint -->
					<circle cx="12" cy="12" r="7" stroke-dasharray="2.4 2.2" />
					<path d="M9 12h6" stroke-width="1.1" opacity="0.7" />
				{:else if id === 'nitro-boost'}
					<!-- Boost bolt -->
					<path d="M13 3 6 13h5l-1 8 8-11h-5z" />
				{:else if id === 'jump-hop'}
					<!-- Arc over a baseline + up arrow -->
					<path d="M4 19h16" />
					<path d="M6 17 Q12 5 18 17" />
					<path d="M9 9l3-3 3 3" stroke-width="1.2" />
				{:else if id === 'emergency-flip'}
					<!-- Two curved rotation arrows -->
					<path d="M5 12a7 7 0 0 1 12-4.5" />
					<path d="M17 4v4h-4" stroke-width="1.2" />
					<path d="M19 12a7 7 0 0 1-12 4.5" />
					<path d="M7 20v-4h4" stroke-width="1.2" />
				{:else if id === 'overcharge-repair'}
					<!-- Heal cross in a circle -->
					<circle cx="12" cy="12" r="8" />
					<path d="M12 8v8M8 12h8" />
				{:else if id === 'grip-surge'}
					<!-- Tire with downforce arrows -->
					<circle cx="12" cy="14" r="5.5" />
					<circle cx="12" cy="14" r="1.8" />
					<path d="M12 2v3.5M8 3l1 2.5M16 3l-1 2.5" stroke-width="1.2" />
				{:else if id === 'ability-none'}
					<!-- Empty ability slot -->
					<circle cx="12" cy="12" r="7" stroke-dasharray="2.4 2.2" />
					<path d="M8.7 15.3l6.6-6.6" stroke-width="1.1" opacity="0.7" />
				{/if}
			</svg>
		{/snippet}

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

		{#if oncosmetic}
			<div class="gg-section-label">Livery</div>
			<div class="gg-livery">
				<div class="gg-livery-group">
					<div class="gg-livery-label">Color</div>
					<div class="gg-swatches">
						<button
							type="button"
							class="gg-swatch gg-swatch-def"
							class:sel={!livery?.color}
							onclick={() => oncosmetic?.({ color: undefined })}
							title="Archetype default"
							aria-label="Archetype default color"
						>
							<span aria-hidden="true">A</span>
						</button>
						{#each COSMETIC_COLORS as c (c.id)}
							<button
								type="button"
								class="gg-swatch"
								class:sel={livery?.color === c.id}
								style="--sw: {swHex(c.hex)}"
								onclick={() => oncosmetic?.({ color: c.id })}
								title={c.name}
								aria-label={c.name}
							></button>
						{/each}
					</div>
				</div>
				<div class="gg-livery-group">
					<div class="gg-livery-label">Pattern</div>
					<div class="gg-patterns">
						{#each COSMETIC_PATTERNS as p (p.id)}
							<button
								type="button"
								class="gg-pattern"
								class:sel={(livery?.pattern ?? 'none') === p.id}
								onclick={() => oncosmetic?.({ pattern: p.id })}
							>
								{p.name}
							</button>
						{/each}
					</div>
				</div>
				<div class="gg-livery-group gg-livery-num">
					<div class="gg-livery-label">Car number</div>
					<div class="gg-num-row">
						<input
							class="gg-num-input"
							type="number"
							min="0"
							max="99"
							inputmode="numeric"
							placeholder="--"
							value={livery?.number ?? ''}
							oninput={onNumberInput}
							aria-label="Car number, 0 to 99"
						/>
						<span class="gg-num-hint">0–99 · tells cars apart</span>
					</div>
				</div>
			</div>
		{/if}

		<div class="gg-section-label gg-weapons-head">
			<span>Weapons</span>
			<span class="gg-cap">
				<span class="gg-cap-label">MOUNT CAPACITY</span>
				<span class="gg-cap-pips" aria-hidden="true">
					{#each Array(mountCapacity) as _, i (i)}
						<span class="gg-cap-pip" class:used={i < mountUsed}></span>
					{/each}
				</span>
				<span class="gg-cap-num">{mountUsed}/{mountCapacity}</span>
			</span>
		</div>
		<div class="gg-wslots">
			{#each WEAPON_SLOT_UI as wslot (wslot.id)}
				{@const sockChoices = slotSocketChoices(loadout, wslot.id)}
				{@const otherSlot = wslot.id === 'weaponPrimary' ? 'weaponSecondary' : 'weaponPrimary'}
				{@const otherSock = resolvedSockets[otherSlot as WeaponSlotId]}
				<div class="gg-slot">
					<div class="gg-section-label">{wslot.label}</div>
					{#if sockChoices.length > 1}
						<!-- Socket picker: only this weapon's compatible hardpoints on
						     this chassis; the one the OTHER slot resolves to is shown
						     but disabled (two weapons never share a socket). -->
						<div class="gg-sockrow">
							<span class="gg-sock-label">MOUNT AT</span>
							{#each sockChoices as s (s)}
								<button
									class="gg-sock"
									class:sel={resolvedSockets[wslot.id] === s}
									disabled={otherSock === s}
									title={otherSock === s
										? `held by the ${otherSlot === 'weaponPrimary' ? 'primary' : 'secondary'} weapon`
										: `mount this weapon at the ${WEAPON_SOCKET_LABELS[s].toLowerCase()}`}
									onclick={() => onsocket?.(wslot.id, s)}
								>{WEAPON_SOCKET_LABELS[s]}</button>
							{/each}
						</div>
					{:else if sockChoices.length === 1}
						<div class="gg-sockrow">
							<span class="gg-sock-label">MOUNT AT</span>
							<span class="gg-sock-fixed">{WEAPON_SOCKET_LABELS[sockChoices[0]]} · fixed</span>
						</div>
					{/if}
					{#each wslot.allowNone ? [...WEAPONS.map((w) => w.id), WEAPON_NONE] : WEAPONS.map((w) => w.id) as wid (wid)}
						{@const w = WEAPONS.find((c) => c.id === wid)}
						{@const blocked = weaponBlockReason(wslot.id, wid)}
						<button
							class="gg-part"
							class:sel={loadout.parts[wslot.id] === wid}
							class:blocked={!!blocked}
							disabled={!!blocked}
							onclick={() => onequip(wslot.id, wid)}
						>
							<span class="gg-part-ico">{@render partIcon(wid)}</span>
							<span class="gg-part-body">
								<span class="gg-part-name">{w ? w.name : 'None'}</span>
								<span class="gg-part-blurb"
									>{w ? w.blurb : 'Leave the hardpoint empty and bank the mount points.'}</span
								>
								<span class="gg-chips">
									{#if w}
										<span class="gg-chip neutral">mount {w.mountCost}</span>
										<span class="gg-chip neutral">cd {w.cooldownSec}s</span>
										<span class="gg-chip neutral">{w.category}</span>
									{/if}
									{#if blocked}
										<span class="gg-chip bad">{blocked}</span>
									{/if}
								</span>
							</span>
						</button>
					{/each}
				</div>
			{/each}
		</div>

		<div class="gg-section-label gg-weapons-head">
			<span>Abilities</span>
			<span class="gg-cap">
				<span class="gg-cap-label">ABILITY CAPACITY</span>
				<span class="gg-cap-pips" aria-hidden="true">
					{#each Array(abilityCapacity) as _, i (i)}
						<span class="gg-cap-pip" class:used={i < abilityUsed}></span>
					{/each}
				</span>
				<span class="gg-cap-num">{abilityUsed}/{abilityCapacity}</span>
			</span>
		</div>
		<div class="gg-wslots">
			{#each ABILITY_SLOT_UI as aslot (aslot.id)}
				<div class="gg-slot">
					<div class="gg-section-label">{aslot.label}</div>
					{#each aslot.allowNone ? [...ABILITIES.map((a) => a.id), ABILITY_NONE] : ABILITIES.map((a) => a.id) as aid (aid)}
						{@const a = ABILITIES.find((c) => c.id === aid)}
						{@const blocked = abilityBlockReason(aslot.id, aid)}
						<button
							class="gg-part"
							class:sel={loadout.parts[aslot.id] === aid}
							class:blocked={!!blocked}
							disabled={!!blocked}
							onclick={() => onequip(aslot.id, aid)}
						>
							<span class="gg-part-ico">{@render partIcon(aid)}</span>
							<span class="gg-part-body">
								<span class="gg-part-name">{a ? a.name : 'None'}</span>
								<span class="gg-part-blurb"
									>{a ? a.blurb : 'Leave the slot empty and bank the ability points.'}</span
								>
								<span class="gg-chips">
									{#if a}
										<span class="gg-chip neutral">cost {a.slotCost}</span>
										<span class="gg-chip neutral">meter {Math.round(a.meterCost * 100)}%</span>
										<span class="gg-chip neutral">{a.category}</span>
									{/if}
									{#if blocked}
										<span class="gg-chip bad">{blocked}</span>
									{/if}
								</span>
							</span>
						</button>
					{/each}
				</div>
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
							<span class="gg-part-ico">{@render partIcon(part.id)}</span>
							<span class="gg-part-body">
								<span class="gg-part-name">{part.name}</span>
								<span class="gg-part-blurb">{part.blurb}</span>
								{#if describeEffects(part.effects).length}
									<span class="gg-chips">
										{#each describeEffects(part.effects) as c (c.key)}
											<span class="gg-chip {c.tone}">{c.label} {fmtPct(c.pct)}</span>
										{/each}
									</span>
								{/if}
							</span>
						</button>
					{/each}
				</div>
			{/each}
		</div>

		<div class="gg-section-label">Resolved build</div>
		<div class="gg-summary">
			<div class="gg-hero-grid">
				{#each heroes as h (h.label)}
					<div class="gg-hero-tile {h.tone}">
						<span class="gg-hero-label">{h.label}</span>
						<span class="gg-hero-value">{h.value}{#if h.unit}<i>{h.unit}</i>{/if}</span>
						<span class="gg-hero-delta {h.tone}">
							{Math.abs(h.delta) < 0.5 ? 'baseline' : fmtPct(h.delta)}
						</span>
					</div>
				{/each}
			</div>

			{#if secondary.length}
				<div class="gg-deltas">
					{#if gains.length}
						<div class="gg-delta-col">
							<span class="gg-delta-head good">GAINS</span>
							<span class="gg-chips">
								{#each gains as c (c.key)}
									<span class="gg-chip good">{c.label} {fmtPct(c.pct)}</span>
								{/each}
							</span>
						</div>
					{/if}
					{#if costs.length}
						<div class="gg-delta-col">
							<span class="gg-delta-head bad">TRADEOFFS</span>
							<span class="gg-chips">
								{#each costs as c (c.key)}
									<span class="gg-chip bad">{c.label} {fmtPct(c.pct)}</span>
								{/each}
							</span>
						</div>
					{/if}
					{#if character.length}
						<div class="gg-delta-col">
							<span class="gg-delta-head neutral">CHARACTER</span>
							<span class="gg-chips">
								{#each character as c (c.key)}
									<span class="gg-chip neutral">{c.label} {fmtPct(c.pct)}</span>
								{/each}
							</span>
						</div>
					{/if}
				</div>
			{:else}
				<span class="gg-part-blurb">neutral build — identical to the baseline feel</span>
			{/if}

			<div class="gg-foot">
				HULL / MASS / TOP SPEED / COOLDOWNS are the resolved numbers; the columns below are the
				rest of the deltas. Mass is character, not a stat: heavy builds physically resist tethers,
				rams, and spins, and pay in acceleration.
			</div>
		</div>

		{#if slots}
			<div class="gg-section-label">Build slots</div>
			<div class="gg-slots-panel">
				<div class="gg-slot-namebar">
					<input
						class="gg-slot-input"
						type="text"
						maxlength="24"
						placeholder="Name this build (optional)"
						bind:value={slotName}
						aria-label="Name for the build you save"
					/>
					<span class="gg-slot-hint">
						{#if activeSlot != null && slotList[activeSlot]}
							equipped: <b>{slotList[activeSlot]?.name}</b>
						{:else}
							working build — unsaved
						{/if}
					</span>
				</div>
				<div class="gg-slot-grid">
					{#each slotList as s, i (i)}
						{@const filled = !!s}
						{@const active = activeSlot === i && filled}
						<div class="gg-slot-tile" class:filled class:active>
							<div class="gg-slot-top">
								<span class="gg-slot-idx">SLOT {i + 1}</span>
								{#if active}<span class="gg-slot-badge">EQUIPPED</span>{/if}
							</div>
							{#if s}
								<span class="gg-slot-name">{s.name}</span>
								<span class="gg-slot-arch">{archetypeById(s.loadout.archetype)?.name ?? s.loadout.archetype}</span>
								<div class="gg-slot-actions">
									{#if confirmDelete === i}
										<button class="gg-slot-btn danger" onclick={() => doDelete(i)}>CONFIRM</button>
										<button class="gg-slot-btn" onclick={() => (confirmDelete = null)}>CANCEL</button>
									{:else}
										<button class="gg-slot-btn primary" onclick={() => onLoadSlot?.(i)}>LOAD</button>
										<button class="gg-slot-btn" onclick={() => doSave(i)} title="Overwrite with the current build">SAVE</button>
										<button class="gg-slot-btn" onclick={() => (confirmDelete = i)} aria-label="Delete slot">✕</button>
									{/if}
								</div>
							{:else}
								<span class="gg-slot-empty">— empty —</span>
								<div class="gg-slot-actions">
									<button class="gg-slot-btn primary" onclick={() => doSave(i)}>SAVE HERE</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
				<div class="gg-foot">
					Save up to {GREENLINE_MAX_SLOTS} named builds. LOAD equips a slot as your working build;
					SAVE overwrites a slot with what you have now. Editing the working build after loading
					marks it unsaved until you save it back.
				</div>
			</div>
		{/if}
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
	/* Weapon mounts: the capacity budget readout + the two slot pickers. */
	.gg-weapons-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
	}
	.gg-cap {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.gg-cap-label {
		font-size: 0.58rem;
		letter-spacing: 0.2em;
		color: var(--glb-ink-faint);
	}
	.gg-cap-pips {
		display: flex;
		gap: 0.2rem;
	}
	.gg-cap-pip {
		width: 0.85rem;
		height: 0.32rem;
		border: 1px solid var(--glb-line-strong);
		background: rgba(13, 19, 25, 0.9);
	}
	.gg-cap-pip.used {
		background: linear-gradient(180deg, #c8ffe2, #2ae57e);
		border-color: rgba(42, 229, 126, 0.7);
	}
	.gg-cap-num {
		font-family: var(--glb-font-data);
		font-size: 0.72rem;
		color: var(--glb-chrome-hi);
	}
	.gg-wslots {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
		gap: 0.35rem 0.7rem;
		margin-top: 0.2rem;
	}
	/* Mount-socket picker: one small chip per compatible hardpoint; the chip
	   the OTHER slot holds stays visible but disabled (never silently hidden,
	   the blocked-pairing convention). */
	.gg-sockrow {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.gg-sock-label {
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		color: var(--glb-ink-faint);
	}
	.gg-sock {
		background: linear-gradient(180deg, rgba(16, 22, 28, 0.85), rgba(7, 10, 14, 0.9));
		border: 1px solid var(--glb-line);
		border-radius: 1px;
		color: var(--glb-steel);
		font: 600 0.62rem var(--glb-font-ui);
		letter-spacing: 0.14em;
		padding: 0.14rem 0.45rem;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}
	.gg-sock:hover:not(:disabled),
	.gg-sock:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: var(--glb-line-strong);
		outline: none;
	}
	.gg-sock.sel {
		color: var(--glb-green-ui);
		border-color: rgba(42, 229, 126, 0.6);
		box-shadow: 0 0 8px rgba(42, 229, 126, 0.2);
	}
	.gg-sock:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		text-decoration: line-through;
	}
	.gg-sock-fixed {
		font-family: var(--glb-font-data);
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		color: var(--glb-steel-dim);
	}
	/* A blocked pairing stays visible WITH its reason, never silently hidden. */
	.gg-part.blocked {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.gg-part.blocked:hover {
		border-color: var(--glb-line);
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
		flex-direction: row;
		align-items: flex-start;
		gap: 0.5rem;
	}
	.gg-part-ico {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.9rem;
		height: 1.9rem;
		margin-top: 0.05rem;
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		background: linear-gradient(180deg, rgba(10, 14, 19, 0.9), rgba(5, 8, 11, 0.9));
	}
	.gg-part-glyph {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--glb-steel-dim);
		transition: color 140ms ease;
	}
	.gg-part:hover .gg-part-glyph {
		color: var(--glb-steel);
	}
	.gg-part.sel .gg-part-ico {
		border-color: rgba(42, 229, 126, 0.45);
		background: linear-gradient(180deg, rgba(14, 22, 18, 0.95), rgba(6, 10, 8, 0.95));
	}
	.gg-part.sel .gg-part-glyph {
		color: var(--glb-green-ui);
	}
	.gg-part-body {
		display: flex;
		flex-direction: column;
		gap: 0.24rem;
		min-width: 0;
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
		gap: 0.6rem;
	}
	/* Headline numbers as a row of tiles: value big, signed delta beneath. */
	.gg-hero-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
		gap: 0.5rem;
	}
	.gg-hero-tile {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.5rem 0.6rem;
		background: linear-gradient(180deg, rgba(16, 22, 28, 0.85), rgba(7, 10, 14, 0.9));
		border: 1px solid var(--glb-line);
		border-left: 2px solid var(--glb-line-strong);
		border-radius: 2px;
	}
	.gg-hero-tile.good {
		border-left-color: rgba(42, 229, 126, 0.7);
	}
	.gg-hero-tile.bad {
		border-left-color: rgba(217, 144, 106, 0.7);
	}
	.gg-hero-tile.neutral {
		border-left-color: rgba(159, 176, 189, 0.5);
	}
	.gg-hero-label {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		color: var(--glb-ink-dim);
	}
	.gg-hero-value {
		font-family: var(--glb-font-data);
		font-size: 1.35rem;
		line-height: 1;
		color: var(--glb-chrome-hi);
	}
	.gg-hero-value i {
		font-style: normal;
		font-size: 0.7rem;
		color: var(--glb-steel-dim);
		margin-left: 0.15rem;
	}
	.gg-hero-delta {
		font-family: var(--glb-font-data);
		font-size: 0.72rem;
		letter-spacing: 0.02em;
	}
	.gg-hero-delta.good {
		color: var(--glb-green-ui);
	}
	.gg-hero-delta.bad {
		color: #d9906a;
	}
	.gg-hero-delta.neutral {
		color: var(--glb-steel-dim);
	}
	/* Secondary deltas, split into what you gain / what it costs / character. */
	.gg-deltas {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.5rem 0.9rem;
	}
	.gg-delta-col {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.gg-delta-head {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.24em;
	}
	.gg-delta-head.good {
		color: var(--glb-green-ui);
	}
	.gg-delta-head.bad {
		color: #d9906a;
	}
	.gg-delta-head.neutral {
		color: #9fb0bd;
	}
	.gg-foot {
		color: var(--glb-ink-faint);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		line-height: 1.45;
	}
	/* Header gear button, sized to the header buttons. */
	.gg-gear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.3rem 0.5rem;
	}
	/* Build slots. */
	.gg-slots-panel {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.gg-slot-namebar {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.gg-slot-input {
		flex: 1;
		min-width: 12rem;
		background: linear-gradient(180deg, rgba(10, 14, 19, 0.9), rgba(5, 8, 11, 0.92));
		border: 1px solid var(--glb-line-strong);
		border-radius: 2px;
		color: var(--glb-chrome-hi);
		font: 600 0.8rem var(--glb-font-ui);
		letter-spacing: 0.04em;
		padding: 0.4rem 0.6rem;
	}
	.gg-slot-input::placeholder {
		color: var(--glb-ink-faint);
	}
	.gg-slot-input:focus-visible {
		outline: 1px solid rgba(42, 229, 126, 0.5);
		outline-offset: 1px;
	}
	.gg-slot-hint {
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		color: var(--glb-ink-dim);
	}
	.gg-slot-hint b {
		color: var(--glb-green-ui);
		font-weight: 600;
	}
	.gg-slot-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.5rem;
	}
	.gg-slot-tile {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.5rem 0.6rem;
		min-height: 6.5rem;
		background: linear-gradient(180deg, rgba(12, 16, 21, 0.7), rgba(6, 9, 12, 0.7));
		border: 1px dashed var(--glb-line);
		border-radius: 2px;
	}
	.gg-slot-tile.filled {
		background: linear-gradient(180deg, rgba(16, 22, 28, 0.9), rgba(7, 10, 14, 0.92));
		border-style: solid;
	}
	.gg-slot-tile.active {
		border-color: rgba(42, 229, 126, 0.55);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.08),
			0 0 12px rgba(42, 229, 126, 0.18);
	}
	.gg-slot-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
	}
	.gg-slot-idx {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.22em;
		color: var(--glb-ink-faint);
	}
	.gg-slot-badge {
		font-size: 0.56rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		color: var(--glb-green-ui);
		border: 1px solid rgba(42, 229, 126, 0.4);
		border-radius: 1px;
		padding: 0.03rem 0.28rem;
	}
	.gg-slot-name {
		color: var(--glb-chrome-hi);
		font-weight: 600;
		font-size: 0.85rem;
		letter-spacing: 0.02em;
		line-height: 1.2;
		word-break: break-word;
	}
	.gg-slot-arch {
		font-family: var(--glb-font-data);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		color: var(--glb-steel);
	}
	.gg-slot-empty {
		flex: 1;
		display: flex;
		align-items: center;
		color: var(--glb-ink-faint);
		font-size: 0.74rem;
		letter-spacing: 0.08em;
	}
	.gg-slot-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: auto;
	}
	.gg-slot-btn {
		background: linear-gradient(180deg, rgba(23, 30, 37, 0.85), rgba(9, 13, 17, 0.9));
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		color: var(--glb-steel);
		font: 600 0.62rem var(--glb-font-ui);
		letter-spacing: 0.12em;
		padding: 0.26rem 0.5rem;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}
	.gg-slot-btn:hover,
	.gg-slot-btn:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: var(--glb-line-strong);
		outline: none;
	}
	.gg-slot-btn.primary {
		color: var(--glb-green-ui);
		border-color: rgba(42, 229, 126, 0.45);
	}
	.gg-slot-btn.primary:hover {
		border-color: rgba(42, 229, 126, 0.75);
	}
	.gg-slot-btn.danger {
		color: var(--glb-amber);
		border-color: rgba(255, 176, 46, 0.5);
	}
	/* Livery panel (Phase 6b): color swatches, pattern picker, number input. */
	.gg-livery {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem 1.4rem;
		align-items: flex-start;
	}
	.gg-livery-group {
		display: flex;
		flex-direction: column;
		gap: 0.32rem;
	}
	.gg-livery-label {
		color: var(--glb-ink-faint);
		font-size: 0.6rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.gg-swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.32rem;
	}
	.gg-swatch {
		width: 1.55rem;
		height: 1.55rem;
		border-radius: 2px;
		border: 1px solid var(--glb-line-strong);
		background: var(--sw, #10151a);
		cursor: pointer;
		padding: 0;
		position: relative;
		box-shadow: inset 0 1px 0 rgba(247, 251, 254, 0.18);
	}
	.gg-swatch.sel {
		outline: 2px solid var(--glb-green);
		outline-offset: 1px;
		border-color: var(--glb-green);
	}
	.gg-swatch-def {
		display: grid;
		place-items: center;
		background: var(--glb-panel-2);
		color: var(--glb-ink-dim);
		font-size: 0.68rem;
		font-weight: 700;
	}
	.gg-patterns {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.gg-pattern {
		padding: 0.24rem 0.55rem;
		border: 1px solid var(--glb-line);
		background: var(--glb-panel-2);
		color: var(--glb-ink-dim);
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		border-radius: 2px;
	}
	.gg-pattern:hover {
		color: var(--glb-ink);
		border-color: var(--glb-line-strong);
	}
	.gg-pattern.sel {
		color: #041b0f;
		background: var(--glb-green-ui);
		border-color: var(--glb-green);
		font-weight: 700;
	}
	.gg-num-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.gg-num-input {
		width: 4rem;
		padding: 0.28rem 0.45rem;
		background: var(--glb-panel);
		border: 1px solid var(--glb-line-strong);
		color: var(--glb-ink);
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.1rem;
		text-align: center;
		border-radius: 2px;
	}
	.gg-num-input:focus {
		outline: none;
		border-color: var(--glb-green);
	}
	.gg-num-hint {
		color: var(--glb-ink-faint);
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
</style>
