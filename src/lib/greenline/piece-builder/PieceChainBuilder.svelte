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
	import type { TrackPiece, TrackVec2 } from '../track-schema';

	/**
	 * GREENLINE // PIECE CHAIN BUILDER, stage 1 (dev tool).
	 *
	 * Authors schema-v3 `pieces` tracks: pick a kind, set its params, append it,
	 * read the computed exit pose, reorder or remove, export droppable
	 * TrackData. Numeric readout only by design — no 2D canvas and no live 3D
	 * this stage; the numbers ARE the deliverable, and they come from the
	 * compiler rather than from a preview.
	 *
	 * The load-bearing rule: every pose, measurement, and violation shown here
	 * comes from `diagnoseChain` in track-pieces.ts — the same walk, the same
	 * generators, and the same guardrails `parseTrack` runs when the game loads
	 * a track. Nothing about the geometry is reimplemented here, so the builder
	 * cannot tell an author something the game would disagree with. Export is
	 * blocked while any guardrail is broken.
	 *
	 * `window.__glPieceBuilder` drives the whole thing from the console (the
	 * `__greenline` / `__glBuilder` convention), which is how it is verified.
	 */

	let doc = $state<ChainDoc>(emptyDoc());
	let selected = $state(-1);
	let showJson = $state(false);
	let copied = $state('');
	let ready = $state(false);

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
			},
			setStart: (patch: Partial<ChainDoc['start']>) => {
				doc = { ...doc, start: { ...doc.start, ...patch } };
			},
			addPiece: (kind: PieceKind, params?: Record<string, unknown>) => {
				addPiece(kind);
				if (params) setParams(doc.pieces.length - 1, params);
				return doc.pieces.length - 1;
			},
			setParams,
			movePiece,
			removePiece,
			select: (i: number) => (selected = i),
			clear: () => {
				doc = { ...doc, pieces: [] };
				selected = -1;
			},
			load: (next: ChainDoc) => {
				doc = { ...emptyDoc(), ...next, start: { ...emptyDoc().start, ...next.start } };
				selected = -1;
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

	function addPiece(kind: PieceKind) {
		const after = selected >= 0 ? diagFor(selected)?.exit : diag.pieces[diag.pieces.length - 1]?.exit;
		const piece = defaultPiece(kind, after ?? { ...doc.start });
		const at = selected >= 0 ? selected + 1 : doc.pieces.length;
		const next = [...doc.pieces];
		next.splice(at, 0, piece);
		doc = { ...doc, pieces: next };
		selected = at;
	}

	function setParams(i: number, params: Record<string, unknown>) {
		const next = [...doc.pieces];
		next[i] = { ...next[i], ...params } as TrackPiece;
		doc = { ...doc, pieces: next };
	}

	function setParam(i: number, key: string, raw: string) {
		if (raw.trim() === '') {
			const next = [...doc.pieces];
			const copy = { ...next[i] } as Record<string, unknown>;
			delete copy[key];
			next[i] = copy as unknown as TrackPiece;
			doc = { ...doc, pieces: next };
			return;
		}
		const v = Number(raw);
		if (!Number.isFinite(v)) return;
		setParams(i, { [key]: v });
	}

	function movePiece(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= doc.pieces.length) return;
		const next = [...doc.pieces];
		[next[i], next[j]] = [next[j], next[i]];
		doc = { ...doc, pieces: next };
		if (selected === i) selected = j;
		else if (selected === j) selected = i;
	}

	function removePiece(i: number) {
		const next = doc.pieces.filter((_, k) => k !== i);
		doc = { ...doc, pieces: next };
		if (selected >= next.length) selected = next.length - 1;
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
		} catch (e) {
			freeformError = e instanceof Error ? e.message : String(e);
		}
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
		<span class="pb-sub">schema v3 · stage 1 · numeric</span>
		<span class="pb-flag" class:ok={diag.ok && doc.pieces.length > 0} data-testid="chain-status">
			{doc.pieces.length === 0 ? 'EMPTY' : diag.ok ? 'VALID' : `${diag.issues.length} ISSUE${diag.issues.length === 1 ? '' : 'S'}`}
		</span>
	</header>

	<div class="pb-body">
		<!-- ---------------- chain ---------------- -->
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
								if (Number.isFinite(v)) doc = { ...doc, start: { ...doc.start, [key]: v } };
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
							if (Number.isFinite(v)) doc = { ...doc, width: v };
						}}
					/>
				</label>
			</div>

			<h3>add a piece</h3>
			<div class="pb-palette">
				{#each KIND_SPECS as k (k.kind)}
					<button class="pb-add" title={k.blurb} data-testid={`add-${k.kind}`} onclick={() => addPiece(k.kind)}>
						+ {k.label}
					</button>
				{/each}
			</div>
			<p class="pb-note">
				Appends after the selection, or at the end. Each piece's entry pose IS the previous piece's exit,
				so the corridor is continuous by construction.
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
					<li class="pb-piece" class:sel={selected === i} class:bad>
						<button class="pb-row" data-testid={`piece-${i}`} onclick={() => (selected = selected === i ? -1 : i)}>
							<span class="pb-idx">{i}</span>
							<span class="pb-kind">{piece.kind}</span>
							<span class="pb-summary">{pieceSummary(piece)}</span>
						</button>
						<div class="pb-tools">
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
										onchange={(e) => setFreeform(i, (e.currentTarget as HTMLTextAreaElement).value)}
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
</div>

<style>
	.pb-root {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		padding: 0.75rem;
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
	.pb-body {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
		margin-top: 0.6rem;
	}
	@media (max-width: 900px) {
		.pb-body {
			grid-template-columns: 1fr;
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
