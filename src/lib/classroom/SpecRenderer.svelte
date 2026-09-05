<script lang="ts">
	import { dev } from '$app/environment';
	import AiLevelBadge from '$lib/classroom/AiLevelBadge.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import InfoTip from '$lib/classroom/InfoTip.svelte';
	import MarkdownText from '$lib/classroom/MarkdownText.svelte';
	import {
		countSentences,
		filesByBlockCount,
		gatedModuleIds,
		isSubmissionFileImage,
		moduleCompletion,
		moduleStarted,
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
	import type { ClassroomAttachment } from '$lib/classroom/classroom';
	import FileUploadPanel, { type PanelUpload } from '$lib/classroom/FileUploadPanel.svelte';
	import type { UploadedFileRow } from '$lib/classroom/file-upload';
	import { filesFromClipboard, pasteRouteMessage } from '$lib/file-drop';

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
		attachments = [],
		files = [],
		locked = false,
		approved = false,
		uploadEnabled = true,
		readonly = false,
		fileNotice = null,
		onvalue = null,
		itemId = null,
		upload = null,
		onuploaded = null,
		ondeletefile = null,
		oncaption = null
	}: {
		spec: AssignmentSpec;
		initialValues: Record<string, ResponseValue>;
		/**
		 * The ITEM's own attachments -- the teacher's files on the assignment,
		 * which an `attachment:<filename>` figure reference in an `instructions`
		 * block resolves against. Deliberately NOT `files` below: those are the
		 * STUDENT's uploaded evidence, a different table with a different proxy
		 * and a different reader, and a figure must never be able to name one.
		 */
		attachments?: ClassroomAttachment[];
		files?: SubmissionFileRow[];
		locked?: boolean;
		/** The approval gate's state for THIS student (true when no gate). */
		approved?: boolean;
		uploadEnabled?: boolean;
		/** The grading console's read-only rendering: values, no inputs. */
		readonly?: boolean;
		/**
		 * WHAT THIS SURFACE DOES WITH A FILE BLOCK, when the answer is "nothing".
		 * Set, an imageZone renders its heading and this sentence and NO control
		 * -- no counter that would read as progress toward something, no picker
		 * that leads nowhere. The instructor working copy (0128) is the caller:
		 * there is no instructor-side file table, and a control that does nothing
		 * is worse than a stated absence.
		 */
		fileNotice?: string | null;
		onvalue?: ((blockId: string, value: ResponseValue) => void) | null;
		/** The assignment this spec belongs to. Needed only to upload. */
		itemId?: string | null;
		/**
		 * THE UPLOAD TRANSPORT, and mounting it is what turns an imageZone into a
		 * working picker. It is the SAME `PanelUpload` an instructor's composer
		 * hands FileUploadPanel, so a zone and a handout share one component,
		 * one set of failure semantics and one set of words.
		 *
		 * Null removes every zone control -- read-only by construction, not by
		 * discipline, and the same mechanism `fileNotice` uses one level up.
		 */
		upload?: PanelUpload | null;
		/** One landed, so the parent can add it to the file list it owns. */
		onuploaded?: ((row: UploadedFileRow | undefined) => void) | null;
		ondeletefile?: ((fileId: string) => void | Promise<void>) | null;
		oncaption?: ((fileId: string, caption: string) => void | Promise<void>) | null;
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

	/**
	 * WHERE A PASTED SCREENSHOT GOES WHEN IT LANDS IN AN ANSWER FIELD.
	 *
	 * An assignment answer field is a textarea, so an image cannot sit inline
	 * in it -- but a student who just worked something out on an online
	 * calculator wants to hand in exactly that screenshot. `handleAnswerPaste`
	 * is wired to every `textField`'s `onpaste`: it reads the SAME clipboard
	 * extraction the shared drop target uses (`filesFromClipboard`), and does
	 * nothing at all -- no `preventDefault`, no interception -- unless the
	 * paste actually carried an image, so pasting plain TEXT into an answer
	 * keeps working exactly as it always did.
	 *
	 * THE TARGET IS THE MODULE'S OWN imageZone, keyed by block id in
	 * `zonePanels` (populated by each imageZone's own `bind:this` below) --
	 * never a global "wherever the composer decided", because a module's photo
	 * evidence is its own, not the assignment's. A module with no imageZone
	 * block, or one whose panel is not mounted right now (uploads disabled, no
	 * `itemId`), has nowhere to put it -- `pasteRouteMessage` is what turns
	 * that into a stated refusal instead of a paste that looks like it did
	 * nothing.
	 */
	let zonePanels = $state<Record<string, FileUploadPanel | null>>({});
	let pasteNotice = $state<Record<string, string>>({});

	function moduleImageZone(mod: SpecModule): ImageZoneBlock | null {
		return (mod.blocks.find((b): b is ImageZoneBlock => b.type === 'imageZone') ?? null);
	}

	function handleAnswerPaste(mod: SpecModule, event: ClipboardEvent) {
		const images = filesFromClipboard(event);
		const zone = moduleImageZone(mod);
		const panel = zone ? zonePanels[zone.id] : null;
		const route = pasteRouteMessage(images.length, !!panel);
		if (!route) return; // no image was pasted -- a plain-text paste is untouched
		event.preventDefault();
		if (route.sent && panel) panel.add(images);
		pasteNotice = { ...pasteNotice, [mod.id]: route.text };
		setTimeout(() => {
			pasteNotice = { ...pasteNotice, [mod.id]: '' };
		}, 4000);
	}

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
	/**
	 * Ends only, never interior -- `white-space: pre-wrap` on `.cell-text` is
	 * what lets a longer cell keep its own line breaks, and this must not
	 * touch those. ONE implementation for two call sites: the read-only span
	 * (repairs a value already stored with leading/trailing whitespace,
	 * without writing anything back) and the editable input's COMMIT, never
	 * its `oninput` -- trimming every keystroke would strip a trailing space
	 * the instant it was typed and make "hello " + "world" impossible to type.
	 */
	function trimCellEnds(value: string): string {
		return value.trim();
	}
	function blankRow(block: TableBlock): Record<string, string> {
		return Object.fromEntries(block.columns.map((c) => [c.key, '']));
	}
	/**
	 * THE CRASH GUARD, AND ONLY THAT: after this runs `values[block.id].rows` is
	 * an ARRAY, possibly an empty one. It never decides how many rows a person
	 * has.
	 *
	 * It used to also materialise `Math.max(block.minRows ?? 0, 1)` blank rows,
	 * and because `addRow` calls it BEFORE appending, the first press of Add row
	 * on an untouched table produced the minimum AND one more -- two rows on a
	 * table with no `minRows`, four on a table with `minRows: 3`. A student who
	 * pressed a button reading "Add row" got two, then filled in a blank row that
	 * should not have been there and wondered whether it counted.
	 *
	 * `minRows` IS A COMPLETION REQUIREMENT COUNTED OVER FILLED ROWS, NEVER A
	 * MATERIALISATION INSTRUCTION, and all three gates that read it already agree
	 * on that: the counter under this block filters rows with a non-empty cell,
	 * `blockProgress` filters on `tableRowFilled`, and `_classroom_spec_unmet`
	 * (0086) counts rows with a `jsonb_each_text` value that is not blank. So a
	 * materialised blank row advances NOTHING any gate reads -- it is noise on
	 * the student's screen, and on a `minRows: 3` table it is three obligations
	 * presented at once to somebody who asked for one place to write.
	 *
	 * BOTH CALL SITES KEEP IT and neither may be the thing that sets a count:
	 * `setCell` writes at an index and `addRow` spreads the array, so both need
	 * it to exist. Removing the call to fix the count is how the crash it guards
	 * against comes back.
	 */
	function ensureRows(block: TableBlock) {
		if (!Array.isArray(values[block.id]?.rows)) {
			values[block.id] = { ...(values[block.id] ?? {}), rows: [] };
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
	/** ONE row, at every state, including the first press on an untouched table.
	 *  The button says "Add row" and the empty cell says "Add one below". */
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
	/**
	 * ONE row, down to none, and the floor is ZERO on purpose -- which is the
	 * same rule `addRow` follows read backwards. A floor at `minRows` would
	 * strand blank rows a student cannot remove while satisfying no gate, since
	 * every gate counts FILLED rows; and an empty table is not a broken state,
	 * it is the state the empty cell already has words for.
	 */
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

	/**
	 * Auto-resizing textarea: grow to fit on every input, BOUNDED.
	 *
	 * The cap is `.answer`'s own `max-height` and is read back from the computed
	 * style rather than written down again here -- one statement of it, so the
	 * element's height can never claim a size the box will not take. Past the cap
	 * the box SCROLLS (`overflow-y: auto`) instead of growing.
	 *
	 * Unbounded, one long answer pushed every later module off the screen:
	 * measured at 375px, a 26-sentence answer grew the box to 1998px, so
	 * reaching the next module meant scrolling a full phone screen and a half
	 * past one field.
	 *
	 * A box with no cap (the LOCKED one, see the rule) computes `max-height`
	 * as `none`, which is not a number, so it keeps growing to fit exactly as
	 * it always did. See the cap's own note on `.answer` for the figures.
	 */
	function autoresize(el: HTMLTextAreaElement) {
		const fit = () => {
			el.style.height = 'auto';
			const cap = Number.parseFloat(getComputedStyle(el).maxHeight);
			const wanted = el.scrollHeight + 2;
			el.style.height = `${Number.isFinite(cap) ? Math.min(wanted, cap) : wanted}px`;
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

	function blockKey(block: SpecBlock, index: number): string {
		return 'id' in block && block.id ? block.id : `b-${index}`;
	}

	/**
	 * A thumbnail that did not decode falls back to the download row, exactly as
	 * SubmissionFileList's does -- the SAME failure, so the same answer.
	 *
	 * IT IS AN ORDINARY OUTCOME, NOT AN ERROR STATE. The image decision is made
	 * from a filename extension (`isSubmissionFileImage`), which is a claim about
	 * what a file is called and not a promise about what is inside it: a `.png`
	 * that is really a renamed zip, a truncated upload, or a signed URL that
	 * expired between the payload and the fetch all land here. A broken-image
	 * glyph tells a student nothing and offers them nothing; a link they can open
	 * is what they actually needed.
	 */
	let brokenThumbs = $state<Record<string, boolean>>({});

	function isImage(f: SubmissionFileRow): boolean {
		return isSubmissionFileImage(f) && !brokenThumbs[f.id];
	}

	/**
	 * The module the progress chip and the "has this been started" signal are
	 * computed over. Identical to the module itself everywhere except a surface
	 * that captures no files (`fileNotice`), where the file blocks come OUT of
	 * the tally rather than sitting in it forever undone -- a chip that reads
	 * 2/3 on a surface where the third can never be done is a lie about the
	 * work, not a reminder about it.
	 */
	function progressModule(mod: SpecModule): SpecModule {
		if (!fileNotice) return mod;
		return { ...mod, blocks: mod.blocks.filter((b) => b.type !== 'imageZone') };
	}

	/**
	 * IS THIS MODULE DONE. The same `moduleCompletion` tally the done-chip
	 * already reads (`done`/`total` over the module's own constrained blocks),
	 * so there is no second definition of "complete" for the collapse to drift
	 * from. `total === 0` (an instructions-only module with nothing to enter)
	 * is never complete by this reading -- there is nothing to have finished,
	 * so the module stays open rather than collapsing on load.
	 */
	function moduleComplete(completion: { done: number; total: number }): boolean {
		return completion.total > 0 && completion.done === completion.total;
	}
</script>

{#each spec.modules as mod, mi (mod.id)}
	{@const gated = moduleGated(mod)}
	{@const responses = new Map(Object.entries(values))}
	{@const completion = moduleCompletion(progressModule(mod), responses, fileCounts)}
	<!-- HAS THIS PERSON PUT ANYTHING INTO THIS MODULE. Derived from the values
	     map this component already owns, right beside the completion chip that
	     already reads it -- no store, no new prop, and no second source of
	     truth about what a student has done. It drives nothing but the
	     instructions panel's default state. -->
	{@const started = moduleStarted(progressModule(mod), responses, fileCounts)}
	{@const complete = moduleComplete(completion)}
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
			<!-- THE WHOLE MODULE, NOT ONLY ITS INSTRUCTIONS. The header above --
			     title, points, the AI badge and the done chip -- stays outside this
			     Disclosure and always renders, so a collapsed module is legible as
			     DONE rather than as missing. `collapseWhen` is `complete`, never
			     `started`: a module a student is halfway through must ARRIVE
			     open, and only one already finished has nothing left to look at.
			     Either way it decides how the module is HANDED OVER and never
			     when it shuts: `Disclosure` latches the signal, so finishing the
			     last field no longer folds the module over the textarea being
			     typed into (prompt 0018). Same
			     rule for the readonly renders (the grading console, the importer's
			     preview) -- `complete` is read off the same `completion` tally
			     with no role branch, exactly as the nested instructions panel
			     already is. -->
			<Disclosure
				label="Module content"
				scope={`${spec.meta.assignmentId}:${mod.id}:module`}
				collapseWhen={complete}
				testId="module-body"
			>
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
					<!-- EXPANDED THE FIRST TIME, ARRIVING COLLAPSED ONCE THE WORK
					     HAS STARTED, and never removed either way (Disclosure hides
					     it in CSS, so it is one press away and it still prints).
					     `started` decides the arrival and nothing else: Disclosure
					     latches it, so a panel already on screen is closed by this
					     person's press alone (prompt 0018). The teacher gets
					     this panel in exactly this state: `started` is the only
					     input, there is no role branch here, and the readonly
					     renders (the grading console, the importer's preview) read
					     the same rule off the same values. -->
					<div class="block instructions">
						<Disclosure
							label="Instructions"
							scope={`${spec.meta.assignmentId}:${mod.id}:instructions:${bi}`}
							collapseWhen={started}
							testId="module-instructions"
						>
							<MarkdownText body={block.content} {attachments} />
						</Disclosure>
					</div>
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
								spellcheck="true"
								disabled={!canEdit}
								value={textValue(block.id)}
								use:autoresize
								oninput={(e) => setText(block.id, (e.currentTarget as HTMLTextAreaElement).value)}
								onpaste={(e) => handleAnswerPaste(mod, e)}
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
												{#if canEdit}No rows yet. Add one below.{:else}—{/if}
											</td>
										</tr>
									{/if}
									{#each rows as row, ri (ri)}
										<tr>
											{#each block.columns as col (col.key)}
												<td>
													{#if readonly || !canEdit}
														<span class="cell-text">{trimCellEnds(row[col.key] ?? '')}</span>
													{:else}
														<textarea
															class="cell"
															rows="1"
															value={row[col.key] ?? ''}
															use:autoresize
															oninput={(e) =>
																setCell(block, ri, col.key, (e.currentTarget as HTMLTextAreaElement).value)}
															onchange={(e) => {
																const el = e.currentTarget as HTMLTextAreaElement;
																const trimmed = trimCellEnds(el.value);
																if (trimmed !== el.value) setCell(block, ri, col.key, trimmed);
															}}
														></textarea>
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
				{:else if block.type === 'imageZone' && fileNotice}
					<!-- A surface that captures no files says so on the block, and
					     renders nothing that could be mistaken for a control or for
					     progress toward one. -->
					<div class="block">
						<div class="zone-head">
							<span class="prompt">Photo evidence</span>
						</div>
						<p class="note">{fileNotice}</p>
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
											<!-- Clickable to the full-size file. The src and the href are
											     the SAME proxy URL: for a storage-backed hand-in it 302s to
											     a short-lived signed URL (0133), and for a Drive-backed one
											     it streams the bytes as it always has. Neither this
											     component nor the student knows which. -->
											<a
												class="zone-shot"
												href={submissionFileSrc(f.id)}
												target="_blank"
												rel="noopener noreferrer"
											>
												<img
													src={submissionFileSrc(f.id)}
													alt={f.caption ?? f.filename}
													loading="lazy"
													onerror={() => (brokenThumbs = { ...brokenThumbs, [f.id]: true })}
												/>
											</a>
										{:else}
											<a class="zone-file" href={submissionFileSrc(f.id)} target="_blank" rel="noopener noreferrer">{f.filename}</a>
										{/if}
										{#if block.captions !== false}
											{#if canEdit}
												<input
													type="text"
													class="caption"
													placeholder="Caption"
													spellcheck="true"
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
							{#if uploadEnabled && upload && itemId}
								<!-- THE SHARED PANEL, per zone. Same component as the plain
								     hand-in below it and as an instructor's handout: every file
								     attempted, whatever fails stays here with its own reason and
								     its own Retry, progress per file.

								     The plain picker carries NO `accept`. A zone asks for photos
								     and mostly gets them, but a student whose evidence is a CAD
								     screenshot exported as something else, or a scan, or a phone
								     that types nothing, is not helped by a picker that hides
								     their file -- the block's own count is what says how many
								     it wants. The camera button beside it keeps `accept` because
								     `capture` is what makes a phone open its camera at all. -->
								<FileUploadPanel
									bind:this={zonePanels[block.id]}
									role="submission"
									{itemId}
									blockId={block.id}
									{upload}
									label="Evidence"
									hint="Any file, up to 200 MB each. Uploads as soon as you pick it."
									autoStart
									offerCamera
									showPreviews
									onuploaded={(row) => onuploaded?.(row)}
								/>
							{:else if !uploadEnabled}
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
				{:else if dev}
					<!-- A BLOCK TYPE THE DATABASE STILL HOLDS AND THIS CODE NO LONGER
					     KNOWS. Until now this chain ended with a bare {/if}, so such a
					     block rendered NOTHING AT ALL -- a module quietly one block
					     short, with no gap and no error, which on an ASSIGNMENT means a
					     student is never shown something they are being graded on.
					     Only reachable if a type is retired while stored specs still
					     carry it; the validators refuse an unknown type on write.

					     DEV ONLY. Production is byte-for-byte what it was, because the
					     person who can act on this is not the student. -->
					<div class="block unknown-block">
						Unsupported block type ({(block as { type: string }).type})
					</div>
				{/if}
			{/each}
			{#if pasteNotice[mod.id]}
				<!-- ONE notice per module, not per textField -- a pasted image is
				     routed once, wherever the paste happened, and every answer in
				     this module shares the one place it could have gone. -->
				<p class="paste-notice" role="status">{pasteNotice[mod.id]}</p>
			{/if}
			</Disclosure>
		{/if}
	</section>

	{#if gateAfter === mod.id}
		<section class="card gate-card" class:approved>
			<span class="gate-label">{spec.approvalGate?.label ?? 'Instructor Approval Required'}</span>
			<span class="gate-state">
				{#if approved}Approved. The modules below are unlocked.{:else}Show your teacher your work so far. The modules below unlock once they approve it.{/if}
			</span>
		</section>
	{/if}
{/each}

<style>
	.module {
		margin-bottom: 0.9rem;
	}
	/* THE ONE THING A GATED MODULE MUST SAY IS WHY IT IS GATED, and at 0.75 the
	   lock message measured 3.91:1 -- the group dim was applied to the
	   explanation as well as to the work it was explaining. 0.85 is the lowest
	   step that carries .gate-lock's amber over 4.5 (4.73:1); the dashed border
	   is what says "gated" and it is untouched, so the state still reads
	   without depending on the dim. */
	.module.gated {
		opacity: 0.85;
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
	/* Dev-only diagnostic (see the markup). */
	.unknown-block {
		padding: var(--space-3);
		border: 1px dashed var(--line-strong);
		border-radius: var(--radius-card);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--amber);
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
		border: 1px solid var(--boundary);
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
	/* BOUNDED GROWTH, AND ONLY ON THE BOX A STUDENT IS WRITING IN.
	   `autoresize` reads this `max-height` back, so the cap is stated once and
	   the element's height can never claim a size the box will not take.
	   Natural heights measured on the real box: a 5-sentence answer (the most
	   any spec typically asks for) is 402px at 375px wide and 106px at 1440px;
	   the longest ask in any stored spec, 8 sentences, is 630px at 375px, 265px
	   at 768px and 151px at 1440px; an unbounded 26-sentence answer reached
	   1998px at 375px, which is what buried every later module. 32rem clears
	   every stored ask at 768px and up, clears a 5-sentence answer at every
	   width, and holds the runaway case to 512px. Past it the box scrolls,
	   which `auto` is what makes possible at all -- `hidden` left growing
	   forever as the only way not to lose the text.

	   THE LOCKED BOX IS DELIBERATELY LEFT UNCAPPED. A submitted answer renders
	   in a DISABLED textarea, and a disabled control cannot take focus and is
	   out of the tab order (measured: `focus()` does not land on it). Capping
	   it would put the tail of a student's own submitted work behind a scroll
	   a keyboard-only reader has no way to perform. The cap is a writing
	   affordance; it must not become a way to hide finished work. */
	.answer:not(:disabled) {
		overflow-y: auto;
		max-height: 32rem;
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
		display: block;
		width: 100%;
		box-sizing: border-box;
		background: var(--surface-0);
		border: 1px solid transparent;
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.9rem;
		line-height: 1.5;
		padding: 0.3rem 0.4rem;
		min-width: 6rem;
		resize: none;
		overflow: hidden;
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
		border: 1px solid var(--boundary);
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
	/* `auto-fit`, NOT `auto-fill`: two photographs in a wide pane must not lay
	   themselves out as two thumbnails and six empty tracks of blank space to
	   their right. Empty tracks collapse and the hand-ins that exist share the
	   measure -- the same decision ClassView's stream, the grading console's
	   roster and the Foundry gallery each already made, and the rule CLAUDE.md
	   states. Measured on this grid at 1440: two hand-ins left 1025.7px of void
	   to the right of the second one, and four left 683.8px.

	   `min(9rem, 100%)` keeps the track from overflowing a pane narrower than
	   one column -- a bare `minmax(9rem, 1fr)` in a 144px-or-less pane is a
	   9rem minimum inside a box that cannot hold it. */
	.zone-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
		gap: 0.6rem;
		margin: var(--space-2) 0;
	}
	.zone-item {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	/* The thumbnail's own anchor: a block so it does not collapse to a text
	   line box around the picture, and line-height 0 so no descender gap sits
	   under it.

	   ITS HIT AREA USED TO BE GUARANTEED BY THE TRACK AND IS NOW GUARANTEED BY
	   ITSELF. While the picture was stretched to the full column the anchor was
	   at least 9rem wide whatever was in it; shrunk to the picture, a small
	   hand-in (a screenshot of a dialogue box, a cropped detail) would be a
	   target the size of the file. The floor is stated here instead, as
	   `min-*` and never a height, and it costs nothing on screen: this anchor
	   paints neither a background nor a border, so the reach beyond a small
	   picture is hit area rather than blank. A photograph clears it several
	   times over. */
	/* `align-self: flex-start` IS THE OTHER HALF OF THE RULE BELOW. `.zone-item`
	   is a flex COLUMN, so the default stretch alignment would size this anchor
	   -- and with it the picture's own box -- to the whole track whatever the
	   img's `width: auto` says. Aligning to the start lets it shrink to the
	   picture it wraps. */
	.zone-shot {
		display: block;
		align-self: flex-start;
		min-width: 44px;
		min-height: 44px;
		line-height: 0;
		border-radius: var(--radius-card);
	}
	/* THE PICTURE'S BOX IS THE PICTURE, WHICH IS WHY BOTH DIMENSIONS ARE
	   AUTOMATIC. This was `width: 100%` with a `max-height` cap and
	   `object-fit: contain`, which forced every thumbnail to the full track
	   width and then clamped its height -- so a PORTRAIT photograph, which is
	   what a phone takes and therefore what most hand-ins are, was letterboxed
	   inside its own box and painted `--surface-0` bars either side of itself,
	   inside the border. Measured at 1440 before the change: a 600x900 hand-in
	   sat 126.7px wide in a 288px box, 161.3px of painted bar; a 800x800 one,
	   98px.

	   The border and the background still do their job -- they are what says
	   where a picture ends against the plate, which matters most for a
	   photograph with a pale edge -- they are simply drawn around the picture
	   now instead of around a box it does not fill. `object-fit` is kept as the
	   backstop it was: with both dimensions automatic it has nothing to do, and
	   it is what stops a distortion if either one is ever pinned again. */
	.zone-item img {
		width: auto;
		height: auto;
		max-width: 100%;
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
		border: 1px solid var(--boundary);
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
	.paste-notice {
		color: var(--text-2);
		font-size: 0.8rem;
		margin: 0.5rem 0 0;
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
