<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { audioEngine, type SfxBus } from '$lib/greenline/audio-engine';
	import Garage from '$lib/greenline/Garage.svelte';
	import GreenlineResults from '$lib/greenline/GreenlineResults.svelte';
	import GreenlineTitle from '$lib/greenline/brand/GreenlineTitle.svelte';
	import GreenlineMusic from '$lib/greenline/GreenlineMusic.svelte';
	import GreenlineSettings from '$lib/greenline/GreenlineSettings.svelte';
	import { GARAGE_BASELINE, type RaceOutcome } from '$lib/greenline/GreenlineRace.svelte';
	import { defaultLoadout, resolveWeaponSockets, sanitizeLoadout, type ArchetypeId, type Cosmetics, type Loadout, type PartSlot } from '$lib/greenline/loadout';
	import type { WeaponSlotId, WeaponSocketId } from '$lib/greenline/combat';
	import { creativeSettings } from '$lib/greenline/creative.svelte';
	import {
		AWARD_PB_BONUS,
		awardForPlacement,
		itemPrice,
		sanitizeLoadoutOwnership,
		unlockableItems,
		type RaceAward
	} from '$lib/greenline/economy';
	import { GREENLINE_MAX_SLOTS, type LeaderboardEntry, type LoadoutSlot } from '$lib/greenline/persistence';
	import DecalReviewQueue from '$lib/greenline/DecalReviewQueue.svelte';
	import { validateDecalFile, type DecalStatus } from '$lib/greenline/decals';
	import { decalImageState, registerDecalImage } from '$lib/greenline/rig-visual';

	/**
	 * Dev harness for the /greenline portal-flow chrome (no auth / Supabase). It
	 * mounts the real GreenlineTitle (the code-rendered key-art scene), the real
	 * Garage with the route's own props (START RACE label, TITLE back button,
	 * custom note), and the real GreenlineResults with sample data, so all three
	 * presentational screens are browser-verifiable. The race itself lives in
	 * /dev/greenline-movement; the full data-backed loop is on /greenline.
	 */
	// ?view=garage|results preselects a view (headless screenshot support).
	const initView = browser ? new URLSearchParams(location.search).get('view') : null;
	let view = $state<'title' | 'garage' | 'race' | 'results'>(
		initView === 'garage' || initView === 'race' || initView === 'results' ? initView : 'title'
	);
	// Drives GreenlineMusic's winner-vs-loser branch on the results screen.
	let resultWin = $state(false);

	// --- Garage screen (real component, route props) ---
	let loadout = $state<Loadout>(defaultLoadout());
	let lastAction = $state('');
	// In-memory named slots + active pointer (the real route persists to Supabase;
	// here we just exercise the UI + component contract).
	let slots = $state<(LoadoutSlot | null)[]>(Array(GREENLINE_MAX_SLOTS).fill(null));
	let activeSlot = $state<number | null>(null);
	const selectArchetype = (id: ArchetypeId) => {
		// Same sanitize as the real route: an archetype swap that shrinks mount
		// capacity under the equipped weapons sheds the secondary.
		loadout = sanitizeLoadout({ ...loadout, archetype: id });
		activeSlot = null;
		lastAction = `archetype -> ${id}`;
	};
	const equipPart = (slot: PartSlot, partId: string) => {
		loadout = sanitizeLoadout({ ...loadout, parts: { ...loadout.parts, [slot]: partId } });
		activeSlot = null;
		lastAction = `equip ${slot} -> ${partId}`;
	};
	const setSocket = (slot: WeaponSlotId, socket: WeaponSocketId) => {
		loadout = sanitizeLoadout({
			...loadout,
			weaponSockets: { ...loadout.weaponSockets, [slot]: socket }
		});
		activeSlot = null;
		lastAction = `socket ${slot} -> ${socket}`;
	};
	const setCosmetic = (patch: Partial<Cosmetics>) => {
		loadout = sanitizeLoadout({ ...loadout, cosmetics: { ...loadout.cosmetics, ...patch } });
		activeSlot = null;
		lastAction = `livery ${Object.keys(patch).join(',')}`;
	};
	// Scripted-verification hook (dev harness only): lets a console drive set
	// whole loadouts and read the resolved sockets without clicking through
	// the picker — the regression surface for the 4c clip/conflict checks.
	$effect(() => {
		if (!browser) return;
		(window as unknown as Record<string, unknown>).__glGarage = {
			get: () => loadout,
			set: (l: Loadout) => {
				loadout = sanitizeLoadout(l);
				return loadout;
			},
			resolve: () => resolveWeaponSockets(loadout)
		};
		return () => {
			delete (window as unknown as Record<string, unknown>).__glGarage;
		};
	});
	const onSaveSlot = (i: number, name: string) => {
		slots = slots.map((s, idx) =>
			idx === i
				? {
						slot: i,
						name,
						loadout: {
							archetype: loadout.archetype,
							parts: { ...loadout.parts },
							weaponSockets: { ...loadout.weaponSockets },
							cosmetics: loadout.cosmetics
						},
						updatedAt: new Date().toISOString()
					}
				: s
		);
		activeSlot = i;
		lastAction = `save slot ${i + 1} "${name}"`;
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
		activeSlot = i;
		lastAction = `load slot ${i + 1}`;
	};
	const onDeleteSlot = (i: number) => {
		slots = slots.map((s, idx) => (idx === i ? null : s));
		if (activeSlot === i) activeSlot = null;
		lastAction = `delete slot ${i + 1}`;
	};

	// --- Custom decal (Phase 6c): in-memory store standing in for Supabase. The
	// REAL validateDecalFile, the REAL Garage decal UI, and the REAL
	// DecalReviewQueue all run against it, so the full loop — upload -> client
	// validation -> pending -> student uses it immediately -> teacher approve /
	// request-revision -> resubmit — is browser-verifiable without auth (the
	// /dev/frc model-gate convention). Images resolve through rig-visual's decal
	// registry as data: URLs, exactly where /greenline registers signed URLs.
	type DevDecal = {
		path: string;
		status: DecalStatus;
		feedback: string;
		previewUrl: string | null;
		submittedAt: string;
	};
	let devDecal = $state<DevDecal | null>(null);
	let decalBusy = $state(false);
	let decalError = $state('');
	let showDecalQueue = $state(false);
	let decalSeq = 0;
	const handleDecalUpload = async (file: File) => {
		decalError = '';
		decalBusy = true;
		const reason = await validateDecalFile(file);
		if (reason) {
			decalError = reason;
			decalBusy = false;
			lastAction = `decal rejected: ${reason}`;
			return;
		}
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const fr = new FileReader();
			fr.onload = () => resolve(fr.result as string);
			fr.onerror = () => reject(fr.error);
			fr.readAsDataURL(file);
		});
		const path = `dev-user/decal-${++decalSeq}`;
		registerDecalImage(path, dataUrl);
		devDecal = {
			path,
			status: 'pending',
			feedback: '',
			previewUrl: dataUrl,
			submittedAt: new Date().toISOString()
		};
		// A fresh upload auto-equips, like the real route.
		setCosmetic({ decal: path });
		decalBusy = false;
		lastAction = `decal uploaded -> pending (${path})`;
	};
	const handleDecalRemove = () => {
		if (loadout.cosmetics?.decal) setCosmetic({ decal: undefined });
		devDecal = null;
		lastAction = 'decal removed';
	};
	const decalQueueItems = $derived(
		devDecal && devDecal.status === 'pending'
			? [
					{
						userId: 'dev-user',
						studentName: 'Dev Student',
						studentEmail: 'dev.student@boscotech.net',
						imageUrl: devDecal.previewUrl,
						submittedAt: devDecal.submittedAt
					}
				]
			: []
	);
	const devApproveDecal = (userId: string) => {
		if (devDecal) devDecal = { ...devDecal, status: 'approved', feedback: '' };
		lastAction = `decal approved (${userId})`;
	};
	const devReviseDecal = (userId: string, feedback: string) => {
		if (devDecal) devDecal = { ...devDecal, status: 'needs_revision', feedback };
		lastAction = `decal revision requested (${userId}): ${feedback}`;
	};
	// Scripted-verification hook: the decal store + registry state, console-readable.
	$effect(() => {
		if (!browser) return;
		(window as unknown as Record<string, unknown>).__glDecal = {
			get: () => devDecal,
			imageState: (ref: string) => decalImageState(ref),
			upload: handleDecalUpload,
			approve: () => devApproveDecal('dev-user'),
			revise: (fb: string) => devReviseDecal('dev-user', fb),
			remove: handleDecalRemove
		};
		return () => {
			delete (window as unknown as Record<string, unknown>).__glDecal;
		};
	});

	// Settings overlay (real component).
	let settingsOpen = $state(false);

	// --- Economy (Phase 7): in-memory wallet + unlocks standing in for the 0052
	// tables, driving the REAL Garage lock UI, the REAL ownership sanitizer, and
	// the REAL creative store (the settings toggle works here). The purchase
	// handler mirrors the greenline_purchase_item RPC's semantics — including
	// the busy guard, so a scripted double-fire verifiably charges once (the
	// server's wallet row lock is the real guard on /greenline).
	let devEconomyOn = $state(true);
	let devWallet = $state(800);
	let devUnlocked = $state<Set<string>>(new Set());
	let purchasing = $state<string | null>(null);
	let purchaseError = $state('');
	async function devPurchase(itemId: string) {
		if (purchasing) return;
		purchasing = itemId;
		purchaseError = '';
		// Simulated round-trip so rapid double-clicks race like the real RPC.
		await new Promise((r) => setTimeout(r, 200));
		const price = itemPrice(itemId);
		if (price == null) {
			purchasing = null;
			lastAction = `purchase ${itemId}: unknown/free item`;
			return;
		}
		if (devUnlocked.has(itemId)) {
			purchasing = null;
			lastAction = `purchase ${itemId}: already unlocked (no charge)`;
			return;
		}
		if (devWallet < price) {
			purchaseError = `Not enough IC — that costs ${price}, you have ${devWallet}.`;
			purchasing = null;
			lastAction = `purchase ${itemId}: insufficient (${devWallet}/${price})`;
			return;
		}
		devWallet -= price;
		devUnlocked = new Set([...devUnlocked, itemId]);
		purchasing = null;
		lastAction = `purchased ${itemId} for ${price} IC (balance ${devWallet})`;
	}
	// Ownership enforcement, the REAL route effect: creative off + economy on
	// means the working build only holds owned items.
	$effect(() => {
		if (!devEconomyOn || creativeSettings.enabled) return;
		const gated = sanitizeLoadoutOwnership(loadout, devUnlocked);
		if (gated !== loadout) {
			loadout = gated;
			lastAction = 'ownership gate stripped locked items from the build';
		}
	});
	// Simulated race finish -> award, mirroring the 0052 server formula
	// (placement + PB bonus, zero on creative), crediting the dev wallet so the
	// earn -> spend loop is verifiable end to end without a backend.
	let simAward = $state<RaceAward | null>(null);
	let simCreative = $state(false);
	function simFinish(pos: number, pb: boolean) {
		const creative = creativeSettings.enabled;
		const placement = creative ? 0 : awardForPlacement(pos);
		const pbBonus = creative || !pb ? 0 : AWARD_PB_BONUS;
		const awarded = placement + pbBonus;
		devWallet += awarded;
		simCreative = creative;
		simAward = { awarded, placement, pbBonus, balance: devWallet, creative };
		resultWin = pos === 1;
		view = 'results';
		lastAction = creative
			? `sim finish P${pos}: CREATIVE, +0 IC (balance ${devWallet})`
			: `sim finish P${pos}${pb ? ' +PB' : ''}: +${awarded} IC (balance ${devWallet})`;
	}
	// Scripted-verification hook: the whole economy store, console-drivable.
	$effect(() => {
		if (!browser) return;
		(window as unknown as Record<string, unknown>).__glEconomy = {
			wallet: () => devWallet,
			setWallet: (n: number) => (devWallet = n),
			unlocked: () => [...devUnlocked],
			purchase: devPurchase,
			price: itemPrice,
			catalog: unlockableItems,
			simFinish,
			reset: () => {
				devWallet = 800;
				devUnlocked = new Set();
				simAward = null;
				purchaseError = '';
			}
		};
		return () => {
			delete (window as unknown as Record<string, unknown>).__glEconomy;
		};
	});

	// --- Results screen (real component, sample data) ---
	const sampleOutcome: RaceOutcome = {
		finishPosition: 2,
		totalTimeMs: 92450,
		bestLapMs: 29380,
		laps: 3
	};
	const MY_ID = 'me-uid';
	const sampleBoard: LeaderboardEntry[] = [
		{
			user_id: 'a',
			display_name: 'NOVA',
			full_name: null,
			avatar: null,
			avatar_url: null,
			archetype: 'velocity',
			finish_position: 1,
			total_time_ms: 88120,
			best_lap_ms: 28010,
			laps: 3,
			rank: 1
		},
		{
			user_id: MY_ID,
			display_name: 'YOU',
			full_name: null,
			avatar: null,
			avatar_url: null,
			archetype: 'handling',
			finish_position: 2,
			total_time_ms: 92450,
			best_lap_ms: 29380,
			laps: 3,
			rank: 2
		},
		{
			user_id: 'c',
			display_name: 'IRONHIDE',
			full_name: null,
			avatar: null,
			avatar_url: null,
			archetype: 'armor',
			finish_position: 3,
			total_time_ms: 99870,
			best_lap_ms: 31450,
			laps: 3,
			rank: 3
		}
	];
	let boardMode = $state<'rows' | 'empty' | 'loading' | 'submitting' | 'error'>('rows');

	// --- Audio engine dev tests (Phase 2C infrastructure) ---
	// There is no real SFX content yet, so these synthetic oscillator tests prove
	// the bus routing, positional pan, manual Doppler, and music-duck ramp work.
	// Exposed on window for scripted verification (javascript_tool) and as bar
	// buttons for manual checking; dev-harness only.
	let audioLog = $state('');
	const alog = (m: string) => {
		audioLog = m;
		// eslint-disable-next-line no-console
		console.log('[gl-audio]', m);
	};

	function toneOn(bus: SfxBus) {
		const freq = { weapons: 330, impacts: 160, ui: 660, ambient: 220 }[bus];
		audioEngine.playTone(bus, { freq, durationMs: 260, pitchJitter: [0.9, 1.1], gain: 0.3 });
		alog(`tone on ${bus} @ ${freq}Hz | ${JSON.stringify(audioEngine.snapshot().busGain)}`);
	}

	function stressBus(bus: SfxBus) {
		for (let i = 0; i < 12; i++)
			audioEngine.playTone(bus, { freq: 200 + i * 40, durationMs: 900, gain: 0.15 });
		alog(`fired 12 on ${bus}; active=${JSON.stringify(audioEngine.snapshot().voices)} (soft-capped)`);
	}

	function panSweep() {
		audioEngine.setListener({ x: 0, y: 0, z: 0 });
		const h = audioEngine.playTone('weapons', {
			freq: 440,
			durationMs: 2200,
			gain: 0.3,
			position: { x: -20, y: 0, z: 2 }
		});
		if (!h) return alog('pan sweep: audio unavailable');
		const t0 = performance.now();
		const samples: number[] = [];
		const step = () => {
			const t = Math.min(1, (performance.now() - t0) / 2000);
			const x = -20 + 40 * t;
			h.setPosition({ x, y: 0, z: 2 });
			const d = audioEngine.voiceDetail().find((v) => v.panX !== null);
			if (d?.panX != null) samples.push(d.panX);
			if (t < 1) requestAnimationFrame(step);
			else alog(`pan sweep panX ${samples[0]} -> ${samples[samples.length - 1]} (L to R)`);
		};
		requestAnimationFrame(step);
	}

	function dopplerSweep() {
		audioEngine.setListener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
		const h = audioEngine.playTone('ambient', {
			freq: 300,
			durationMs: 2200,
			gain: 0.3,
			position: { x: -40, y: 0, z: 4 },
			velocity: { x: 45, y: 0, z: 0 }
		});
		if (!h) return alog('doppler: audio unavailable');
		const t0 = performance.now();
		let hi = 1;
		let lo = 1;
		const step = () => {
			const t = Math.min(1, (performance.now() - t0) / 2000);
			const x = -40 + 80 * t; // passes the listener at t=0.5
			h.setPosition({ x, y: 0, z: 4 }, { x: 45, y: 0, z: 0 });
			const d = audioEngine.voiceDetail().find((v) => v.bus === 'ambient');
			if (d) {
				hi = Math.max(hi, d.rate);
				lo = Math.min(lo, d.rate);
			}
			if (t < 1) requestAnimationFrame(step);
			else alog(`doppler rate range ${lo.toFixed(3)} (receding) .. ${hi.toFixed(3)} (approaching)`);
		};
		requestAnimationFrame(step);
	}

	function duckTest() {
		const before = audioEngine.snapshot().busGain?.music;
		audioEngine.duckMusicBus(-12, 120, 600);
		alog(`duck fired (music ${before} -> ~0.25 -> 1). Sampling…`);
		const t0 = performance.now();
		let min = 1;
		const step = () => {
			const g = audioEngine.snapshot().busGain?.music ?? 1;
			min = Math.min(min, g);
			if (performance.now() - t0 < 900) requestAnimationFrame(step);
			else
				alog(
					`duck: music dipped to ${min.toFixed(3)}, back to ${(audioEngine.snapshot().busGain?.music ?? 1).toFixed(3)}`
				);
		};
		requestAnimationFrame(step);
	}

	onMount(() => {
		if (!browser) return;
		(window as unknown as Record<string, unknown>).__greenlineAudio = {
			engine: audioEngine,
			tone: toneOn,
			stress: stressBus,
			pan: panSweep,
			doppler: dopplerSweep,
			duck: duckTest,
			snapshot: () => audioEngine.snapshot(),
			detail: () => audioEngine.voiceDetail()
		};
	});
</script>

<svelte:head>
	<title>GREENLINE portal flow (dev)</title>
</svelte:head>

<div class="dh-bar">
	<span>GREENLINE portal-flow harness (dev)</span>
	<button class:on={view === 'title'} onclick={() => (view = 'title')}>title</button>
	<button class:on={view === 'garage'} onclick={() => (view = 'garage')}>garage</button>
	<button class:on={view === 'race'} onclick={() => (view = 'race')}>race</button>
	<button class:on={view === 'results'} onclick={() => (view = 'results')}>results</button>
	{#if view === 'garage'}
		<button class:on={showDecalQueue} onclick={() => (showDecalQueue = !showDecalQueue)}>
			decal queue ({decalQueueItems.length})
		</button>
	{/if}
	{#if view !== 'results'}<span class="dh-note">last: {lastAction || '—'}</span>{/if}
	{#if view === 'results'}
		<span class="dh-note">music:</span>
		<button class:on={resultWin} onclick={() => (resultWin = true)}>win (winner)</button>
		<button class:on={!resultWin} onclick={() => (resultWin = false)}>lose (loser)</button>
	{/if}
	{#if view === 'results'}
		<span class="dh-note">board:</span>
		{#each ['rows', 'empty', 'loading', 'submitting', 'error'] as m}
			<button class:on={boardMode === m} onclick={() => (boardMode = m as typeof boardMode)}>{m}</button>
		{/each}
	{/if}
</div>

<div class="dh-bar dh-bar-economy">
	<span>economy (dev):</span>
	<button class:on={devEconomyOn} onclick={() => (devEconomyOn = !devEconomyOn)}>
		{devEconomyOn ? 'on' : 'off (fail-soft)'}
	</button>
	<span class="dh-note">wallet {devWallet} IC · {devUnlocked.size} unlocked</span>
	<button onclick={() => (devWallet += 500)}>+500 IC</button>
	<button onclick={() => { devWallet = 0; lastAction = 'wallet zeroed'; }}>wallet=0</button>
	<button
		onclick={() => {
			devWallet = 800;
			devUnlocked = new Set();
			simAward = null;
			purchaseError = '';
			lastAction = 'economy reset';
		}}>reset</button
	>
	<span class="dh-note">sim finish:</span>
	<button onclick={() => simFinish(1, true)}>P1 +PB</button>
	<button onclick={() => simFinish(2, false)}>P2</button>
	<button onclick={() => simFinish(4, false)}>P4</button>
	<span class="dh-note">creative: {creativeSettings.enabled ? 'ON' : 'off'} (toggle in settings)</span>
</div>

<div class="dh-bar dh-bar-audio">
	<span>audio (dev):</span>
	<button onclick={() => toneOn('weapons')}>weapons</button>
	<button onclick={() => toneOn('impacts')}>impacts</button>
	<button onclick={() => toneOn('ui')}>ui</button>
	<button onclick={() => toneOn('ambient')}>ambient</button>
	<button onclick={() => stressBus('weapons')}>stress×12</button>
	<button onclick={panSweep}>pan sweep</button>
	<button onclick={dopplerSweep}>doppler</button>
	<button onclick={duckTest}>duck music</button>
	<span class="dh-note dh-audio-log">{audioLog || '—'}</span>
</div>

<div class="dh-stage">
	{#if view === 'title'}
		<GreenlineTitle
			trackName="Proving Ground 07"
			onStart={() => (lastAction = 'START')}
			onSettings={() => (settingsOpen = true)}
			enableShortcut={!settingsOpen}
		/>
	{:else if view === 'garage'}
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
			note="choose your build · saved to your account"
			closeLabel="START RACE ▸"
			onclose={() => (lastAction = 'START RACE')}
			onback={() => (lastAction = 'back to TITLE')}
			backLabel="◂ TITLE"
			onSettings={() => (settingsOpen = true)}
			{slots}
			{activeSlot}
			{onSaveSlot}
			{onLoadSlot}
			{onDeleteSlot}
			decal={devDecal}
			{decalBusy}
			{decalError}
			onDecalUpload={handleDecalUpload}
			onDecalRemove={handleDecalRemove}
			wallet={devEconomyOn ? devWallet : undefined}
			unlocked={devEconomyOn ? devUnlocked : undefined}
			creative={creativeSettings.enabled}
			onPurchase={devPurchase}
			{purchasing}
			{purchaseError}
		/>
		{#if showDecalQueue}
			<!-- The REAL dashboard review queue over the in-memory store: the
			     teacher half of the 6c round-trip, verifiable beside the garage. -->
			<div class="dh-decal-queue">
				<div class="dh-decal-queue-head">decal review queue (dev · real DecalReviewQueue)</div>
				<DecalReviewQueue
					items={decalQueueItems}
					onApprove={devApproveDecal}
					onRequestRevision={devReviseDecal}
				/>
			</div>
		{/if}
	{:else if view === 'race'}
		<div class="dh-center">
			<div class="dh-racenote">
				RACE (music harness only — real race is /dev/greenline-movement)<br />
				a random race-N track plays here; re-select race to reroll
			</div>
		</div>
	{:else}
		<div class="dh-center">
			<GreenlineResults
				outcome={sampleOutcome}
				trackName="Proving Ground 07"
				board={boardMode === 'rows' ? sampleBoard : []}
				boardLoading={boardMode === 'loading'}
				submitting={boardMode === 'submitting'}
				submitError={boardMode === 'error'}
				myUserId={MY_ID}
				award={simAward}
				creative={simCreative}
				onRaceAgain={() => (lastAction = 'race again')}
				onGarage={() => (view = 'garage')}
				onTitle={() => (lastAction = 'title')}
			/>
		</div>
	{/if}
</div>

<GreenlineMusic screen={view} finishPosition={view === 'results' ? (resultWin ? 1 : 2) : null} />

{#if settingsOpen}
	<div class="dh-settings">
		<GreenlineSettings onClose={() => (settingsOpen = false)} />
	</div>
{/if}

<style>
	.dh-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		background: #060c08;
		border-bottom: 1px solid rgba(0, 255, 65, 0.3);
		padding: 0.4rem 0.7rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: #7fbf8f;
	}
	.dh-bar button {
		background: rgba(0, 255, 65, 0.08);
		border: 1px solid rgba(0, 255, 65, 0.3);
		color: #00ff41;
		font-family: inherit;
		font-size: 0.7rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.dh-bar button.on {
		background: rgba(0, 255, 65, 0.22);
	}
	.dh-note {
		color: #5f7f6a;
	}
	.dh-bar-audio {
		top: 2.1rem;
		border-bottom-color: rgba(0, 255, 65, 0.18);
	}
	.dh-bar-economy {
		top: 4.2rem;
		border-bottom-color: rgba(0, 255, 65, 0.18);
	}
	.dh-audio-log {
		color: #8fbf9a;
		font-size: 0.66rem;
		max-width: 32rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dh-stage {
		position: fixed;
		inset: 6.5rem 0 0;
		background: #05090c;
		overflow-y: auto;
	}
	.dh-settings {
		position: fixed;
		inset: 0;
		z-index: 60;
	}
	.dh-decal-queue {
		position: fixed;
		top: 4.8rem;
		right: 0.6rem;
		width: min(24rem, 92vw);
		z-index: 45;
		background: #04120a;
		border: 1px solid rgba(0, 255, 65, 0.35);
		border-radius: 6px;
		padding: 0.5rem 0.7rem 0.7rem;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
	}
	.dh-decal-queue-head {
		font-size: 0.66rem;
		color: #7fbf8f;
		letter-spacing: 0.08em;
		margin-bottom: 0.2rem;
	}
	.dh-center {
		min-height: 100%;
		display: flex;
		align-items: flex-start;
		justify-content: center;
	}
	.dh-racenote {
		margin-top: 25vh;
		text-align: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		line-height: 1.8;
		color: #7fbf8f;
	}
</style>
