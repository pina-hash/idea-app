<script lang="ts">
	/**
	 * THE REVIEWER'S HALF: what is in the bundle, what the bytes say, and the
	 * decision.
	 *
	 * IT SHOWS THE BYTES THAT ARE STORED, NOT THE UPLOAD. The student handed over
	 * an archive; `foundry-ingest` decided what came out of it -- a wrapper
	 * directory stripped, OS noise dropped, ignored extensions removed -- and
	 * what a viewer will actually run is the result. A reviewer reading the
	 * upload would be reviewing something nobody will execute. So the tree comes
	 * from `student_app_files`, which IS the proxy's allowlist, and the source
	 * comes from `foundry-bundles`, which is where the proxy reads.
	 *
	 * ABSENCE IS THE MECHANISM, one control at a time. No `listFiles`, no tree.
	 * No `readFile`, no source viewer. No `decide`, no decision form. No
	 * `saveField`, no metadata editor. A read-only mounting of this component is
	 * therefore structural rather than a flag, and the dev harness gets exactly
	 * the controls it hands transports for.
	 *
	 * THE ADMIN'S SINGLE-APP TOOLS ALL LIVE HERE, AND THAT IS WHY THE METADATA
	 * EDITOR IS HERE TOO.
	 *
	 * `foundry_update_app_metadata` has admitted `is_admin()` in its own body
	 * since 0130 -- the database half of an admin edit has existed all along and
	 * only the control was missing. This is where it goes, because this is
	 * already the one place staff act on ONE app: clear its flag, shelve it,
	 * restore it, delete it. A second admin editor somewhere else would be a
	 * second list of field names and limits to keep in step with the whitelist
	 * inside that RPC, so the fields come from `FOUNDRY_METADATA_FIELDS` -- the
	 * SAME registry `/foundry/mine` renders for the owner.
	 *
	 * WHICH ALSO MEANS THE ADMIN EDITS EXACTLY WHAT THE OWNER EDITS, including
	 * the build notes. That is the RPC's whitelist, not a choice made here, and
	 * it is the right side to err on: the reason staff need this at all is to
	 * take something inappropriate off a published page without deleting a
	 * student's work, and a field list that stopped short of one of them would
	 * leave exactly that case with no answer but deletion.
	 *
	 * A HIDDEN APP IS REFUSED BY THE RPC FOR EVERYONE, an admin included, so no
	 * control is drawn for one -- and the reason is stated where the control
	 * would have been, because a panel that is simply missing reads as a bug.
	 */
	import { untrack } from 'svelte';
	import { foundryDownloadUrl } from './bundle-url.ts';
	import ForgeStatus from './ForgeStatus.svelte';
	import FoundryPlayStats from './FoundryPlayStats.svelte';
	import { formatBytes } from './preflight.ts';
	import {
		FOUNDRY_REJECT_REASONS,
		buildFileTree,
		metadataDrift,
		reviewBlockedBecause,
		reviewCanSend,
		type FoundryDecision,
		type FoundryTreeNode
	} from './review.ts';
	import {
		FOUNDRY_METADATA_FIELDS,
		deleteAppCostLine,
		metadataIsLive
	} from './surface.ts';
	import type {
		FoundryApp,
		FoundryBundleFileRow,
		FoundryReviewTransports,
		FoundryVersion
	} from './transports.ts';

	let {
		app,
		version,
		transports = {},
		coverUrl = (path: string) => path,
		onDecided,
		onDeleted
	}: {
		app: FoundryApp;
		/** Turns a stored cover path into a URL. Injected, never built here. */
		coverUrl?: (path: string) => string;
		/** The version being decided about. */
		version: FoundryVersion;
		transports?: FoundryReviewTransports;
		onDecided?: () => void;
		/**
		 * The app no longer exists, so there is nothing left to be looking at.
		 * Distinct from `onDecided`, which re-reads the app: re-reading a
		 * deleted one asks the server about a row that has just been removed.
		 */
		onDeleted?: () => void;
	} = $props();

	let files = $state<FoundryBundleFileRow[]>([]);
	let filesProblem = $state<string | null>(null);
	let loadingFiles = $state(false);

	let openPath = $state<string | null>(null);
	let source = $state<{ path: string; text: string; byteSize: number } | null>(null);
	let sourceProblem = $state<string | null>(null);
	let loadingSource = $state(false);

	let decision = $state<FoundryDecision | null>(null);
	let note = $state('');
	let reasonId = $state<string | null>(null);
	let sending = $state(false);
	let sendProblem = $state<string | null>(null);
	let sentAt = $state<string | null>(null);

	const tree = $derived(buildFileTree(files));
	const drift = $derived(metadataDrift(app));
	const blocked = $derived(reviewBlockedBecause({ decision, note, reasonId }));
	const canSend = $derived(reviewCanSend({ decision, note, reasonId }));

	/**
	 * THE FILE LIST RELOADS WHEN THE VERSION CHANGES, and every piece of state
	 * that belongs to the previous version is cleared with it -- an open source
	 * file, a half-typed note, a chosen decision.
	 *
	 * Only `version.id` is read tracked, which is the one thing that should
	 * re-run it, and TWO independent reasons make that necessary rather than one.
	 *
	 * The body WRITES `files`, `openPath` and the rest, so reading any of them
	 * inside a tracked effect would take a dependency on state the effect itself
	 * moves. That much was already written down here, and it stops one step
	 * short: it accounts only for what THIS file reads, and never asks what
	 * `listFiles` reads.
	 *
	 * `listFiles` is INJECTED -- written by whoever mounts this component, who
	 * cannot see this effect -- so everything it touches reactively before its
	 * first `await` joins this effect's dependency set too, and anything it
	 * writes re-triggers the effect. A harness transport that merely read a
	 * fixture array and appended a log line is already a non-terminating loop.
	 * So the CALL is untracked, which is what this comment previously claimed
	 * was already happening while no `untrack` was anywhere in the body. See the
	 * injected-callback rule in CLAUDE.md.
	 */
	$effect(() => {
		const id = version.id;
		files = [];
		filesProblem = null;
		openPath = null;
		source = null;
		sourceProblem = null;
		decision = null;
		note = '';
		reasonId = null;
		sendProblem = null;
		sentAt = null;
		const listFiles = transports.listFiles;
		if (!listFiles) return;
		loadingFiles = true;
		untrack(() => listFiles(id))
			.then((r) => {
				// The version may have moved on while this was in flight. Answering
				// a stale request into the current state is how a reviewer ends up
				// reading another submission's file list under this one's title.
				if (version.id !== id) return;
				if (r.ok) files = r.files;
				else filesProblem = r.message;
			})
			.catch((e: unknown) => {
				if (version.id !== id) return;
				filesProblem = e instanceof Error ? e.message : 'The file list could not be read.';
			})
			.finally(() => {
				if (version.id === id) loadingFiles = false;
			});
	});

	async function open(path: string) {
		if (!transports.readFile) return;
		openPath = path;
		source = null;
		sourceProblem = null;
		loadingSource = true;
		try {
			const r = await transports.readFile(version.id, path);
			if (openPath !== path) return;
			if (r.ok) source = { path: r.path, text: r.text, byteSize: r.byteSize };
			else sourceProblem = r.message;
		} catch (e) {
			if (openPath !== path) return;
			sourceProblem = e instanceof Error ? e.message : 'That file could not be read.';
		} finally {
			if (openPath === path) loadingSource = false;
		}
	}

	async function send() {
		if (!transports.decide || !decision || !canSend || sending) return;
		sending = true;
		sendProblem = null;
		try {
			const r = await transports.decide({
				versionId: version.id,
				decision,
				note: note.trim(),
				reasonId: decision === 'reject' ? reasonId : null
			});
			if (!r.ok) {
				sendProblem = r.message;
				return;
			}
			// The ACKNOWLEDGEMENT, with the clock time of the write -- never the
			// dispatch. A status set beside the call says a request was made.
			sentAt = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
			onDecided?.();
		} catch (e) {
			sendProblem = e instanceof Error ? e.message : 'That decision did not go through.';
		} finally {
			sending = false;
		}
	}

	async function clearFlag() {
		if (!transports.clearMetadataFlag) return;
		sendProblem = null;
		try {
			const r = await transports.clearMetadataFlag(app.id);
			if (!r.ok) sendProblem = r.message;
			else onDecided?.();
		} catch (e) {
			sendProblem = e instanceof Error ? e.message : 'That did not work.';
		}
	}

	/* --------------------------------------------------------- taking it off
	 *
	 * HIDE AND DELETE ARE TWO DECISIONS AND THE PANEL SAYS SO IN WORDS. They
	 * are separate transports rather than one call with a flag for exactly that
	 * reason: a single "remove" control with a mode picker is how a reviewer
	 * ends up destroying something they meant to shelve for a week.
	 *
	 * BOTH ARM BEFORE THEY FIRE, and the delete's confirm names the app. Hide
	 * is reversible and still arms, because a hidden app is off the gallery
	 * immediately and a student notices within the hour.
	 */

	let armed = $state<'hide' | 'restore' | 'delete' | null>(null);
	let hideReason = $state('');
	let shelfBusy = $state(false);
	let shelfProblem = $state<string | null>(null);
	let shelfNote = $state<string | null>(null);

	async function shelf(work: () => Promise<{ ok: boolean; message?: string }>, said: string) {
		if (shelfBusy) return false;
		shelfBusy = true;
		shelfProblem = null;
		shelfNote = null;
		try {
			const r = await work();
			if (!r.ok) {
				shelfProblem = r.message ?? 'That did not work.';
				return false;
			}
			shelfNote = said;
			return true;
		} catch (e) {
			shelfProblem = e instanceof Error ? e.message : 'That did not work.';
			return false;
		} finally {
			shelfBusy = false;
		}
	}

	async function setHidden(hidden: boolean) {
		if (!transports.setHidden) return;
		const ok = await shelf(
			() => transports.setHidden!(app.id, hidden, hideReason.trim()),
			hidden ? 'Hidden. It is off the gallery and the files are kept.' : 'Restored.'
		);
		if (ok) {
			hideReason = '';
			onDecided?.();
		}
	}

	async function removeApp() {
		if (!transports.deleteApp) return;
		const title = app.title;
		const ok = await shelf(async () => {
			const r = await transports.deleteApp!(app.id);
			if (!r.ok) return r;
			// A PARTIAL OBJECT SWEEP IS NOT A FAILED DELETE. The rows are gone
			// before the sweep runs, so this rides the success.
			shelfNote = r.storageProblem
				? `"${title}" is deleted. ${r.storageProblem} Nothing on the site can reach them.`
				: `"${title}" is deleted.`;
			return { ok: true };
		}, `"${title}" is deleted.`);
		if (ok) onDeleted?.();
	}

	/* ------------------------------------------------- editing the metadata
	 *
	 * THE OWNER'S EDITOR, POINTED AT THE SAME RPC. Same field registry, same one
	 * field per call, same inline edit-and-save -- because it is the same act,
	 * and two spellings of "change an app's title" is how the two surfaces come
	 * to enforce different limits.
	 *
	 * ONE FIELD PER CALL IS THE RPC'S SHAPE AND IS WORTH KEEPING. A whole-row
	 * update would make `metadata_flagged_at` -- the flag whose entire job is to
	 * say the text drifted from what was approved -- unanswerable about which
	 * text moved, and would let a stale read silently revert somebody else's
	 * change.
	 */

	let editing = $state<string | null>(null);
	let draft = $state('');
	let metaBusy = $state(false);
	let metaProblem = $state<string | null>(null);
	let metaNote = $state<string | null>(null);

	/**
	 * A CHANGE OF APP CLEARS A HALF-TYPED EDIT. The queue keys this component on
	 * the slug so it normally remounts, but the reset is stated rather than
	 * rested on: a draft carried into another student's app is an edit made to
	 * the wrong work. Only `app.id` is read tracked; the body only writes.
	 */
	$effect(() => {
		void app.id;
		editing = null;
		draft = '';
		metaProblem = null;
		metaNote = null;
	});

	/** The app is on the gallery, so an edit is visible the moment it lands. */
	const metadataLive = $derived(metadataIsLive(app));

	function beginEdit(field: string, value: string) {
		editing = field;
		draft = value;
		metaProblem = null;
		metaNote = null;
	}

	/**
	 * Every metadata write goes through here, so the busy flag, the problem and
	 * the acknowledgement are one set rather than three copies. THE FLAG IS
	 * CLEARED IN `finally`: a throw mid-save would otherwise disable the whole
	 * panel until the page is reloaded.
	 */
	async function runMeta(
		work: () => Promise<{ ok: boolean; message?: string }>,
		said: string
	): Promise<boolean> {
		if (metaBusy) return false;
		metaBusy = true;
		metaProblem = null;
		metaNote = null;
		try {
			const r = await work();
			if (!r.ok) {
				// The RPC's own sentence. It is already written for a person to
				// read, so replacing it with a generic one would say less.
				metaProblem = r.message ?? 'That did not save.';
				return false;
			}
			// THE ACKNOWLEDGEMENT CARRIES THE CLOCK TIME OF THE WRITE, never the
			// dispatch: a status set beside the call says a request was made,
			// which is not what the reader is asking.
			metaNote = `${said} at ${new Date().toLocaleTimeString([], {
				hour: 'numeric',
				minute: '2-digit'
			})}.`;
			return true;
		} catch (e) {
			metaProblem = e instanceof Error ? e.message : 'That did not save.';
			return false;
		} finally {
			metaBusy = false;
		}
	}

	async function saveEdit(field: string) {
		if (!transports.saveField) return;
		const value = draft;
		const ok = await runMeta(() => transports.saveField!(app.id, field, value), 'Saved');
		if (ok) {
			editing = null;
			// Re-read, so the panel and the student page beside it both show what
			// actually landed rather than what was typed.
			onDecided?.();
		}
	}

	async function replaceCover(file: File) {
		if (!transports.uploadCover || !transports.saveField) return;
		const ok = await runMeta(async () => {
			const up = await transports.uploadCover!(file);
			if (!up.ok) return up;
			return transports.saveField!(app.id, 'cover_path', up.path);
		}, 'Cover replaced');
		if (ok) onDecided?.();
	}

	function stamp(iso: string | null): string {
		if (!iso) return 'unknown';
		return new Date(iso).toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

{#snippet treeNodes(nodes: FoundryTreeNode[], depth: number)}
	<ul class="fdy-tree" style="--depth: {depth}">
		{#each nodes as node (node.path)}
			<li>
				{#if node.kind === 'dir'}
					<span class="fdy-tree-dir">
						<span class="fdy-tree-name">{node.name}/</span>
						<span class="fdy-tree-size">{formatBytes(node.byteSize)}</span>
					</span>
					{@render treeNodes(node.children, depth + 1)}
				{:else}
					<button
						type="button"
						class="fdy-tree-file tap-44"
						class:open={openPath === node.path}
						data-path={node.path}
						onclick={() => open(node.path)}
						disabled={!transports.readFile}
					>
						<span class="fdy-tree-name">{node.name}</span>
						<span class="fdy-tree-size">{formatBytes(node.byteSize)}</span>
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<div class="fdy-insp" data-testid="foundry-inspector">
	<header class="fdy-insp-head">
		<h3>Reviewing build {version.ordinal}</h3>
		<p class="fdy-insp-meta">
			{version.file_count}
			{version.file_count === 1 ? 'file' : 'files'}, {formatBytes(version.byte_size)}, uploaded {stamp(
				version.created_at
			)}
		</p>
		<!--
			THE STAFF COPY, AND IT IS IN THE INSPECTOR RATHER THAN IN
			`FoundryDetail` FOR THE REASON THAT COMPONENT'S WHOLE DESIGN RESTS ON.
			The gallery, the detail view and the review queue are ONE render path
			and `FoundryDetail` has no staff branch in it, so "what does a student
			see" stays answerable by reading that one file straight through. An
			admin-only control belongs in the column BESIDE it, which is this.

			WHAT ARRIVES IS THE STORED BUNDLE, the same bytes the tree below lists
			and the same bytes the frame runs -- not the archive the student
			uploaded, which contains files nothing serves. It is the source viewer's
			argument applied to the whole version at once: a reviewer who wants to
			open the thing in an editor should be opening what executes.

			THE ROUTE IS THE BOUNDARY, not this condition. `previewViewerMayRun`
			admits an admin to any app including a shelved one; `foundryDownloadable`
			is the OWNER's view of that gate, so it refuses a hidden app -- which is
			why the control is drawn from the flag rather than from the predicate
			here, and the empty-bundle clause is spelled out instead.
		-->
		{#if version.file_count > 0}
			{@const downloadHref = foundryDownloadUrl(app.id, version.id)}
			{#if downloadHref}
				<p class="fdy-insp-get">
					<a class="btn tap-44" href={downloadHref} download>
						Download this build
					</a>
				</p>
			{/if}
		{/if}
	</header>

	{#if drift}
		<!--
			THE METADATA FLAG. It says WHEN the drift started and which approval it
			drifted FROM -- and it does not claim to say which field moved, because
			nothing records that: `metadata_flagged_at` is a timestamp, there is no
			metadata history table, and the version manifest carries build facts
			only. Inventing a diff here would be a confident sentence with nothing
			behind it. The reviewer reads the text on the page beside the running
			build, which is what clearing the flag means anyway.
		-->
		<section class="fdy-flag" data-testid="foundry-metadata-flag">
			<h4>The text around this app changed after it was approved</h4>
			<p>
				First unreviewed edit {stamp(drift.flaggedAt)}{drift.approvedAt
					? `, against the build approved ${stamp(drift.approvedAt)}`
					: ''}.
			</p>
			<p class="fdy-flag-fields">
				One or more of these moved: {drift.fields.join(', ')}. Which one is not recorded, so read
				them on the page beside this.
			</p>
			{#if transports.clearMetadataFlag}
				<button type="button" class="btn tap-44" onclick={clearFlag}>
					I have read it, clear the flag
				</button>
			{/if}
		</section>
	{/if}

	{#if transports.listFiles}
		<section class="fdy-insp-section">
			<h4>Files in the stored bundle</h4>
			<p class="fdy-insp-note">
				These are the bytes in storage, not the archive that was uploaded.
			</p>
			{#if loadingFiles}
				<p class="fdy-insp-note">Reading...</p>
			{:else if filesProblem}
				<p class="fdy-insp-problem" role="alert">{filesProblem}</p>
			{:else if files.length === 0}
				<p class="fdy-insp-problem">This version has no files in storage.</p>
			{:else}
				{@render treeNodes(tree, 0)}
			{/if}
		</section>

		<section class="fdy-insp-section fdy-source-section">
			<h4>Source</h4>
			{#if !openPath}
				<p class="fdy-insp-note">Pick a file to read it.</p>
			{:else if loadingSource}
				<p class="fdy-insp-note">Reading {openPath}...</p>
			{:else if sourceProblem}
				<p class="fdy-insp-problem" role="alert">{sourceProblem}</p>
			{:else if source}
				<p class="fdy-insp-note">{source.path} &middot; {formatBytes(source.byteSize)}</p>
				<!--
					A <pre> holding a plain string. There is no highlighter, no
					{@html}, and nothing that parses what a student wrote: this is
					untrusted text being shown to an admin, and the only safe renderer
					for it is the one that escapes by construction.
				-->
				<pre class="fdy-source" data-testid="foundry-source">{source.text}</pre>
			{/if}
		</section>
	{/if}

	{#if transports.decide}
		<section class="fdy-insp-section fdy-decide">
			<h4>Decision</h4>
			<div class="fdy-choice" role="group" aria-label="Decision">
				<label class="fdy-radio tap-44">
					<input type="radio" name="fdy-decision" value="approve" bind:group={decision} />
					<span>Approve and publish</span>
				</label>
				<label class="fdy-radio tap-44">
					<input type="radio" name="fdy-decision" value="reject" bind:group={decision} />
					<span>Send back</span>
				</label>
			</div>

			{#if decision === 'reject'}
				<div class="fdy-reasons">
					<span class="fdy-label">Reason</span>
					{#each FOUNDRY_REJECT_REASONS as reason (reason.id)}
						<label class="fdy-radio tap-44">
							<input type="radio" name="fdy-reason" value={reason.id} bind:group={reasonId} />
							<span>
								<span class="fdy-reason-label">{reason.label}</span>
								<span class="fdy-reason-hint">{reason.hint}</span>
							</span>
						</label>
					{/each}
				</div>
			{/if}

			{#if decision}
				<label class="fdy-note-label">
					<span class="fdy-label">
						{decision === 'reject' ? 'What to change' : 'Note for the student (optional)'}
					</span>
					<textarea class="fdy-note" rows="4" bind:value={note}></textarea>
				</label>
			{/if}

			<div class="fdy-send-row">
				<!--
					`aria-disabled`, NOT `disabled`. A genuinely disabled control
					swallows pointer events, so the sentence explaining why it is off
					could never be reached from it. The handler refuses too, so the
					control is not merely styled as unavailable.
				-->
				<button
					type="button"
					class="btn fdy-send tap-44"
					aria-disabled={!canSend || sending}
					onclick={send}
				>
					{sending ? 'Sending...' : 'Send decision'}
				</button>
				{#if blocked}<span class="fdy-insp-note">{blocked}</span>{/if}
				{#if sentAt}<span class="fdy-sent">Sent at {sentAt}.</span>{/if}
			</div>
			{#if sendProblem}<p class="fdy-insp-problem" role="alert">{sendProblem}</p>{/if}
		</section>
	{/if}

	<!--
		FROM HERE DOWN IT IS THE APP, NOT THE BUILD. The decision above answers
		the version; everything below answers the thing the version belongs to,
		which is why these are their own sections rather than more controls in
		the decision form. A reviewer who has just rejected a build has not
		thereby said anything about the app.
	-->
	<section class="fdy-insp-section">
		<!--
			THE SAME COMPONENT /foundry/mine MOUNTS FOR THE AUTHOR, with the same
			four scalars, because `foundry_app_play_stats` answers the owner and an
			admin identically. Staff see MORE APPS, never more detail about one:
			there is no per-player read for any caller, so "which students played
			it" has no answer on this surface either.
		-->
		<FoundryPlayStats appId={app.id} load={transports.playStats} heading="h4" />
	</section>

	{#if transports.saveField}
		<section class="fdy-insp-section fdy-meta" data-testid="foundry-metadata-edit">
			<h4>The text on this app&rsquo;s page</h4>

			{#if app.hidden_at}
				<!--
					A CONTROL THAT IS ABSENT FOR A REASON SAYS THE REASON. 0130 refuses
					a metadata edit on a hidden app for EVERYONE, an admin included --
					it is not an oversight, it is that a hidden app is under discussion
					and editing the text of one is how the discussion loses its subject.
					A panel that simply vanished here would read as a bug in the console.
				-->
				<p class="fdy-insp-note">
					This app is hidden, so its text cannot be edited. Restore it below first.
				</p>
			{:else}
				<p class="fdy-insp-note">
					You are editing the student&rsquo;s own words. Change what has to change and leave the
					rest.
					{#if metadataLive}
						This app is live, so a save is on the gallery straight away.
					{/if}
				</p>

				{#if metaNote}<p class="fdy-meta-said" role="status">{metaNote}</p>{/if}
				{#if metaProblem}<p class="fdy-insp-problem" role="alert">{metaProblem}</p>{/if}

				{#each FOUNDRY_METADATA_FIELDS as f (f.field)}
					{@const current = String((app as unknown as Record<string, unknown>)[f.field] ?? '')}
					<div class="fdy-meta-row">
						<span class="fdy-label">{f.label}</span>
						{#if editing === f.field}
							{#if f.kind === 'text'}
								<textarea class="fdy-note" bind:value={draft} maxlength={f.max} rows="5"
								></textarea>
							{:else}
								<input class="fdy-meta-input tap-44" type="text" bind:value={draft} maxlength={f.max} />
							{/if}
							<div class="fdy-shelf-row">
								<button
									type="button"
									class="btn tap-44"
									disabled={metaBusy}
									onclick={() => saveEdit(f.field)}
								>
									{metaBusy ? 'Saving...' : 'Save'}
								</button>
								<button type="button" class="btn tap-44" onclick={() => (editing = null)}>
									Cancel
								</button>
							</div>
						{:else}
							<p class="fdy-meta-value" class:fdy-meta-empty={current === ''}>
								{current || 'Not set'}
							</p>
							<!--
								`tap-44`, not `tap-reach-44`: this control owns its row, so it
								can simply grow. A reach is for a control sitting inside a line
								of text, where growing would reflow the writing around it.
							-->
							<button
								type="button"
								class="btn tap-44"
								onclick={() => beginEdit(f.field, current)}
							>
								Edit
							</button>
						{/if}
					</div>
				{/each}

				{#if transports.uploadCover}
					<div class="fdy-meta-row">
						<span class="fdy-label">Cover</span>
						{#if app.cover_path}
							<!-- `scale-down`, never `cover`: a cropped preview hides the
							     cut-off edge, which is the whole thing a cover is for. -->
							<img class="fdy-meta-cover" src={coverUrl(app.cover_path)} alt="Current cover" />
						{:else}
							<p class="fdy-meta-value fdy-meta-empty">Not set</p>
						{/if}
						<label class="btn tap-44">
							{app.cover_path ? 'Replace' : 'Add'}
							<input
								type="file"
								accept="image/png,image/jpeg,image/webp"
								hidden
								onchange={async (e) => {
									const input = e.currentTarget as HTMLInputElement;
									const file = input.files?.[0];
									// Cleared BEFORE the await, so picking the same file again
									// after a failure still fires a change event.
									input.value = '';
									if (!file) return;
									await replaceCover(file);
								}}
							/>
						</label>
					</div>
				{/if}
			{/if}
		</section>
	{/if}

	{#if transports.setHidden || transports.deleteApp}
		<!--
			TAKING IT OFF THE GALLERY: the two ways, side by side, with the
			difference in words rather than in the reader's memory.

			THIS IS NOT A DECISION ABOUT THE BUILD. Approve and Send back answer
			the version above; these answer the APP, so they sit in their own
			section below the decision rather than as two more radio buttons in it.
			A reviewer who has just rejected a build has not thereby said anything
			about whether the app should exist.

			ForgeStatus IS THE CHIP, and both states already have a tone in the
			heat language: shelved for hidden, quenched for what is being removed.
			Neither wears heat, because heat means IN PROGRESS.
		-->
		<section class="fdy-insp-section fdy-shelf" data-testid="foundry-app-actions">
			<h4>Taking it off the gallery</h4>

			<dl class="fdy-shelf-diff">
				<div>
					<dt><ForgeStatus tone="shelved" word="Hide" /></dt>
					<dd>
						Shelved but kept. It comes off the gallery and stops serving straight away, the
						student keeps every version and every file, and you can put it back with Restore.
						Use this while something is being sorted out.
					</dd>
				</div>
				<div>
					<dt><ForgeStatus tone="refused" word="Delete" /></dt>
					<dd>
						Gone. The app, every version and every stored file are removed and there is
						nothing to restore from. Use this only when the work should not exist.
					</dd>
				</div>
			</dl>

			{#if shelfNote}<p class="fdy-shelf-said" role="status">{shelfNote}</p>{/if}
			{#if shelfProblem}<p class="fdy-insp-problem" role="alert">{shelfProblem}</p>{/if}

			{#if transports.setHidden}
				{#if app.hidden_at}
					<p class="fdy-insp-note">
						This app is hidden. It is off the gallery and its files are still here.
					</p>
					{#if armed === 'restore'}
						<div class="fdy-shelf-row">
							<button
								type="button"
								class="btn tap-44"
								disabled={shelfBusy}
								onclick={async () => {
									armed = null;
									await setHidden(false);
								}}
							>
								Yes, put it back on the gallery
							</button>
							<button type="button" class="btn tap-44" onclick={() => (armed = null)}>
								Leave it hidden
							</button>
						</div>
					{:else}
						<button type="button" class="btn tap-44" onclick={() => (armed = 'restore')}>
							Restore
						</button>
					{/if}
				{:else if armed === 'hide'}
					<label class="fdy-note-label">
						<span class="fdy-label">Why (the student does not see this)</span>
						<textarea class="fdy-note" rows="2" bind:value={hideReason}></textarea>
					</label>
					<div class="fdy-shelf-row">
						<button
							type="button"
							class="btn fdy-shelve tap-44"
							disabled={shelfBusy}
							onclick={async () => {
								armed = null;
								await setHidden(true);
							}}
						>
							Yes, hide &ldquo;{app.title}&rdquo;
						</button>
						<button type="button" class="btn tap-44" onclick={() => (armed = null)}>
							Cancel
						</button>
					</div>
				{:else}
					<button type="button" class="btn tap-44" onclick={() => (armed = 'hide')}>
						Hide this app
					</button>
				{/if}
			{/if}

			{#if transports.deleteApp}
				<p class="fdy-shelf-cost">{deleteAppCostLine(app)}</p>
				{#if armed === 'delete'}
					<div class="fdy-shelf-row">
						<button
							type="button"
							class="btn fdy-danger tap-44"
							disabled={shelfBusy}
							onclick={async () => {
								armed = null;
								await removeApp();
							}}
						>
							Yes, delete &ldquo;{app.title}&rdquo; permanently
						</button>
						<button type="button" class="btn tap-44" onclick={() => (armed = null)}>
							Keep it
						</button>
					</div>
				{:else}
					<button
						type="button"
						class="btn fdy-danger-quiet tap-44"
						onclick={() => (armed = 'delete')}
					>
						Delete this app
					</button>
				{/if}
			{/if}
		</section>
	{/if}
</div>

<style>
	.fdy-insp {
		display: flex;
		flex-direction: column;
		gap: var(--space-4, 1rem);
		min-width: 0;
	}

	.fdy-insp-head h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
	}

	.fdy-insp-meta,
	.fdy-insp-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	/* The staff copy sits under the build's own meta line, on its own row, so
	   it is not competing with the decision controls further down. */
	.fdy-insp-get {
		margin: var(--space-2, 0.5rem) 0 0;
	}

	.fdy-insp-problem {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--crimson);
	}

	.fdy-insp-section {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}

	.fdy-insp-section h4,
	.fdy-flag h4 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}

	/* AMBER is the warning token, and the word beside it carries the meaning --
	   colour is never the only signal. */
	.fdy-flag {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		padding: var(--space-3, 0.75rem);
		border: 1px solid var(--amber);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-flag h4 {
		color: var(--amber);
	}

	.fdy-flag p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-1, var(--white));
	}

	.fdy-flag-fields {
		color: var(--text-2, var(--dim)) !important;
	}

	.fdy-tree {
		list-style: none;
		margin: 0;
		padding-left: calc(var(--depth) * 0.85rem);
		min-width: 0;
	}

	.fdy-tree-dir,
	.fdy-tree-file {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		min-height: 44px;
		align-items: center;
		padding: 0.2rem 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		text-align: left;
	}

	.fdy-tree-dir {
		color: var(--text-2, var(--dim));
	}

	.fdy-tree-file {
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm, 6px);
		color: var(--text-1, var(--white));
		cursor: pointer;
	}

	.fdy-tree-file:hover:not(:disabled),
	.fdy-tree-file:focus-visible {
		border-color: var(--boundary);
	}

	.fdy-tree-file.open {
		border-color: var(--green);
		color: var(--green);
	}

	.fdy-tree-name {
		overflow-wrap: anywhere;
	}

	.fdy-tree-size {
		flex: none;
		color: var(--text-2, var(--dim));
	}

	/* The source pane scrolls INSIDE its own box. A wide minified line must not
	   make the page itself scroll sideways. */
	.fdy-source {
		margin: 0;
		max-height: 32rem;
		overflow: auto;
		padding: var(--space-3, 0.75rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-md, 8px);
		background: var(--surface-2, var(--bg2));
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--text-1, var(--white));
		white-space: pre;
		tab-size: 2;
	}

	.fdy-choice,
	.fdy-reasons {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.fdy-radio {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		/* The floor is on the LABEL, which is what a finger actually hits. */
		min-height: 44px;
		padding: 0.35rem 0;
		cursor: pointer;
	}

	.fdy-radio input {
		margin-top: 0.35rem;
		flex: none;
	}

	.fdy-radio > span {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.fdy-reason-hint {
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-label {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}

	.fdy-note-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.fdy-note {
		width: 100%;
		min-width: 0;
		padding: 0.5rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 6px);
		background: var(--surface-2, var(--bg2));
		color: var(--text-1, var(--white));
		font-family: var(--font-display);
	}

	/* ---------------------------------------------- editing the app's text */

	.fdy-meta {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}

	/*
	   ONE COLUMN, ALWAYS. This panel lives inside the inspector column, which
	   measures 418px at a 1440px viewport and about 541px at 1920 -- so a
	   two-column label/value arrangement would be a breakpoint that never fires
	   at any width this surface is ever seen at. `/foundry/mine` puts its own
	   version of this row in columns because it has the whole page; this one
	   does not, and lowering the threshold would only produce two columns too
	   narrow to read.
	*/
	.fdy-meta-row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		padding: var(--space-2, 0.5rem) 0;
		border-top: 1px solid var(--hairline);
		min-width: 0;
	}

	.fdy-meta-value {
		margin: 0;
		/* The student's own words, rendered as text with their own line breaks
		   kept. There is no rich-text document here and no {@html} near it. */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--text-1, var(--white));
		min-width: 0;
	}

	/*
	   "Not set" is the ABSENCE of a value, not a value, so it takes the
	   secondary token -- `--text-2` rather than `--dim`, which clears only the
	   darkest of the three portal grounds.
	*/
	.fdy-meta-empty {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-meta-input {
		width: 100%;
		min-width: 0;
		padding: 0.5rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 6px);
		background: var(--surface-2, var(--bg2));
		color: var(--text-1, var(--white));
		font-family: var(--font-display);
	}

	.fdy-meta-cover {
		display: block;
		width: 100%;
		max-width: 100%;
		max-height: 9rem;
		object-fit: scale-down;
		object-position: left center;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 6px);
		background: var(--surface-1, var(--bg1));
	}

	.fdy-meta-said {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-2, var(--dim));
		max-width: 62ch;
	}

	/* ----------------------------------------------------- hide beside delete */

	.fdy-shelf {
		gap: var(--space-3, 0.75rem);
		padding: var(--space-3, 0.75rem);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		align-items: flex-start;
	}

	/*
	 * ONE COLUMN AT EVERY WIDTH, AND THAT IS MEASURED RATHER THAN CHOSEN.
	 *
	 * This was written as two columns above 34rem, on the reasoning that the
	 * panel exists to be COMPARED and a comparison reads best side by side. In
	 * a real browser the rule never fired: this panel sits in the inspector
	 * column, which is itself a fraction of the split's detail pane, so its
	 * inner width is 418px at a 1440px viewport and about 541px at 1920 -- both
	 * under the 544px the query asked for. It was dead code that no unused
	 * selector warning would have caught, which is the same mistake
	 * `.fdy-q-work` in ReviewQueue documents making at 58rem against the
	 * viewport figure.
	 *
	 * LOWERING THE THRESHOLD WAS THE REJECTED FIX. At 418px two columns are
	 * ~200px each, which is four or five words a line for a forty-word
	 * definition -- worse to compare than reading them in sequence. So the rule
	 * is gone rather than tuned, and the two definitions stack. If this panel
	 * ever gets a genuinely wide home, measure it there before adding one back.
	 */
	.fdy-shelf-diff {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-3, 0.75rem);
		margin: 0;
		width: 100%;
		min-width: 0;
	}

	.fdy-shelf-diff dt {
		margin: 0 0 0.3rem;
	}

	.fdy-shelf-diff dd {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.45;
		color: var(--text-2, var(--dim));
	}

	.fdy-shelf-row {
		display: flex;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
		align-items: center;
	}

	.fdy-shelf-cost {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.45;
		color: var(--text-1, var(--white));
		max-width: 62ch;
	}

	.fdy-shelf-said {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--fg-st-shelf-ink, var(--dim));
		max-width: 62ch;
		line-height: 1.5;
	}

	.fdy-shelve {
		border-color: var(--fg-st-shelf-edge, var(--boundary));
		color: var(--fg-st-shelf-ink, var(--text-2));
	}

	.fdy-danger {
		border-color: var(--crimson);
		color: var(--crimson);
	}

	/* Quiet at rest, crimson once it is one press from happening: `--crimson` is
	   reserved for live / rec / error status, and a resting Delete is none of
	   those. */
	.fdy-danger-quiet {
		border-color: var(--boundary);
		color: var(--text-2, var(--dim));
	}

	.fdy-danger-quiet:hover,
	.fdy-danger-quiet:focus-visible {
		border-color: var(--crimson);
		color: var(--crimson);
	}

	.fdy-send-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
	}

	.fdy-send[aria-disabled='true'] {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.fdy-sent {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--green);
	}
</style>
