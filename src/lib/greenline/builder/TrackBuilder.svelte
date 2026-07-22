<script lang="ts">
	import { onMount } from 'svelte';
	import Builder2D from './Builder2D.svelte';
	import Builder3D from './Builder3D.svelte';
	import {
		compile,
		makePiece,
		PALETTE,
		PIECES,
		pieceSummary,
		type PaletteEntry,
		type PieceType,
		type PlacedPiece
	} from './pieces';
	import { validateCompiled, type ValidationReport } from './validate';

	/**
	 * GREENLINE // TRACK BUILDER, stage 1 (dev tool). Piece-based authoring:
	 * palette appends/inserts after the selection, every piece snaps
	 * entry-to-exit by construction, the 2D canvas is the placement view, the
	 * 3D panel previews the real runtime sweep live, the inspector tunes the
	 * selected piece numerically, and the export panel serializes valid
	 * schema-v2 TrackData. The validation panel's pass gates are the REAL
	 * `parseTrack` + `buildRuntime` code paths (see validate.ts).
	 *
	 * The piece sequence persists per browser (localStorage) so a reload
	 * never loses an authored track. `window.__glBuilder` (the __greenline
	 * convention) drives everything from the console for scripted regression
	 * checks.
	 */

	const STORE_KEY = 'greenline_track_builder_v1';

	let trackName = $state('Custom Circuit');
	let trackId = $state('custom-circuit');
	let pieces = $state<PlacedPiece[]>([makePiece('start-finish')]);
	let selectedId = $state<string | null>(null);
	let resetArmed = $state(false);
	let copied = $state(false);
	let loaded = $state(false);

	let threeApi: {
		renderOnce: () => void;
		reframe: () => void;
		probe: (
			cols?: number,
			rows?: number
		) => {
			width: number;
			height: number;
			nonBg: number;
			green: number;
			topColors: string[];
			selVerts: number;
			grid?: string[];
			total: number;
		};
	} | null = null;

	const cleanId = (s: string) =>
		s
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'custom-track';

	const selectedIdx = $derived.by(() => {
		if (selectedId === null) return null;
		const i = pieces.findIndex((p) => p.id === selectedId);
		return i === -1 ? null : i;
	});

	const compiled = $derived.by(() =>
		compile(pieces, { id: cleanId(trackId), name: trackName.trim() || 'Custom Circuit' })
	);

	// Heavy checks (serialize + parse round-trip + overlap scan) are debounced
	// off the live compile so number-input keystrokes stay instant.
	let report = $state<ValidationReport | null>(null);
	$effect(() => {
		const c = compiled;
		const t = setTimeout(() => {
			report = validateCompiled(c);
		}, 120);
		return () => clearTimeout(t);
	});

	const stats = $derived.by(() => {
		let maxElev = 0;
		let maxBank = 0;
		for (const s of compiled.samples) {
			if (s.elev > maxElev) maxElev = s.elev;
			if (Math.abs(s.bankDeg) > maxBank) maxBank = Math.abs(s.bankDeg);
		}
		return { maxElev, maxBank };
	});

	/* ---------------- piece actions ---------------- */

	const paramVal = (piece: PlacedPiece, key: string): number =>
		piece.params[key] ?? PIECES[piece.type].defaults[key] ?? 0;

	function addFromPalette(entry: PaletteEntry): number {
		if (entry.type === 'loop-close' && pieces.some((p) => p.type === 'loop-close')) return -1;
		const np = makePiece(entry.type, entry.params);
		let at = selectedIdx !== null ? selectedIdx + 1 : pieces.length;
		at = Math.max(1, at);
		const lc = pieces.findIndex((p) => p.type === 'loop-close');
		if (lc !== -1 && at > lc) at = lc;
		if (entry.type === 'loop-close') at = pieces.length;
		pieces = [...pieces.slice(0, at), np, ...pieces.slice(at)];
		selectedId = np.id;
		return at;
	}

	function removePiece(i: number) {
		if (i <= 0 || i >= pieces.length) return;
		const removed = pieces[i];
		pieces = pieces.filter((_, k) => k !== i);
		if (selectedId === removed.id) selectedId = null;
	}

	function movePiece(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (i <= 0 || j <= 0 || j >= pieces.length) return;
		if (pieces[i].type === 'loop-close' || pieces[j].type === 'loop-close') return;
		const next = [...pieces];
		[next[i], next[j]] = [next[j], next[i]];
		pieces = next;
	}

	function setParam(i: number, key: string, value: number) {
		const piece = pieces[i];
		if (!piece) return;
		const spec = PIECES[piece.type].params.find((p) => p.key === key);
		if (!spec || !Number.isFinite(value)) return;
		const v = Math.min(spec.max, Math.max(spec.min, value));
		pieces = pieces.map((p, k) => (k === i ? { ...p, params: { ...p.params, [key]: v } } : p));
	}

	function doReset() {
		pieces = [makePiece('start-finish')];
		selectedId = null;
		trackName = 'Custom Circuit';
		trackId = 'custom-circuit';
		resetArmed = false;
	}

	/* ---------------- persistence ---------------- */

	function restore(raw: string): boolean {
		let data: unknown;
		try {
			data = JSON.parse(raw);
		} catch {
			return false;
		}
		const d = data as { v?: number; name?: unknown; id?: unknown; pieces?: unknown };
		if (d?.v !== 1 || !Array.isArray(d.pieces)) return false;
		const ps: PlacedPiece[] = [];
		for (const p of d.pieces as { type?: unknown; params?: unknown }[]) {
			if (!p || typeof p.type !== 'string' || !(p.type in PIECES)) continue;
			const numeric: Record<string, number> = {};
			if (p.params && typeof p.params === 'object') {
				for (const [k, v] of Object.entries(p.params as Record<string, unknown>)) {
					if (typeof v === 'number' && Number.isFinite(v)) numeric[k] = v;
				}
			}
			ps.push(makePiece(p.type as PieceType, numeric));
		}
		// Structural invariants: one start-finish, first; loop-close last.
		const body = ps.filter((p) => p.type !== 'start-finish' && p.type !== 'loop-close');
		const sf = ps.find((p) => p.type === 'start-finish');
		const hadLc = ps.some((p) => p.type === 'loop-close');
		if (!sf) return false;
		pieces = [sf, ...body, ...(hadLc ? [makePiece('loop-close')] : [])];
		if (typeof d.name === 'string' && d.name) trackName = d.name;
		if (typeof d.id === 'string' && d.id) trackId = d.id;
		return true;
	}

	$effect(() => {
		if (!loaded) return;
		const payload = JSON.stringify({
			v: 1,
			name: trackName,
			id: trackId,
			pieces: $state.snapshot(pieces)
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

		// Console drive API (the __greenline convention): everything the UI
		// can do, callable from a scripted browser session.
		const api = {
			addPiece: (type: PieceType, params?: Record<string, number>) =>
				type in PIECES && type !== 'start-finish'
					? addFromPalette({ type, label: type, params })
					: -1,
			setParam: (i: number, key: string, value: number) => setParam(i, key, value),
			select: (i: number | null) => {
				selectedId = i === null ? null : (pieces[i]?.id ?? null);
			},
			removePiece: (i: number) => removePiece(i),
			movePiece: (i: number, dir: -1 | 1) => movePiece(i, dir),
			getPieces: () => $state.snapshot(pieces),
			getCompiled: () => compiled,
			validateNow: () => validateCompiled(compiled),
			exportJson: () => validateCompiled(compiled).json,
			probe3d: (cols?: number, rows?: number) => threeApi?.probe(cols, rows) ?? null,
			reset: () => doReset()
		};
		(window as unknown as Record<string, unknown>).__glBuilder = api;
		return () => {
			delete (window as unknown as Record<string, unknown>).__glBuilder;
		};
	});

	/* ---------------- export ---------------- */

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

	const selPiece = $derived(selectedIdx === null ? null : pieces[selectedIdx]);
	const selDef = $derived(selPiece ? PIECES[selPiece.type] : null);
	const selExit = $derived(
		selectedIdx === null ? null : (compiled.exits[selectedIdx] ?? null)
	);
</script>

<div class="tb-root">
	<header class="tb-head">
		<div class="tb-title">
			GREENLINE <span>// TRACK BUILDER</span>
			<em>dev tool · stage 1: pieces + snap + export</em>
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
			{Math.round(compiled.totalLengthM)} m · {compiled.samples.length} pts · {pieces.length} pieces
			· elev max {stats.maxElev.toFixed(1)} m · bank max {stats.maxBank.toFixed(0)}°
			· {compiled.closure.closed ? 'CLOSED LOOP' : 'OPEN'}
		</div>
		{#if resetArmed}
			<button class="tb-btn danger" onclick={doReset}>CONFIRM RESET</button>
			<button class="tb-btn" onclick={() => (resetArmed = false)}>KEEP</button>
		{:else}
			<button class="tb-btn" onclick={() => (resetArmed = true)}>RESET</button>
		{/if}
	</header>

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
							disabled={entry.type === 'loop-close' && pieces.some((p) => p.type === 'loop-close')}
							onclick={() => addFromPalette(entry)}>{entry.label}</button
						>
					{/each}
				</div>
				<p class="tb-hint">
					Placing appends after the selected piece (or at the end). Every piece snaps its entry
					socket to the previous exit; there are no typed coordinates.
				</p>
			</section>
			<section class="tb-seq">
				<h3>SEQUENCE</h3>
				{#each pieces as piece, i (piece.id)}
					<div
						class="tb-row"
						class:sel={selectedIdx === i}
						role="button"
						tabindex="0"
						onclick={() => (selectedId = selectedId === piece.id ? null : piece.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter') selectedId = selectedId === piece.id ? null : piece.id;
						}}
					>
						<span class="tb-row-idx">{i}</span>
						<span class="tb-row-name">
							{PIECES[piece.type].name}
							<em>{pieceSummary(piece)}</em>
						</span>
						<span class="tb-row-acts">
							<button
								title="Move up"
								disabled={i <= 1 || piece.type === 'loop-close'}
								onclick={(e) => {
									e.stopPropagation();
									movePiece(i, -1);
								}}>▲</button
							>
							<button
								title="Move down"
								disabled={i === 0 ||
									i >= pieces.length - 1 ||
									piece.type === 'loop-close' ||
									pieces[i + 1]?.type === 'loop-close'}
								onclick={(e) => {
									e.stopPropagation();
									movePiece(i, 1);
								}}>▼</button
							>
							<button
								title="Delete"
								disabled={i === 0}
								onclick={(e) => {
									e.stopPropagation();
									removePiece(i);
								}}>✕</button
							>
						</span>
					</div>
				{/each}
			</section>
		</aside>

		<div class="tb-canvas">
			<Builder2D
				{compiled}
				selected={selectedIdx}
				onselect={(i) => (selectedId = i === null ? null : (pieces[i]?.id ?? null))}
			/>
		</div>

		<aside class="tb-right">
			<div class="tb-3d">
				<Builder3D
					{compiled}
					selected={selectedIdx}
					onready={(api) => (threeApi = api)}
				/>
			</div>
			<div class="tb-inspector">
				<h3>INSPECTOR</h3>
				{#if selPiece && selDef && selectedIdx !== null}
					<div class="tb-insp-name">
						#{selectedIdx} {selDef.name}
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
										oninput={(e) =>
											setParam(selectedIdx!, spec.key, Number(e.currentTarget.value))}
									/>
									<input
										type="number"
										min={spec.min}
										max={spec.max}
										step={spec.step}
										value={paramVal(selPiece, spec.key)}
										oninput={(e) =>
											setParam(selectedIdx!, spec.key, Number(e.currentTarget.value))}
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
				{:else}
					<p class="tb-hint">
						Select a piece (click it in the canvas or the sequence list) to tune its parameters.
						Changes re-derive every downstream piece live in both views.
					</p>
				{/if}
			</div>
		</aside>
	</div>

	<div class="tb-bottom">
		<section class="tb-validation">
			<h3>VALIDATION <span class="tb-vsub">gates run the game's real parseTrack + buildRuntime</span></h3>
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
				entry). Zones, authored gates, and props are the next bundle.
			</p>
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
		font-size: 0.64rem;
		letter-spacing: 0.06em;
		color: #8fd4ff;
		margin-left: auto;
	}
	.tb-btn {
		background: rgba(4, 7, 11, 0.85);
		border: 1px solid rgba(147, 163, 176, 0.4);
		color: #8fffc4;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		letter-spacing: 0.12em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
	}
	.tb-btn:hover {
		border-color: #2ae57e;
	}
	.tb-btn.danger {
		color: #ff8899;
		border-color: rgba(255, 85, 102, 0.6);
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
		grid-template-columns: 250px minmax(0, 1fr) 400px;
		gap: 0.7rem;
		height: 64vh;
		min-height: 30rem;
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
	.tb-seq {
		display: flex;
		flex-direction: column;
	}
	.tb-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid rgba(147, 163, 176, 0.22);
		border-bottom: none;
		padding: 0.3rem 0.4rem;
		cursor: pointer;
		background: rgba(10, 15, 20, 0.6);
	}
	.tb-seq .tb-row:last-child {
		border-bottom: 1px solid rgba(147, 163, 176, 0.22);
	}
	.tb-row.sel {
		border-color: rgba(42, 229, 126, 0.7);
		background: rgba(42, 229, 126, 0.08);
	}
	.tb-row.sel + .tb-row {
		border-top-color: rgba(42, 229, 126, 0.7);
	}
	.tb-row-idx {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: #6b7b88;
		width: 1.1rem;
		text-align: right;
	}
	.tb-row-name {
		flex: 1;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		line-height: 1.25;
	}
	.tb-row-name em {
		display: block;
		font-style: normal;
		color: rgba(143, 212, 255, 0.75);
		font-size: 0.58rem;
	}
	.tb-row-acts {
		display: flex;
		gap: 0.15rem;
	}
	.tb-row-acts button {
		background: none;
		border: 1px solid rgba(147, 163, 176, 0.25);
		color: #8fa3b0;
		font-size: 0.55rem;
		width: 1.35rem;
		height: 1.35rem;
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
		flex: 1 1 52%;
		min-height: 0;
	}
	.tb-inspector {
		flex: 1 1 48%;
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		color: #8fa3b0;
		margin-bottom: 0.15rem;
	}
	.tb-param label b {
		color: #eaf4ff;
	}
	.tb-param-inputs {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.tb-param-inputs input[type='range'] {
		flex: 1;
		accent-color: #2ae57e;
	}
	.tb-param-inputs input[type='number'] {
		width: 4.6rem;
		background: #0a0f14;
		border: 1px solid rgba(147, 163, 176, 0.35);
		color: #eaf4ff;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		padding: 0.2rem 0.3rem;
	}
	.tb-exit {
		margin-top: 0.55rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
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
		max-height: 21rem;
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
		font-size: 0.62rem;
		letter-spacing: 0.05em;
		color: #eaf4ff;
		white-space: nowrap;
	}
	.tb-check.fail .tb-check-label {
		color: #ff8899;
	}
	.tb-check-detail {
		color: rgba(143, 163, 176, 0.85);
		font-size: 0.7rem;
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
