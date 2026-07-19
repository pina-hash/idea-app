<script lang="ts">
	import { onMount } from 'svelte';
	import { parseTrack } from '$lib/greenline/track-schema';
	import provingGroundJson from '$lib/greenline/tracks/proving-ground-07.json';
	import GreenlineRace, {
		GARAGE_BASELINE,
		type RaceOutcome
	} from '$lib/greenline/GreenlineRace.svelte';
	import GreenlineResults from '$lib/greenline/GreenlineResults.svelte';
	import Garage from '$lib/greenline/Garage.svelte';
	import {
		defaultLoadout,
		sanitizeLoadout,
		type ArchetypeId,
		type Cosmetics,
		type Loadout,
		type PartSlot
	} from '$lib/greenline/loadout';
	import type { WeaponSlotId, WeaponSocketId } from '$lib/greenline/combat';
	import {
		deleteSlot,
		GREENLINE_MAX_SLOTS,
		loadActiveSlot,
		loadLeaderboard,
		loadUserLoadout,
		loadUserSlots,
		saveSlot,
		saveUserLoadout,
		submitRaceResult,
		type LeaderboardEntry,
		type LoadoutSlot
	} from '$lib/greenline/persistence';
	import GreenlineTitle from '$lib/greenline/brand/GreenlineTitle.svelte';
	import GreenlineMusic from '$lib/greenline/GreenlineMusic.svelte';
	import GreenlineSettings from '$lib/greenline/GreenlineSettings.svelte';
	import {
		decalImageUrl,
		loadOwnDecal,
		removeDecal,
		uploadDecal,
		validateDecalFile,
		type DecalStatus
	} from '$lib/greenline/decals';
	import { registerDecalImage } from '$lib/greenline/rig-visual';
	import '$lib/greenline/brand/brand';
	import type { PageData } from './$types';

	/**
	 * GREENLINE portal route: the real player loop over the shared game. RACE
	 * mode only for now (the mode flag lives under GreenlineRace; no selector is
	 * surfaced here). Sequence: title -> garage -> race -> results -> back to
	 * garage/title, all without a page reload.
	 *
	 * Everything data-backed goes through the persistence seam
	 * (src/lib/greenline/persistence.ts), which fails soft: if migration 0049 is
	 * unapplied, the garage and results still function, just without real
	 * persistence (saved build reads as the default, submit is a no-op, the board
	 * comes back empty).
	 */
	const { data }: { data: PageData } = $props();

	const track = parseTrack(provingGroundJson);

	type Screen = 'title' | 'garage' | 'race' | 'results';
	let screen = $state<Screen>('title');

	// Player build: loaded from the account on mount, edited in the garage.
	let loadout = $state<Loadout>(defaultLoadout());
	let loadoutReady = $state(false);
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	// Named build slots (index = slot number, null = empty) + which one is
	// equipped. All fail soft: if 0050 is unapplied, slots load empty, saves are
	// no-ops server-side but stay usable this session (optimistic local update).
	let slots = $state<(LoadoutSlot | null)[]>(Array(GREENLINE_MAX_SLOTS).fill(null));
	let activeSlot = $state<number | null>(null);

	// Settings overlay (a modal, not a screen). Reachable from title + garage.
	let settingsOpen = $state(false);

	// Custom decal (Phase 6c). `undefined` until loaded (or when 0051 is
	// unapplied — the garage hides the control), null = none uploaded. The
	// image itself resolves through rig-visual's decal registry (a signed URL
	// registered here), so the garage preview AND the race render it without
	// ever touching Supabase themselves.
	type DecalState = {
		path: string;
		status: DecalStatus;
		feedback: string;
		previewUrl: string | null;
	};
	let decalState = $state<DecalState | null | undefined>(undefined);
	let decalBusy = $state(false);
	let decalError = $state('');

	// Results state.
	let outcome = $state<RaceOutcome | null>(null);
	let submitting = $state(false);
	let submitError = $state(false);
	let board = $state<LeaderboardEntry[]>([]);
	let boardLoading = $state(false);

	onMount(async () => {
		const [saved, savedSlots, savedActive, ownDecal] = await Promise.all([
			loadUserLoadout(data.supabase, data.userId),
			loadUserSlots(data.supabase, data.userId),
			loadActiveSlot(data.supabase, data.userId),
			loadOwnDecal(data.supabase, data.userId)
		]);
		if (saved) loadout = saved;
		const next: (LoadoutSlot | null)[] = Array(GREENLINE_MAX_SLOTS).fill(null);
		for (const s of savedSlots) if (s.slot >= 0 && s.slot < GREENLINE_MAX_SLOTS) next[s.slot] = s;
		slots = next;
		activeSlot = savedActive;
		loadoutReady = true;
		// Custom decal: resolve a signed URL (the owner may always read their
		// own image, whatever the review status) and register it so the garage
		// preview and the race scene can paint it. 0051 unapplied -> undefined,
		// the garage control stays hidden.
		if (ownDecal.ready) {
			if (ownDecal.decal) {
				const url = await decalImageUrl(data.supabase, ownDecal.decal.path);
				registerDecalImage(ownDecal.decal.path, url);
				decalState = {
					path: ownDecal.decal.path,
					status: ownDecal.decal.status,
					feedback: ownDecal.decal.feedback,
					previewUrl: url
				};
			} else {
				decalState = null;
			}
		}
	});

	// --- Custom decal actions (6c). Validation is client-side convenience; the
	// bucket's own size/mime constraints and the review gate are the boundary. ---
	const handleDecalUpload = async (file: File) => {
		decalError = '';
		decalBusy = true;
		const reason = await validateDecalFile(file);
		if (reason) {
			decalError = reason;
			decalBusy = false;
			return;
		}
		const prev = decalState?.path ?? null;
		const { decal: up, error } = await uploadDecal(data.supabase, data.userId, file, prev);
		if (error || !up) {
			decalError = error ?? 'Upload failed.';
			decalBusy = false;
			return;
		}
		const url = await decalImageUrl(data.supabase, up.path);
		registerDecalImage(up.path, url);
		decalState = { path: up.path, status: up.status, feedback: '', previewUrl: url };
		// A fresh upload auto-equips: uploading a decal means wanting it shown.
		setCosmetic({ decal: up.path });
		decalBusy = false;
	};
	const handleDecalRemove = async () => {
		decalError = '';
		decalBusy = true;
		const path = decalState?.path ?? null;
		if (loadout.cosmetics?.decal) setCosmetic({ decal: undefined });
		const { error } = await removeDecal(data.supabase, data.userId, path);
		if (error) decalError = error;
		else decalState = null;
		decalBusy = false;
	};

	/** Persist the working build + which slot it is tied to (null = custom). */
	async function persistBuild(slot: number | null) {
		activeSlot = slot;
		saveStatus = 'saving';
		const { error } = await saveUserLoadout(data.supabase, data.userId, loadout, slot);
		saveStatus = error ? 'error' : 'saved';
	}
	// Weapon-slot sanitize on every edit: the garage blocks invalid weapon
	// pairings itself, but an archetype swap can shrink mount capacity under
	// the equipped pair — the sanitizer sheds the secondary so the saved build
	// is always valid.
	const selectArchetype = (id: ArchetypeId) => {
		loadout = sanitizeLoadout({ ...loadout, archetype: id });
		// Editing diverges from any loaded slot: the build is now custom/unsaved.
		persistBuild(null);
	};
	const equipPart = (slot: PartSlot, partId: string) => {
		loadout = sanitizeLoadout({ ...loadout, parts: { ...loadout.parts, [slot]: partId } });
		persistBuild(null);
	};
	// Mount-socket pick (4c): same sanitize-and-persist path as an equip; the
	// sanitizer drops a pick the resolution cannot honor.
	const setSocket = (slot: WeaponSlotId, socket: WeaponSocketId) => {
		loadout = sanitizeLoadout({
			...loadout,
			weaponSockets: { ...loadout.weaponSockets, [slot]: socket }
		});
		persistBuild(null);
	};
	// Preset livery patch (Phase 6b): same sanitize-and-persist path; cosmetics
	// ride the parts jsonb via partsForStorage, so saveUserLoadout stores them.
	const setCosmetic = (patch: Partial<Cosmetics>) => {
		loadout = sanitizeLoadout({ ...loadout, cosmetics: { ...loadout.cosmetics, ...patch } });
		persistBuild(null);
	};

	// --- Named slot actions (fail soft; local state updates optimistically) ---
	const onSaveSlot = async (i: number, name: string) => {
		const entry: LoadoutSlot = {
			slot: i,
			name,
			loadout: {
				archetype: loadout.archetype,
				parts: { ...loadout.parts },
				weaponSockets: { ...loadout.weaponSockets },
				cosmetics: loadout.cosmetics
			},
			updatedAt: new Date().toISOString()
		};
		slots = slots.map((s, idx) => (idx === i ? entry : s));
		await saveSlot(data.supabase, data.userId, i, name, loadout);
		await persistBuild(i);
	};
	const onLoadSlot = (i: number) => {
		const s = slots[i];
		if (!s) return;
		loadout = {
			archetype: s.loadout.archetype,
			parts: { ...s.loadout.parts },
			weaponSockets: { ...s.loadout.weaponSockets },
			cosmetics: s.loadout.cosmetics
		};
		persistBuild(i);
	};
	const onDeleteSlot = async (i: number) => {
		slots = slots.map((s, idx) => (idx === i ? null : s));
		if (activeSlot === i) await persistBuild(null);
		await deleteSlot(data.supabase, data.userId, i);
	};

	const garageNote = $derived(
		saveStatus === 'saving'
			? 'saving build to your account…'
			: saveStatus === 'error'
				? 'offline — build not saved (playable, changes stay this session)'
				: saveStatus === 'saved'
					? 'build saved to your account'
					: 'choose your build · saved to your account'
	);

	async function handleFinish(o: RaceOutcome) {
		outcome = o;
		screen = 'results';
		submitting = true;
		submitError = false;
		board = [];
		const { error } = await submitRaceResult(data.supabase, {
			trackId: track.id,
			mode: 'race',
			finishPosition: o.finishPosition,
			totalTimeMs: o.totalTimeMs,
			bestLapMs: o.bestLapMs,
			laps: o.laps,
			archetype: loadout.archetype
		});
		submitError = error !== null;
		submitting = false;
		await refreshBoard();
	}

	async function refreshBoard() {
		boardLoading = true;
		board = await loadLeaderboard(data.supabase, track.id, { mode: 'race', limit: 20 });
		boardLoading = false;
	}
</script>

<svelte:head>
	<title>GREENLINE</title>
</svelte:head>

<GreenlineMusic {screen} finishPosition={outcome?.finishPosition ?? null} />

{#if screen === 'title'}
	<div class="gp-root">
		<GreenlineTitle
			trackName={track.name}
			onStart={() => (screen = 'garage')}
			onSettings={() => (settingsOpen = true)}
			enableShortcut={!settingsOpen}
		/>
	</div>
{:else if screen === 'garage'}
	<div class="gp-root">
		{#if loadoutReady}
			<Garage
				{loadout}
				baselineHealth={GARAGE_BASELINE.health}
				baselineMass={GARAGE_BASELINE.mass}
				baselineEngine={GARAGE_BASELINE.engine}
				baselineDrag={GARAGE_BASELINE.drag}
				onselect={selectArchetype}
				onequip={equipPart}
				onsocket={setSocket}
				oncosmetic={setCosmetic}
				note={garageNote}
				closeLabel="START RACE ▸"
				onclose={() => (screen = 'race')}
				onback={() => (screen = 'title')}
				backLabel="◂ TITLE"
				onSettings={() => (settingsOpen = true)}
				{slots}
				{activeSlot}
				{onSaveSlot}
				{onLoadSlot}
				{onDeleteSlot}
				decal={decalState}
				{decalBusy}
				{decalError}
				onDecalUpload={handleDecalUpload}
				onDecalRemove={handleDecalRemove}
			/>
		{:else}
			<div class="gp-center gp-fill"><div class="gp-loading">loading your build…</div></div>
		{/if}
	</div>
{:else if screen === 'race'}
	<GreenlineRace {loadout} onFinish={handleFinish} />
{:else if screen === 'results'}
	<div class="gp-root gp-center">
		<GreenlineResults
			{outcome}
			trackName={track.name}
			{board}
			{boardLoading}
			{submitting}
			{submitError}
			myUserId={data.userId}
			onRaceAgain={() => (screen = 'race')}
			onGarage={() => (screen = 'garage')}
			onTitle={() => (screen = 'title')}
		/>
	</div>
{/if}

{#if settingsOpen}
	<div class="gp-root gp-overlay">
		<GreenlineSettings onClose={() => (settingsOpen = false)} />
	</div>
{/if}

<style>
	.gp-root {
		position: fixed;
		inset: 0;
		background: #04060a;
		font-family: 'Saira Condensed', sans-serif;
		color: #dfe8ee;
		z-index: 10;
		overflow-y: auto;
	}
	.gp-center {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.gp-overlay {
		z-index: 50;
		background: transparent;
	}
	.gp-fill {
		position: absolute;
		inset: 0;
	}
	.gp-loading {
		color: #6b7b88;
		font-size: 0.85rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
</style>
