<script lang="ts">
	import AiLevelBadge from '$lib/classroom/AiLevelBadge.svelte';
	import InfoTip from '$lib/classroom/InfoTip.svelte';
	import MarkdownText from '$lib/classroom/MarkdownText.svelte';
	import {
		countSentences,
		filesByBlockCount,
		gatedModuleIds,
		isSubmissionFileImage,
		moduleCompletion,
		sentenceState,
		submissionFileSrc,
		type AssignmentSpec,
		type ImageZoneBlock,
		type ResponseValue,
		type SpecBlock,
		type SpecModule,
		type SubmissionFileRow,
		type TableBlock,
		type TextFieldBlock
	} from '$lib/classroom/assignment-spec';

	/**
	 * The student renderer for one assignment spec: modules in order with
	 * points, AI-level badges and completion chips; instructions; textFields
	 * with live sentence counters; tables with add / duplicate / delete /
	 * reorder rows; imageZones fed by the Drive pipeline; checklists; and the
	 * approval gate blocking later modules until a teacher approves.
	 *
	 * PRESENTATION-ONLY, and it owns nothing durable: `values` starts from the
	 * autosaved rows the page loaded and every edit is reported UP through
	 * `onvalue` -- the parent (AssignmentEngine) owns debouncing, the actual
	 * RPC writes, and the preflight; the SERVER owns the rules (a locked or
	 * gated write is refused there whatever this renders).
	 */
	let {
		spec,
		initialValues,
		files = [],
		locked = false,
		approved = false,
		uploadEnabled = true,
		readonly = false,
		onvalue = null,
		onupload = null,
		ondeletefile = null,
		oncaption = null,
		uploadingProgress = null
	}: {
		spec: AssignmentSpec;
		initialValues: Record<string, ResponseValue>;
		files?: SubmissionFileRow[];
		locked?: boolean;
		/** The approval gate's state for THIS student (true when no gate). */
		approved?: boolean;
		uploadEnabled?: boolean;
		/** The grading console's read-only rendering: values, no inputs. */
		readonly?: boolean;
		onvalue?: ((blockId: string, value: ResponseValue) => void) | null;
		onupload?: ((blockId: string, files: File[]) => void | Promise<void>) | null;
		ondeletefile?: ((fileId: string) => void | Promise<void>) | null;
		oncaption?: ((fileId: string, caption: string) => void | Promise<void>) | null;
		/** Live progress for the file uploading right now, whichever block it
		 *  belongs to (the parent uploads one file at a time). */
		uploadingProgress?: { blockId: string | null; name: string; fraction: number } | null;
	} = $props();

	// Local working copy, seeded ONCE per mount by design ($state.snapshot
	// hands back a plain deep clone whether or not the prop was reactive). The
	// parent remounts (#key) on structural changes (submit / unsubmit /
	// reload), so this never drifts.
	// svelte-ignore state_referenced_locally
	let values = $state<Record<string, ResponseValue>>(
		$state.snapshot(initialValues) as Record<string, ResponseValue>
	);

	const gatedIds = $derived(new Set(gatedModuleIds(spec)));
	const gateAfter = $derived(spec.approvalGate?.afterModule ?? null);
	const zoneFiles = $derived.by(() => {
		const map = new Map<string, SubmissionFileRow[]>();
		for (const f of files) {
			if (!f.block_id) continue;
			const list = map.get(f.block_id) ?? [];
			list.push(f);
			map.set(f.block_id, list);
		}
		return map;
	});
	const fileCounts = $derived(filesByBlockCount(files));
	const canEdit = $derived(!locked && !readonly);

	function report(blockId: string) {
		onvalue?.(blockId, $state.snapshot(values[blockId]) as ResponseValue);
	}

	function textValue(id: string): string {
		return values[id]?.text ?? '';
	}
	function setText(id: string, text: string) {
		values[id] = { ...(values[id] ?? {}), text };
		report(id);
	}

	function tableRows(block: TableBlock): Record<string, string>[] {
		const stored = values[block.id]?.rows;
		if (stored && stored.length) return stored;
		return [];
	}
	function blankRow(block: TableBlock): Record<string, string> {
		return Object.fromEntries(block.columns.map((c) => [c.key, '']));
	}
	function ensureRows(block: TableBlock) {
		if (!values[block.id]?.rows?.length) {
			const count = Math.max(block.minRows ?? 0, 1);
			values[block.id] = {
				...(values[block.id] ?? {}),
				rows: Array.from({ length: count }, () => blankRow(block))
			};
		}
	}
	function setCell(block: TableBlock, rowIndex: number, key: string, cellValue: string) {
		ensureRows(block);
		values[block.id].rows![rowIndex] = {
			...values[block.id].rows![rowIndex],
			[key]: cellValue
		};
		report(block.id);
	}
	function addRow(block: TableBlock) {
		ensureRows(block);
		values[block.id].rows = [...values[block.id].rows!, blankRow(block)];
		report(block.id);
	}
	function duplicateRow(block: TableBlock, index: number) {
		const rows = values[block.id]?.rows ?? [];
		values[block.id].rows = [
			...rows.slice(0, index + 1),
			{ ...rows[index] },
			...rows.slice(index + 1)
		];
		report(block.id);
	}
	function deleteRow(block: TableBlock, index: number) {
		const rows = values[block.id]?.rows ?? [];
		values[block.id].rows = rows.filter((_, i) => i !== index);
		report(block.id);
	}
	function moveRow(block: TableBlock, index: number, direction: -1 | 1) {
		const rows = [...(values[block.id]?.rows ?? [])];
		const target = index + direction;
		if (target < 0 || target >= rows.length) return;
		[rows[index], rows[target]] = [rows[target], rows[index]];
		values[block.id].rows = rows;
		report(block.id);
	}

	function checklistChecked(id: string, count: number): boolean[] {
		const stored = values[id]?.checked ?? [];
		return Array.from({ length: count }, (_, i) => stored[i] === true);
	}
	function toggleItem(id: string, index: number, count: number) {
		const next = checklistChecked(id, count);
		next[index] = !next[index];
		values[id] = { ...(values[id] ?? {}), checked: next };
		report(id);
	}

	/** Auto-resizing textarea: grow to fit on every input. */
	function autoresize(el: HTMLTextAreaElement) {
		const fit = () => {
			el.style.height = 'auto';
			el.style.height = `${el.scrollHeight + 2}px`;
		};
		fit();
		el.addEventListener('input', fit);
		return { destroy: () => el.removeEventListener('input', fit) };
	}

	function counterFor(block: TextFieldBlock): { count: number; state: string; label: string } {
		const count = countSentences(textValue(block.id));
		const state = sentenceState(count, block.minSentences);
		let label = `${count} sentence${count === 1 ? '' : 's'}`;
		if (block.minSentences) label += ` · min ${block.minSentences}`;
		if (block.maxSentences) label += ` · max ${block.maxSentences}`;
		return { count, state, label };
	}

	function moduleGated(mod: SpecModule): boolean {
		// The grading console (readonly) always shows every module: a teacher
		// reviewing work needs to see the gated half regardless of the gate's
		// state, and there is nothing to protect from its own reviewer.
		return gatedIds.has(mod.id) && !approved && !readonly;
	}

	function pickZoneFiles(block: ImageZoneBlock, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const picked = Array.from(input.files ?? []);
		input.value = '';
		if (picked.length) void onupload?.(block.id, picked);
	}

	function blockKey(block: SpecBlock, index: number): string {
		return 'id' in block && block.id ? block.id : `b-${index}`;
	}

	function isImage(f: SubmissionFileRow): boolean {
		return isSubmissionFileImage(f);
	}
</script>

{#each spec.modules as mod, mi (mod.id)}
	{@const gated = moduleGated(mod)}
	{@const completion = moduleCompletion(mod, new Map(Object.entries(values)), fileCounts)}
	<section class="module card" class:gated>
		<header class="module-head">
			<div class="module-titles">
				<span class="module-eyebrow">Module {mi + 1}</span>
				<h3 class="module-title">{mod.title}</h3>
			</div>
			<div class="module-chips">
				<!-- The SHARED badge (AiLevelBadge): the reference documents' AI
				     level lookup mounts the same component, so a student sees an
				     identical badge in both places by construction. `mod.aiNote`
				     (schema v2) surfaces on hover/focus in place of the generic
				     level rule when the module carries one. -->
					<AiLevelBadge level={mod.aiLevel} note={mod.aiNote} />
				<span class="chip points-chip">{mod.points} pts</span>
				{#if !readonly && completion.total > 0 && !gated}
					<span class="chip done-chip" class:complete={completion.done === completion.total}>
						{completion.done}/{completion.total} done
					</span>
				{/if}
			</div>
		</header>

		{#if gated}
			<p class="gate-lock">
				Locked until your teacher approves your work on the earlier modules
				{#if spec.approvalGate?.label}&nbsp;({spec.approvalGate.label}){/if}.
			</p>
		{:else}
			{#if mod.intro}
				<p class="module-intro">{mod.intro}</p>
			{/if}

			{#each mod.blocks as block, bi (blockKey(block, bi))}
				{#if block.type === 'instructions'}
					<!-- The SAME markdown renderer the reference documents' own
					     instructions blocks use (both carry the identical
					     `{type: 'instructions', content: string}` shape), so a
					     module's markdown -- headings, bold, lists, tables, code --
					     comes through as real elements rather than literal
					     asterisks and hash marks. -->
					<div class="block instructions"><MarkdownText body={block.content} /></div>
				{:else if block.type === 'textField'}
					{@const counter = counterFor(block)}
					<div class="block">
						<label class="prompt" for={`tf-${block.id}`}>{block.prompt}</label>
						{#if readonly}
							<p class="readonly-text">{textValue(block.id) || '—'}</p>
						{:else}
							<textarea
								id={`tf-${block.id}`}
								class="answer"
								rows="2"
								disabled={!canEdit}
								value={textValue(block.id)}
								use:autoresize
								oninput={(e) => setText(block.id, (e.currentTarget as HTMLTextAreaElement).value)}
							></textarea>
						{/if}
						<span class="counter {counter.state}">
							<span class="counter-dot" aria-hidden="true"></span>
							{counter.label}
						</span>
					</div>
				{:else if block.type === 'table'}
					{@const rows = tableRows(block)}
					<div class="block">
						<div class="table-scroll">
							<table class="entry-table">
								<thead>
									<tr>
										<!-- Each column's tip is attached to its OWN header --
										     visible on hover and on keyboard focus (InfoTip), and
										     always visible in the print view, since print has no
										     hover to reveal it -- rather than an unlabelled bullet
										     list a student could not match back to a column. -->
										{#each block.columns as col (col.key)}
											<th><InfoTip tip={col.tip}>{col.label}</InfoTip></th>
										{/each}
										{#if canEdit}<th class="row-ops-head" aria-label="Row actions"></th>{/if}
									</tr>
								</thead>
								<tbody>
									{#if rows.length === 0}
										<tr>
											<td colspan={block.columns.length + (canEdit ? 1 : 0)} class="empty-cell">
												{#if canEdit}No rows yet -- add one below.{:else}—{/if}
											</td>
										</tr>
									{/if}
									{#each rows as row, ri (ri)}
										<tr>
											{#each block.columns as col (col.key)}
												<td>
													{#if readonly || !canEdit}
														<span class="cell-text">{row[col.key] ?? ''}</span>
													{:else}
														<input
															type="text"
															class="cell"
															value={row[col.key] ?? ''}
															oninput={(e) =>
																setCell(block, ri, col.key, (e.currentTarget as HTMLInputElement).value)}
														/>
													{/if}
												</td>
											{/each}
											{#if canEdit}
												<td class="row-ops">
													<button type="button" title="Move up" onclick={() => moveRow(block, ri, -1)} disabled={ri === 0}>↑</button>
													<button type="button" title="Move down" onclick={() => moveRow(block, ri, 1)} disabled={ri === rows.length - 1}>↓</button>
													<button type="button" title="Duplicate row" onclick={() => duplicateRow(block, ri)}>⧉</button>
													<button type="button" title="Delete row" onclick={() => deleteRow(block, ri)}>✕</button>
												</td>
											{/if}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<div class="table-foot">
							{#if canEdit}
								<button type="button" class="btn secondary tiny" onclick={() => addRow(block)}>
									Add row
								</button>
							{/if}
							{#if block.minRows}
								<span class="counter" class:met={rows.filter((r) => Object.values(r).some((v) => String(v ?? '').trim() !== '')).length >= block.minRows}>
									min {block.minRows} filled rows
								</span>
							{/if}
						</div>
					</div>
				{:else if block.type === 'imageZone'}
					{@const zone = zoneFiles.get(block.id) ?? []}
					{@const need = block.minImages ?? 1}
					<div class="block">
						<div class="zone-head">
							<span class="prompt">Photo evidence</span>
							<span class="counter" class:met={zone.length >= need}>
								{zone.length} / {need} photo{need === 1 ? '' : 's'}
							</span>
						</div>
						{#if zone.length}
							<div class="zone-grid">
								{#each zone as f (f.id)}
									<figure class="zone-item">
										{#if isImage(f)}
											<img src={submissionFileSrc(f.id)} alt={f.caption ?? f.filename} loading="lazy" />
										{:else}
											<a class="zone-file" href={submissionFileSrc(f.id)} target="_blank" rel="noopener noreferrer">{f.filename}</a>
										{/if}
										{#if block.captions !== false}
											{#if canEdit}
												<input
													type="text"
													class="caption"
													placeholder="Caption"
													value={f.caption ?? ''}
													onchange={(e) => oncaption?.(f.id, (e.currentTarget as HTMLInputElement).value)}
												/>
											{:else if f.caption}
												<figcaption class="caption-text">{f.caption}</figcaption>
											{/if}
										{/if}
										{#if canEdit}
											<button type="button" class="zone-remove" onclick={() => ondeletefile?.(f.id)}>
												Remove
											</button>
										{/if}
									</figure>
								{/each}
							</div>
						{/if}
						{#if canEdit}
							{#if uploadEnabled}
								<div class="zone-actions">
									<!-- The notebook capture pattern: capture is camera-ONLY on
									     Android and a capture returns one file, so the camera
									     input and the multi-select gallery input stay separate. -->
									<label class="btn secondary tiny">
										Take a photo
										<input type="file" accept="image/*" capture="environment" hidden onchange={(e) => pickZoneFiles(block, e)} />
									</label>
									<label class="btn secondary tiny">
										Choose photos
										<input type="file" accept="image/*" multiple hidden onchange={(e) => pickZoneFiles(block, e)} />
									</label>
								</div>
								{#if uploadingProgress && uploadingProgress.blockId === block.id}
									<p class="upload-status">
										Uploading {uploadingProgress.name}...
										<span class="upload-bar" role="progressbar" aria-valuenow={Math.round(uploadingProgress.fraction * 100)} aria-valuemin="0" aria-valuemax="100">
											<span class="upload-bar-fill" style={`width: ${Math.round(uploadingProgress.fraction * 100)}%`}></span>
										</span>
										{Math.round(uploadingProgress.fraction * 100)}%
									</p>
								{/if}
							{:else}
								<p class="note">Photo uploads are not configured on this deployment.</p>
							{/if}
						{/if}
					</div>
				{:else if block.type === 'checklist'}
					{@const checked = checklistChecked(block.id, block.items.length)}
					<div class="block">
						<ul class="checklist">
							{#each block.items as item, ii (ii)}
								<li>
									<label class="check-item">
										<input
											type="checkbox"
											checked={checked[ii]}
											disabled={!canEdit}
											onchange={() => toggleItem(block.id, ii, block.items.length)}
										/>
										<span>{item}</span>
									</label>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
		{/if}
	</section>

	{#if gateAfter === mod.id}
		<section class="card gate-card" class:approved>
			<span class="gate-label">{spec.approvalGate?.label ?? 'Instructor Approval Required'}</span>
			<span class="gate-state">
				{#if approved}Approved -- the modules below are unlocked.{:else}Show your teacher your work so far. The modules below unlock once they approve it.{/if}
			</span>
		</section>
	{/if}
{/each}

<style>
	.module {
		margin-bottom: 0.9rem;
	}
	.module.gated {
		opacity: 0.75;
		border-style: dashed;
	}
	.module-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.module-eyebrow {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.module-title {
		margin: 0.1rem 0 0;
		font-size: 1.05rem;
	}
	.module-chips {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.chip {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.08rem 0.5rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.points-chip {
		color: var(--gold);
		border-color: var(--gold);
	}
	.done-chip.complete {
		color: var(--green);
		border-color: var(--line-strong);
	}
	/* PROSE KEEPS ITS MEASURE WHEREVER THE SPEC IS RENDERED. Every surface that
	   mounted this used to be a reading column narrower than the measure, so
	   nothing needed saying. The grading console is an application surface that
	   takes the window, and its response pane measured a 1035px line at 2560px --
	   about 65rem, half again past the reading measure. The cap belongs on the
	   prose, not on the console: bounding the console instead would take the room
	   back off the rubric, which is the whole reason it is wide. */
	.module-intro,
	.readonly-text,
	.prompt {
		max-width: var(--measure-reading);
	}
	.module-intro {
		margin: 0 0 0.6rem;
		color: var(--text-2);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.gate-lock {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--amber);
	}
	.block {
		margin: 0 0 0.9rem;
	}
	.block:last-child {
		margin-bottom: 0;
	}
	.prompt {
		display: block;
		font-size: 0.9rem;
		margin-bottom: 0.3rem;
	}
	.answer {
		width: 100%;
		box-sizing: border-box;
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
		line-height: 1.5;
		padding: 0.45rem 0.6rem;
		resize: none;
		overflow: hidden;
		min-height: 3.2rem;
	}
	.answer:focus {
		outline: none;
		border-color: var(--line-strong);
	}
	.answer:disabled {
		color: var(--text-3);
	}
	.readonly-text,
	.cell-text {
		white-space: pre-wrap;
		font-size: 0.9rem;
		margin: 0;
	}
	.counter {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: var(--space-1);
		padding: 0.14rem 0.55rem;
		border-radius: 999px;
		border: 1px solid var(--hairline);
		background: var(--surface-0);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.counter-dot {
		width: 0.4rem;
		height: 0.4rem;
		flex: none;
		border-radius: 50%;
		background: currentColor;
	}
	.counter.below {
		color: var(--amber);
		border-color: var(--amber);
		background: color-mix(in srgb, var(--amber) 12%, var(--surface-0));
	}
	.counter.met {
		color: var(--green);
		border-color: var(--green);
		background: color-mix(in srgb, var(--green) 12%, var(--surface-0));
	}
	.table-scroll {
		overflow-x: auto;
	}
	.entry-table {
		width: 100%;
		border-collapse: collapse;
		min-width: 24rem;
	}
	.entry-table th {
		text-align: left;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cyan);
		border-bottom: 1px solid var(--hairline);
		padding: 0.25rem 0.4rem;
	}
	.entry-table td {
		border-bottom: 1px solid var(--hairline);
		padding: 0.2rem 0.3rem;
		vertical-align: top;
	}
	.empty-cell {
		color: var(--text-2);
		font-size: 0.8rem;
		padding: 0.5rem 0.4rem;
	}
	.cell {
		width: 100%;
		box-sizing: border-box;
		background: var(--surface-0);
		border: 1px solid transparent;
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.9rem;
		padding: 0.3rem 0.4rem;
		min-width: 6rem;
	}
	.cell:focus {
		outline: none;
		border-color: var(--line-strong);
	}
	.row-ops-head {
		width: 6.4rem;
	}
	.row-ops {
		white-space: nowrap;
	}
	.row-ops button {
		appearance: none;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		color: var(--text-2);
		font-size: 0.7rem;
		width: 1.45rem;
		height: 1.45rem;
		cursor: pointer;
		margin-left: 0.15rem;
	}
	.row-ops button:hover:not(:disabled) {
		color: var(--text-1);
		border-color: var(--line-strong);
	}
	.row-ops button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.table-foot {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.4rem;
	}
	.zone-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
	}
	.zone-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 0.6rem;
		margin: var(--space-2) 0;
	}
	.zone-item {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.zone-item img {
		width: 100%;
		max-height: 12rem;
		object-fit: contain;
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
	}
	.zone-file {
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}
	.caption {
		width: 100%;
		box-sizing: border-box;
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.8rem;
		padding: 0.25rem 0.4rem;
	}
	.caption-text {
		font-size: 0.76rem;
		color: var(--text-2);
	}
	.zone-remove {
		appearance: none;
		background: none;
		border: none;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-align: left;
		cursor: pointer;
		padding: 0;
	}
	.zone-remove:hover {
		color: var(--crimson);
	}
	.zone-actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}
	.zone-actions label {
		cursor: pointer;
	}
	.checklist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.check-item {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: 0.9rem;
		cursor: pointer;
	}
	.check-item input {
		margin-top: 0.2rem;
		accent-color: var(--green);
	}
	.note {
		color: var(--text-2);
		font-size: 0.8rem;
		margin: 0.3rem 0 0;
	}
	.upload-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.4rem 0 0;
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.upload-bar {
		display: inline-block;
		width: 6rem;
		height: 0.4rem;
		border-radius: 999px;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		overflow: hidden;
	}
	.upload-bar-fill {
		display: block;
		height: 100%;
		background: var(--green);
		transition: width 0.15s ease-out;
	}
	.gate-card {
		margin-bottom: 0.9rem;
		border-color: var(--gold);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.gate-card.approved {
		border-color: var(--line-strong);
	}
	.gate-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold);
	}
	.gate-card.approved .gate-label {
		color: var(--green);
	}
	.gate-state {
		font-size: 0.85rem;
		color: var(--text-2);
	}
</style>
