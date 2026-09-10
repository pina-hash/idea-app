<script lang="ts">
	/**
	 * HARNESS: the shared classroom file picker, both sides, every failure --
	 * and, since 0193, the ORDERED, EDITABLE staged list and the attachment
	 * list's own reorder and rename.
	 *
	 * It mounts the REAL `FileUploadPanel` -- the same component ContentComposer
	 * mounts for a handout, AssignmentEngine mounts for a hand-in, and
	 * SpecRenderer mounts per imageZone -- never a copy of its markup. What is
	 * faked is the TRANSPORT, which is the injection point the real routes use
	 * too: they point `upload` at `uploadClassroomFile`, this points it at a
	 * function that answers in memory. The same goes for `AttachmentList`: the
	 * real component, with `onreorder`, `onrename` and `renameBlocked` answered
	 * by in-memory handlers that use the SAME pure helpers the composer's
	 * handlers use (`renameCollides`, `renamedAttachmentFilename`,
	 * `renameBlockedReason`), so what the spec measures is the vocabulary the
	 * real surface will show.
	 *
	 * WHY IT EXISTS. Four of the guarantees in this bundle are invisible to a
	 * type check and awkward to reach through a real class:
	 *
	 *   - every file is attempted, even when an earlier one fails
	 *   - a failed file STAYS, with its own message and its own Retry
	 *   - the message names its gate (a size and the limit, an expired signed
	 *     URL, an RLS denial) and is never a bare "Upload failed"
	 *   - progress is per file
	 *
	 * The gate selector below makes each one reproducible in one click, which is
	 * also what makes "induce a failure and confirm the file is still staged"
	 * something anybody can re-run rather than a story about one afternoon.
	 *
	 * THE ORDERED SECTION is what `tools/browser-verify/routes/classroom-upload.mjs`
	 * drives: a panel seeded with three staged files the moment the client
	 * mounts (a `File` exists nowhere but in a browser's memory, so SSR cannot
	 * render a staged row and the spec waits for the three to appear), a
	 * probe for the current order, and a Save that records the order the
	 * transport was actually called in -- which is the whole claim about
	 * `runAll` being sequential.
	 *
	 * IN THE ROOM PRODUCTION IS IN. `.cr-root` with `classroom.css` imported,
	 * because the sort easing (`.cr-root .is-sorting ...`) and the plate the
	 * zone's contrast is measured against both live there; a harness without
	 * the room would measure a page the classroom never shows.
	 */
	import '$lib/classroom/classroom.css';
	import FileUploadPanel, { type PanelUpload } from '$lib/classroom/FileUploadPanel.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import type { UploadedFileRow } from '$lib/classroom/file-upload';
	import type { ClassroomAttachment, TxResult } from '$lib/classroom/classroom';
	import {
		RENAME_REFUSALS,
		renameBlockedReason,
		renameCollides,
		renamedAttachmentFilename
	} from '$lib/classroom/attachments';
	import {
		classifyUploadError,
		tooLarge,
		type UploadGate
	} from '$lib/classroom/upload-errors';
	import { CLASSROOM_UPLOAD_MAX_BYTES } from '$lib/classroom/file-upload';

	const ITEM_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

	type Mode =
		| 'ok'
		| 'slow'
		| 'too_large'
		| 'too_large_one'
		| 'expired'
		| 'denied'
		| 'not_configured'
		| 'alternate';

	let mode = $state<Mode>('ok');
	let role = $state<'attachment' | 'submission'>('attachment');
	let landed = $state<{ name: string; at: string }[]>([]);
	let failureReport = $state<string[]>([]);
	let attempt = 0;
	let panel = $state<FileUploadPanel | null>(null);

	const GATE_FOR: Record<string, UploadGate> = {
		expired: 'expired',
		denied: 'denied',
		not_configured: 'not_configured'
	};

	/**
	 * The fake. Deliberately reports progress in real steps for the slow mode --
	 * a progress bar that jumps 0 to 100 proves nothing about a 60 MB upload.
	 */
	const upload: PanelUpload = async ({ file, onProgress }) => {
		attempt += 1;
		const steps = mode === 'slow' ? 20 : 4;
		for (let i = 1; i <= steps; i += 1) {
			await new Promise((r) => setTimeout(r, mode === 'slow' ? 120 : 15));
			onProgress(i / steps);
		}

		// ALTERNATE fails the files whose name ends in an ODD digit -- the case the
		// old student-side loop got wrong: it stopped at the first failure and
		// abandoned every file after it. Keyed on the NAME rather than on a
		// counter, because which file fails must be a property of the file and
		// not of the order the batch happens to run in.
		const trailing = Number(file.name.match(/(\d)(?=\.[^.]*$|$)/)?.[1] ?? 0);
		const fails =
			mode === 'too_large' ||
			mode === 'expired' ||
			mode === 'denied' ||
			mode === 'not_configured' ||
			((mode === 'alternate' || mode === 'too_large_one') && trailing % 2 === 1);

		if (!fails) {
			landed = [...landed, { name: file.name, at: new Date().toLocaleTimeString() }];
			return {
				ok: true,
				storageKey: `${ITEM_ID}/fake-${attempt}`,
				row: { id: `fake-${attempt}`, filename: file.name } satisfies UploadedFileRow
			};
		}

		// THE ONE-OVERSIZED-FILE CASE, which the all-or-nothing modes cannot
		// express: a hand-in where a good file and a file over the cap are
		// staged together. Keyed on the trailing digit like `alternate`, so
		// which file fails is a property of the NAME rather than of the order
		// the batch runs in. The refusal is the real `tooLarge`, so the
		// sentence under the file is the one a real 200 MB refusal produces,
		// limit and all.
		if (mode === 'too_large' || mode === 'too_large_one') {
			return { ok: false, ...tooLarge(file.size * 500, CLASSROOM_UPLOAD_MAX_BYTES) };
		}
		const gate = mode === 'alternate' ? 'denied' : GATE_FOR[mode];
		const refusal = classifyUploadError({
			status: gate === 'expired' ? 400 : gate === 'not_configured' ? 404 : 403,
			detail:
				gate === 'expired'
					? 'jwt expired'
					: gate === 'not_configured'
						? 'Bucket not found'
						: 'new row violates row-level security policy',
			role,
			sizeBytes: file.size,
			maxBytes: CLASSROOM_UPLOAD_MAX_BYTES
		});
		return { ok: false, ...refusal };
	};

	async function runStaged() {
		failureReport = panel ? await panel.runAll(ITEM_ID) : [];
	}

	const MODES: [Mode, string][] = [
		['ok', 'everything lands'],
		['slow', 'lands slowly (watch progress)'],
		['alternate', 'every other file is refused'],
		['too_large', 'size refusal'],
		['too_large_one', 'one file is too large, the rest land'],
		['expired', 'expired signed URL'],
		['denied', 'RLS denial'],
		['not_configured', 'bucket missing']
	];

	// ------------------------------------------------------------------
	// THE ORDERED SECTION (0193): a seeded staged list and a Save that records
	// the order the transport was called in.
	// ------------------------------------------------------------------

	/** A real one-pixel PNG, so the seeded picture previews as a picture. */
	function pngFile(name: string): File {
		const bytes = Uint8Array.from(
			atob(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
			),
			(c) => c.charCodeAt(0)
		);
		return new File([bytes], name, { type: 'image/png' });
	}

	let ordered = $state<FileUploadPanel | null>(null);
	/** The names in the order the ordered panel's transport was CALLED, which
	 *  is the order `runAll` chose. Printed under the section and read by the
	 *  spec's probe. */
	let uploadOrder = $state<string[]>([]);
	let orderedReport = $state<string[]>([]);

	const orderedUpload: PanelUpload = async (args) => {
		uploadOrder = [...uploadOrder, args.file.name];
		return upload(args);
	};

	/**
	 * SEED ON THE CLIENT. A `File` is a browser object, so the three staged
	 * rows cannot be server-rendered; the effect runs once the panel is bound
	 * and stages them through the same `add` a paste or a drop reaches. The
	 * call is DEFERRED to a microtask (CLAUDE.md: an effect that calls
	 * something writing state lands while Svelte is still settling the render
	 * and throws `state_unsafe_mutation`), which also puts it outside the
	 * effect's tracking context, so nothing `add` touches can re-run this.
	 * The effect itself tracks only the binding.
	 */
	$effect(() => {
		const p = ordered;
		if (!p) return;
		queueMicrotask(() => {
			if (p.count() === 0) {
				p.add([
					new File([new Uint8Array(1200)], 'alpha.txt', { type: 'text/plain' }),
					pngFile('beta.png'),
					new File([new Uint8Array(4096)], 'gamma.pdf', { type: 'application/pdf' })
				]);
			}
		});
	});

	/**
	 * THE STAGED SECTION IS SEEDED TOO, with two rows that stay on screen: the
	 * ordered section's rows are uploaded by the spec's last step, so a
	 * staged-row control (grip, Move, Rename, Remove) could not be measured
	 * for its box after the drives if these did not exist. Remove takes them
	 * off for anyone using the page by hand.
	 */
	$effect(() => {
		const p = panel;
		if (!p) return;
		queueMicrotask(() => {
			if (p.count() === 0) {
				p.add([
					new File([new Uint8Array(900)], 'report-1.txt', { type: 'text/plain' }),
					new File([new Uint8Array(2048)], 'sketch-2.pdf', { type: 'application/pdf' })
				]);
			}
		});
	});

	/** The order on screen at the moment Save was pressed -- the thing the
	 *  transport's call order is compared against. `files()` is empty once
	 *  everything has landed, so this is read BEFORE the batch runs. */
	let orderAtSave = $state<string[]>([]);

	async function runOrdered() {
		uploadOrder = [];
		orderAtSave = ordered ? ordered.files().map((f) => f.name) : [];
		orderedReport = ordered ? await ordered.runAll(ITEM_ID) : [];
	}

	// ------------------------------------------------------------------
	// THE EXISTING LIST (0193): AttachmentList with the three new props
	// answered in memory, beside a mount WITHOUT them as the control.
	// ------------------------------------------------------------------

	/** A 1x1 PNG data URI, so the one image row draws a thumbnail with no
	 *  network request (a `/api/classroom/attachment/<id>` fetch would 404 on a
	 *  harness and log a console error the run counts). */
	const PNG_DATA =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

	const seedExisting = (): ClassroomAttachment[] => [
		{ id: 'a-1', filename: 'notes.pdf', mime_type: 'application/octet-stream', size_bytes: 48213, sort_order: 1 },
		{ id: 'a-2', filename: 'figure.png', mime_type: 'application/octet-stream', size_bytes: 20144, sort_order: 2 },
		{ id: 'a-3', filename: 'bracket.sldprt', mime_type: 'application/octet-stream', size_bytes: 918234, sort_order: 3 }
	];

	let existing = $state<ClassroomAttachment[]>(seedExisting());
	const readonlyExisting: ClassroomAttachment[] = seedExisting();

	/** The body document this pretend item carries: one picture, pointing at
	 *  `figure.png` -- so renaming that row is BLOCKED, which is the sentence
	 *  the spec asserts. */
	const BODY_DOC = {
		type: 'doc',
		content: [{ type: 'img', src: 'attachment:figure.png', alt: 'The bracket' }]
	};

	function reorderExisting(ids: string[]) {
		const byId = new Map(existing.map((a) => [a.id, a]));
		const next = ids.map((id) => byId.get(id)).filter((a): a is ClassroomAttachment => !!a);
		if (next.length === existing.length) existing = next;
	}

	/** The composer's own pre-checks, then an in-memory "RPC" that answers the
	 *  sanitized name exactly as 0193's function does. */
	async function renameExisting(
		a: ClassroomAttachment,
		filename: string
	): Promise<TxResult<{ filename: string }>> {
		const next = renamedAttachmentFilename(filename);
		if (!next) return { ok: false, message: RENAME_REFUSALS.empty };
		if (renameCollides(next, existing.map((x) => x.filename), a.filename)) {
			return { ok: false, message: RENAME_REFUSALS.taken };
		}
		await new Promise((r) => setTimeout(r, 40));
		existing = existing.map((x) => (x.id === a.id ? { ...x, filename: next } : x));
		return { ok: true, data: { filename: next } };
	}

	function renameBlocked(a: ClassroomAttachment): string | null {
		const reason = renameBlockedReason(a.filename, { referencedIn: [BODY_DOC] });
		return reason ? RENAME_REFUSALS[reason] : null;
	}

	const resolveSrc = (a: ClassroomAttachment) => (a.id === 'a-2' ? PNG_DATA : `#${a.id}`);

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		/** The staged order, by name -- what `files()` answers. */
		w.__stagedOrder = () => (ordered ? ordered.files().map((f) => f.name) : []);
		/** The staged order as it stood when Save was pressed. */
		w.__stagedOrderAtSave = () => [...orderAtSave];
		/** The order the ordered panel's transport was called in. */
		w.__uploadOrder = () => [...uploadOrder];
		/** The existing list's order, by id, and its names. */
		w.__existingOrder = () => existing.map((a) => a.id);
		w.__existingNames = () => existing.map((a) => a.filename);
	}
</script>

<div class="cr-root wrap">
	<h1>Classroom upload panel</h1>
	<p class="note">
		The real <code>FileUploadPanel</code>, with an in-memory transport. Pick several files at
		once, choose a failure, and check that every file is attempted, that a failed one stays with
		its own reason, and that Retry only appears where retrying could work.
	</p>

	<fieldset>
		<legend>Transport answers</legend>
		{#each MODES as [value, label] (value)}
			<label class="radio tap-44">
				<input type="radio" name="mode" checked={mode === value} onchange={() => (mode = value)} />
				<span>{label}</span>
			</label>
		{/each}
	</fieldset>

	<fieldset>
		<legend>Role (wording only)</legend>
		{#each ['attachment', 'submission'] as const as value (value)}
			<label class="radio tap-44">
				<input type="radio" name="role" checked={role === value} onchange={() => (role = value)} />
				<span>{value}</span>
			</label>
		{/each}
	</fieldset>

	<section class="panel-box" data-testid="staged-mode">
		<h2>Staged (a composer: uploads on save)</h2>
		<FileUploadPanel
			bind:this={panel}
			{role}
			itemId={ITEM_ID}
			{upload}
			label="Files"
			hint="Any file type, up to 200 MB each. Uploads when you save."
			showPreviews
		/>
		<button type="button" class="run tap-44" onclick={runStaged}>Save (run the batch)</button>
		{#if failureReport.length}
			<div class="report" data-testid="failure-report">
				<p>
					Saved, but {failureReport.length} thing{failureReport.length === 1 ? '' : 's'} did not:
				</p>
				<ul>
					{#each failureReport as line, i (i)}
						<li>{line}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>

	<section class="panel-box" data-testid="auto-mode">
		<h2>Immediate (a hand-in: uploads on pick)</h2>
		<FileUploadPanel
			{role}
			itemId={ITEM_ID}
			{upload}
			label="Your files"
			hint="Any file, up to 200 MB each. Uploads as soon as you pick it."
			autoStart
			offerCamera
			showPreviews
		/>
	</section>

	<section class="panel-box" data-testid="ordered-mode">
		<h2>Ordered (three staged files: rename, drag, arrow keys, Move up / Move down)</h2>
		<p class="note">
			Seeded with alpha.txt, beta.png and gamma.pdf. Save uploads them one at a time, in the order
			shown, and the list below records the order the transport was called in.
		</p>
		<FileUploadPanel
			bind:this={ordered}
			role="attachment"
			itemId={ITEM_ID}
			upload={orderedUpload}
			label="Files"
			hint="Reorder or rename before saving."
			showPreviews
		/>
		<button type="button" class="run tap-44" data-testid="ordered-run" onclick={runOrdered}>
			Save (run the batch in order)
		</button>
		{#if uploadOrder.length}
			<ol class="order" data-testid="upload-order">
				{#each uploadOrder as name, i (i)}
					<li>{name}</li>
				{/each}
			</ol>
		{/if}
		{#if orderedReport.length}
			<div class="report">
				<ul>
					{#each orderedReport as line, i (i)}
						<li>{line}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>

	<section class="panel-box" data-testid="existing-mode">
		<h2>Existing files (reorder, rename, and one that cannot be renamed)</h2>
		<p class="note">
			The real <code>AttachmentList</code> with reorder and rename handed in. figure.png is used
			as a picture in this item's text, so its Rename shows the blocking sentence instead of an
			input; renaming another row to a sibling's name is refused with the same words the
			database uses.
		</p>
		<AttachmentList
			attachments={existing}
			figureRefs
			{resolveSrc}
			onreorder={reorderExisting}
			onrename={renameExisting}
			{renameBlocked}
		/>
	</section>

	<section class="panel-box" data-testid="existing-readonly">
		<h2>The same list with nothing handed in (the control)</h2>
		<p class="note">No grip, no Move, no Rename: absence is the mechanism.</p>
		<AttachmentList attachments={readonlyExisting} {resolveSrc} />
	</section>

	<section class="panel-box">
		<h2>Landed</h2>
		{#if landed.length}
			<ul data-testid="landed">
				{#each landed as row, i (i)}
					<li>{row.name} <span class="dim">{row.at}</span></li>
				{/each}
			</ul>
		{:else}
			<p class="note">Nothing yet.</p>
		{/if}
	</section>
</div>

<style>
	.wrap {
		max-width: 60rem;
		margin: 0 auto;
		padding: var(--space-4, 1rem);
		display: grid;
		gap: var(--space-4, 1rem);
	}
	h1 {
		font-family: var(--font-title, var(--font-display));
		margin: 0;
	}
	h2 {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin: 0 0 0.5rem;
	}
	.note {
		color: var(--text-2, var(--dim));
		font-size: 0.9rem;
		margin: 0;
	}
	fieldset {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
	}
	legend {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2, var(--dim));
	}
	.radio {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.panel-box {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		padding: var(--space-3, 0.75rem);
		display: grid;
		gap: 0.6rem;
		min-width: 0;
	}
	.run {
		justify-self: start;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--green);
		border-radius: var(--radius-2, 6px);
		background: transparent;
		color: var(--green);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.report {
		border: 1px solid var(--amber);
		border-radius: var(--radius-2, 6px);
		padding: 0.5rem 0.7rem;
		font-size: 0.88rem;
	}
	.report p {
		margin: 0 0 0.3rem;
	}
	.report ul,
	ul,
	.order {
		margin: 0;
		padding-left: 1.1rem;
	}
	.order {
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.dim {
		color: var(--text-2, var(--dim));
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
</style>
