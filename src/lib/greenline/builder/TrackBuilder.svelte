<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { setCustomTrack } from '../custom-track.svelte';
	import { setSelectedTrack } from '../track-selection.svelte';
	import { CUSTOM_TRACK_ID } from '../tracks';
	import Builder2D from './Builder2D.svelte';
	import Builder3D from './Builder3D.svelte';
	import {
		compile,
		makeGate,
		makePiece,
		makeZone,
		PALETTE,
		PIECES,
		pieceSummary,
		probeBranchGap,
		probeSurface,
		type GateSpec,
		type PaletteEntry,
		type PieceType,
		type PlacedPiece,
		type TrackDoc,
		type ZoneKind,
		type ZoneSpec
	} from './pieces';
	import { validateCompiled, type ValidationReport } from './validate';

	/**
	 * GREENLINE // TRACK BUILDER, stage 2 (dev tool). Piece-based authoring:
	 * palette appends/inserts after the selection, every piece snaps
	 * entry-to-exit by construction, forks open a nested branch sub-sequence,
	 * the 2D canvas is the placement view, the 3D panel previews the real
	 * runtime sweep live, the inspector tunes the selected piece / gate / zone
	 * numerically, and the export panel serializes valid schema-v2 TrackData.
	 * The validation panel's pass gates are the REAL `parseTrack`,
	 * `buildRuntime`, `surfaceState` and `LapTracker` code paths (validate.ts).
	 *
	 * The whole document (pieces, gates, zones) persists per browser, and
	 * `window.__glBuilder` (the `__greenline` convention) drives everything
	 * from the console for scripted regression checks.
	 */

	const STORE_KEY = 'greenline_track_builder_v1';

	/**
	 * Publish seam (Bundle 4a). Presentation-only, the Minimap convention: the
	 * component gathers the name + the validated export JSON and hands them to
	 * the host; the real route posts to /api/greenline-track-publish (session
	 * auth + the REAL server-side re-validation + the service-role insert), the
	 * dev harness wires an in-memory fake. Omitted = no publish UI at all.
	 */
	const {
		onPublish
	}: {
		onPublish?: (
			name: string,
			trackJson: string
		) => Promise<{ ok: boolean; trackId?: string | null; error: string | null }>;
	} = $props();

	let publishState = $state<'idle' | 'busy' | 'done' | 'error'>('idle');
	let publishMsg = $state('');

	/**
	 * Publish the CURRENT validated export. Gated on the full validation report
	 * passing (the same gate TEST DRIVE trusts, plus the advisory-free FAIL
	 * checks) — purely a UX courtesy: the server re-runs the authoritative
	 * validation on whatever it receives regardless.
	 */
	async function publishNow() {
		if (!onPublish || !report?.ok || !report.json || publishState === 'busy') return;
		publishState = 'busy';
		publishMsg = 'publishing…';
		const res = await onPublish(trackName.trim() || 'Custom Circuit', report.json);
		if (res.ok) {
			publishState = 'done';
			publishMsg =
				'Submitted for review. Only you and your teachers can see or race it until it is approved.';
		} else {
			publishState = 'error';
			publishMsg = res.error ?? 'Publish failed.';
		}
	}

	type Selection =
		| { kind: 'piece'; id: string }
		| { kind: 'gate'; id: string }
		| { kind: 'zone'; id: string }
		| null;

	let trackName = $state('Custom Circuit');
	let trackId = $state('custom-circuit');
	let pieces = $state<PlacedPiece[]>([makePiece('start-finish')]);
	let gates = $state<GateSpec[]>([]);
	let zones = $state<ZoneSpec[]>([]);
	let sel = $state<Selection>(null);
	let resetArmed = $state(false);
	let copied = $state(false);
	let loaded = $state(false);

	let threeApi: {
		renderOnce: () => void;
		reframe: () => void;
		probe: (cols?: number, rows?: number) => Record<string, unknown>;
	} | null = null;

	const cleanId = (s: string) =>
		s
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'custom-track';

	const doc = $derived<TrackDoc>({ pieces, gates, zones });
	const compiled = $derived.by(() =>
		compile(doc, { id: cleanId(trackId), name: trackName.trim() || 'Custom Circuit' })
	);

	const selPieceIdx = $derived.by(() => {
		const s = sel;
		if (s?.kind !== 'piece') return null;
		const i = compiled.flat.findIndex((f) => f.piece.id === s.id);
		return i === -1 ? null : i;
	});

	// Heavy checks (serialize + parse round-trip + route sims) are debounced off
	// the live compile so number-input keystrokes stay instant.
	let report = $state<ValidationReport | null>(null);
	$effect(() => {
		const c = compiled;
		const t = setTimeout(() => {
			report = validateCompiled(c);
		}, 140);
		return () => clearTimeout(t);
	});

	const stats = $derived.by(() => {
		let maxElev = 0;
		let maxBank = 0;
		for (const L of compiled.lanes)
			for (const s of L.samples) {
				if (s.elev > maxElev) maxElev = s.elev;
				if (Math.abs(s.bankDeg) > maxBank) maxBank = Math.abs(s.bankDeg);
			}
		return { maxElev, maxBank };
	});

	/* ---------------- tree helpers ---------------- */

	const cloneTree = (list: PlacedPiece[]): PlacedPiece[] =>
		list.map((p) => ({
			...p,
			params: { ...p.params },
			...(p.branch ? { branch: cloneTree(p.branch) } : {})
		}));

	function locate(
		list: PlacedPiece[],
		id: string
	): { list: PlacedPiece[]; idx: number; parent: PlacedPiece | null } | null {
		for (let i = 0; i < list.length; i++) {
			if (list[i].id === id) return { list, idx: i, parent: null };
			const br = list[i].branch;
			if (br) {
				const r = locate(br, id);
				if (r) return { ...r, parent: r.parent ?? list[i] };
			}
		}
		return null;
	}

	/** Every piece id currently in the tree (for pruning orphaned specs). */
	function allIds(list: PlacedPiece[], out: Set<string> = new Set()): Set<string> {
		for (const p of list) {
			out.add(p.id);
			if (p.branch) allIds(p.branch, out);
		}
		return out;
	}

	function pruneSpecs() {
		const live = allIds(pieces);
		gates = gates.filter((g) => live.has(g.pieceId));
		zones = zones.filter((z) => live.has(z.pieceId));
	}

	/** Rows for the sequence list: main pieces, with branch pieces indented. */
	interface SeqRow {
		piece: PlacedPiece;
		depth: number;
		flatIdx: number;
		lane: number;
		lastInList: boolean;
		firstInList: boolean;
	}
	const seqRows = $derived.by((): SeqRow[] => {
		const rows: SeqRow[] = [];
		const walk = (list: PlacedPiece[], depth: number) => {
			list.forEach((p, i) => {
				const flatIdx = compiled.flat.findIndex((f) => f.piece.id === p.id);
				const lane = flatIdx === -1 ? 0 : compiled.flat[flatIdx].lane;
				rows.push({
					piece: p,
					depth,
					flatIdx,
					lane,
					firstInList: i === 0,
					lastInList: i === list.length - 1
				});
				if (p.branch) walk(p.branch, depth + 1);
			});
		};
		walk(pieces, 0);
		return rows;
	});

	/* ---------------- piece actions ---------------- */

	const paramVal = (piece: PlacedPiece, key: string): number =>
		piece.params[key] ?? PIECES[piece.type].defaults[key] ?? 0;

	/** Where a new piece goes: after the selected piece, inside its own list. */
	function addFromPalette(entry: PaletteEntry): boolean {
		if (entry.type === 'loop-close' && pieces.some((p) => p.type === 'loop-close')) return false;
		const next = cloneTree(pieces);
		const np = makePiece(entry.type, entry.params);
		let target = next;
		let at = next.length;
		if (sel?.kind === 'piece') {
			const hit = locate(next, sel.id);
			if (hit) {
				target = hit.list;
				at = hit.idx + 1;
			}
		}
		const isBranchList = target !== next;
		// Structural rules: a fork or loop-close may only live on the main line,
		// nothing may follow a branch's merge, and loop-close stays last.
		if (isBranchList && (PIECES[entry.type].forks || entry.type === 'loop-close')) return false;
		if (isBranchList) at = Math.min(at, target.length - 1); // before the merge
		else {
			at = Math.max(1, at);
			const lc = target.findIndex((p) => p.type === 'loop-close');
			if (lc !== -1 && at > lc) at = lc;
			if (entry.type === 'loop-close') at = target.length;
		}
		target.splice(at, 0, np);
		pieces = next;
		sel = { kind: 'piece', id: np.id };
		return true;
	}

	function removePiece(id: string) {
		const next = cloneTree(pieces);
		const hit = locate(next, id);
		if (!hit) return;
		// The start/finish anchor and a branch's merge terminator are structural.
		if (hit.list === next && hit.idx === 0) return;
		if (hit.list[hit.idx].type === 'merge') return;
		hit.list.splice(hit.idx, 1);
		pieces = next;
		if (sel?.kind === 'piece' && sel.id === id) sel = null;
		pruneSpecs();
	}

	function movePiece(id: string, dir: -1 | 1) {
		const next = cloneTree(pieces);
		const hit = locate(next, id);
		if (!hit) return;
		const j = hit.idx + dir;
		const isMain = hit.list === next;
		const lo = isMain ? 1 : 0;
		const hi = hit.list.length - 1;
		// Never past the start/finish, the loop-close, or a branch's merge.
		if (hit.idx < lo || j < lo || j > hi) return;
		if (hit.list[hit.idx].type === 'merge' || hit.list[j].type === 'merge') return;
		if (hit.list[hit.idx].type === 'loop-close' || hit.list[j].type === 'loop-close') return;
		[hit.list[hit.idx], hit.list[j]] = [hit.list[j], hit.list[hit.idx]];
		pieces = next;
	}

	function setParam(id: string, key: string, value: number) {
		const next = cloneTree(pieces);
		const hit = locate(next, id);
		if (!hit) return;
		const piece = hit.list[hit.idx];
		const spec = PIECES[piece.type].params.find((p) => p.key === key);
		if (!spec || !Number.isFinite(value)) return;
		piece.params[key] = Math.min(spec.max, Math.max(spec.min, value));
		pieces = next;
	}

	/* ---------------- gate + zone actions ---------------- */

	const selPiece = $derived.by(() => {
		const s = sel;
		if (s?.kind !== 'piece') return null;
		const hit = locate(pieces, s.id);
		return hit ? hit.list[hit.idx] : null;
	});
	const selGate = $derived.by(() => {
		const s = sel;
		return s?.kind === 'gate' ? (gates.find((g) => g.id === s.id) ?? null) : null;
	});
	const selZone = $derived.by(() => {
		const s = sel;
		return s?.kind === 'zone' ? (zones.find((z) => z.id === s.id) ?? null) : null;
	});

	function addGateHere() {
		if (!selPiece) return;
		const g = makeGate(selPiece.id, { name: `CP ${gates.length + 1}` });
		gates = [...gates, g];
		sel = { kind: 'gate', id: g.id };
	}

	function addZoneHere(kind: ZoneKind) {
		if (!selPiece) return;
		const z = makeZone(kind, selPiece.id);
		zones = [...zones, z];
		sel = { kind: 'zone', id: z.id };
	}

	/**
	 * The affordance that encodes the Terminal Nine rule: a checkpoint inside a
	 * stretch a branch bypasses MUST have a branch alternative, or a shortcut
	 * car can never complete a lap. This drops both halves at once, already
	 * sharing a group.
	 */
	function addSplitPair(forkId: string) {
		const hit = locate(pieces, forkId);
		const fork = hit?.list[hit.idx];
		if (!fork?.branch) return;
		const lane = compiled.lanes.find((L) => L.forkFlatIdx !== undefined &&
			compiled.flat[L.forkFlatIdx]?.piece.id === forkId);
		if (!lane) return;
		// Main half: the main piece covering the middle of the bypassed stretch.
		const mid = Math.round((lane.joinStart! + lane.joinEnd!) / 2);
		const mainRangeIdx = compiled.ranges.findIndex(
			(r, i) => r.lane === 0 && mid >= r.start && mid <= r.end && compiled.flat[i]
		);
		const mainPieceId = mainRangeIdx === -1 ? null : compiled.flat[mainRangeIdx].piece.id;
		// Branch half: the branch's middle piece.
		const branchPiece = fork.branch[Math.max(0, Math.floor((fork.branch.length - 1) / 2))];
		if (!mainPieceId || !branchPiece) return;
		const group = `split-${lane.id}`;
		const a = makeGate(mainPieceId, { name: `${lane.id} main`, group, frac: 0.5 });
		const b = makeGate(branchPiece.id, { name: `${lane.id} branch`, group, frac: 0.5 });
		gates = [...gates, a, b];
		sel = { kind: 'gate', id: a.id };
	}

	function setGate(id: string, patch: Partial<GateSpec>) {
		gates = gates.map((g) => (g.id === id ? { ...g, ...patch } : g));
	}
	function setZone(id: string, patch: Partial<ZoneSpec>) {
		zones = zones.map((z) => (z.id === id ? { ...z, ...patch } : z));
	}
	function removeGate(id: string) {
		gates = gates.filter((g) => g.id !== id);
		if (sel?.kind === 'gate' && sel.id === id) sel = null;
	}
	function removeZone(id: string) {
		zones = zones.filter((z) => z.id !== id);
		if (sel?.kind === 'zone' && sel.id === id) sel = null;
	}

	function doReset() {
		pieces = [makePiece('start-finish')];
		gates = [];
		zones = [];
		sel = null;
		trackName = 'Custom Circuit';
		trackId = 'custom-circuit';
		resetArmed = false;
	}

	/* ---------------- persistence ---------------- */

	function sanitizePieces(raw: unknown, depth = 0): PlacedPiece[] {
		if (!Array.isArray(raw)) return [];
		const out: PlacedPiece[] = [];
		for (const p of raw as { type?: unknown; params?: unknown; branch?: unknown }[]) {
			if (!p || typeof p.type !== 'string' || !(p.type in PIECES)) continue;
			const numeric: Record<string, number> = {};
			if (p.params && typeof p.params === 'object')
				for (const [k, v] of Object.entries(p.params as Record<string, unknown>))
					if (typeof v === 'number' && Number.isFinite(v)) numeric[k] = v;
			const piece = makePiece(p.type as PieceType, numeric);
			if (PIECES[piece.type].forks && depth === 0) {
				const kids = sanitizePieces(p.branch, depth + 1).filter(
					(b) => b.type !== 'merge' && !PIECES[b.type].forks
				);
				const mergeParams = Array.isArray(p.branch)
					? ((p.branch as { type?: string; params?: Record<string, number> }[]).find(
							(b) => b?.type === 'merge'
						)?.params ?? {})
					: {};
				piece.branch = [...kids, makePiece('merge', mergeParams)];
			}
			out.push(piece);
		}
		return out;
	}

	function restore(raw: string): boolean {
		let data: unknown;
		try {
			data = JSON.parse(raw);
		} catch {
			return false;
		}
		const d = data as {
			v?: number;
			name?: unknown;
			id?: unknown;
			pieces?: unknown;
			gates?: unknown;
			zones?: unknown;
		};
		if (!d || (d.v !== 1 && d.v !== 2)) return false;
		const ps = sanitizePieces(d.pieces);
		const sf = ps.find((p) => p.type === 'start-finish');
		if (!sf) return false;
		const body = ps.filter((p) => p.type !== 'start-finish' && p.type !== 'loop-close');
		const hadLc = ps.some((p) => p.type === 'loop-close');
		pieces = [sf, ...body, ...(hadLc ? [makePiece('loop-close')] : [])];
		// Specs reference piece ids, which are minted fresh on restore, so they
		// are remapped by POSITION in the flattened order they were saved in.
		const flatIds: string[] = [];
		const walk = (list: PlacedPiece[]) => {
			for (const p of list) {
				flatIds.push(p.id);
				if (p.branch) walk(p.branch);
			}
		};
		walk(pieces);
		const remap = (i: unknown) => (typeof i === 'number' ? (flatIds[i] ?? '') : '');
		gates = Array.isArray(d.gates)
			? (d.gates as Record<string, unknown>[])
					.map((g) => ({
						...makeGate(remap(g.pieceIndex), {
							name: typeof g.name === 'string' ? g.name : undefined,
							frac: typeof g.frac === 'number' ? g.frac : 0.5,
							group: typeof g.group === 'string' && g.group ? g.group : undefined
						})
					}))
					.filter((g) => g.pieceId)
			: [];
		zones = Array.isArray(d.zones)
			? (d.zones as Record<string, unknown>[])
					.map((z) => {
						const kind = (z.kind === 'boost' || z.kind === 'hazard' || z.kind === 'pit'
							? z.kind
							: 'boost') as ZoneKind;
						const num = (k: string) => (typeof z[k] === 'number' ? (z[k] as number) : undefined);
						return makeZone(kind, remap(z.pieceIndex), {
							startFrac: num('startFrac'),
							endFrac: num('endFrac'),
							radius: num('radius'),
							strength: num('strength'),
							durationSec: num('durationSec'),
							repairPerSec: num('repairPerSec'),
							stopSpeed: num('stopSpeed')
						});
					})
					.filter((z) => z.pieceId)
			: [];
		if (typeof d.name === 'string' && d.name) trackName = d.name;
		if (typeof d.id === 'string' && d.id) trackId = d.id;
		return true;
	}

	$effect(() => {
		if (!loaded) return;
		// Specs are stored by flat piece INDEX, since ids are regenerated on load.
		const flatIds: string[] = [];
		const walk = (list: PlacedPiece[]) => {
			for (const p of list) {
				flatIds.push(p.id);
				if (p.branch) walk(p.branch);
			}
		};
		walk(pieces);
		const idxOf = (id: string) => flatIds.indexOf(id);
		const payload = JSON.stringify({
			v: 2,
			name: trackName,
			id: trackId,
			pieces: $state.snapshot(pieces),
			gates: $state.snapshot(gates).map((g) => ({ ...g, pieceIndex: idxOf(g.pieceId) })),
			zones: $state.snapshot(zones).map((z) => ({ ...z, pieceIndex: idxOf(z.pieceId) }))
		});
		const t = setTimeout(() => {
			try {
				localStorage.setItem(STORE_KEY, payload);
			} catch {
				/* storage full/blocked: authoring continues unsaved */
			}
		}, 300);
		return () => clearTimeout(t);
	});

	onMount(() => {
		try {
			const raw = localStorage.getItem(STORE_KEY);
			if (raw) restore(raw);
		} catch {
			/* ignore */
		}
		loaded = true;

		const pieceIdAt = (i: number) => compiled.flat[i]?.piece.id ?? '';
		const api = {
			addPiece: (type: PieceType, params?: Record<string, number>) =>
				type in PIECES && type !== 'start-finish' && type !== 'merge'
					? addFromPalette({ type, label: type, params })
					: false,
			setParam: (i: number, key: string, value: number) => setParam(pieceIdAt(i), key, value),
			select: (i: number | null) => {
				sel = i === null ? null : { kind: 'piece', id: pieceIdAt(i) };
			},
			selectId: (kind: 'piece' | 'gate' | 'zone', id: string) => {
				sel = { kind, id };
			},
			removePiece: (i: number) => removePiece(pieceIdAt(i)),
			movePiece: (i: number, dir: -1 | 1) => movePiece(pieceIdAt(i), dir),
			addGate: (pieceIdx: number, patch?: Partial<GateSpec>) => {
				const g = makeGate(pieceIdAt(pieceIdx), patch);
				if (!g.pieceId) return null;
				gates = [...gates, g];
				return g.id;
			},
			addZone: (kind: ZoneKind, pieceIdx: number, patch?: Partial<ZoneSpec>) => {
				const z = makeZone(kind, pieceIdAt(pieceIdx), patch);
				if (!z.pieceId) return null;
				zones = [...zones, z];
				return z.id;
			},
			setGate: (id: string, patch: Partial<GateSpec>) => setGate(id, patch),
			setZone: (id: string, patch: Partial<ZoneSpec>) => setZone(id, patch),
			removeGate: (id: string) => removeGate(id),
			removeZone: (id: string) => removeZone(id),
			addSplitPair: (forkIdx: number) => addSplitPair(pieceIdAt(forkIdx)),
			getPieces: () => $state.snapshot(pieces),
			getGates: () => $state.snapshot(gates),
			getZones: () => $state.snapshot(zones),
			getCompiled: () => compiled,
			validateNow: () => validateCompiled(compiled),
			exportJson: () => validateCompiled(compiled).json,
			probeSurface: () => probeSurface(compiled),
			probeBranchGap: () => probeBranchGap(compiled),
			probe3d: (cols?: number, rows?: number) => threeApi?.probe(cols, rows) ?? null,
			reset: () => doReset()
		};
		(window as unknown as Record<string, unknown>).__glBuilder = api;
		return () => {
			delete (window as unknown as Record<string, unknown>).__glBuilder;
		};
	});

	/* ---------------- export ---------------- */

	/* ---------------- test drive ---------------- */

	let testDriveError = $state('');

	/**
	 * Park the CURRENT compiled track and drive it, now.
	 *
	 * It hands over `compiled.track` — the live object the compiler built and
	 * `buildRuntime` already swept — deliberately NOT the export string, which
	 * rounds every coordinate to 2 dp for committed files. The race then loads
	 * it through the completely unmodified path: the same track-selection store,
	 * the same `loadTrack`, the same `GreenlineRace`. Nothing builder-specific
	 * reaches the race.
	 */
	function testDrive() {
		testDriveError = '';
		const track = compiled.track;
		if (!track || !compiled.runtime) {
			testDriveError = compiled.error ?? 'Track does not compile yet.';
			return;
		}
		const err = setCustomTrack(track);
		if (err) {
			testDriveError = err;
			return;
		}
		setSelectedTrack(CUSTOM_TRACK_ID);
		// `?race=1` skips title -> garage so authoring and driving are one click
		// apart; the garage entry is still there for a deliberate visit.
		void goto('/greenline?race=1');
	}

	const canTestDrive = $derived(!!compiled.track && !!compiled.runtime);

	async function copyJson() {
		if (!report?.json) return;
		try {
			await navigator.clipboard.writeText(report.json);
			copied = true;
			setTimeout(() => (copied = false), 1400);
		} catch {
			/* clipboard blocked; the textarea is selectable */
		}
	}

	function downloadJson() {
		if (!report?.json) return;
		const blob = new Blob([report.json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${cleanId(trackId)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	const selDef = $derived(selPiece ? PIECES[selPiece.type] : null);
	const selExit = $derived(selPieceIdx === null ? null : (compiled.exits[selPieceIdx] ?? null));
	const pieceLabelOf = (pieceId: string) => {
		const i = compiled.flat.findIndex((f) => f.piece.id === pieceId);
		return i === -1 ? '(deleted piece)' : compiled.flat[i].label;
	};
	const ZONE_LABEL: Record<ZoneKind, string> = {
		boost: 'BOOST',
		hazard: 'OIL HAZARD',
		pit: 'PIT BOX'
	};
</script>

<div class="tb-root">
	<header class="tb-head">
		<div class="tb-title">
			GREENLINE <span>// TRACK BUILDER</span>
			<em>snap pieces · validate · test drive{onPublish ? ' · submit for review' : ''}</em>
		</div>
		<label class="tb-field">
			<span>NAME</span>
			<input type="text" bind:value={trackName} maxlength="48" />
		</label>
		<label class="tb-field">
			<span>ID</span>
			<input type="text" bind:value={trackId} maxlength="40" />
		</label>
		<div class="tb-stats">
			{Math.round(compiled.totalLengthM)} m · {compiled.lanes.length} path{compiled.lanes.length === 1
				? ''
				: 's'} · {compiled.flat.length} pieces · {compiled.gates.resolved.length} gates ({compiled
				.gates.stepCount} steps) · {compiled.zones.length} zones · elev max {stats.maxElev.toFixed(
				1
			)} m · bank max {stats.maxBank.toFixed(0)}° · {compiled.closure.closed
				? 'CLOSED LOOP'
				: 'OPEN'}
		</div>
		<button class="tb-btn drive" disabled={!canTestDrive} onclick={testDrive}>TEST DRIVE ▸</button>
		{#if resetArmed}
			<button class="tb-btn danger" onclick={doReset}>CONFIRM RESET</button>
			<button class="tb-btn" onclick={() => (resetArmed = false)}>KEEP</button>
		{:else}
			<button class="tb-btn" onclick={() => (resetArmed = true)}>RESET</button>
		{/if}
	</header>

	{#if testDriveError}
		<div class="tb-error">TEST DRIVE: {testDriveError}</div>
	{/if}

	{#if !compiled.ok}
		<div class="tb-error">COMPILE: {compiled.error}</div>
	{/if}

	<div class="tb-main">
		<aside class="tb-left">
			<section>
				<h3>PIECES</h3>
				<div class="tb-palette">
					{#each PALETTE as entry (entry.label)}
						<button
							class="tb-piece-btn"
							class:fork={PIECES[entry.type].forks}
							disabled={entry.type === 'loop-close' && pieces.some((p) => p.type === 'loop-close')}
							onclick={() => addFromPalette(entry)}>{entry.label}</button
						>
					{/each}
				</div>
				<p class="tb-hint">
					Placing appends after the selection. Every piece snaps its entry socket to the previous
					exit; a FORK adds a second exit, opening an indented branch that always ends with MERGE.
				</p>
			</section>

			<section class="tb-seq">
				<h3>SEQUENCE</h3>
				{#each seqRows as row (row.piece.id)}
					<div
						class="tb-row"
						class:sel={sel?.kind === 'piece' && sel.id === row.piece.id}
						class:branch={row.depth > 0}
						style="margin-left:{row.depth * 0.85}rem"
						role="button"
						tabindex="0"
						onclick={() =>
							(sel =
								sel?.kind === 'piece' && sel.id === row.piece.id
									? null
									: { kind: 'piece', id: row.piece.id })}
						onkeydown={(e) => {
							if (e.key === 'Enter')
								sel =
									sel?.kind === 'piece' && sel.id === row.piece.id
										? null
										: { kind: 'piece', id: row.piece.id };
						}}
					>
						<span class="tb-row-idx">{row.flatIdx}</span>
						<span class="tb-row-name">
							{PIECES[row.piece.type].name}
							<em>{pieceSummary(row.piece)}</em>
						</span>
						<span class="tb-row-acts">
							<button
								title="Move up"
								disabled={row.firstInList || row.piece.type === 'merge'}
								onclick={(e) => {
									e.stopPropagation();
									movePiece(row.piece.id, -1);
								}}>▲</button
							>
							<button
								title="Move down"
								disabled={row.lastInList || row.piece.type === 'merge'}
								onclick={(e) => {
									e.stopPropagation();
									movePiece(row.piece.id, 1);
								}}>▼</button
							>
							<button
								title="Delete"
								disabled={(row.depth === 0 && row.firstInList) || row.piece.type === 'merge'}
								onclick={(e) => {
									e.stopPropagation();
									removePiece(row.piece.id);
								}}>✕</button
							>
						</span>
					</div>
				{/each}
			</section>

			<section>
				<h3>CHECKPOINTS</h3>
				<div class="tb-mini-acts">
					<button class="tb-btn" disabled={!selPiece} onclick={addGateHere}>+ GATE HERE</button>
					{#if selPiece && PIECES[selPiece.type].forks}
						<button class="tb-btn" onclick={() => addSplitPair(selPiece.id)}>+ SPLIT PAIR</button>
					{/if}
				</div>
				{#if !gates.length}
					<p class="tb-hint">
						Select a piece, then add a gate. A fork needs a SPLIT PAIR: one gate on the bypassed
						main stretch and one on the branch, sharing a group, so either route satisfies the step.
					</p>
				{:else}
					{#each compiled.gates.resolved as r (r.specId)}
						<div
							class="tb-row spec"
							class:sel={sel?.kind === 'gate' && sel.id === r.specId}
							role="button"
							tabindex="0"
							onclick={() => (sel = { kind: 'gate', id: r.specId })}
							onkeydown={(e) => {
								if (e.key === 'Enter') sel = { kind: 'gate', id: r.specId };
							}}
						>
							<span class="tb-row-idx">{r.step}</span>
							<span class="tb-row-name">
								{r.gate.name}
								<em>{r.group ? `group ${r.group}` : 'own step'} · {compiled.lanes[r.lane]?.id}</em>
							</span>
							<span class="tb-row-acts">
								<button
									title="Delete"
									onclick={(e) => {
										e.stopPropagation();
										removeGate(r.specId);
									}}>✕</button
								>
							</span>
						</div>
					{/each}
				{/if}
			</section>

			<section>
				<h3>ZONES</h3>
				<div class="tb-mini-acts">
					<button class="tb-btn" disabled={!selPiece} onclick={() => addZoneHere('boost')}
						>+ BOOST</button
					>
					<button class="tb-btn" disabled={!selPiece} onclick={() => addZoneHere('hazard')}
						>+ OIL</button
					>
					<button class="tb-btn" disabled={!selPiece} onclick={() => addZoneHere('pit')}
						>+ PIT</button
					>
				</div>
				{#if !zones.length}
					<p class="tb-hint">
						A zone is an extent along the selected piece, so it moves when the piece is retuned. It
						exports as the circular triggers the runtime actually reads.
					</p>
				{:else}
					{#each compiled.zones as z (z.spec.id)}
						<div
							class="tb-row spec"
							class:sel={sel?.kind === 'zone' && sel.id === z.spec.id}
							role="button"
							tabindex="0"
							onclick={() => (sel = { kind: 'zone', id: z.spec.id })}
							onkeydown={(e) => {
								if (e.key === 'Enter') sel = { kind: 'zone', id: z.spec.id };
							}}
						>
							<span class="tb-row-idx zone {z.spec.kind}"></span>
							<span class="tb-row-name">
								{ZONE_LABEL[z.spec.kind]}
								<em>{z.circles.length} circle(s) · {compiled.lanes[z.lane]?.id}</em>
							</span>
							<span class="tb-row-acts">
								<button
									title="Delete"
									onclick={(e) => {
										e.stopPropagation();
										removeZone(z.spec.id);
									}}>✕</button
								>
							</span>
						</div>
					{/each}
				{/if}
			</section>
		</aside>

		<div class="tb-canvas">
			<Builder2D
				{compiled}
				selected={selPieceIdx}
				onselect={(i) => (sel = i === null ? null : { kind: 'piece', id: compiled.flat[i].piece.id })}
			/>
		</div>

		<aside class="tb-right">
			<div class="tb-3d">
				<Builder3D {compiled} selected={selPieceIdx} onready={(api) => (threeApi = api)} />
			</div>
			<div class="tb-inspector">
				<h3>INSPECTOR</h3>
				{#if selPiece && selDef}
					<div class="tb-insp-name">
						#{selPieceIdx} {selDef.name}
					</div>
					{#if selDef.params.length}
						{#each selDef.params as spec (spec.key)}
							<div class="tb-param">
								<label for="tb-p-{spec.key}">
									{spec.label}
									<b>{paramVal(selPiece, spec.key)}{spec.unit === 'deg' ? '°' : ` ${spec.unit}`}</b>
								</label>
								<div class="tb-param-inputs">
									<input
										id="tb-p-{spec.key}"
										type="range"
										min={spec.min}
										max={spec.max}
										step={spec.step}
										value={paramVal(selPiece, spec.key)}
										oninput={(e) => setParam(selPiece.id, spec.key, Number(e.currentTarget.value))}
									/>
									<input
										type="number"
										min={spec.min}
										max={spec.max}
										step={spec.step}
										value={paramVal(selPiece, spec.key)}
										oninput={(e) => setParam(selPiece.id, spec.key, Number(e.currentTarget.value))}
									/>
								</div>
							</div>
						{/each}
					{:else}
						<p class="tb-hint">
							This connector derives its geometry automatically: a smooth curve from the previous
							exit back to the track start, blending elevation and bank to zero.
						</p>
					{/if}
					{#if selExit}
						<div class="tb-exit">
							EXIT SOCKET · x {selExit.x.toFixed(1)} · z {selExit.z.toFixed(1)} · hdg
							{selExit.headingDeg.toFixed(0)}° · elev {selExit.elev.toFixed(1)} m · bank
							{selExit.bankDeg.toFixed(0)}° · w {selExit.width.toFixed(1)} m
						</div>
					{/if}
				{:else if selGate}
					<div class="tb-insp-name">CHECKPOINT</div>
					<div class="tb-param">
						<label for="tb-g-name">Name</label>
						<input
							id="tb-g-name"
							class="tb-text"
							type="text"
							maxlength="32"
							value={selGate.name ?? ''}
							oninput={(e) => setGate(selGate.id, { name: e.currentTarget.value })}
						/>
					</div>
					<div class="tb-param">
						<label for="tb-g-frac">Position along piece <b>{Math.round(selGate.frac * 100)}%</b></label>
						<input
							id="tb-g-frac"
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={selGate.frac}
							oninput={(e) => setGate(selGate.id, { frac: Number(e.currentTarget.value) })}
						/>
					</div>
					<div class="tb-param">
						<label for="tb-g-group">Alternative group (blank = its own step)</label>
						<input
							id="tb-g-group"
							class="tb-text"
							type="text"
							maxlength="24"
							value={selGate.group ?? ''}
							oninput={(e) =>
								setGate(selGate.id, { group: e.currentTarget.value.trim() || undefined })}
						/>
					</div>
					<div class="tb-exit">ON {pieceLabelOf(selGate.pieceId)}</div>
				{:else if selZone}
					<div class="tb-insp-name">{ZONE_LABEL[selZone.kind]}</div>
					<div class="tb-param">
						<label for="tb-z-a">Extent start <b>{Math.round(selZone.startFrac * 100)}%</b></label>
						<input
							id="tb-z-a"
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={selZone.startFrac}
							oninput={(e) => setZone(selZone.id, { startFrac: Number(e.currentTarget.value) })}
						/>
					</div>
					<div class="tb-param">
						<label for="tb-z-b">Extent end <b>{Math.round(selZone.endFrac * 100)}%</b></label>
						<input
							id="tb-z-b"
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={selZone.endFrac}
							oninput={(e) => setZone(selZone.id, { endFrac: Number(e.currentTarget.value) })}
						/>
					</div>
					<div class="tb-param">
						<label for="tb-z-r">Trigger radius <b>{selZone.radius} m</b></label>
						<input
							id="tb-z-r"
							type="range"
							min="2"
							max="14"
							step="0.5"
							value={selZone.radius}
							oninput={(e) => setZone(selZone.id, { radius: Number(e.currentTarget.value) })}
						/>
					</div>
					{#if selZone.kind === 'boost'}
						<div class="tb-param">
							<label for="tb-z-s">Strength <b>x{selZone.strength ?? 1.8}</b></label>
							<input
								id="tb-z-s"
								type="range"
								min="1.1"
								max="3"
								step="0.1"
								value={selZone.strength ?? 1.8}
								oninput={(e) => setZone(selZone.id, { strength: Number(e.currentTarget.value) })}
							/>
						</div>
						<div class="tb-param">
							<label for="tb-z-d">Duration <b>{selZone.durationSec ?? 1.5} s</b></label>
							<input
								id="tb-z-d"
								type="range"
								min="0.4"
								max="4"
								step="0.1"
								value={selZone.durationSec ?? 1.5}
								oninput={(e) => setZone(selZone.id, { durationSec: Number(e.currentTarget.value) })}
							/>
						</div>
					{/if}
					{#if selZone.kind === 'pit'}
						<div class="tb-param">
							<label for="tb-z-rep">Repair per second <b>{selZone.repairPerSec ?? 125}</b></label>
							<input
								id="tb-z-rep"
								type="range"
								min="25"
								max="300"
								step="5"
								value={selZone.repairPerSec ?? 125}
								oninput={(e) => setZone(selZone.id, { repairPerSec: Number(e.currentTarget.value) })}
							/>
						</div>
						<div class="tb-param">
							<label for="tb-z-ss">Counts as stopped below <b>{selZone.stopSpeed ?? 2.5} m/s</b></label>
							<input
								id="tb-z-ss"
								type="range"
								min="0.5"
								max="8"
								step="0.5"
								value={selZone.stopSpeed ?? 2.5}
								oninput={(e) => setZone(selZone.id, { stopSpeed: Number(e.currentTarget.value) })}
							/>
						</div>
						<p class="tb-hint">
							A pit box always exports as ONE trigger circle: the harness heals per occupied pit
							zone per frame, so overlapping circles would multiply the repair rate.
						</p>
					{/if}
					<div class="tb-exit">ON {pieceLabelOf(selZone.pieceId)}</div>
				{:else}
					<p class="tb-hint">
						Select a piece, checkpoint, or zone to tune it. Piece changes re-derive every downstream
						piece live in both views; gates and zones are anchored to their piece, so they move with
						it instead of drifting.
					</p>
				{/if}
			</div>
		</aside>
	</div>

	<div class="tb-bottom">
		<section class="tb-validation">
			<h3>
				VALIDATION <span class="tb-vsub"
					>gates run the game's real parseTrack, buildRuntime, surfaceState and LapTracker</span
				>
			</h3>
			{#if report}
				{#each report.checks as check (check.label)}
					<div class="tb-check {check.status}">
						<i></i>
						<span class="tb-check-label">{check.label}</span>
						<span class="tb-check-detail">{check.detail}</span>
					</div>
				{/each}
			{:else}
				<p class="tb-hint">validating…</p>
			{/if}
		</section>
		<section class="tb-export">
			<h3>
				EXPORT · TrackData v2
				<span class="tb-export-acts">
					<button class="tb-btn" onclick={copyJson}>{copied ? 'COPIED ✓' : 'COPY'}</button>
					<button class="tb-btn" onclick={downloadJson}>DOWNLOAD .JSON</button>
				</span>
			</h3>
			<textarea readonly rows="12" value={report?.json ?? ''}></textarea>
			<p class="tb-hint">
				Drop the file into src/lib/greenline/tracks/ and register it in tracks.ts (one import + one
				entry). Props and junction-side scenery are still authored by hand.
			</p>
			{#if onPublish}
				<div class="tb-publish">
					<button
						class="tb-btn drive"
						disabled={!report?.ok || publishState === 'busy'}
						onclick={publishNow}
						title={report?.ok
							? `Publish "${trackName.trim() || 'Custom Circuit'}" for everyone to race`
							: 'Fix the failing validation checks first'}
					>
						{publishState === 'busy' ? 'SUBMITTING…' : 'SUBMIT FOR REVIEW ▸'}
					</button>
					<span class="tb-publish-note">
						{#if publishState === 'idle'}
							Submits "{trackName.trim() || 'Custom Circuit'}" to your teachers. Until a teacher
							approves it, only you and staff can see or race it. The server re-validates
							before anything is stored.
						{:else}
							{publishMsg}
						{/if}
					</span>
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.tb-root {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 0.75rem;
		background: #04060a;
		color: #eaf4ff;
		font-family: 'Rajdhani', sans-serif;
	}
	h3 {
		margin: 0 0 0.45rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.16em;
		color: #8fa3b0;
	}
	.tb-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.8rem;
	}
	.tb-title {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.95rem;
		letter-spacing: 0.1em;
		color: #eaf4ff;
	}
	.tb-title span {
		color: #2ae57e;
	}
	.tb-title em {
		display: block;
		font-style: normal;
		font-size: 0.6rem;
		color: rgba(143, 163, 176, 0.7);
		letter-spacing: 0.08em;
	}
	.tb-field {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		color: #8fa3b0;
	}
	.tb-field input {
		background: #0a0f14;
		border: 1px solid rgba(147, 163, 176, 0.35);
		color: #eaf4ff;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.28rem 0.45rem;
		width: 11rem;
	}
	.tb-stats {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.05em;
		color: #8fd4ff;
		margin-left: auto;
		max-width: 46rem;
		text-align: right;
	}
	.tb-btn {
		background: rgba(4, 7, 11, 0.85);
		border: 1px solid rgba(147, 163, 176, 0.4);
		color: #8fffc4;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
	}
	.tb-btn:hover:not(:disabled) {
		border-color: #2ae57e;
	}
	.tb-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.tb-btn.danger {
		color: #ff8899;
		border-color: rgba(255, 85, 102, 0.6);
	}
	.tb-btn.drive {
		color: #04060a;
		background: #2ae57e;
		border-color: #2ae57e;
		font-weight: 700;
	}
	.tb-btn.drive:hover:not(:disabled) {
		background: #8fffc4;
		border-color: #8fffc4;
	}
	.tb-btn.drive:disabled {
		background: rgba(42, 229, 126, 0.25);
		border-color: rgba(42, 229, 126, 0.3);
		color: rgba(4, 6, 10, 0.6);
	}
	.tb-error {
		border: 1px solid rgba(255, 85, 102, 0.6);
		color: #ff8899;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		padding: 0.4rem 0.6rem;
	}

	.tb-main {
		display: grid;
		grid-template-columns: 265px minmax(0, 1fr) 400px;
		gap: 0.7rem;
		height: 68vh;
		min-height: 32rem;
	}
	.tb-left {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		overflow-y: auto;
		padding-right: 0.15rem;
	}
	.tb-palette {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.3rem;
	}
	.tb-piece-btn {
		background: #0a0f14;
		border: 1px solid rgba(147, 163, 176, 0.35);
		color: #eaf4ff;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		padding: 0.42rem 0.2rem;
		cursor: pointer;
	}
	.tb-piece-btn.fork {
		border-color: rgba(143, 212, 255, 0.5);
		color: #8fd4ff;
	}
	.tb-piece-btn:hover:not(:disabled) {
		border-color: #2ae57e;
		color: #8fffc4;
	}
	.tb-piece-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.tb-hint {
		font-size: 0.72rem;
		line-height: 1.35;
		color: rgba(143, 163, 176, 0.75);
		margin: 0.4rem 0 0;
	}
	.tb-mini-acts {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
		margin-bottom: 0.35rem;
	}
	.tb-seq {
		display: flex;
		flex-direction: column;
	}
	.tb-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid rgba(147, 163, 176, 0.22);
		padding: 0.3rem 0.4rem;
		cursor: pointer;
		background: rgba(10, 15, 20, 0.6);
		margin-bottom: -1px;
	}
	.tb-row.branch {
		border-left: 2px solid rgba(143, 212, 255, 0.55);
		background: rgba(12, 20, 28, 0.7);
	}
	.tb-row.sel {
		border-color: rgba(42, 229, 126, 0.7);
		background: rgba(42, 229, 126, 0.08);
		position: relative;
		z-index: 1;
	}
	.tb-row-idx {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: #6b7b88;
		width: 1.1rem;
		text-align: right;
		flex: none;
	}
	.tb-row-idx.zone {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
	}
	.tb-row-idx.zone.boost {
		background: #2ae57e;
	}
	.tb-row-idx.zone.hazard {
		background: #a06eff;
	}
	.tb-row-idx.zone.pit {
		background: #ffb02e;
	}
	.tb-row-name {
		flex: 1;
		min-width: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.04em;
		line-height: 1.25;
	}
	.tb-row-name em {
		display: block;
		font-style: normal;
		color: rgba(143, 212, 255, 0.75);
		font-size: 0.56rem;
	}
	.tb-row-acts {
		display: flex;
		gap: 0.15rem;
		flex: none;
	}
	.tb-row-acts button {
		background: none;
		border: 1px solid rgba(147, 163, 176, 0.25);
		color: #8fa3b0;
		font-size: 0.55rem;
		width: 1.3rem;
		height: 1.3rem;
		cursor: pointer;
	}
	.tb-row-acts button:hover:not(:disabled) {
		border-color: #2ae57e;
		color: #8fffc4;
	}
	.tb-row-acts button:disabled {
		opacity: 0.25;
		cursor: default;
	}

	.tb-canvas {
		min-width: 0;
	}
	.tb-right {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		min-height: 0;
	}
	.tb-3d {
		flex: 1 1 50%;
		min-height: 0;
	}
	.tb-inspector {
		flex: 1 1 50%;
		min-height: 0;
		overflow-y: auto;
		border: 1px solid rgba(147, 163, 176, 0.28);
		padding: 0.6rem;
		background: rgba(10, 15, 20, 0.6);
	}
	.tb-insp-name {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		color: #2ae57e;
		margin-bottom: 0.5rem;
	}
	.tb-param {
		margin-bottom: 0.45rem;
	}
	.tb-param label {
		display: flex;
		justify-content: space-between;
		gap: 0.4rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		color: #8fa3b0;
		margin-bottom: 0.15rem;
	}
	.tb-param label b {
		color: #eaf4ff;
	}
	.tb-param input[type='range'] {
		width: 100%;
		accent-color: #2ae57e;
	}
	.tb-param-inputs {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.tb-param-inputs input[type='range'] {
		flex: 1;
	}
	.tb-param-inputs input[type='number'],
	.tb-text {
		width: 4.6rem;
		background: #0a0f14;
		border: 1px solid rgba(147, 163, 176, 0.35);
		color: #eaf4ff;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		padding: 0.2rem 0.3rem;
	}
	.tb-text {
		width: 100%;
	}
	.tb-exit {
		margin-top: 0.55rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.58rem;
		letter-spacing: 0.05em;
		color: #8fd4ff;
		border-top: 1px solid rgba(147, 163, 176, 0.2);
		padding-top: 0.45rem;
	}

	.tb-bottom {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 0.7rem;
	}
	.tb-validation,
	.tb-export {
		border: 1px solid rgba(147, 163, 176, 0.28);
		background: rgba(10, 15, 20, 0.6);
		padding: 0.6rem;
		max-height: 24rem;
		overflow-y: auto;
	}
	.tb-vsub {
		color: rgba(143, 163, 176, 0.55);
		letter-spacing: 0.06em;
		text-transform: none;
	}
	.tb-check {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		padding: 0.2rem 0;
		font-size: 0.74rem;
	}
	.tb-check i {
		flex: none;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		align-self: center;
	}
	.tb-check.pass i {
		background: #2ae57e;
	}
	.tb-check.warn i {
		background: #ffb02e;
	}
	.tb-check.fail i {
		background: #ff5566;
	}
	.tb-check.info i {
		background: transparent;
		border: 1px solid #6b7b88;
	}
	.tb-check-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.05em;
		color: #eaf4ff;
		white-space: nowrap;
	}
	.tb-check.fail .tb-check-label {
		color: #ff8899;
	}
	.tb-check-detail {
		color: rgba(143, 163, 176, 0.85);
		font-size: 0.68rem;
		line-height: 1.3;
	}
	.tb-export h3 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.tb-export-acts {
		display: flex;
		gap: 0.4rem;
	}
	.tb-publish {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-top: 0.5rem;
		border-top: 1px solid rgba(147, 163, 176, 0.2);
		padding-top: 0.5rem;
	}
	.tb-publish-note {
		flex: 1;
		min-width: 14rem;
		font-size: 0.68rem;
		line-height: 1.35;
		color: rgba(143, 163, 176, 0.85);
	}
	.tb-export textarea {
		width: 100%;
		background: #06090d;
		border: 1px solid rgba(147, 163, 176, 0.25);
		color: #b7ccd9;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		line-height: 1.35;
		padding: 0.45rem;
		resize: vertical;
	}

	@media (max-width: 1180px) {
		.tb-main {
			grid-template-columns: 1fr;
			height: auto;
		}
		.tb-canvas {
			height: 60vh;
		}
		.tb-3d {
			height: 22rem;
			flex: none;
		}
		.tb-bottom {
			grid-template-columns: 1fr;
		}
	}
</style>
