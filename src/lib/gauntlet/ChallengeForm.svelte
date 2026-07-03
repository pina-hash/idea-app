<script lang="ts">
	import { goto } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import RegionEditor from '$lib/gauntlet/RegionEditor.svelte';
	import {
		MODES,
		modeById,
		DIFFICULTY_LABELS,
		UNIT_SYSTEMS,
		UNIT_SYSTEM_UNITS,
		DRAWINGS_BUCKET,
		MODELS_BUCKET,
		type UnitSystem
	} from '$lib/gauntlet';
	import {
		buildPayload,
		massFromGeometry,
		parseAuthorCapture,
		normalizeYouTubeId,
		isModeling,
		type AuthorFormState
	} from '$lib/gauntlet/authoring';

	let { supabase, initial }: { supabase: SupabaseClient; initial: AuthorFormState } = $props();

	let form = $state<AuthorFormState>({ ...initial, options: initial.options.map((o) => ({ ...o })) });
	let file = $state<File | null>(null);
	let fileName = $state('');
	let pngFile = $state<File | null>(null);
	let pngName = $state('');
	let stlFile = $state<File | null>(null);
	let stlName = $state('');
	let pasteText = $state('');
	let saving = $state('');
	let error = $state('');

	const modeling = $derived(isModeling(form.mode));
	const speedrun = $derived(form.mode === 'speedrun');
	const gatedAsset = $derived(form.mode === 'speedrun' || form.mode === 'feature_golf');
	// Speedrun's density/mass labels follow its unit_system; Reverse Engineer and
	// Feature Golf keep the original fixed g/cm3 convention (no unit_system field).
	const densityUnit = $derived(speedrun ? UNIT_SYSTEM_UNITS[form.unit_system].density : 'g/cm3');
	const massUnit = $derived(speedrun ? UNIT_SYSTEM_UNITS[form.unit_system].mass : 'g');
	const computedMass = $derived(
		massFromGeometry(form.target_volume_mm3, form.density, speedrun ? form.unit_system : 'MMGS')
	);
	const massMismatch = $derived(
		computedMass != null && form.target_mass != null && form.target_mass > 0
			? Math.abs(form.target_mass - computedMass) / computedMass > 0.005
			: false
	);

	// Exact unit-conversion factors for the Speedrun unit-system toggle
	// (1 in = 25.4 mm, 1 lb = 453.59237 g; density factor = 453.59237 / 16.387064).
	const LB_IN3_TO_G_CM3 = 27.679904653;
	const LB_TO_G = 453.59237;
	const roundTo = (v: number, n: number) => {
		const f = 10 ** n;
		return Math.round(v * f) / f;
	};
	// Toggling the unit system auto-converts every unit-carrying value (density and
	// target mass) with the exact factors, so nothing is silently reinterpreted in
	// the new system. The canonical volume (mm3), tolerance (%), and par time (s)
	// are unit-independent and stay put.
	function changeUnitSystem(next: UnitSystem) {
		const prev = form.unit_system;
		if (next === prev) return;
		const toMetric = next === 'MMGS';
		if (form.density != null && Number.isFinite(form.density)) {
			form.density = roundTo(toMetric ? form.density * LB_IN3_TO_G_CM3 : form.density / LB_IN3_TO_G_CM3, 5);
		}
		if (form.target_mass != null && Number.isFinite(form.target_mass)) {
			form.target_mass = roundTo(toMetric ? form.target_mass * LB_TO_G : form.target_mass / LB_TO_G, 4);
		}
		form.unit_system = next;
	}

	// Feature 4: live preview of the parsed video id (empty when input is invalid).
	const tutorialId = $derived(normalizeYouTubeId(form.tutorialVideoId));

	// Feature 1: focus-region rows (percent). Shared between the visual picker
	// (RegionEditor) and the numeric inputs, both bound to form.focusRegions.
	let selectedRegion = $state(-1);

	const addRegion = () => {
		form.focusRegions = [...form.focusRegions, { label: '', x: 30, y: 30, w: 25, h: 25 }];
		selectedRegion = form.focusRegions.length - 1;
	};
	const removeRegion = (i: number) => {
		form.focusRegions = form.focusRegions.filter((_, idx) => idx !== i);
		if (selectedRegion === i) selectedRegion = -1;
		else if (selectedRegion > i) selectedRegion -= 1;
	};
	const moveRegion = (i: number, dir: number) => {
		const j = i + dir;
		if (j < 0 || j >= form.focusRegions.length) return;
		const next = [...form.focusRegions];
		[next[i], next[j]] = [next[j], next[i]];
		form.focusRegions = next;
		selectedRegion = j;
	};

	// Resolve the drawing the picker draws on, mirroring the student viewer's
	// preference: the PNG (uploaded or pending) wins over the inline-SVG / URL asset.
	let signedDrawingUrl = $state<string | null>(null);
	let pngObjUrl = $state<string | null>(null);
	let assetObjUrl = $state<string | null>(null);

	$effect(() => {
		if (!pngFile) {
			pngObjUrl = null;
			return;
		}
		const u = URL.createObjectURL(pngFile);
		pngObjUrl = u;
		return () => URL.revokeObjectURL(u);
	});
	$effect(() => {
		if (!file) {
			assetObjUrl = null;
			return;
		}
		const u = URL.createObjectURL(file);
		assetObjUrl = u;
		return () => URL.revokeObjectURL(u);
	});
	// Sign the existing private PNG path (skip when a fresh PNG is pending).
	$effect(() => {
		const path = form.drawing_image_path;
		if (pngFile || !path) {
			signedDrawingUrl = null;
			return;
		}
		let cancelled = false;
		supabase.storage
			.from(DRAWINGS_BUCKET)
			.createSignedUrl(path, 3600)
			.then(({ data }) => {
				if (!cancelled) signedDrawingUrl = data?.signedUrl ?? null;
			});
		return () => {
			cancelled = true;
		};
	});

	const assetIsInline = $derived(form.asset.trimStart().startsWith('<'));
	const drawSrc = $derived(
		pngObjUrl ?? signedDrawingUrl ?? assetObjUrl ?? (form.asset && !assetIsInline ? form.asset : null)
	);
	const drawSvg = $derived(
		!pngObjUrl && !signedDrawingUrl && !assetObjUrl && assetIsInline ? form.asset : null
	);

	const applyPaste = () => {
		const g = parseAuthorCapture(pasteText);
		if (g.target_volume_mm3 != null) form.target_volume_mm3 = g.target_volume_mm3;
		if (g.surface_area_mm2 != null) form.surface_area_mm2 = g.surface_area_mm2;
		if (g.feature_count != null) form.feature_count = g.feature_count;
		if (g.density != null) form.density = g.density;
		if (g.target_mass != null) form.target_mass = g.target_mass;
		if (g.material) form.material = g.material;
	};

	const onFile = (e: Event) => {
		const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		file = f;
		fileName = f?.name ?? '';
	};

	const onPng = (e: Event) => {
		const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		pngFile = f;
		pngName = f?.name ?? '';
	};

	const onStl = (e: Event) => {
		const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		stlFile = f;
		stlName = f?.name ?? '';
	};

	const addOption = () => {
		const next = String.fromCharCode(97 + form.options.length); // a, b, c, ...
		form.options = [...form.options, { id: next, label: '' }];
	};
	const removeOption = (i: number) => {
		form.options = form.options.filter((_, idx) => idx !== i);
	};

	async function uploadAsset(): Promise<string> {
		if (!file) return form.asset;
		const ext = (file.name.split('.').pop() || 'png').toLowerCase();
		const path = `${crypto.randomUUID()}.${ext}`;
		const { error: upErr } = await supabase.storage
			.from('gauntlet')
			.upload(path, file, { contentType: file.type || undefined });
		if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
		return supabase.storage.from('gauntlet').getPublicUrl(path).data.publicUrl;
	}

	// Upload a Speedrun artifact to a PRIVATE bucket and return the stored path
	// (not a public URL): reads go through the authenticated-read policy, so the
	// student view / reveal RPC turns the path into a short-lived signed URL.
	async function uploadArtifact(bucket: string, f: File, fallbackExt: string): Promise<string> {
		const ext = (f.name.split('.').pop() || fallbackExt).toLowerCase();
		const path = `${crypto.randomUUID()}.${ext}`;
		const { error: upErr } = await supabase.storage
			.from(bucket)
			.upload(path, f, { contentType: f.type || undefined });
		if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
		return path;
	}

	async function save(status: 'draft' | 'published') {
		saving = status;
		error = '';
		try {
			if (file) {
				form.asset = await uploadAsset();
				file = null;
				fileName = '';
			}
			if (pngFile) {
				form.drawing_image_path = await uploadArtifact(DRAWINGS_BUCKET, pngFile, 'png');
				pngFile = null;
				pngName = '';
			}
			if (stlFile) {
				form.model_path = await uploadArtifact(MODELS_BUCKET, stlFile, 'stl');
				stlFile = null;
				stlName = '';
			}
			const { prompt, answer } = buildPayload(form);
			const { data: id, error: rpcErr } = await supabase.rpc('gauntlet_author_upsert', {
				p_id: form.id,
				p_mode: form.mode,
				p_title: form.title,
				p_difficulty: form.difficulty,
				p_status: status,
				p_prompt: prompt,
				p_answer: answer
			});
			if (rpcErr) throw new Error(rpcErr.message);
			form.id = id as string;
			await goto('/gauntlet/author');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Save failed.';
		}
		saving = '';
	}

	async function remove() {
		if (!form.id) return;
		if (!confirm('Delete this challenge? It is archived instead if it has submissions.')) return;
		saving = 'delete';
		error = '';
		const { error: rpcErr } = await supabase.rpc('gauntlet_author_delete', { p_id: form.id });
		if (rpcErr) {
			error = rpcErr.message;
			saving = '';
			return;
		}
		await goto('/gauntlet/author');
	}
</script>

<div class="author-form">
	{#if form.id}
		<p class="status-line">
			Editing &middot; current status <span class="status-badge status-{form.status}">{form.status}</span>
		</p>
	{/if}

	<div class="card">
		<label class="ff">
			<span class="ff-label">Mode</span>
			<select class="ff-input" bind:value={form.mode}>
				{#each MODES as m (m.id)}
					<option value={m.id}>{m.name}</option>
				{/each}
			</select>
		</label>
		<label class="ff">
			<span class="ff-label">Title</span>
			<input class="ff-input" type="text" bind:value={form.title} placeholder="Challenge title" />
		</label>
		<label class="ff">
			<span class="ff-label">Difficulty</span>
			<select class="ff-input" bind:value={form.difficulty}>
				{#each Object.entries(DIFFICULTY_LABELS) as [n, label] (n)}
					<option value={Number(n)}>{n} &middot; {label}</option>
				{/each}
			</select>
		</label>
	</div>

	{#if modeling}
		<h2>Geometry capture</h2>
		<div class="card">
			<p class="ff-help">
				Run the GAUNTLET macro in <strong>Author capture</strong> mode on the real part, then paste
				its output here and Parse to fill the fields.
			</p>
			<textarea
				class="ff-input ff-area"
				bind:value={pasteText}
				rows="5"
				placeholder="GAUNTLET author capture ... target_volume_mm3 : ..."
			></textarea>
			<div class="btn-row">
				<button class="btn secondary" type="button" onclick={applyPaste}>Parse capture</button>
			</div>
		</div>

		<div class="card">
			<label class="ff">
				<span class="ff-label">Canonical volume (mm3)</span>
				<input class="ff-input" type="number" step="any" bind:value={form.target_volume_mm3} />
			</label>
			<label class="ff">
				<span class="ff-label">Surface area (mm2)</span>
				<input class="ff-input" type="number" step="any" bind:value={form.surface_area_mm2} />
			</label>
			<label class="ff">
				<span class="ff-label">Feature count</span>
				<input class="ff-input" type="number" step="1" bind:value={form.feature_count} />
			</label>
			{#if speedrun}
				<label class="ff">
					<span class="ff-label">Unit system</span>
					<select
						class="ff-input"
						value={form.unit_system}
						onchange={(e) => changeUnitSystem(e.currentTarget.value as UnitSystem)}
					>
						{#each UNIT_SYSTEMS as u (u)}
							<option value={u}>{u}</option>
						{/each}
					</select>
					<span class="ff-help">
						Switching auto-converts density and target mass with exact factors (1 in = 25.4 mm,
						1 lb = 453.59237 g). IPS reads lb / in3, MMGS reads g / cm3.
					</span>
				</label>
			{/if}
			<label class="ff">
				<span class="ff-label">Material (optional)</span>
				<input class="ff-input" type="text" bind:value={form.material} placeholder="Display name, e.g. 6061 Alloy" />
				<span class="ff-help">
					Display / advisory label only. Ranked verification is geometry (volume) only and mass is
					computed from the density below, so a student's applied material never gates a run. Not
					required to publish.
				</span>
			</label>
			<label class="ff">
				<span class="ff-label">Density ({densityUnit})</span>
				<input class="ff-input" type="number" step="any" bind:value={form.density} />
			</label>
			<label class="ff">
				<span class="ff-label">Target mass ({massUnit})</span>
				<input class="ff-input" type="number" step="any" bind:value={form.target_mass} />
			</label>
			{#if massMismatch}
				<p class="warn ff-warn">
					Target mass {form.target_mass} {massUnit} does not match volume x density ({computedMass}
					{massUnit}). Check the values.
				</p>
			{/if}
			<label class="ff">
				<span class="ff-label">Tolerance band (%)</span>
				<input class="ff-input" type="number" step="any" bind:value={form.tolerance_pct} />
			</label>
			{#if speedrun}
				<label class="ff">
					<span class="ff-label">Slug (stable, url-safe)</span>
					<input class="ff-input" type="text" bind:value={form.slug} placeholder="aluminum-bracket" />
				</label>
				<label class="ff">
					<span class="ff-label">Par time (seconds)</span>
					<input class="ff-input" type="number" step="1" min="0" bind:value={form.par_time} />
				</label>
			{/if}
			{#if form.mode === 'feature_golf'}
				<label class="ff">
					<span class="ff-label">Par features (shown, not graded)</span>
					<input class="ff-input" type="number" step="1" bind:value={form.par_features} />
				</label>
			{/if}
			<label class="ff">
				<span class="ff-label">Note</span>
				<input class="ff-input" type="text" bind:value={form.note} placeholder="Optional framing note" />
			</label>
		</div>
	{:else}
		<h2>Question</h2>
		<div class="card">
			<label class="ff">
				<span class="ff-label">Question</span>
				<textarea class="ff-input ff-area" bind:value={form.question} rows="2"></textarea>
			</label>
			<label class="ff">
				<span class="ff-label">Instructions (optional)</span>
				<input class="ff-input" type="text" bind:value={form.instructions} />
			</label>
			<label class="ff">
				<span class="ff-label">Answer type</span>
				<select class="ff-input" bind:value={form.answerType}>
					<option value="choice">Multiple choice</option>
					<option value="text">Exact text</option>
					<option value="numeric">Numeric</option>
				</select>
			</label>

			{#if form.answerType === 'choice'}
				<div class="opt-editor">
					<span class="ff-label">Options (the correct one is selected below)</span>
					{#each form.options as opt, i (i)}
						<div class="opt-edit-row">
							<input class="ff-input opt-id" type="text" bind:value={opt.id} maxlength="3" />
							<input class="ff-input" type="text" bind:value={opt.label} placeholder="Option text" />
							<button class="text-act danger" type="button" onclick={() => removeOption(i)}>Remove</button>
						</div>
					{/each}
					<button class="btn secondary" type="button" onclick={addOption}>Add option</button>
				</div>
				<label class="ff">
					<span class="ff-label">Correct option</span>
					<select class="ff-input" bind:value={form.correct}>
						<option value="">Select...</option>
						{#each form.options as opt (opt.id)}
							<option value={opt.id}>{opt.id} &middot; {opt.label}</option>
						{/each}
					</select>
				</label>
			{:else}
				<label class="ff">
					<span class="ff-label">Correct answer</span>
					<input class="ff-input" type="text" bind:value={form.correct} />
				</label>
				<label class="ff">
					<span class="ff-label">Unit (optional)</span>
					<input class="ff-input" type="text" bind:value={form.inputUnit} placeholder="mm" />
				</label>
				{#if form.answerType === 'numeric'}
					<label class="ff">
						<span class="ff-label">Numeric tolerance (+/-)</span>
						<input class="ff-input" type="number" step="any" bind:value={form.numericTolerance} />
					</label>
				{/if}
			{/if}
			<label class="ff">
				<span class="ff-label">Explanation (shown after answering)</span>
				<textarea class="ff-input ff-area" bind:value={form.explanation} rows="2"></textarea>
			</label>
		</div>
	{/if}

	<h2>{modeling ? (gatedAsset ? 'Drawing (hidden, revealed on Start)' : 'Reference') : 'Drawing or image (optional)'}</h2>
	<div class="card">
		{#if gatedAsset}
			<p class="ff-help">
				This drawing is stored in the hidden answer and revealed only when a student clicks Start.
			</p>
		{/if}
		<label class="ff">
			<span class="ff-label">Upload image</span>
			<input class="ff-input" type="file" accept="image/*,.svg" onchange={onFile} />
		</label>
		{#if fileName}<p class="ff-help">Selected: {fileName} (uploads on save)</p>{/if}
		<label class="ff">
			<span class="ff-label">Or paste inline SVG / URL</span>
			<textarea class="ff-input ff-area" bind:value={form.asset} rows="3" placeholder="<svg ...> or https://..."></textarea>
		</label>
	</div>

	{#if speedrun}
		<h2>Geometry artifacts (PNG drawing + STL model)</h2>
		<div class="card">
			<p class="ff-help">
				The drawing (PNG) and 3D model (STL) are pure-geometry files. The dimensioned PNG is hidden
				and revealed on Start, like the drawing above; the STL is a shape-only preview shown up front.
			</p>
			<label class="ff">
				<span class="ff-label">Dimensioned drawing (PNG)</span>
				<input class="ff-input" type="file" accept="image/png,image/*" onchange={onPng} />
			</label>
			{#if pngName}
				<p class="ff-help">Selected: {pngName} (uploads on save)</p>
			{:else if form.drawing_image_path}
				<p class="ff-help">Current: {form.drawing_image_path}</p>
			{/if}
			<label class="ff">
				<span class="ff-label">3D model (STL)</span>
				<input class="ff-input" type="file" accept=".stl,model/stl,application/octet-stream" onchange={onStl} />
			</label>
			{#if stlName}
				<p class="ff-help">Selected: {stlName} (uploads on save)</p>
			{:else if form.model_path}
				<p class="ff-help">Current: {form.model_path}</p>
			{/if}
		</div>
	{/if}

	{#if speedrun}
		<h2>Drawing viewer (tutorial + focus regions)</h2>
		<div class="card">
			<label class="ff">
				<span class="ff-label">Tutorial video (YouTube URL or id, optional)</span>
				<input
					class="ff-input"
					type="text"
					bind:value={form.tutorialVideoId}
					placeholder="https://youtu.be/... or dQw4w9WgXcQ"
				/>
			</label>
			{#if form.tutorialVideoId.trim() && !tutorialId}
				<p class="warn ff-warn">
					Could not read a YouTube video id from that. Paste a full watch/share URL or the
					11-character id.
				</p>
			{:else if tutorialId}
				<p class="ff-help">
					Video id <strong>{tutorialId}</strong>. Students get a collapsible Tutorial panel, closed
					by default so it never distracts during a run.
				</p>
			{/if}

			<span class="ff-label region-heading">Focus regions (optional jump targets)</span>
			<p class="ff-help">
				Author-defined detail areas a student can jump to at high zoom. Values are percent of the
				drawing (0 to 100), measured from the top-left. Leave empty for none; the viewer degrades to
				plain pan and zoom.
			</p>
			<RegionEditor bind:regions={form.focusRegions} bind:selected={selectedRegion} src={drawSrc} svg={drawSvg} />

			{#if form.focusRegions.length}
				<div class="region-head">
					<span>Label</span><span>X%</span><span>Y%</span><span>W%</span><span>H%</span><span></span>
				</div>
			{/if}
			{#each form.focusRegions as r, i (i)}
				<div class="region-row" class:sel={selectedRegion === i} onfocusin={() => (selectedRegion = i)}>
					<input class="ff-input" type="text" bind:value={r.label} placeholder="Detail {i + 1}" />
					<input class="ff-input region-num" type="number" min="0" max="100" bind:value={r.x} />
					<input class="ff-input region-num" type="number" min="0" max="100" bind:value={r.y} />
					<input class="ff-input region-num" type="number" min="0" max="100" bind:value={r.w} />
					<input class="ff-input region-num" type="number" min="0" max="100" bind:value={r.h} />
					<span class="region-acts">
						<button class="text-act" type="button" disabled={i === 0} onclick={() => moveRegion(i, -1)} aria-label="Move up">↑</button>
						<button class="text-act" type="button" disabled={i === form.focusRegions.length - 1} onclick={() => moveRegion(i, 1)} aria-label="Move down">↓</button>
						<button class="text-act danger" type="button" onclick={() => removeRegion(i)}>Remove</button>
					</span>
				</div>
			{/each}
			<div class="btn-row">
				<button class="btn secondary" type="button" onclick={addRegion}>Add focus region</button>
			</div>
		</div>
	{/if}

	{#if error}<p class="warn">{error}</p>{/if}

	<div class="btn-row form-actions">
		<button class="btn secondary" type="button" disabled={saving !== ''} onclick={() => save('draft')}>
			{saving === 'draft' ? 'Saving...' : 'Save draft'}
		</button>
		<button class="btn" type="button" disabled={saving !== ''} onclick={() => save('published')}>
			{saving === 'published' ? 'Publishing...' : 'Save and publish'}
		</button>
		{#if form.id}
			<button class="btn secondary danger-btn" type="button" disabled={saving !== ''} onclick={remove}>
				{saving === 'delete' ? 'Deleting...' : 'Delete'}
			</button>
		{/if}
		<a class="btn secondary" href="/gauntlet/author">Cancel</a>
	</div>
	<p class="dim author-note">{modeById(form.mode)?.name}: publishing checks all required fields server-side.</p>
</div>
