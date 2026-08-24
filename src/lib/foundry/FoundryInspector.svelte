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
	 * No `readFile`, no source viewer. No `decide`, no decision form. A read-only
	 * mounting of this component is therefore structural rather than a flag, and
	 * the dev harness gets exactly the controls it hands transports for.
	 */
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
		onDecided
	}: {
		app: FoundryApp;
		/** The version being decided about. */
		version: FoundryVersion;
		transports?: FoundryReviewTransports;
		onDecided?: () => void;
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
	 * `untrack` is what keeps this from spinning: the body WRITES `files`,
	 * `openPath` and the rest, and reading any of them inside a tracked effect
	 * would take a dependency on state the effect itself moves. Only `version.id`
	 * is read tracked, which is the one thing that should re-run it.
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
		if (!transports.listFiles) return;
		loadingFiles = true;
		transports
			.listFiles(id)
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
