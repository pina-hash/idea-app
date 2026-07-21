<script lang="ts">
	import { onMount } from 'svelte';
	import { loadTrack, trackEntry, TRACKS } from '$lib/greenline/tracks';
	import { setSelectedTrack, trackSelection } from '$lib/greenline/track-selection.svelte';
	import { gridSelection, setAiCount } from '$lib/greenline/grid-selection.svelte';
	import FeedbackBox from '$lib/feedback/FeedbackBox.svelte';
	import { submitFeedback, type FeedbackEntry } from '$lib/feedback/feedback';
	import { ABILITY_NONE } from '$lib/greenline/abilities';
	import { WEAPON_NONE } from '$lib/greenline/combat';
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
	import { creativeSettings } from '$lib/greenline/creative.svelte';
	import {
		CURRENCY_SHORT,
		itemPrice,
		sanitizeLoadoutOwnership,
		type RaceAward
	} from '$lib/greenline/economy';
	import {
		deleteSlot,
		GREENLINE_MAX_SLOTS,
		loadActiveSlot,
		loadLeaderboard,
		loadUnlocks,
		loadUserLoadout,
		loadUserSlots,
		loadWallet,
		purchaseItem,
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

	// Selected track (Phase 8e). The choice lives in the reactive
	// track-selection store (per browser, like weather), so it survives a
	// reload and the garage picker, the race, the results header, and the
	// leaderboard read all resolve from the same id.
	const selectedTrack = $derived(loadTrack(trackSelection.id));

	type Screen = 'title' | 'garage' | 'race' | 'results';
	let screen = $state<Screen>('title');

	// Feedback box (Phase 8e). ONE instance for the whole flow, rendered above
	// every screen, so the race can offer it from its pause menu without owning
	// any of the data layer. `feedbackContext` records which screen asked, which
	// is exactly the field that makes a bug report actionable.
	let feedbackOpen = $state(false);
	let feedbackContext = $state<Screen>('title');
	function openFeedback(context: Screen) {
		feedbackContext = context;
		feedbackOpen = true;
	}
	// Attached to the row as free-form context: enough to reproduce a report
	// without asking the player a single follow-up question.
	const feedbackMeta = () => ({
		screen: feedbackContext,
		track: trackSelection.id,
		archetype: loadout.archetype,
		parts: loadout.parts,
		creative: creativeSettings.enabled,
		userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent
	});
	const sendFeedback = (entry: FeedbackEntry) => submitFeedback(data.supabase, data.userId, entry);

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

	// Economy (Phase 7): Ignition Credits wallet + unlocked items. economyReady
	// false (0052 unapplied / offline) means NO gating at all — the pre-economy
	// behavior — never lock-everything (the fail-soft rule).
	let economyReady = $state(false);
	let wallet = $state<number | null>(null);
	let unlockedSet = $state<Set<string>>(new Set());
	let purchasing = $state<string | null>(null);
	let purchaseError = $state('');
	// Creative flag captured at RACE START (settings are unreachable mid-race,
	// but the capture makes the submitted flag unambiguous either way).
	let raceCreative = $state(false);
	// The track the CURRENT run is on, captured at race start for the same
	// reason: the result, the award, the board, and the telemetry must all agree
	// on which track was raced even if the selection moves afterwards.
	let raceTrackId = $state(trackSelection.id);
	const raceTrack = $derived(loadTrack(raceTrackId));
	// Grid size for the CURRENT run (Phase 9-fix-b), captured at race start like
	// the track: the player picks it in the garage, the race launches with it.
	let raceAiCount = $state(gridSelection.aiCount);

	// Qualifying grid placement (Phase 9b): the player's best recorded lap on the
	// selected track, read from the REAL leaderboard (the same board the results
	// screen shows). Loaded in the background whenever the track changes so it is
	// ready by race time; a race captures it into raceQualifyingMs. null = no time
	// set on this track yet, which starts the player at the back of the grid.
	let playerQualifyingMs = $state<number | null>(null);
	let raceQualifyingMs = $state<number | null>(null);
	$effect(() => {
		const tid = trackSelection.id; // re-run when the selected track changes
		let cancelled = false;
		void (async () => {
			// Best-per-player board; find the caller's own row for their best lap.
			// (limit 100 is plenty for GREENLINE's board size; a player outside the
			// top 100 reads as no-time, i.e. back of grid — acceptable for now.)
			const rows = await loadLeaderboard(data.supabase, tid, { mode: 'race', limit: 100 });
			if (cancelled) return;
			const mine = rows.find((e) => e.user_id === data.userId);
			playerQualifyingMs = typeof mine?.best_lap_ms === 'number' ? mine.best_lap_ms : null;
		})();
		return () => {
			cancelled = true;
		};
	});

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
	let lastAward = $state<RaceAward | null>(null);
	let submitting = $state(false);
	let submitError = $state(false);
	let board = $state<LeaderboardEntry[]>([]);
	let boardLoading = $state(false);

	onMount(async () => {
		const [saved, savedSlots, savedActive, ownDecal, savedWallet, savedUnlocks] =
			await Promise.all([
				loadUserLoadout(data.supabase, data.userId),
				loadUserSlots(data.supabase, data.userId),
				loadActiveSlot(data.supabase, data.userId),
				loadOwnDecal(data.supabase, data.userId),
				loadWallet(data.supabase, data.userId),
				loadUnlocks(data.supabase, data.userId)
			]);
		if (saved) loadout = saved;
		// Economy: gating turns on only when the unlock ledger really read back
		// (0052 applied + online). A failed wallet read alone leaves purchases
		// disabled (balance null) but ownership gating still correct.
		if (savedUnlocks.ready) {
			unlockedSet = savedUnlocks.items;
			wallet = savedWallet.ready ? savedWallet.balance : null;
			economyReady = true;
		}
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

	// Ownership enforcement (Phase 7): whenever creative mode is OFF and the
	// economy is live, the working build may only hold owned items — locked
	// gear (equipped during a creative session, or loaded from a slot saved
	// then) falls back to the starter kit and the gated build persists, per the
	// settings copy ("turning it off returns your build to what you actually
	// own"). The sanitizer returns the same object when nothing is locked, so
	// this effect is a no-op on every ordinary edit (the garage already blocks
	// equipping locked items up front).
	$effect(() => {
		if (!economyReady || creativeSettings.enabled) return;
		const gated = sanitizeLoadoutOwnership(loadout, unlockedSet);
		if (gated !== loadout) {
			loadout = gated;
			persistBuild(null);
		}
	});

	// Purchase (Phase 7): the RPC is atomic server-side (wallet row lock), so a
	// double-submit can never double-charge; this guard just keeps the UI to
	// one in-flight purchase.
	async function handlePurchase(itemId: string) {
		if (purchasing) return;
		purchasing = itemId;
		purchaseError = '';
		const res = await purchaseItem(data.supabase, itemId);
		if (res.ok || res.reason === 'already_unlocked') {
			unlockedSet = new Set([...unlockedSet, itemId]);
			if (res.balance != null) wallet = res.balance;
		} else if (res.reason === 'insufficient_funds') {
			if (res.balance != null) wallet = res.balance;
			purchaseError = `Not enough ${CURRENCY_SHORT} — that costs ${res.price ?? itemPrice(itemId) ?? '?'}, you have ${res.balance ?? 0}.`;
		} else {
			purchaseError = res.error
				? `Purchase failed — ${res.error}`
				: 'Purchase unavailable right now.';
		}
		purchasing = null;
	}

	/** Enter the race, capturing the flags the submit will report. */
	function startRace() {
		raceCreative = creativeSettings.enabled;
		raceTrackId = trackSelection.id;
		// Freeze the qualifying time for THIS run's grid, same reason as the track
		// and creative flag: the selection could move before the race mounts.
		raceQualifyingMs = playerQualifyingMs;
		// Grid size, frozen for the same reason: the picker stays reachable from
		// the garage between runs, and the launched race must be the field the
		// player chose when they hit START.
		raceAiCount = gridSelection.aiCount;
		screen = 'race';
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

	/** An empty equipment slot is absence, not an item id, so it logs as null. */
	const telemetrySlot = (id: string | undefined, none: string): string | null =>
		!id || id === none ? null : id;

	async function handleFinish(o: RaceOutcome) {
		outcome = o;
		lastAward = null;
		screen = 'results';
		submitting = true;
		submitError = false;
		board = [];
		const { award, error } = await submitRaceResult(data.supabase, {
			trackId: raceTrackId,
			mode: 'race',
			finishPosition: o.finishPosition,
			totalTimeMs: o.totalTimeMs,
			bestLapMs: o.bestLapMs,
			laps: o.laps,
			archetype: loadout.archetype,
			creative: raceCreative,
			// Telemetry (Phase 8f). The empty-slot sentinels are normalized to
			// null so "no secondary weapon" reads as absence in the data rather
			// than as a weapon literally named 'none'.
			weaponPrimary: telemetrySlot(loadout.parts.weaponPrimary, WEAPON_NONE),
			weaponSecondary: telemetrySlot(loadout.parts.weaponSecondary, WEAPON_NONE),
			abilityPrimary: telemetrySlot(loadout.parts.abilityPrimary, ABILITY_NONE),
			abilitySecondary: telemetrySlot(loadout.parts.abilitySecondary, ABILITY_NONE),
			route: o.route
		});
		submitError = error !== null;
		submitting = false;
		// The award was credited in the same transaction as the result; mirror
		// the server-reported balance into the wallet readout.
		if (award) {
			lastAward = award;
			if (award.balance != null) wallet = award.balance;
		}
		await refreshBoard();
	}

	async function refreshBoard() {
		boardLoading = true;
		board = await loadLeaderboard(data.supabase, raceTrackId, { mode: 'race', limit: 20 });
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
			trackName={selectedTrack.name}
			onStart={() => (screen = 'garage')}
			onSettings={() => (settingsOpen = true)}
			onFeedback={() => openFeedback('title')}
			enableShortcut={!settingsOpen && !feedbackOpen}
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
				onclose={startRace}
				onback={() => (screen = 'title')}
				backLabel="◂ TITLE"
				onSettings={() => (settingsOpen = true)}
				onFeedback={() => openFeedback('garage')}
				tracks={TRACKS}
				trackId={trackSelection.id}
				ontrack={setSelectedTrack}
				aiCount={gridSelection.aiCount}
				onAiCount={setAiCount}
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
				wallet={economyReady ? wallet : undefined}
				unlocked={economyReady ? unlockedSet : undefined}
				creative={creativeSettings.enabled}
				onPurchase={handlePurchase}
				{purchasing}
				{purchaseError}
			/>
		{:else}
			<div class="gp-center gp-fill"><div class="gp-loading">loading your build…</div></div>
		{/if}
	</div>
{:else if screen === 'race'}
	<GreenlineRace
		{loadout}
		track={raceTrack}
		playerQualifyingMs={raceQualifyingMs}
		aiCount={raceAiCount}
		onFinish={handleFinish}
		onQuit={() => (screen = 'garage')}
		onFeedback={() => openFeedback('race')}
		inputBlocked={feedbackOpen || settingsOpen}
	/>
{:else if screen === 'results'}
	<div class="gp-root gp-center">
		<GreenlineResults
			{outcome}
			trackName={raceTrack.name}
			onFeedback={() => openFeedback('results')}
			{board}
			{boardLoading}
			{submitting}
			{submitError}
			myUserId={data.userId}
			award={lastAward}
			creative={raceCreative}
			onRaceAgain={startRace}
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

{#if feedbackOpen}
	<!-- ONE shared box for every screen. The `glb` class hands it the GREENLINE
	     brand tokens (the component itself is app-agnostic and takes its palette
	     from --fb-* custom properties, so VANGUARD can theme it differently
	     without the component changing). Rendered ABOVE the race, which stays
	     paused underneath, so Escape steps feedback -> pause menu -> race. -->
	<div class="glb gp-feedback">
		<FeedbackBox
			app="greenline"
			context={feedbackContext}
			meta={feedbackMeta()}
			submit={sendFeedback}
			onClose={() => (feedbackOpen = false)}
		/>
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
	/* Above the pause menu (z 60) and the settings overlay (z 50): feedback is
	   always the topmost layer, since it can be opened from either. The GREENLINE
	   palette is handed to the shared component through its --fb-* hooks rather
	   than baked into it. */
	.gp-feedback :global(.fb-scrim) {
		z-index: 120;
		--fb-accent: #2ae57e;
		--fb-font: 'Saira Condensed', sans-serif;
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
