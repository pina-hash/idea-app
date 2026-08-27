<script lang="ts">
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import SpecProseField from '$lib/classroom/SpecProseField.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { guardSaveNavigation } from '$lib/save-guard.svelte';
	import { specTextSurfaces, type EditableSpec, type EditableSpecKind, type SpecTextSurface } from '$lib/classroom/spec-text';
	import { prepareSpecTextSave, type SpecGuardViolation } from '$lib/classroom/spec-text-guard';

	/**
	 * EDIT WHAT A STUDENT READS, IN PLACE.
	 *
	 * The surface Mr. Pina uses to change a sentence in a published assignment
	 * or reference document without opening JSON. It walks the SAME block list a
	 * student's page walks -- `specTextSurfaces`, in document order, grouped by
	 * module or section -- and puts an editing control on every surface that is
	 * WORDS. Prose gets the rich-text editor; a short string gets an input; a
	 * sentence or two gets a textarea. Nothing else appears at all.
	 *
	 * NOTHING STRUCTURAL IS EDITABLE, AND THE RENDERING IS NOT WHAT ENFORCES
	 * THAT. There is no control here for a point value, a rubric criterion, an
	 * AI level, a block type, a block id or the assignment total -- but the
	 * boundary is `prepareSpecTextSave`, which compares the outgoing document
	 * against the incoming one field by field and REFUSES the save, naming what
	 * differed, if anything outside the text surfaces moved. Rendering only the
	 * safe fields would mean a bug in this component writes a broken spec
	 * silently, and the person it breaks for teaches another section and has no
	 * way to debug a spec.
	 *
	 * IT SAVES THROUGH WHAT ALREADY EXISTS. `save` is the item's existing spec
	 * setter -- `classroom_set_assignment_spec` or `classroom_set_reference_spec`
	 * -- so a wording change snapshots a revision (0110), is revertible from the
	 * history panel on this same page, and reaches every class the item is
	 * posted to because the spec hangs off the CANONICAL item and the postings
	 * join to it. There is no second write path and there must not be one.
	 *
	 * `autosave: false`, deliberately. A spec edit MINTS A REVISION SOMEBODY
	 * ELSE READS, which is the exact case the save-state rule names: debouncing
	 * one would fill the history panel with versions nobody asked for. The
	 * machine still reports dirty, which is what the navigation guard reads.
	 */
	let {
		spec,
		kind,
		disabled = false,
		upload = null,
		save,
		onchanged = null
	}: {
		spec: EditableSpec;
		kind: EditableSpecKind;
		disabled?: boolean;
		/** Handed straight to each prose field. Null removes image drop entirely. */
		upload?:
			| ((file: File) => Promise<{ ok: true; filename: string } | { ok: false; message: string }>)
			| null;
		save: (next: EditableSpec) => Promise<{ ok: boolean; message?: string }>;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	/** What is ON SCREEN, keyed by `specPathKey`, for the surfaces somebody has
	 *  typed into. A surface nobody touched is not in here, which is what makes
	 *  an untouched field byte-identical on the way out. */
	let edits = $state<Record<string, string>>({});
	/**
	 * What the SERVER has acknowledged for those same surfaces.
	 *
	 * A MANUAL SAVE IS A CHECKPOINT, NOT A FINISH, and the writing stays in the
	 * box. Clearing `edits` on a successful save put the pre-save wording back on
	 * screen until the item's reload landed -- measured in a browser, where a
	 * second edit made straight after a save was then appended to the OLD text.
	 * So the typed value stays and the comparison moves: "unsaved" is `edits`
	 * against this, not against the document, and when the reload arrives the two
	 * agree by construction.
	 */
	let acked = $state<Record<string, string>>({});
	/**
	 * Prose fields that have been downgraded to source because an image landed
	 * in them. Held HERE rather than in the field, because the switch has to
	 * replace the field's whole instance -- see the note in SpecProseField on
	 * `state_unsafe_mutation`.
	 */
	let sourceKeys = $state<Record<string, true>>({});
	let violations = $state<SpecGuardViolation[]>([]);
	let saved = $state<number | null>(null);
	let savedCount = $state(0);

	const surfaces = $derived(specTextSurfaces(spec, kind));
	const groups = $derived.by(() => {
		const out: { name: string; items: SpecTextSurface[] }[] = [];
		for (const s of surfaces) {
			const last = out[out.length - 1];
			if (last && last.name === s.group) last.items.push(s);
			else out.push({ name: s.group, items: [s] });
		}
		return out;
	});

	/**
	 * "Has this actually been edited", asked as a COMPARISON rather than as
	 * "is there content in here" -- the presence-of-state trap. A surface whose
	 * draft carries the document's own words is dirty from the first frame if
	 * the question is asked the other way.
	 */
	const changedKeys = $derived(
		surfaces.filter((s) => s.key in edits && edits[s.key] !== stored(s)).map((s) => s.key)
	);
	const hasEdits = $derived(changedKeys.length > 0);

	const saveState = new SaveState({
		autosave: false,
		save: async () => {
			const map = new Map<string, string>();
			for (const key of Object.keys(edits)) map.set(key, edits[key]);
			const prepared = prepareSpecTextSave(spec, kind, map);
			if (!prepared.ok) {
				violations = prepared.violations;
				return {
					ok: false,
					retryable: false,
					message: 'That edit changed something other than wording, so nothing was saved.'
				};
			}
			violations = [];
			if (!prepared.changed.length) return { ok: true };
			const res = await save(prepared.spec);
			if (!res.ok) {
				return { ok: false, retryable: false, message: res.message ?? 'That change was not saved.' };
			}
			savedCount = prepared.changed.length;
			saved = Date.now();
			acked = { ...acked, ...edits };
			await onchanged?.();
			return { ok: true };
		}
	});

	function edit(surface: SpecTextSurface, next: string) {
		// AGAINST WHAT THE CONTROL IS ALREADY SHOWING, not against the edit slot
		// alone. A control reporting its own current value is not an edit, and
		// treating it as one wiped the "Saved" acknowledgement off the screen the
		// moment a reseeded editor reported itself -- measured in a browser.
		const prev = current(surface);
		if (next === prev) return;
		edits = { ...edits, [surface.key]: next };
		violations = [];
		saved = null;
		saveState.markDirty();
	}

	/** An `id` a `for=` can name. `specPathKey` spells a path with dots and
	 *  brackets, which are legal in an id but awkward everywhere that reads one. */
	function fieldId(key: string): string {
		return `spx-${key.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
	}

	/** What the server holds for this surface: the last acknowledgement if there
	 *  has been one this session, the loaded document otherwise. */
	function stored(surface: SpecTextSurface): string {
		return surface.key in acked ? acked[surface.key] : surface.value;
	}

	function current(surface: SpecTextSurface): string {
		return surface.key in edits ? edits[surface.key] : stored(surface);
	}

	function revertAll() {
		// Back to what the server holds, which after a save this session is the
		// acknowledgement rather than the document the page loaded on.
		edits = {};
		violations = [];
		saved = null;
		// The work was discarded, so the machine goes back to clean rather than
		// leaving a dirty flag the navigation guard would ask about.
		saveState.reset();
	}

	// The durability net (visibilitychange / pagehide) lives and dies with this
	// instance. `autosave: false` means nothing is scheduled; this is what makes
	// a hidden tab flush the edit that is already waiting.
	$effect(() => saveState.attach());

	guardSaveNavigation(saveState, {
		warning: 'Your wording changes have not been saved.',
		enabled: () => !disabled
	});
</script>

<div class="spx" data-testid="spec-text-editor">
	<header class="spx-head">
		<div>
			<h3 class="spx-title">Edit the wording</h3>
			<p class="spx-sub">
				Every sentence a student reads, in the order they read it. Points, rubrics, AI levels and
				the structure of the document are not editable here, and a save that changed one of them is
				refused rather than written.
			</p>
		</div>
		<SaveIndicator state={saveState} hideClean={false} />
	</header>

	{#if violations.length}
		<div class="spx-refusal" data-testid="spec-guard-refusal" role="alert">
			<p class="spx-refusal-head">
				Nothing was saved. This edit changed {violations.length}
				{violations.length === 1 ? 'thing' : 'things'} that is not wording:
			</p>
			<ul>
				{#each violations as v (v.path)}
					<li><code>{v.path}</code> -- {v.message}</li>
				{/each}
			</ul>
			<p class="spx-refusal-foot">
				A points, rubric or structure change belongs in the spec import, where the point sums are
				validated.
			</p>
		</div>
	{/if}

	{#if saved && savedCount}
		<p class="spx-saved" data-testid="spec-text-saved">
			Saved. {savedCount}
			{savedCount === 1 ? 'field' : 'fields'} changed, in every class this is posted to. The previous
			wording is in the content history below.
		</p>
	{/if}

	{#if !surfaces.length}
		<p class="spx-empty">This document has no editable text.</p>
	{:else}
		{#each groups as group (group.name)}
			<section class="spx-group">
				<h4 class="spx-group-name">{group.name}</h4>
				{#each group.items as surface (surface.key)}
					{@const value = current(surface)}
					<div class="spx-field" class:spx-changed={value !== stored(surface)}>
						{#if surface.kind === 'prose'}
							<span class="spx-label">{surface.label}</span>
							{#key `${surface.key}:${sourceKeys[surface.key] ? 'source' : 'rich'}`}
								<SpecProseField
									{value}
									label={surface.label}
									source={!!sourceKeys[surface.key]}
									{disabled}
									{upload}
									placeholder={surface.placeholder ?? 'Write the instructions...'}
									onchange={(md) => edit(surface, md)}
									onimage={() => (sourceKeys = { ...sourceKeys, [surface.key]: true })}
								/>
							{/key}
						{:else if surface.kind === 'block'}
							<label class="spx-label" for={fieldId(surface.key)}>{surface.label}</label>
							<textarea
								id={fieldId(surface.key)}
								class="spx-input spx-area"
								rows="3"
								{disabled}
								placeholder={surface.placeholder ?? ''}
								{value}
								oninput={(e) => edit(surface, (e.currentTarget as HTMLTextAreaElement).value)}
							></textarea>
						{:else}
							<label class="spx-label" for={fieldId(surface.key)}>{surface.label}</label>
							<input
								id={fieldId(surface.key)}
								class="spx-input"
								type="text"
								{disabled}
								placeholder={surface.placeholder ?? ''}
								{value}
								oninput={(e) => edit(surface, (e.currentTarget as HTMLInputElement).value)}
							/>
						{/if}
					</div>
				{/each}
			</section>
		{/each}
	{/if}

	<footer class="spx-foot">
		<button
			type="button"
			class="btn tiny tap-44"
			disabled={disabled || !hasEdits || saveState.phase === 'writing'}
			onclick={() => void saveState.saveNow()}
		>
			{saveState.phase === 'writing' ? 'Saving...' : 'Save wording'}
		</button>
		<button
			type="button"
			class="btn secondary tiny tap-44"
			disabled={!hasEdits || saveState.phase === 'writing'}
			onclick={revertAll}
		>
			Discard changes
		</button>
		<span class="spx-count">
			{#if hasEdits}
				{changedKeys.length}
				{changedKeys.length === 1 ? 'field' : 'fields'} edited and not yet saved.
			{:else}
				Nothing edited yet.
			{/if}
		</span>
	</footer>
</div>

<style>
	.spx {
		display: grid;
		gap: var(--space-3, 0.75rem);
	}

	.spx-head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: flex-start;
		justify-content: space-between;
	}

	.spx-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--text-1);
	}

	.spx-sub,
	.spx-empty {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: var(--text-2);
		max-width: 60ch;
	}

	.spx-group {
		display: grid;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-2, 0.5rem) 0;
		border-top: 1px solid var(--hairline);
		min-width: 0;
	}

	.spx-group-name {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.spx-field {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
		border-left: 2px solid transparent;
		padding-left: var(--space-2, 0.5rem);
	}

	.spx-changed {
		border-left-color: var(--green);
	}

	.spx-label {
		font-size: 0.78rem;
		color: var(--text-2);
	}

	.spx-input {
		width: 100%;
		min-width: 0;
		min-height: 44px;
		font-family: var(--font-display);
		font-size: 0.95rem;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1, 4px);
		padding: 0.4rem 0.55rem;
	}

	.spx-area {
		resize: vertical;
		line-height: 1.45;
	}

	.spx-refusal {
		border: 1px solid var(--crimson);
		border-radius: var(--radius-2, 6px);
		padding: var(--space-2, 0.5rem);
		background: var(--surface-1);
	}

	.spx-refusal-head,
	.spx-refusal-foot {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-1);
	}

	.spx-refusal ul {
		margin: 0.4rem 0;
		padding-left: 1.1rem;
		font-size: 0.82rem;
		color: var(--text-2);
	}

	.spx-refusal code {
		font-family: var(--font-mono);
		color: var(--text-1);
	}

	.spx-saved {
		margin: 0;
		font-size: 0.85rem;
		color: var(--green);
	}

	.spx-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-2, 0.5rem);
	}

	.spx-count {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}
</style>
