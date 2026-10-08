<script lang="ts">
	import { untrack } from 'svelte';
	import { holdDeployReload } from '$lib/shell/deploy-safety';
	import type { ClassroomSection } from '$lib/classroom/classroom';
	import FileUploadPanel from '$lib/classroom/FileUploadPanel.svelte';
	import type { UploadedFileRow } from '$lib/classroom/file-upload';
	import { createDropController, type DragLikeEvent } from '$lib/file-drop';
	import { formatCap } from '$lib/classroom/upload-errors';
	import {
		QUICK_POST_DEFAULT_PRESET,
		QUICK_POST_LEGACY_MAX_CHARS,
		QUICK_POST_PRESETS,
		quickPostPresetHint,
		quickPostSendCheck,
		quickPostSendLabel,
		quickPostRefusalWords,
		quickPostTargets,
		type QuickPostCreateResult,
		type QuickPostFile,
		type QuickPostLimits,
		type QuickPostPresetId,
		type QuickPostTargetMode,
		type QuickPostTransports
	} from '$lib/classroom/quick-posts';
	import { SCHOOL_LOCALE } from '$lib/classroom/school-calendar';

	/**
	 * WRITING A QUICK POST (ledger 0360, report R22), IN AS FEW ACTIONS AS IT CAN
	 * TAKE: the header's Quick post key opens this with the box focused, the
	 * defaults are THIS class until the END OF THE SCHOOL DAY, and Post (or
	 * Ctrl+Enter) sends it. Every other choice is one press: another end, "All
	 * my classes", or a hand-picked set.
	 *
	 * EACH END SAYS WHAT IT MEANS RIGHT NOW beside its label ("3:00 PM today"),
	 * from the same clock-injected function that resolves it, so the words on
	 * the key and the instant the database stores cannot disagree.
	 *
	 * ONE PREDICATE DRIVES POST (`quickPostSendCheck`): its `aria-disabled` and
	 * its handler read the same answer, and a press while it is not ready says
	 * why in words instead of doing nothing. A refusal from the database renders
	 * here verbatim, in the same line.
	 *
	 * WRITING IN THE BOX HOLDS A DEPLOY RELOAD (`holdDeployReload`), the rule
	 * every surface holding unsent work follows: a new version of the site must
	 * not arrive in the middle of a notice somebody is typing -- and so do staged
	 * files, which are `File` handles in this tab's memory and nowhere else.
	 *
	 * FILES (0233, ledger 0368, report R04). Offered only where the database
	 * says files are possible (`limits.filesReady`) AND an upload transport was
	 * handed in: absence removes the picker. Post creates the notice FIRST (the
	 * files' key names it), then uploads every staged file through the
	 * classroom's one upload panel, in order. A file that does not land stays
	 * staged with its own sentence and its own Retry, the composer stays open as
	 * "Posted. N files did not attach", and "Attach the rest" sends them to the
	 * SAME notice -- never a second post. "Close without them" takes two presses,
	 * because it lets go of files that exist nowhere else.
	 */
	let {
		sections,
		currentSectionId,
		viewerEmail = null,
		create,
		oncreated,
		oncancel,
		onfiles = null,
		uploadFile = null,
		limits = null,
		clock = () => Date.now()
	}: {
		/** The sections the page already loaded for this manager. */
		sections: ClassroomSection[];
		currentSectionId: string;
		/** Whose classes "All my classes" means (by `teacher_email`). */
		viewerEmail?: string | null;
		create: QuickPostTransports['create'];
		/**
		 * Told once, after the database said yes, with the body it was sent and
		 * how many files are about to be uploaded onto it (0 closes it here).
		 */
		oncreated: (result: Extract<QuickPostCreateResult, { ok: true }>, body: string, filesPending: number) => void;
		oncancel: () => void;
		/**
		 * Told after every upload pass: the files that landed in it and how many
		 * are still not attached. Zero left is the composer's job done.
		 */
		onfiles?: ((postId: string, landed: QuickPostFile[], left: number) => void) | null;
		/** The upload, through the board's transports. Absent: no picker at all. */
		uploadFile?: QuickPostTransports['uploadFile'] | null;
		/** What the database takes (`quickPostLimits` of the board). */
		limits?: (QuickPostLimits & { filesReady: boolean }) | null;
		/** The clock the ends are resolved against; a test pins it. */
		clock?: () => number;
	} = $props();

	let body = $state('');
	let preset = $state<QuickPostPresetId>(QUICK_POST_DEFAULT_PRESET);
	let custom = $state('');
	let mode = $state<QuickPostTargetMode>('this');
	// svelte-ignore state_referenced_locally
	let chosen = $state<string[]>([currentSectionId]);
	let busy = $state(false);
	let refusal = $state<string | null>(null);
	let discardArmed = $state(false);
	let textEl = $state<HTMLTextAreaElement | null>(null);
	const uid = $props.id();

	/** The ceiling this database enforces: 0233's, or 0230's on an older one. */
	const maxChars = $derived(limits?.maxChars ?? QUICK_POST_LEGACY_MAX_CHARS);
	const maxFiles = $derived(limits?.maxFiles ?? 0);
	/** Files are offered only where the database and the transports both allow them. */
	const filesOn = $derived(!!uploadFile && !!limits?.filesReady && maxFiles > 0);
	let panel = $state<ReturnType<typeof FileUploadPanel> | null>(null);
	let staged = $state(0);
	/** The notice already posted, while its files are still going on (or did not). */
	let postedId = $state<string | null>(null);
	let uploading = $state(false);
	let failedLines = $state<string[]>([]);
	let closeArmed = $state(false);
	/** The files that landed in the current pass, in order. */
	let landed: QuickPostFile[] = [];
	/**
	 * How many files are already ON the posted notice. Every one came through
	 * this composer, so this is the whole count, and the cap below adds it to
	 * what is still staged: a file staged after the notice was posted counts
	 * against the same ten as the ones already on it.
	 */
	let onNotice = $state(0);

	function onUploaded(row: UploadedFileRow | undefined) {
		if (!row?.id || !row.filename) return;
		const file: QuickPostFile = { id: row.id, filename: row.filename, size_bytes: row.size_bytes ?? null };
		onNotice += 1;
		if (uploading) {
			landed.push(file);
			return;
		}
		// A row's own Retry, outside a pass: report it the moment the panel has
		// taken the row off its list (it does that just after telling us).
		const postId = postedId;
		if (!postId) return;
		queueMicrotask(() => {
			staged = panel?.count() ?? 0;
			onfiles?.(postId, [file], staged);
		});
	}

	/**
	 * Upload every staged file onto the posted notice, and report the pass.
	 * Called once after Post and again by "Attach the rest", always against the
	 * same notice: a retry never makes a second post.
	 */
	async function attach(postId: string) {
		if (!panel || uploading || tooManyFiles) return;
		uploading = true;
		landed = [];
		try {
			const failures = await panel.runAll(postId);
			failedLines = failures;
			const left = panel.count();
			onfiles?.(postId, [...landed], left);
			closeArmed = false;
		} finally {
			uploading = false;
		}
	}

	/** The resolved hints move with the clock while the box is open; no network. */
	// svelte-ignore state_referenced_locally
	let nowMs = $state(clock());
	$effect(() => {
		const read = clock;
		const timer = setInterval(() => {
			nowMs = untrack(() => read());
		}, 30_000);
		return () => clearInterval(timer);
	});

	const targets = $derived(quickPostTargets(sections, viewerEmail, currentSectionId));
	/** "All my classes" only when it means more than this class. */
	const offerMine = $derived(
		targets.mine.length > 1 || (targets.mine.length === 1 && targets.mine[0].id !== currentSectionId)
	);
	const offerChoose = $derived(targets.choices.length > 1);
	const sectionIds = $derived(
		mode === 'mine' ? targets.mine.map((t) => t.id) : mode === 'choose' ? chosen : [currentSectionId]
	);
	const check = $derived(quickPostSendCheck({ body, preset, custom, sectionIds }, nowMs, maxChars));
	const count = $derived(new Set(sectionIds).size);
	const tooLong = $derived(body.trim().length > maxChars);
	/** ONE PREDICATE for Post, Attach the rest and the sentence under the panel. */
	const tooManyFiles = $derived(filesOn && staged + onNotice > maxFiles);

	// An autofocus keyed on the ELEMENT, not on mount (CLAUDE.md).
	$effect(() => {
		textEl?.focus();
	});

	$effect(() => {
		if (body.trim() === '' && staged === 0 && !uploading) return;
		return holdDeployReload('an unsaved quick post', { warnOnUnload: true });
	});

	/**
	 * A FILE LET GO ANYWHERE ON THIS CARD IS STAGED HERE, not handed to the class
	 * page underneath (whose own drop opens New post). The upload panel takes a
	 * drop on itself and says so (`defaultPrevented`); this takes the rest of the
	 * card, the box included, the class page's own pattern. Off without files.
	 * ON DURING AN UPLOAD TOO: the panel's own zone is off while it runs, so a
	 * file let go here then would otherwise fall through to the class page and
	 * open New post. `runAll` keeps a file added mid-pass staged (it is not in
	 * the batch), so it waits for Attach the rest.
	 */
	function composerDrop(node: HTMLElement, initial: { enabled: boolean }) {
		let enabled = initial.enabled;
		const controller = createDropController({ onfiles: (files) => panel?.add(files) });
		const asDrag = (e: Event) => e as unknown as DragLikeEvent;
		const onEnter = (e: Event) => {
			if (enabled && !e.defaultPrevented) controller.dragEnter(asDrag(e));
		};
		const onOver = (e: Event) => {
			if (enabled && !e.defaultPrevented) controller.dragOver(asDrag(e));
		};
		const onLeave = () => {
			if (enabled) controller.dragLeave();
		};
		const onDrop = (e: Event) => {
			if (enabled && !e.defaultPrevented) void controller.drop(asDrag(e));
		};
		node.addEventListener('dragenter', onEnter);
		node.addEventListener('dragover', onOver);
		node.addEventListener('dragleave', onLeave);
		node.addEventListener('drop', onDrop);
		return {
			update(next: { enabled: boolean }) {
				enabled = next.enabled;
			},
			destroy() {
				node.removeEventListener('dragenter', onEnter);
				node.removeEventListener('dragover', onOver);
				node.removeEventListener('dragleave', onLeave);
				node.removeEventListener('drop', onDrop);
			}
		};
	}

	function toggleChosen(id: string, on: boolean) {
		chosen = on ? [...new Set([...chosen, id])] : chosen.filter((x) => x !== id);
	}

	async function post() {
		if (busy || postedId) return;
		nowMs = clock();
		const c = quickPostSendCheck({ body, preset, custom, sectionIds }, nowMs, maxChars);
		if (!c.ok) {
			refusal = c.reason;
			return;
		}
		if (tooManyFiles) {
			refusal = quickPostRefusalWords('too_many_files', maxFiles);
			return;
		}
		busy = true;
		refusal = null;
		let created: Extract<QuickPostCreateResult, { ok: true }> | null = null;
		try {
			const res = await create(c.sectionIds, c.body, c.expiresAt);
			if (!res.ok) {
				refusal = res.message;
				return;
			}
			created = res;
		} catch {
			refusal = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = false;
		}
		if (!created) return;
		body = '';
		const pending = filesOn ? staged : 0;
		oncreated(created, c.body, pending);
		if (pending > 0) {
			postedId = created.id;
			await attach(created.id);
		}
	}

	function cancel() {
		if (postedId) {
			// Posted, with files still not attached: letting go of them is the
			// second press, because they exist nowhere but this tab.
			if (staged > 0 && !closeArmed) {
				closeArmed = true;
				return;
			}
			panel?.clear();
			oncancel();
			return;
		}
		if ((body.trim() !== '' || staged > 0) && !discardArmed) {
			discardArmed = true;
			return;
		}
		body = '';
		panel?.clear();
		oncancel();
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			void post();
		}
	}
</script>

<div
	class="card qp-compose"
	role="group"
	aria-label="Quick post"
	data-testid="quick-post-composer"
	use:composerDrop={{ enabled: filesOn }}
>
	{#if postedId}
		<!-- POSTED; ITS FILES ARE THE ONLY THING LEFT. The words say what landed
		     and what did not, the panel below keeps each file that did not with
		     its own sentence and Retry, and nothing here can make a second post. -->
		<p class="qp-posted" role="status" data-testid="quick-post-posted">
			{#if uploading}
				Posted. Attaching the files now.
			{:else if staged > 0}
				Posted. {staged === 1 ? '1 file did not attach' : `${staged} files did not attach`}. They are still here.
			{:else}
				Posted, with every file attached.
			{/if}
		</p>
	{:else}
	<label class="qp-field">
		<span class="qp-label">Quick post</span>
		<textarea
			bind:this={textEl}
			bind:value={body}
			class="qp-text"
			rows="3"
			placeholder="A schedule change, a link, a reminder"
			aria-describedby={`${uid}-count`}
			data-testid="quick-post-text"
			oninput={() => {
				refusal = null;
				discardArmed = false;
			}}
			onkeydown={keydown}
		></textarea>
	</label>
	<p class="qp-hint" id={`${uid}-count`} class:over={tooLong} data-testid="quick-post-count">
		{body.trim().length.toLocaleString(SCHOOL_LOCALE)} of {maxChars.toLocaleString(SCHOOL_LOCALE)}
		characters. Links become buttons. Ctrl+Enter posts.
	</p>

	<div class="qp-choice" role="group" aria-label="Show until" data-testid="quick-post-presets">
		<span class="qp-label">Show until</span>
		<div class="qp-keys">
			{#each QUICK_POST_PRESETS as p (p.id)}
				<button
					type="button"
					class="btn secondary tiny qp-key"
					aria-pressed={preset === p.id}
					data-preset={p.id}
					data-testid="quick-post-preset"
					onclick={() => {
						preset = p.id;
						refusal = null;
					}}
				>
					<span class="qp-key-word">{p.label}</span>
					<span class="qp-key-hint">{quickPostPresetHint(p.id, nowMs)}</span>
				</button>
			{/each}
		</div>
		{#if preset === 'custom'}
			<label class="qp-when">
				<span class="qp-label">Date and time, school time (Pacific)</span>
				<input
					type="datetime-local"
					class="qp-input"
					bind:value={custom}
					data-testid="quick-post-custom"
					oninput={() => (refusal = null)}
				/>
			</label>
		{/if}
	</div>

	{#if offerMine || offerChoose}
		<div class="qp-choice" role="group" aria-label="Post to" data-testid="quick-post-targets">
			<span class="qp-label">Post to</span>
			<div class="qp-keys">
				<button
					type="button"
					class="btn secondary tiny qp-key"
					aria-pressed={mode === 'this'}
					data-testid="quick-post-target-this"
					onclick={() => (mode = 'this')}>This class</button
				>
				{#if offerMine}
					<button
						type="button"
						class="btn secondary tiny qp-key"
						aria-pressed={mode === 'mine'}
						data-testid="quick-post-target-mine"
						onclick={() => (mode = 'mine')}>All my classes ({targets.mine.length})</button
					>
				{/if}
				{#if offerChoose}
					<button
						type="button"
						class="btn secondary tiny qp-key"
						aria-pressed={mode === 'choose'}
						data-testid="quick-post-target-choose"
						onclick={() => (mode = 'choose')}>Choose classes</button
					>
				{/if}
			</div>
			{#if mode === 'choose'}
				<ul class="qp-classes" data-testid="quick-post-classes">
					{#each targets.choices as t (t.id)}
						<li>
							<label class="qp-class">
								<input
									type="checkbox"
									checked={chosen.includes(t.id)}
									onchange={(e) => toggleChosen(t.id, e.currentTarget.checked)}
								/>
								<span>{t.label}</span>
							</label>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{/if}

	{#if filesOn}
		<!-- THE CLASSROOM'S ONE UPLOAD PANEL, role quick-post: staged here, and
		     uploaded onto the notice once Post has made it. No `accept`. -->
		<FileUploadPanel
			bind:this={panel}
			role="quick-post"
			itemId={postedId}
			upload={({ itemId, file, onProgress }) => uploadFile!(itemId, file, onProgress)}
			label="Pictures and files"
			hint={`Up to ${maxFiles} files, ${formatCap(limits?.maxBytes ?? 0)} each. Pictures open in a viewer the class can page through; other files download.`}
			autoStart={false}
			showPreviews
			onuploaded={onUploaded}
			oncountchange={(n) => (staged = n)}
		/>
		{#if tooManyFiles}
			<p class="qp-hint over" data-testid="quick-post-too-many">
				{quickPostRefusalWords('too_many_files', maxFiles)}
			</p>
		{/if}
	{/if}

	{#if postedId}
		{#if failedLines.length && !uploading}
			<ul class="qp-failed" data-testid="quick-post-failed">
				{#each failedLines as line, i (i)}<li>{line}</li>{/each}
			</ul>
		{/if}
		<div class="qp-send">
			{#if staged > 0}
				<button
					type="button"
					class="btn tiny qp-post"
					aria-disabled={uploading || tooManyFiles}
					data-testid="quick-post-attach-rest"
					onclick={() => postedId && void attach(postedId)}
				>
					{uploading ? 'Attaching' : 'Attach the rest'}
				</button>
			{/if}
			<button type="button" class="btn secondary tiny" data-testid="quick-post-cancel" onclick={cancel}>
				{staged > 0 ? (closeArmed ? 'Close, and leave these files off' : 'Close without them') : 'Close'}
			</button>
		</div>
	{:else}
	<div class="qp-send">
		<button
			type="button"
			class="btn tiny qp-post"
			aria-disabled={!check.ok || busy || tooManyFiles}
			data-testid="quick-post-send"
			onclick={() => void post()}
		>
			{busy ? 'Posting' : quickPostSendLabel(count)}
		</button>
		<button type="button" class="btn secondary tiny" data-testid="quick-post-cancel" onclick={cancel}>
			{discardArmed ? 'Discard what you wrote' : 'Cancel'}
		</button>
	</div>
	{/if}
	{#if refusal}
		<p class="qp-refusal" role="alert" data-testid="quick-post-refusal">{refusal}</p>
	{/if}
</div>

<style>
	.qp-compose {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		padding: var(--space-3);
		min-width: 0;
	}
	.qp-field,
	.qp-when {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.qp-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-1);
	}
	.qp-text,
	.qp-input {
		box-sizing: border-box;
		width: 100%;
		min-height: 44px;
		padding: var(--space-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
		background: var(--surface-0, var(--bg0));
		color: var(--text-1);
		font: inherit;
		font-family: var(--font-display);
		font-size: 1rem;
	}
	.qp-text {
		resize: vertical;
		line-height: 1.4;
	}
	.qp-text:focus-visible,
	.qp-input:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.qp-hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.qp-hint.over {
		color: var(--text-1);
		font-weight: 600;
	}
	.qp-choice {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.qp-keys {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-width: 0;
	}
	.qp-compose :global(.btn.tiny) {
		font-size: 0.6875rem;
	}
	.qp-key {
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 0.1rem;
		max-width: 100%;
		text-align: left;
	}
	.qp-key-word {
		white-space: normal;
	}
	.qp-key-hint {
		font-size: 0.75rem;
		letter-spacing: 0.02em;
		text-transform: none;
		opacity: 1;
	}
	.qp-classes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.qp-class {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 44px;
		color: var(--text-1);
		cursor: pointer;
	}
	.qp-class input {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
	}
	.qp-send {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}
	.qp-post[aria-disabled='true'] {
		cursor: not-allowed;
	}
	.qp-refusal {
		margin: 0;
		padding-left: 0.5rem;
		border-left: 3px solid var(--amber);
		color: var(--text-1);
	}
	.qp-posted {
		margin: 0;
		color: var(--text-1);
		font-weight: 600;
	}
	.qp-failed {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--text-1);
		font-size: 0.85rem;
	}
</style>
