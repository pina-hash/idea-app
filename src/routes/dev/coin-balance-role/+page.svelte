<script lang="ts">
	import { onMount } from 'svelte';
	import { page as appPage } from '$app/state';
	import CoinRolePortal from '$lib/coin-balance/CoinRolePortal.svelte';
	import { parseMyRole, type CoinRole } from '$lib/coin-balance/role';
	import type { CoinRoleTransports } from '$lib/coin-balance/transports';
	import type { CoinActionResult } from '$lib/coin-balance/extras';
	import { coinUploadExt, coinUploadRefusal } from '$lib/coin-balance/uploads';
	import { fixtureRole, ROLE_SCENARIOS, type RoleScenario } from './fixture';

	/**
	 * Dev harness for /coin-balance/role. Mounts the REAL CoinRolePortal over a
	 * `coin_my_role()`-shaped payload run through the REAL `parseMyRole`, with
	 * in-memory transports: a captured photo is "recorded" at the harness's own
	 * clock and appended to today, and a check request answers the database's
	 * refusals for an empty note and a repeat.
	 *
	 * THE CAMERA. `?camera=0` hands the portal NO camera transport, which is the
	 * state of a browser without one, so only the camera-only file input shows.
	 * Otherwise the camera is a FAKE stream: an animated canvas through
	 * `captureStream`, so Open the camera, the live view and Capture all run
	 * with no device and no permission prompt. Where `captureStream` is not
	 * there, the open fails and the portal falls back, which is the refusal
	 * path. 404s in production.
	 */
	const params = appPage.url.searchParams;
	function pick(): RoleScenario {
		const q = params.get('scenario') ?? '';
		return (ROLE_SCENARIOS.find((s) => s.id === q)?.id ?? 'holder') as RoleScenario;
	}
	const cameraOff = params.get('camera') === '0';

	let scenario = $state<RoleScenario>(pick());
	let roles = $state<CoinRole[] | null>(parseMyRole(fixtureRole(pick())));
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	function load(s: RoleScenario) {
		scenario = s;
		roles = parseMyRole(fixtureRole(s));
	}

	const viewState = $derived(
		scenario === 'signed_out' ? 'signed_out' : scenario === 'updating' ? 'updating' : 'ready'
	) as 'ready' | 'signed_out' | 'updating';

	const wait = () => new Promise((r) => setTimeout(r, 250));
	const no = (reason: string): CoinActionResult => ({ ok: false, reason, data: { ok: false, reason } });
	const UID = '00000000-0000-4000-8000-000000000001';
	const asked = new Set<string>();

	function fakeStream(): Promise<MediaStream> {
		const canvas = document.createElement('canvas');
		canvas.width = 640;
		canvas.height = 360;
		const ctx = canvas.getContext('2d');
		const cap = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream;
		if (!ctx || typeof cap !== 'function') return Promise.reject(new Error('no captureStream'));
		let t = 0;
		const draw = () => {
			ctx.fillStyle = '#16302a';
			ctx.fillRect(0, 0, 640, 360);
			ctx.fillStyle = '#4fae7e';
			ctx.fillRect(40 + ((t * 4) % 520), 140, 80, 80);
			t += 1;
		};
		draw();
		const id = setInterval(draw, 66);
		const stream = cap.call(canvas, 15);
		for (const track of stream.getTracks()) {
			const stop = track.stop.bind(track);
			track.stop = () => {
				clearInterval(id);
				stop();
			};
		}
		return Promise.resolve(stream);
	}

	const transports: CoinRoleTransports = {
		async uploadPhoto(file) {
			await wait();
			const refusal = coinUploadRefusal(file);
			if (refusal) return { ok: false, words: refusal };
			return { ok: true, path: `${UID}/${crypto.randomUUID()}.${coinUploadExt(file)}` };
		},
		async capture(holderId, path) {
			await wait();
			const role = roles?.find((r) => r.holder_id === holderId);
			if (!role) return no('not_your_role');
			const today = role.days.find((d) => d.day === role.today);
			const at = new Date().toISOString();
			if (today) {
				today.photo_paths = [...today.photo_paths, { path, taken_at: at, url: null }];
				today.photos += 1;
				if (today.photos >= role.rules.photos_per_day) {
					today.status = 'passed';
					today.reason = null;
					today.valid = true;
				}
			}
			return { ok: true, data: { ok: true, evidence_id: crypto.randomUUID(), taken_at: at } };
		},
		async requestException(holderId, day, note) {
			await wait();
			if (!note.trim()) return no('note_required');
			const key = `${holderId}:${day}`;
			if (asked.has(key)) return no('already_pending');
			asked.add(key);
			return { ok: true, data: { ok: true, request_id: crypto.randomUUID() } };
		},
		...(cameraOff ? {} : { openCamera: fakeStream })
	};
</script>

<div class="dev-toolbar" data-coin-role-hydrated={hydrated ? '' : undefined}>
	<label>
		Scenario
		<select value={scenario} onchange={(e) => load(e.currentTarget.value as RoleScenario)}>
			{#each ROLE_SCENARIOS as s (s.id)}
				<option value={s.id}>{s.label}</option>
			{/each}
		</select>
	</label>
	<span>Camera: {cameraOff ? 'none (file fallback)' : 'fake stream'}</span>
</div>

{#key scenario}
	<CoinRolePortal
		state={viewState}
		{roles}
		transports={viewState === 'ready' ? transports : {}}
		onsignin={() => {}}
		onchanged={() => {}}
	/>
{/key}

<style>
	.dev-toolbar {
		margin: 0.5rem 1rem;
		width: fit-content;
		max-width: calc(100% - 2rem);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 1rem;
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-1);
	}
	.dev-toolbar label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.dev-toolbar select {
		min-height: 44px;
		max-width: 60vw;
	}
</style>
