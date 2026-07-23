<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BANK_LIMIT_DEG,
		GRADE_LIMIT,
		defaultPiece,
		diagnoseDoc,
		emptyDoc,
		exportTrack,
		kindSpec,
		KIND_SPECS,
		loadDoc,
		pieceSummary,
		saveDoc,
		serializeTrack,
		summarize,
		type ChainDoc,
		type PieceKind
	} from './chain-doc';
	import PiecePreview3D from './PiecePreview3D.svelte';
	import type { TrackPiece, TrackVec2 } from '../track-schema';
	import { goto } from '$app/navigation';
	import { setCustomTrack } from '../custom-track.svelte';
	import { CUSTOM_TRACK_ID } from '../tracks';

	/**
	 * GREENLINE // PIECE CHAIN BUILDER (dev tool).
	 *
	 * Authors schema-v3 `pieces` tracks: pick a kind, set its params, append it,
	 * read the computed exit pose, reorder or remove, export droppable
	 * TrackData — beside a live orbitable 3D view of the road it compiles to,
	 * because a corkscrew's shape and a corner's bank do not read from numbers.
	 *
	 * The load-bearing rule: every pose, measurement, and violation shown here
	 * comes from `diagnoseChain` in track-pieces.ts — the same walk, the same
	 * generators, and the same guardrails `parseTrack` runs when the game loads
	 * a track. Nothing about the geometry is reimplemented here, so the builder
	 * cannot tell an author something the game would disagree with. Export is
	 * blocked while any guardrail is broken, and the 3D view feeds that same
	 * compiled output into the SHARED track-visual mesh builders the race scene
	 * mounts, so the previewed road is by construction the road the game sweeps.
	 *
	 * `window.__glPieceBuilder` drives the whole thing from the console (the
	 * `__greenline` / `__glBuilder` convention), which is how it is verified.
	 */

	let doc = $state<ChainDoc>(emptyDoc());
	let selected = $state(-1);
	let showJson = $state(false);
	let copied = $state('');
	let ready = $state(false);

	/**
	 * RENDER counter for the 3D view. There is no manual commit step: an edit
	 * shows up on its own.
	 *
	 * This reverses the earlier commit-gated design. Rebuilding the scene per
	 * edit was treated as a performance risk it never actually was at chain
	 * scale (tens of pieces, a few hundred samples), and the cost of the gate
	 * was that an author typed a number and then had to do something ELSE
	 * before the road agreed with the form.
	 *
	 * Two speeds, because they want different things:
	 *  - `renderNow` for STRUCTURAL edits (add / insert / duplicate / remove /
	 *    reorder / paste). One discrete action, one immediate redraw.
	 *  - `renderSoon` for TYPING. Debounced, so a four-digit radius redraws
	 *    once on the pause rather than four times mid-number.
	 *
	 * Deliberately plain function calls rather than an `$effect` over `doc`:
	 * reading a prop or state inside an effect SUBSCRIBES to it, which is the
	 * exact trap that made the previous version rebuild on every keystroke. By
	 * bumping the counter explicitly from the handlers, the set of things that
	 * trigger a redraw is the set of things that call these two functions —
	 * readable in one place, with nothing implicit. The preview keeps its own
	 * half of that contract: `rev`/`selected` are its only reactive triggers
	 * and it reads `doc`/`diag` under `untrack`.
	 */
	let renderRev = $state(0);
	let renderTimer: ReturnType<typeof setTimeout> | undefined;
	/** Long enough to swallow a fast typist mid-number, short enough to feel live. */
	const RENDER_DEBOUNCE_MS = 180;
	function renderNow() {
		clearTimeout(renderTimer);
		renderTimer = undefined;
		renderRev += 1;
	}
	function renderSoon() {
		clearTimeout(renderTimer);
		renderTimer = setTimeout(renderNow, RENDER_DEBOUNCE_MS);
	}

	/**
	 * Where the palette drops the next piece: an explicit index, or null for
	 * "after the selection, else at the end" (the historical behavior).
	 */
	let insertAt = $state<number | null>(null);
	/** Row being dragged, and the row it would land on. */
	let dragFrom = $state<number | null>(null);
	let dragOver = $state<number | null>(null);

	const diag = $derived(diagnoseDoc(doc));
	const summary = $derived(summarize(diag));
	const exported = $derived(diag.ok && doc.pieces.length > 0 ? exportTrack(doc) : null);
	const json = $derived(exported ? serializeTrack(exported) : '');

	/** Per-authored-index diagnostic (a piece skipped by the walk has none). */
	const diagFor = (i: number) => diag.pieces.find((p) => p.index === i);
	/**
	 * Every issue attributed to this piece. Read from `diag.issues` rather than
	 * from the diagnostic, because a piece with out-of-range params is SKIPPED by
	 * the walk and so has no diagnostic at all — which is exactly the piece whose
	 * message the author most needs to see on its own row.
	 */
	const issuesFor = (i: number) =>
		diag.issues.filter((x) => x.pieceIndex === i).map((x) => x.message);

	onMount(() => {
		const stored = loadDoc();
		if (stored) doc = stored;
		ready = true;
		renderNow();
		const api = {
			get doc() {
				return doc;
			},
			get diag() {
				return diag;
			},
			get summary() {
				return summary;
			},
			get json() {
				return json;
			},
			exportTrack: () => (diag.ok && doc.pieces.length ? exportTrack(doc) : null),
			setMeta: (patch: Partial<ChainDoc>) => {
				doc = { ...doc, ...patch };
				renderNow();
			},
			setStart: (patch: Partial<ChainDoc['start']>) => {
				doc = { ...doc, start: { ...doc.start, ...patch } };
				renderNow();
			},
			/** `at` inserts at an index; omitted keeps the append/after-selection rule. */
			addPiece: (kind: PieceKind, params?: Record<string, unknown>, at?: number) => {
				const i = addPiece(kind, at);
				if (params) setParams(i, params);
				return i;
			},
			duplicatePiece,
			reorderPiece,
			setParams,
			/** Typed-edit path, debounce included, for driving the live-update check. */
			setParamText: (i: number, key: string, raw: string) => setParam(i, key, raw),
			movePiece,
			removePiece,
			select: (i: number) => (selected = i),
			get insertAt() {
				return insertAt;
			},
			setInsertAt: (i: number | null) => (insertAt = i),
			get renderRev() {
				return renderRev;
			},
			playtest,
			clear: () => {
				doc = { ...doc, pieces: [] };
				selected = -1;
				renderNow();
			},
			load: (next: ChainDoc) => {
				doc = { ...emptyDoc(), ...next, start: { ...emptyDoc().start, ...next.start } };
				selected = -1;
				renderNow();
			},
			exitPose: (i: number) => diagFor(i)?.exit ?? null
		};
		(window as unknown as Record<string, unknown>).__glPieceBuilder = api;
		return () => {
			delete (window as unknown as Record<string, unknown>).__glPieceBuilder;
		};
	});

	$effect(() => {
		if (ready) saveDoc(doc);
	});

	/**
	 * Insert a piece ANYWHERE, not only at the end.
	 *
	 * `at` wins; otherwise the explicit `insertAt` target; otherwise after the
	 * selection; otherwise the end. The new piece's default params are seeded
	 * from the exit pose of whatever ends up IN FRONT of it (`at - 1`), never
	 * from the selection or the tail — that is what makes a mid-chain insert
	 * start where the road actually is. Everything downstream re-derives on its
	 * own, since each piece's entry pose IS its predecessor's exit.
	 */
	function addPiece(kind: PieceKind, at?: number) {
		const target = at ?? insertAt ?? (selected >= 0 ? selected + 1 : doc.pieces.length);
		const idx = Math.max(0, Math.min(doc.pieces.length, target));
		const before = idx > 0 ? diagFor(idx - 1)?.exit : undefined;
		const piece = defaultPiece(kind, before ?? { ...doc.start });
		const next = [...doc.pieces];
		next.splice(idx, 0, piece);
		doc = { ...doc, pieces: next };
		selected = idx;
		insertAt = null;
		renderNow();
		return idx;
	}

	/**
	 * Copy a piece in place, directly after the original. A structural clone
	 * (JSON round trip) so a freeform piece's arrays are not shared with the
	 * source — editing the copy must never reach back into the original.
	 */
	function duplicatePiece(i: number) {
		const src = doc.pieces[i];
		if (!src) return;
		const next = [...doc.pieces];
		next.splice(i + 1, 0, JSON.parse(JSON.stringify(src)) as TrackPiece);
		doc = { ...doc, pieces: next };
		selected = i + 1;
		insertAt = null;
		renderNow();
		return i + 1;
	}

	function setParams(i: number, params: Record<string, unknown>, render = true) {
		const next = [...doc.pieces];
		next[i] = { ...next[i], ...params } as TrackPiece;
		doc = { ...doc, pieces: next };
		if (render) renderNow();
	}

	/**
	 * Typed parameter edit. The document updates on the keystroke (so every
	 * numeric readout, pose and guardrail is live), and the 3D rebuild is
	 * debounced behind it — no commit action of any kind.
	 */
	function setParam(i: number, key: string, raw: string) {
		if (raw.trim() === '') {
			const next = [...doc.pieces];
			const copy = { ...next[i] } as Record<string, unknown>;
			delete copy[key];
			next[i] = copy as unknown as TrackPiece;
			doc = { ...doc, pieces: next };
			renderSoon();
			return;
		}
		const v = Number(raw);
		if (!Number.isFinite(v)) return;
		setParams(i, { [key]: v }, false);
		renderSoon();
	}

	/** Move a piece to an arbitrary index (drag-drop, and the arrow buttons). */
	function reorderPiece(from: number, to: number) {
		const n = doc.pieces.length;
		if (from === to || from < 0 || from >= n) return;
		const dest = Math.max(0, Math.min(n - 1, to));
		const next = [...doc.pieces];
		const [moved] = next.splice(from, 1);
		next.splice(dest, 0, moved);
		doc = { ...doc, pieces: next };
		// Selection follows the piece the author was manipulating.
		if (selected === from) selected = dest;
		else if (selected > from && selected <= dest) selected -= 1;
		else if (selected < from && selected >= dest) selected += 1;
		renderNow();
	}

	function movePiece(i: number, dir: -1 | 1) {
		reorderPiece(i, i + dir);
	}

	/* ---- drag to reorder (native DnD, initiated only from the grip) ---- */
	function onDragStart(e: DragEvent, i: number) {
		dragFrom = i;
		dragOver = i;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			// Firefox refuses to start a drag without payload.
			e.dataTransfer.setData('text/plain', String(i));
		}
	}
	function onDragOver(e: DragEvent, i: number) {
		if (dragFrom === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOver = i;
	}
	function onDrop(e: DragEvent, i: number) {
		if (dragFrom === null) return;
		e.preventDefault();
		reorderPiece(dragFrom, i);
		dragFrom = null;
		dragOver = null;
	}
	function onDragEnd() {
		dragFrom = null;
		dragOver = null;
	}

	function removePiece(i: number) {
		const next = doc.pieces.filter((_, k) => k !== i);
		doc = { ...doc, pieces: next };
		if (selected >= next.length) selected = next.length - 1;
		if (insertAt !== null && insertAt > next.length) insertAt = null;
		renderNow();
	}

	/** Freeform geometry is edited as raw JSON: it IS verbatim world data. */
	function freeformText(p: Extract<TrackPiece, { kind: 'freeform' }>): string {
		return JSON.stringify(
			{
				centerline: p.centerline,
				...(p.widths ? { widths: p.widths } : {}),
				...(p.elevations ? { elevations: p.elevations } : {}),
				...(p.banking ? { banking: p.banking } : {})
			},
			null,
			1
		);
	}
	let freeformError = $state('');
	/**
	 * Live like every other field, with one concession to the medium: raw JSON
	 * is invalid for most of the time it is being typed, so a parse failure
	 * leaves the last GOOD geometry in place and just reports itself. Nothing
	 * is committed until the text parses, so the road never flickers through
	 * half-typed states.
	 */
	function setFreeform(i: number, text: string) {
		try {
			const parsed = JSON.parse(text) as {
				centerline?: TrackVec2[];
				widths?: number[];
				elevations?: number[];
				banking?: number[];
			};
			if (!Array.isArray(parsed.centerline)) throw new Error('needs a centerline array');
			const next = [...doc.pieces];
			next[i] = { kind: 'freeform', ...parsed } as TrackPiece;
			doc = { ...doc, pieces: next };
			freeformError = '';
			renderSoon();
		} catch (e) {
			freeformError = e instanceof Error ? e.message : String(e);
		}
	}

	/* ---------------- playtest ---------------- */

	let playtestError = $state('');

	/**
	 * Drive the chain as it stands, with no export/reimport round trip.
	 *
	 * Reuses the EXISTING pieces end to end: `setCustomTrack` parks the live
	 * compiled `TrackData` in the same one-slot custom-track store the ribbon
	 * builder's Test Drive uses (deliberately the live object, not the export
	 * string, which rounds every coordinate to 2 dp for committed files), and
	 * the dev movement harness then loads it through its own unmodified
	 * `?track=` path. No second driving mode, and nothing builder-specific
	 * reaches the race.
	 *
	 * The harness rather than `/greenline` because this is a dev tool: the
	 * portal route is behind auth, and the harness is the surface these chains
	 * have been verified on all along.
	 */
	function playtest() {
		playtestError = '';
		if (!exported) {
			playtestError =
				doc.pieces.length === 0
					? 'Add pieces first.'
					: 'An invalid chain cannot be raced — clear the guardrail issues first.';
			return;
		}
		const err = setCustomTrack(exported);
		if (err) {
			playtestError = err;
			return;
		}
		// `from` gives the harness a one-click way back to the chain, which is
		// still exactly where it was (the doc lives in localStorage).
		void goto(`/dev/greenline-movement?track=${CUSTOM_TRACK_ID}&from=piece-builder`);
	}

	const n2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '-');
	const n1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-');
	const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

	async function copyJson() {
		try {
			await navigator.clipboard.writeText(json);
			copied = 'copied';
		} catch {
			copied = 'clipboard blocked, use download';
		}
		setTimeout(() => (copied = ''), 2000);
	}
	function downloadJson() {
		const blob = new Blob([json], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${doc.id}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
</script>

<div class="pb-root">
	<header class="pb-head">
		<span class="pb-title">GREENLINE // PIECE CHAIN BUILDER</span>
		<span class="pb-sub">schema v3 · numeric + live 3D</span>
		<span class="pb-flag" class:ok={diag.ok && doc.pieces.length > 0} data-testid="chain-status">
			{doc.pieces.length === 0 ? 'EMPTY' : diag.ok ? 'VALID' : `${diag.issues.length} ISSUE${diag.issues.length === 1 ? '' : 'S'}`}
		</span>
	</header>

	<div class="pb-main">
		<!-- ---------------- editor (scrolls) ---------------- -->
		<div class="pb-editor">
		<section class="pb-col pb-chain">
			<h3>chain start</h3>
			<div class="pb-grid">
				{#each [['x', 'x'], ['z', 'z'], ['y', 'y'], ['headingDeg', 'heading'], ['pitchDeg', 'pitch'], ['bankDeg', 'bank']] as [key, label] (key)}
					<label class="pb-field">
						<span>{label}</span>
						<input
							type="number"
							step="0.5"
							value={doc.start[key as keyof ChainDoc['start']]}
							data-testid={`start-${key}`}
							oninput={(e) => {
								const v = Number((e.currentTarget as HTMLInputElement).value);
								if (!Number.isFinite(v)) return;
								doc = { ...doc, start: { ...doc.start, [key]: v } };
								renderSoon();
							}}
						/>
					</label>
				{/each}
				<label class="pb-field">
					<span>width</span>
					<input
						type="number"
						step="0.5"
						min="4"
						max="40"
						value={doc.width}
						data-testid="chain-width"
						oninput={(e) => {
							const v = Number((e.currentTarget as HTMLInputElement).value);
							if (!Number.isFinite(v)) return;
							doc = { ...doc, width: v };
							renderSoon();
						}}
					/>
				</label>
			</div>

			<h3>add a piece</h3>
			<div class="pb-target" data-testid="insert-target">
				{#if insertAt !== null}
					<span class="pb-target-on">
						inserting at position {insertAt}{insertAt === 0
							? ' (start of chain)'
							: ` (after piece ${insertAt - 1})`}
					</span>
					<button data-testid="insert-cancel" onclick={() => (insertAt = null)}>cancel</button>
				{:else}
					<span>
						{selected >= 0 ? `inserting after piece ${selected}` : 'appending at the end'} · use
						<b>+</b> on a row to insert there
					</span>
				{/if}
			</div>
			<div class="pb-palette">
				{#each KIND_SPECS as k (k.kind)}
					<button class="pb-add" title={k.blurb} data-testid={`add-${k.kind}`} onclick={() => addPiece(k.kind)}>
						+ {k.label}
					</button>
				{/each}
			</div>
			<p class="pb-note">
				A new piece's defaults are seeded from the exit pose of whatever ends up in front of it, and each
				piece's entry pose IS the previous piece's exit, so an insert anywhere keeps the corridor
				continuous and everything downstream re-derives.
			</p>

			<h3>pieces ({doc.pieces.length})</h3>
			{#if doc.pieces.length === 0}
				<p class="pb-empty">No pieces yet. A chain must close back on its start pose to export.</p>
			{/if}
			<ol class="pb-list">
				{#each doc.pieces as piece, i (i)}
					{@const d = diagFor(i)}
					{@const rowIssues = issuesFor(i)}
					{@const bad = rowIssues.length > 0 || !d}
					<li
						class="pb-piece"
						class:sel={selected === i}
						class:bad
						class:dragging={dragFrom === i}
						class:dropinto={dragFrom !== null && dragOver === i && dragFrom !== i}
						data-testid={`row-${i}`}
						ondragover={(e) => onDragOver(e, i)}
						ondrop={(e) => onDrop(e, i)}
					>
						<button class="pb-row" data-testid={`piece-${i}`} onclick={() => (selected = selected === i ? -1 : i)}>
							<!-- Only the grip is draggable: making the whole row draggable
							     would hijack text selection inside the expanded param form. -->
							<!-- Decorative for assistive tech: reordering by keyboard is the
							     up/down buttons' job, this is purely the mouse affordance. -->
							<span
								class="pb-grip"
								aria-hidden="true"
								title="drag to reorder"
								draggable="true"
								data-testid={`grip-${i}`}
								ondragstart={(e) => onDragStart(e, i)}
								ondragend={onDragEnd}
							>⠿</span>
							<span class="pb-idx">{i}</span>
							<span class="pb-kind">{piece.kind}</span>
							<span class="pb-summary">{pieceSummary(piece)}</span>
						</button>
						<div class="pb-tools">
							<button
								title="insert a new piece here"
								class:armed={insertAt === i}
								data-testid={`ins-${i}`}
								onclick={() => (insertAt = insertAt === i ? null : i)}>+</button
							>
							<button title="duplicate" data-testid={`dup-${i}`} onclick={() => duplicatePiece(i)}>⧉</button>
							<button title="move up" disabled={i === 0} data-testid={`up-${i}`} onclick={() => movePiece(i, -1)}>↑</button>
							<button
								title="move down"
								disabled={i === doc.pieces.length - 1}
								data-testid={`down-${i}`}
								onclick={() => movePiece(i, 1)}>↓</button
							>
							<button title="remove" class="del" data-testid={`del-${i}`} onclick={() => removePiece(i)}>×</button>
						</div>

						{#if d}
							<div class="pb-pose" data-testid={`exit-${i}`}>
								<span>exit</span>
								<b>x {n2(d.exit.x)}</b>
								<b>z {n2(d.exit.z)}</b>
								<b>y {n2(d.exit.y)}</b>
								<b>hdg {n1(d.exit.headingDeg)}&deg;</b>
								<b>pitch {n1(d.exit.pitchDeg)}&deg;</b>
								<b>bank {n1(d.exit.bankDeg)}&deg;</b>
							</div>
							<div class="pb-meas">
								<span>{n1(d.lengthM)} m</span>
								<span class:warn={d.maxGrade > GRADE_LIMIT}>grade {pct(d.maxGrade)}</span>
								<span class:warn={d.maxBankDeg > BANK_LIMIT_DEG}>bank {n1(d.maxBankDeg)}&deg;</span>
								<span class:warn={d.minEdgeYM < -0.001} title="lowest swept edge above the y=0 catch plane">
									edge {n2(d.minEdgeYM)} m
								</span>
								{#if d.archLiftM > 0.001}
									<span class="lift" title="catch-plane arch the corkscrew applied to its own base">
										arch {n2(d.archLiftM)} m
									</span>
								{/if}
								{#if d.bankRaiseM > 0.001}
									<span class="lift" title="residual pointwise catch-plane raise">raise {n2(d.bankRaiseM)} m</span>
								{/if}
							</div>
						{/if}
						{#if rowIssues.length}
							<ul class="pb-issues" data-testid={`issues-${i}`}>
								{#each rowIssues as msg (msg)}<li>{msg}</li>{/each}
							</ul>
						{/if}

						{#if selected === i}
							<div class="pb-params">
								{#if piece.kind === 'freeform'}
									<p class="pb-note">
										Verbatim world geometry: absolute coordinates, no arithmetic, exempt from the chain's
										bank raise and grade lint. It ignores the incoming pose, so it must be placed where the
										previous piece leaves off.
									</p>
									<textarea
										rows="6"
										data-testid={`freeform-${i}`}
										value={freeformText(piece)}
										oninput={(e) => setFreeform(i, (e.currentTarget as HTMLTextAreaElement).value)}
									></textarea>
									{#if freeformError}<p class="pb-err">{freeformError}</p>{/if}
								{:else}
									<div class="pb-grid">
										{#each kindSpec(piece.kind).params as spec (spec.key)}
											<label class="pb-field" title={spec.hint ?? ''}>
												<span>{spec.label} <i>{spec.unit}</i></span>
												<input
													type="number"
													min={spec.min}
													max={spec.max}
													step={spec.step}
													data-testid={`param-${i}-${spec.key}`}
													value={(piece as unknown as Record<string, number>)[spec.key] ?? ''}
													placeholder="inherit"
													oninput={(e) => setParam(i, spec.key, (e.currentTarget as HTMLInputElement).value)}
												/>
											</label>
										{/each}
									</div>
								{/if}
								<p class="pb-blurb">{kindSpec(piece.kind).blurb}</p>
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		</section>

		<!-- ---------------- report ---------------- -->
		<section class="pb-col pb-report">
			<h3>chain</h3>
			<dl class="pb-stats">
				<div><dt>samples</dt><dd>{summary.sampleCount}</dd></div>
				<div><dt>lap length</dt><dd>{n1(summary.lengthM)} m</dd></div>
				<div><dt>elevation</dt><dd>{n2(summary.minElevM)} .. {n2(summary.maxElevM)} m</dd></div>
				<div><dt>max bank</dt><dd class:warn={summary.maxBankDeg > BANK_LIMIT_DEG}>{n1(summary.maxBankDeg)}&deg;</dd></div>
				<div><dt>max grade</dt><dd class:warn={summary.maxGrade > GRADE_LIMIT}>{pct(summary.maxGrade)}</dd></div>
				<div>
					<dt title="lowest swept edge y; below 0 is under the catch plane">lowest edge</dt>
					<dd class:warn={summary.minEdgeYM < -0.001}>{n2(summary.minEdgeYM)} m</dd>
				</div>
				<div><dt title="corkscrew base arch applied by the generator">corkscrew arch</dt><dd>{n2(summary.maxArchLiftM)} m</dd></div>
				<div><dt title="residual pointwise catch-plane raise">bank raise</dt><dd>{n2(summary.maxBankRaiseM)} m</dd></div>
			</dl>

			<h3>closure</h3>
			{#if summary.closureGapM === null}
				<p class="pb-empty">Not closed yet: the last piece's exit pose has to land back on the chain start.</p>
			{:else}
				<dl class="pb-stats">
					<div><dt>gap</dt><dd>{summary.closureGapM.toFixed(3)} m</dd></div>
					<div><dt>heading</dt><dd>{summary.closureHeadingDeg?.toFixed(2)}&deg;</dd></div>
					<div><dt>elevation</dt><dd>{summary.closureElevM?.toFixed(3)} m</dd></div>
					<div><dt>bank</dt><dd>{summary.closureBankDeg?.toFixed(2)}&deg;</dd></div>
				</dl>
			{/if}

			<h3>guardrails</h3>
			{#if diag.issues.length === 0}
				<p class="pb-ok" data-testid="guardrails">
					All clear: params in range, joints continuous, loop closed, every swept edge above the catch
					plane, grades under {pct(GRADE_LIMIT)}, bank within &plusmn;{BANK_LIMIT_DEG}&deg;.
				</p>
			{:else}
				<ul class="pb-issues big" data-testid="guardrails">
					{#each diag.issues as issue (issue.message)}
						<li>{issue.pieceIndex === null ? 'chain' : `piece ${issue.pieceIndex}`}: {issue.message}</li>
					{/each}
				</ul>
			{/if}

			<h3>export</h3>
			<div class="pb-grid">
				<label class="pb-field wide">
					<span>id</span>
					<input data-testid="doc-id" value={doc.id} oninput={(e) => (doc = { ...doc, id: (e.currentTarget as HTMLInputElement).value })} />
				</label>
				<label class="pb-field wide">
					<span>name</span>
					<input data-testid="doc-name" value={doc.name} oninput={(e) => (doc = { ...doc, name: (e.currentTarget as HTMLInputElement).value })} />
				</label>
				<label class="pb-field">
					<span>checkpoints</span>
					<input
						type="number"
						min="1"
						max="12"
						step="1"
						data-testid="doc-cps"
						value={doc.checkpointCount}
						oninput={(e) => {
							const v = Number((e.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(v)) doc = { ...doc, checkpointCount: v };
						}}
					/>
				</label>
			</div>
			<label class="pb-field wide">
				<span>description</span>
				<input
					data-testid="doc-desc"
					value={doc.description}
					oninput={(e) => (doc = { ...doc, description: (e.currentTarget as HTMLInputElement).value })}
				/>
			</label>

			<div class="pb-actions">
				<button class="pb-primary" disabled={!exported} data-testid="copy-json" onclick={copyJson}>Copy JSON</button>
				<button disabled={!exported} data-testid="download-json" onclick={downloadJson}>Download</button>
				<button disabled={!exported} onclick={() => (showJson = !showJson)}>{showJson ? 'Hide' : 'Show'} JSON</button>
				{#if copied}<span class="pb-copied">{copied}</span>{/if}
			</div>
			{#if playtestError}<p class="pb-err" data-testid="playtest-error">{playtestError}</p>{/if}
			{#if !exported}
				<p class="pb-err">
					{doc.pieces.length === 0 ? 'Add pieces first.' : 'Export is blocked while a guardrail is broken.'}
				</p>
			{:else}
				<p class="pb-note">
					Drop the file in <code>src/lib/greenline/tracks/</code>, then add one import and one entry in
					<code>tracks.ts</code>.
				</p>
			{/if}
			{#if showJson && exported}
				<textarea class="pb-json" readonly rows="14" data-testid="json-out">{json}</textarea>
			{/if}
		</section>
		</div>

		<!-- ---------------- docked preview (never scrolls away) ---------------- -->
		<aside class="pb-dock">
			<div class="pb-dockhead">
				<h3>3D preview</h3>
				<button
					class="pb-drive"
					disabled={!exported}
					data-testid="playtest"
					title={exported
						? 'Park this chain and drive it in the movement harness'
						: 'A valid, closed chain is needed to race'}
					onclick={playtest}>PLAYTEST ▸</button
				>
			</div>
			<div class="pb-dockbody">
				<PiecePreview3D {doc} {diag} rev={renderRev} {selected} />
			</div>
		</aside>
	</div>
</div>

<style>
	/* Fixed-viewport shell: the page itself never scrolls, so the preview can be
	   docked against it. The EDITOR column scrolls on its own instead. */
	.pb-root {
		position: relative;
		z-index: 1;
		height: 100vh;
		display: flex;
		flex-direction: column;
		padding: 0.75rem;
		box-sizing: border-box;
		background: #04060a;
		color: #eaf4ff;
		font-family: 'Rajdhani', sans-serif;
	}
	h3 {
		margin: 0.9rem 0 0.4rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.16em;
		color: #8fa3b0;
		text-transform: uppercase;
	}
	h3:first-child {
		margin-top: 0;
	}
	.pb-head {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
		flex-wrap: wrap;
		border-bottom: 1px solid #1b2733;
		padding-bottom: 0.5rem;
	}
	.pb-title {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.95rem;
		letter-spacing: 0.1em;
	}
	.pb-sub {
		font-size: 0.75rem;
		color: #6d8090;
	}
	.pb-flag {
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.12em;
		padding: 0.15rem 0.5rem;
		border: 1px solid #ffb02e;
		color: #ffb02e;
	}
	.pb-flag.ok {
		border-color: #2ae57e;
		color: #8fffc4;
	}
	/* The split: editor left, preview docked right. `min-height: 0` on both the
	   row and the scrolling child is what actually lets the child scroll — a
	   grid/flex item defaults to min-content, which would push the whole
	   column to full height and hand the scrollbar back to the page. */
	.pb-main {
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(22rem, 0.85fr);
		gap: 0.8rem;
		margin-top: 0.6rem;
	}
	.pb-editor {
		min-height: 0;
		overflow-y: auto;
		padding-right: 0.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.pb-dock {
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border: 1px solid #16212c;
		background: #070b11;
		padding: 0.7rem;
	}
	.pb-dockhead {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.pb-dockhead h3 {
		margin: 0;
	}
	.pb-dockbody {
		flex: 1 1 auto;
		min-height: 0;
	}
	.pb-drive {
		margin-left: auto;
		border-color: #2ae57e;
		color: #8fffc4;
		letter-spacing: 0.1em;
	}
	.pb-drive:disabled {
		border-color: #24333f;
		color: #cfe2ef;
	}
	/* Below this the columns cannot both be useful, so the shell gives up its
	   fixed height and the page scrolls as one, preview first. */
	@media (max-width: 1000px) {
		.pb-root {
			height: auto;
			min-height: 100vh;
		}
		.pb-main {
			grid-template-columns: 1fr;
		}
		.pb-editor {
			overflow: visible;
		}
		.pb-dock {
			order: -1;
			height: 24rem;
		}
	}
	.pb-col {
		border: 1px solid #16212c;
		background: #070b11;
		padding: 0.7rem;
	}
	.pb-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pb-field {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.68rem;
		color: #8fa3b0;
		min-width: 5.2rem;
		flex: 0 1 auto;
	}
	.pb-field.wide {
		flex: 1 1 12rem;
	}
	.pb-field i {
		color: #55697a;
		font-style: normal;
	}
	.pb-field input,
	textarea {
		background: #0b1219;
		border: 1px solid #1d2b38;
		color: #eaf4ff;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		padding: 0.22rem 0.35rem;
		width: 100%;
		box-sizing: border-box;
	}
	textarea {
		font-size: 0.65rem;
		line-height: 1.35;
		resize: vertical;
	}
	.pb-palette {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	button {
		background: #0d1620;
		border: 1px solid #24333f;
		color: #cfe2ef;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		padding: 0.28rem 0.55rem;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: #2ae57e;
		color: #8fffc4;
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.pb-primary {
		border-color: #2ae57e;
		color: #8fffc4;
	}
	.pb-note,
	.pb-empty,
	.pb-blurb {
		margin: 0.35rem 0 0;
		font-size: 0.7rem;
		color: #6d8090;
		line-height: 1.4;
	}
	.pb-blurb {
		font-size: 0.68rem;
	}
	code {
		font-family: 'Share Tech Mono', monospace;
		color: #8fa3b0;
	}
	.pb-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.pb-piece {
		border: 1px solid #16212c;
		background: #090e15;
		padding: 0.35rem 0.45rem;
		position: relative;
	}
	.pb-piece.sel {
		border-color: #2ae57e;
	}
	.pb-piece.bad {
		border-color: #ffb02e;
	}
	.pb-piece.dragging {
		opacity: 0.4;
	}
	/* Where the dragged piece would land. */
	.pb-piece.dropinto {
		border-color: #2ae57e;
		box-shadow: inset 0 0 0 1px rgba(42, 229, 126, 0.35);
	}
	.pb-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		text-align: left;
	}
	.pb-grip {
		cursor: grab;
		color: #44586a;
		font-size: 0.7rem;
		line-height: 1;
		letter-spacing: -0.1em;
		user-select: none;
	}
	.pb-grip:active {
		cursor: grabbing;
	}
	.pb-piece:hover .pb-grip {
		color: #8fa3b0;
	}
	.pb-target {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.68rem;
		color: #6d8090;
		margin-bottom: 0.35rem;
	}
	.pb-target-on {
		color: #8fffc4;
	}
	.pb-tools button.armed {
		border-color: #2ae57e;
		color: #8fffc4;
	}
	.pb-idx {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: #55697a;
		min-width: 1.1rem;
	}
	.pb-kind {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		color: #8fffc4;
		min-width: 5.5rem;
	}
	.pb-summary {
		font-size: 0.74rem;
		color: #a9bdcc;
	}
	.pb-tools {
		position: absolute;
		top: 0.28rem;
		right: 0.35rem;
		display: flex;
		gap: 0.2rem;
	}
	.pb-tools button {
		padding: 0.05rem 0.32rem;
		font-size: 0.66rem;
	}
	.pb-tools .del:hover {
		border-color: #ffb02e;
		color: #ffb02e;
	}
	.pb-pose,
	.pb-meas {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.25rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.63rem;
		color: #6d8090;
	}
	.pb-pose b {
		font-weight: 400;
		color: #cfe2ef;
	}
	.pb-meas .warn,
	dd.warn {
		color: #ffb02e;
	}
	.pb-meas .lift {
		color: #8fffc4;
	}
	.pb-issues {
		margin: 0.3rem 0 0;
		padding-left: 1rem;
		font-size: 0.68rem;
		color: #ffb02e;
		line-height: 1.4;
	}
	.pb-issues.big {
		font-size: 0.72rem;
	}
	.pb-params {
		margin-top: 0.4rem;
		border-top: 1px solid #16212c;
		padding-top: 0.4rem;
	}
	.pb-stats {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.3rem 0.6rem;
	}
	.pb-stats div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px dotted #16212c;
		padding-bottom: 0.12rem;
	}
	dt {
		font-size: 0.68rem;
		color: #6d8090;
	}
	dd {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: #cfe2ef;
	}
	.pb-ok {
		margin: 0;
		font-size: 0.72rem;
		color: #8fffc4;
		line-height: 1.45;
	}
	.pb-err {
		margin: 0.35rem 0 0;
		font-size: 0.72rem;
		color: #ffb02e;
	}
	.pb-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.6rem;
		flex-wrap: wrap;
	}
	.pb-copied {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: #8fffc4;
	}
	.pb-json {
		margin-top: 0.5rem;
	}
</style>
