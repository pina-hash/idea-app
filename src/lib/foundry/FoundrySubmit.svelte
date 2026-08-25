<script lang="ts">
	/**
	 * THE SUBMIT SURFACE: everything an app needs, on one screen, before the row
	 * exists.
	 *
	 * CREATION COMPLETENESS (`IDEA_INTERFACE_STANDARDS` 4). Name, address,
	 * tagline, description, cover, how-it-was-built and the app itself are all
	 * staged here and land together. Nothing is deferred to "after the app
	 * exists" as a design choice.
	 *
	 * TWO THINGS GENUINELY CANNOT BE STAGED, and both are the documented
	 * exception rather than an oversight. The COVER needs a row to hang off:
	 * `foundry_create_app` takes no cover parameter, so it is uploaded and
	 * attached with `foundry_update_app_metadata` immediately after create, in
	 * the same action, with its own failure reported rather than swallowed. The
	 * BUNDLE is the multi-request ingest job the standard names explicitly:
	 * create the version, upload the zip, invoke the function.
	 *
	 * PREFLIGHT PASSING IS NOT SUBMISSION, and the surface has to make that
	 * legible rather than merely true. A pass leaves the version a DRAFT and
	 * says so; submitting for review is a SEPARATE, DELIBERATE PRESS -- offered
	 * right here once ingest succeeds, so the choice happens on the page the
	 * work was made on, and still available from /foundry/mine. A student who
	 * uploads and walks away has saved their work and queued nothing.
	 *
	 * NOTHING HERE RESTATES A RULE. The three input shapes are normalized by
	 * `./normalize.ts`, judged by `./preflight-browser.ts`, and worded by
	 * `./preflight.ts`. This component decides layout and order of operations
	 * and nothing else about what is legal.
	 */
	import { untrack } from 'svelte';

	import ForgeStatus from './ForgeStatus.svelte';
	import FoundryIssues from './FoundryIssues.svelte';
	import { filesFromDataTransfer, normalizeFoundryInput, type NormalizeResult } from './normalize.ts';
	import { preflightZipInBrowser, type BrowserPreflightResult } from './preflight-browser.ts';
	import { FOUNDRY_LIMITS, formatBytes, type FoundryIssue } from './preflight.ts';
	import { slugLooksOk, suggestSlug } from './surface.ts';
	import { FOUNDRY_STARTER_PATH } from './vendor.ts';
	import type { FoundrySubmitTransports, IngestOutcome } from './transports.ts';

	let {
		transports,
		/** Pre-selected app for the add-a-version path, by id. */
		initialAppId = null,
		onDone = null
	}: {
		transports: FoundrySubmitTransports;
		initialAppId?: string | null;
		onDone?: ((slug: string) => void) | null;
	} = $props();

	/* ------------------------------------------------------------ the file */

	type Phase = 'idle' | 'reading' | 'checking' | 'blocked' | 'ready' | 'sending' | 'done';

	let phase = $state<Phase>('idle');
	let normalized = $state<NormalizeResult | null>(null);
	let preflight = $state<BrowserPreflightResult | null>(null);
	let ingest = $state<IngestOutcome | null>(null);
	let dragging = $state(false);
	let busyLabel = $state('');

	/** Problems that are ours rather than the preflight's: a failed upload, a refused RPC. */
	let transportProblems = $state<FoundryIssue[]>([]);

	let fileInput: HTMLInputElement | null = $state(null);
	let dirInput: HTMLInputElement | null = $state(null);

	/* ------------------------------------------------------------- the app */

	/*
	 * SEEDED ONCE, ON PURPOSE, AND `untrack` IS HOW THAT IS SAID OUT LOUD.
	 * These are the student's working choices from here on: re-deriving them
	 * when the route's data reloads would throw away a selection made after the
	 * page painted. The deep link decides the FIRST value and nothing after it.
	 */
	let mode = $state<'new' | 'existing'>(untrack(() => (initialAppId ? 'existing' : 'new')));
	let existingAppId = $state(
		untrack(() => initialAppId ?? transports.existingApps[0]?.id ?? '')
	);

	let title = $state('');
	let slug = $state('');
	let slugTouched = $state(false);
	let tagline = $state('');
	let description = $state('');
	let buildNotes = $state('');
	let coverFile = $state<File | null>(null);
	let coverPreview = $state<string | null>(null);

	/**
	 * The address follows the name until somebody edits it, and then it stops.
	 * Re-deriving after an edit would silently discard a deliberate choice about
	 * a value that can never be changed again.
	 */
	$effect(() => {
		const t = title;
		if (!slugTouched) slug = suggestSlug(t);
	});

	/** A pre-save preview shows the CONTENT, contained, never cropped to fill. */
	$effect(() => {
		const f = coverFile;
		if (!f) {
			coverPreview = null;
			return;
		}
		const url = URL.createObjectURL(f);
		coverPreview = url;
		return () => URL.revokeObjectURL(url);
	});

	/* --------------------------------------------------------- normalizing */

	async function accept(files: File[]) {
		transportProblems = [];
		ingest = null;
		preflight = null;
		phase = 'reading';
		busyLabel = 'Reading what you picked';

		const result = await normalizeFoundryInput(files);
		normalized = result;

		if (!result.ok || !result.zip) {
			phase = 'blocked';
			return;
		}

		/*
		 * The zip cap is checked here rather than only in the preflight because
		 * a 40 MB folder should be refused before it is inflated a second time
		 * into a preflight pass. The sentence is the shared module's.
		 */
		if (result.zip.size > FOUNDRY_LIMITS.maxZipBytes) {
			preflight = null;
			transportProblems = [
				{
					file: null,
					line: null,
					message: `That comes to ${formatBytes(result.zip.size)} zipped, which is over the ${Math.round(FOUNDRY_LIMITS.maxZipBytes / (1024 * 1024))} MB limit. Take out or compress the largest files and try again.`
				}
			];
			phase = 'blocked';
			return;
		}

		phase = 'checking';
		busyLabel = 'Checking your app';
		const verdict = await preflightZipInBrowser(result.zip);
		preflight = verdict;
		phase = verdict.ok ? 'ready' : 'blocked';
	}

	async function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (!event.dataTransfer) return;
		await accept(await filesFromDataTransfer(event.dataTransfer));
	}

	function onPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		// Reset so re-picking the same folder fires a change event again.
		input.value = '';
		if (files.length > 0) void accept(files);
	}

	function clearFile() {
		normalized = null;
		preflight = null;
		ingest = null;
		transportProblems = [];
		phase = 'idle';
	}

	/* -------------------------------------------------------------- saving */

	const detailsComplete = $derived(
		mode === 'existing'
			? existingAppId !== ''
			: title.trim() !== '' && slugLooksOk(slug) && buildNotes.trim() !== ''
	);

	const canSend = $derived(phase === 'ready' && detailsComplete);

	function problem(message: string) {
		transportProblems = [...transportProblems, { file: null, line: null, message }];
	}

	/**
	 * THE ORDER IS FORCED, and each step's failure leaves the student holding
	 * whatever already landed rather than a blank form.
	 *
	 * app -> cover -> upload -> version -> ingest. A retry after a partial
	 * create must not produce a second app, so `createdAppId` survives a failure
	 * and the next press resumes from where it stopped.
	 */
	let createdAppId = $state<string | null>(null);
	let createdSlug = $state<string | null>(null);
	/** The version this flow just made, which is what the submit press queues. */
	let createdVersionId = $state<string | null>(null);
	let createdOrdinal = $state<number | null>(null);
	let submitting = $state(false);
	let submittedForReview = $state(false);

	async function send() {
		if (!canSend || !normalized?.zip) return;
		phase = 'sending';
		transportProblems = [];

		let appId = mode === 'existing' ? existingAppId : createdAppId;
		let appSlug = createdSlug ?? '';

		if (mode === 'new' && !appId) {
			busyLabel = 'Creating your app';
			const created = await transports.createApp({
				slug: slug.trim(),
				title: title.trim(),
				tagline: tagline.trim(),
				description: description.trim(),
				buildNotes: buildNotes.trim()
			});
			if (!created.ok) {
				problem(created.message);
				phase = 'ready';
				return;
			}
			appId = created.appId;
			appSlug = created.slug;
			createdAppId = created.appId;
			createdSlug = created.slug;
		}

		if (!appId) {
			problem('No app was selected to add this version to.');
			phase = 'ready';
			return;
		}

		/*
		 * THE COVER IS BEST EFFORT AND ITS FAILURE IS NAMED. It cannot be staged
		 * into create -- the RPC has no parameter for it -- so it lands here, and
		 * a cover that fails must not take the upload down with it: the app and
		 * its build are the work, the picture is decoration that can be added
		 * again from /foundry/mine.
		 */
		if (coverFile) {
			busyLabel = 'Uploading the cover image';
			const up = await transports.uploadCover(coverFile);
			if (!up.ok) {
				problem(`The cover image was not saved: ${up.message} Everything else is being uploaded, and you can add a cover from My apps.`);
			} else {
				const set = await transports.saveField(appId, 'cover_path', up.path);
				if (!set.ok) problem(`The cover image was uploaded but not attached: ${set.message}`);
			}
		}

		/*
		 * THE UPLOAD PATH IS NOT KEYED TO THE VERSION ID, and that is forced
		 * rather than chosen: `foundry_create_version` takes the path as an
		 * INPUT, so the row -- and therefore its id -- does not exist until
		 * after the object has to be named. A per-upload uuid under the caller's
		 * own prefix is what the bucket policy allows and is one-to-one with the
		 * version it becomes. Changing this to the version id means changing
		 * that RPC's signature, which is a migration.
		 */
		const uploadId = crypto.randomUUID();
		const zipPath = `${transports.uid}/${uploadId}.zip`;

		busyLabel = 'Uploading your app';
		const put = await transports.uploadZip(normalized.zip, zipPath);
		if (!put.ok) {
			problem(put.message);
			phase = 'ready';
			return;
		}

		busyLabel = 'Recording the version';
		const version = await transports.createVersion({
			appId,
			zipPath,
			byteSize: normalized.zip.size,
			fileCount: preflight?.files.length ?? 0
		});
		if (!version.ok) {
			problem(version.message);
			phase = 'ready';
			return;
		}
		createdVersionId = version.versionId;
		createdOrdinal = version.ordinal;

		busyLabel = 'Unpacking and checking on the server';
		const result = await transports.ingest(version.versionId);
		ingest = result;

		if (!result.ok) {
			// The server considered it and said no. That is an answer, not a
			// transport failure, so it is not retried -- it is rendered.
			phase = 'blocked';
			return;
		}

		phase = 'done';
		if (appSlug && onDone) onDone(appSlug);
	}

	/**
	 * THE SECOND PRESS. Queueing for review is its own deliberate act -- one
	 * button, on this page, never a side effect of the upload finishing. The
	 * busy flag clears in `finally` so a throw cannot strand the control.
	 */
	async function submitForReview() {
		if (!createdVersionId || !transports.submitVersion || submitting) return;
		submitting = true;
		transportProblems = [];
		try {
			const result = await transports.submitVersion(createdVersionId);
			if (!result.ok) {
				problem(result.message);
				return;
			}
			submittedForReview = true;
		} catch (err) {
			problem(err instanceof Error ? err.message : 'That did not work. Try again.');
		} finally {
			submitting = false;
		}
	}

	const failures = $derived<FoundryIssue[]>([
		...transportProblems,
		...(normalized && !normalized.ok && normalized.problem
			? [{ file: null, line: null, message: normalized.problem }]
			: []),
		...(ingest?.failures ?? []),
		...(preflight?.failures ?? [])
	]);

	const warnings = $derived<FoundryIssue[]>([
		...(ingest?.warnings ?? []),
		...(preflight?.warnings ?? [])
	]);

	/*
	 * `planStructure` ALREADY EMITS A NOTE FOR THE STRIPPED WRAPPER, so this
	 * does not add one. It did, briefly, and the harness showed the two side by
	 * side saying the same thing in different words -- which is the precise
	 * failure this lane exists to avoid, committed in the one place nobody was
	 * watching for it. `strippedWrapper` stays on the result for the surface to
	 * branch on; the SENTENCE is the shared module's alone.
	 */
	const notes = $derived<string[]>([
		...(normalized?.notes ?? []),
		...(preflight?.notes ?? []),
		...(ingest?.notes ?? [])
	]);

	const busy = $derived(phase === 'reading' || phase === 'checking' || phase === 'sending');
</script>

<div class="fdy-submit">
	<!--
		TWO COLUMNS ABOVE 1024px, and they are the two halves of the job: what
		the app IS on the left, what the app CONTAINS on the right. A single
		column at every width would be a wide phone, which the standard names as
		a defect rather than a deferral.
	-->
	<section class="fdy-col fdy-details" aria-label="About your app">
		<h2>About your app</h2>

		{#if transports.existingApps.length > 0}
			<fieldset class="fdy-mode">
				<legend>What are you uploading?</legend>
				<label class="fdy-radio tap-44">
					<input type="radio" bind:group={mode} value="new" disabled={busy} />
					<span>A new app</span>
				</label>
				<label class="fdy-radio tap-44">
					<input type="radio" bind:group={mode} value="existing" disabled={busy} />
					<span>A new version of one I already have</span>
				</label>
			</fieldset>
		{/if}

		{#if mode === 'existing'}
			<label class="fdy-field">
				<span class="fdy-label">Which app</span>
				<select bind:value={existingAppId} disabled={busy} class="tap-44">
					{#each transports.existingApps as app (app.id)}
						<option value={app.id}>{app.title}</option>
					{/each}
				</select>
			</label>
			<p class="fdy-hint">
				The name, tagline, description and cover stay as they are. Edit them from My apps.
			</p>
		{:else}
			<label class="fdy-field">
				<span class="fdy-label">Name <span class="fdy-req">required</span></span>
				<input type="text" bind:value={title} maxlength="120" disabled={busy} class="tap-44" />
			</label>

			<label class="fdy-field">
				<span class="fdy-label">Address <span class="fdy-req">required</span></span>
				<input
					type="text"
					bind:value={slug}
					maxlength="64"
					disabled={busy}
					class="tap-44"
					oninput={() => (slugTouched = true)}
				/>
				<span class="fdy-hint">
					Your app will live at /foundry/{slug || 'your-address'}. This cannot be changed
					later, because links and QR codes to it stay in circulation.
					{#if slug !== '' && !slugLooksOk(slug)}
						<strong class="fdy-bad">
							An address is 2 to 64 characters of lowercase letters, digits and single
							hyphens, starting and ending with a letter or digit.
						</strong>
					{/if}
				</span>
			</label>

			<label class="fdy-field">
				<span class="fdy-label">Tagline</span>
				<input type="text" bind:value={tagline} maxlength="200" disabled={busy} class="tap-44" />
				<span class="fdy-hint">One line, shown under the name on the gallery.</span>
			</label>

			<label class="fdy-field">
				<span class="fdy-label">Description</span>
				<textarea bind:value={description} maxlength="4000" rows="4" disabled={busy}></textarea>
			</label>

			<!--
				THE ATTRIBUTION FIELD, AND IT IS REQUIRED IN THE DATABASE TOO.
				`student_apps.build_notes` is `not null` with a non-empty check and
				`foundry_create_app` refuses an empty one by name, so this is the
				surface for a rule rather than the rule itself.

				THE FRAMING IS THE WORK HERE. Most of these apps are AI-generated,
				and the pathway treats saying so as normal practice rather than as
				an admission -- so the label asks which tools were used as a matter
				of course, the examples name real ones, and nothing on this surface
				implies that a hand-written answer scores better than an honest one.
				A field that reads like a confession gets blank answers.
			-->
			<label class="fdy-field fdy-build">
				<span class="fdy-label">How you built this <span class="fdy-req">required</span></span>
				<textarea
					bind:value={buildNotes}
					maxlength="8000"
					rows="6"
					disabled={busy}
					placeholder="Which AI tools you used and how, what you wrote yourself, what you changed after it was generated, and anything you got stuck on."
				></textarea>
				<span class="fdy-hint">
					Name the tools. Claude, ChatGPT, Copilot, Cursor, v0, Gemini, or none. Using them
					is normal here and expected; what matters is that the next person reading your
					app knows how it was made. This is shown on your app's page.
				</span>
			</label>

			<div class="fdy-field">
				<span class="fdy-label">Cover image</span>
				<div class="fdy-cover-row">
					<label class="btn tap-44">
						Choose image
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							hidden
							disabled={busy}
							onchange={(e) => {
								const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
								coverFile = f;
							}}
						/>
					</label>
					{#if coverFile}
						<button type="button" class="btn tap-44" onclick={() => (coverFile = null)}>
							Remove
						</button>
					{/if}
				</div>
				{#if coverPreview}
					<!-- object-fit: contain. A filename says nothing about whether the
					     app is in frame, and cropping to fill hides the cut edge the
					     preview exists to catch. -->
					<img class="fdy-cover-preview" src={coverPreview} alt="Cover preview" />
				{/if}
			</div>
		{/if}
	</section>

	<section class="fdy-col fdy-bundle" aria-label="Your app files">
		<h2>Your app</h2>

		<p class="fdy-hint fdy-contract-link">
			Building it with an AI tool? <a href="/foundry/contract">Read the build contract</a> and
			paste it in first. It is what these checks are written against.
		</p>
		<!--
			THE STARTER SITS BESIDE THE CONTRACT, not on the contract page alone.
			This is the surface a student is standing on when they discover their
			app is missing its libraries, and a file they can start from is a more
			useful answer at that moment than a document about the rules.
		-->
		<p class="fdy-hint fdy-contract-link">
			Using React? <a href={FOUNDRY_STARTER_PATH} download="index.html">Download the starter
				file</a>
			-- an index.html with the platform libraries already linked and a marked spot for your component.
		</p>

		{#if phase === 'idle'}
			<div
				class="fdy-drop"
				class:fdy-dragging={dragging}
				role="button"
				tabindex="0"
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={onDrop}
				onclick={() => fileInput?.click()}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						fileInput?.click();
					}
				}}
			>
				<p class="fdy-drop-lead">Drop your app here</p>
				<p class="fdy-drop-sub">A zip, a folder, or a single HTML file.</p>
				<div class="fdy-drop-actions">
					<button type="button" class="btn tap-44" onclick={(e) => { e.stopPropagation(); fileInput?.click(); }}>
						Choose a file
					</button>
					<button type="button" class="btn tap-44" onclick={(e) => { e.stopPropagation(); dirInput?.click(); }}>
						Choose a folder
					</button>
				</div>
			</div>
			<!-- data-fdy-input: the dev harness hands fixture files to THIS input,
			     so a harness drive exercises the component's own change handler
			     rather than a shortcut past it. -->
			<input bind:this={fileInput} type="file" hidden onchange={onPick} data-fdy-input />
			<!--
				`webkitdirectory` is how a directory picker is spelled in every
				browser that has one; there is no standard attribute. It is set
				through an action rather than in the markup because Svelte would
				otherwise warn about an unknown attribute on every build.
			-->
			<input
				bind:this={dirInput}
				type="file"
				hidden
				multiple
				onchange={onPick}
				{...{ webkitdirectory: true, directory: true }}
			/>
		{:else}
			<div class="fdy-picked">
				<div class="fdy-picked-main">
					<p class="fdy-picked-name">{normalized?.name || 'Your app'}</p>
					<p class="fdy-picked-meta">
						{#if normalized?.shape === 'zip'}Uploaded as a zip{/if}
						{#if normalized?.shape === 'folder'}Zipped from your folder{/if}
						{#if normalized?.shape === 'single-html'}Packed as a single page{/if}
						{#if normalized?.zip}&middot; {formatBytes(normalized.zip.size)}{/if}
					</p>
				</div>
				{#if !busy && phase !== 'done'}
					<button type="button" class="btn tap-44" onclick={clearFile}>Choose something else</button>
				{/if}
			</div>
		{/if}

		{#if busy}
			<p class="fdy-busy" role="status">{busyLabel}&hellip;</p>
		{/if}

		<FoundryIssues
			title={failures.length === 1 ? 'This has to be fixed' : 'These have to be fixed'}
			tone="failure"
			issues={failures}
		/>
		<FoundryIssues title="Worth a look" tone="warning" issues={warnings} />
		<FoundryIssues title="What we did" tone="note" {notes} />

		{#if phase === 'ready' && preflight}
			<p class="fdy-pass">
				Checks passed. {preflight.files.length}
				{preflight.files.length === 1 ? 'file' : 'files'} ready to upload.
			</p>
		{/if}

		{#if phase === 'done' && ingest}
			<div class="fdy-done">
				<p class="fdy-pass">
					Uploaded and unpacked. {ingest.fileCount}
					{ingest.fileCount === 1 ? 'file' : 'files'}, {formatBytes(ingest.totalBytes)}.
				</p>
				{#if submittedForReview}
					<!-- HEATING: the one confirmation that wears the heat language,
					     because this is the moment work goes into the fire. -->
					<p class="fdy-queued">
						<ForgeStatus tone="waiting" word="Waiting for review" />
						{#if createdOrdinal !== null}v{createdOrdinal} is in the review queue.{:else}This
							version is in the review queue.{/if}
						You can withdraw it from My apps while it waits.
					</p>
				{:else}
					<!--
						THE VERSION IS STILL A DRAFT, said plainly, WITH THE PRESS BESIDE
						THE SENTENCE. Checks passing is not submission: a student who
						reads "uploaded" as "submitted" walks away believing a review is
						queued when nothing is. The press below is that choice, made
						deliberately, on the page the work was made on.
					-->
					<p class="fdy-draft-note">
						<ForgeStatus tone="quiet" word="Draft" />
						This is saved as a draft. Nobody reviews it until you submit it.
					</p>
				{/if}
				<details class="fdy-files">
					<summary class="tap-44">The {ingest.files.length} files that will be served</summary>
					<ul>
						{#each ingest.files as f (f.path)}
							<li><code>{f.path}</code><span>{formatBytes(f.size)}</span></li>
						{/each}
					</ul>
				</details>
				<div class="fdy-done-actions">
					{#if !submittedForReview && transports.submitVersion && createdVersionId}
						<button
							type="button"
							class="btn fdy-primary tap-44"
							disabled={submitting}
							onclick={submitForReview}
						>
							{submitting ? 'Submitting...' : 'Submit for review'}
						</button>
					{/if}
					<a class="btn tap-44" href="/foundry/mine">Go to My apps</a>
				</div>
			</div>
		{/if}

		{#if phase !== 'done'}
			<div class="fdy-actions">
				<button
					type="button"
					class="btn fdy-primary tap-44"
					disabled={!canSend || busy}
					onclick={send}
				>
					{mode === 'existing' ? 'Upload this version' : 'Create app and upload'}
				</button>
				{#if phase === 'ready' && !detailsComplete}
					<p class="fdy-hint">
						{#if mode === 'new'}Fill in the name, the address and how you built it.{:else}Choose
							an app.{/if}
					</p>
				{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	/*
	 * The two-column desktop layout. `--fdy-col` is the width at which the
	 * details column stops gaining -- measured against its own longest field
	 * label and its textarea, not chosen as a round number -- and `auto-fit`
	 * means a narrow window gets one column with no separate breakpoint rule.
	 */
	.fdy-submit {
		display: grid;
		gap: var(--space-5, 1.5rem);
		grid-template-columns: 1fr;
	}

	@media (min-width: 64rem) {
		.fdy-submit {
			grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
			align-items: start;
		}
	}

	.fdy-col {
		min-width: 0;
	}

	.fdy-col h2 {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: 0 0 var(--space-3, 0.75rem);
	}

	.fdy-field {
		display: block;
		margin-bottom: var(--space-4, 1rem);
	}

	.fdy-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-2);
		margin-bottom: 0.3rem;
	}

	.fdy-req {
		color: var(--amber);
		text-transform: none;
		letter-spacing: 0;
	}

	.fdy-field input[type='text'],
	.fdy-field select,
	.fdy-field textarea {
		width: 100%;
		background: var(--bg2);
		color: var(--white);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 6px);
		padding: 0.5rem 0.6rem;
		font-family: var(--font-display);
		font-size: 1rem;
	}

	.fdy-field textarea {
		resize: vertical;
		line-height: 1.5;
		/* A reading measure inside a console is still a reading measure. */
		max-width: 68ch;
	}

	.fdy-hint {
		display: block;
		font-size: 0.85rem;
		color: var(--text-2);
		margin: 0.35rem 0 0;
		line-height: 1.45;
		max-width: 62ch;
	}

	.fdy-bad {
		display: block;
		color: var(--amber);
		margin-top: 0.25rem;
	}

	.fdy-mode {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 6px);
		padding: var(--space-3, 0.75rem);
		margin: 0 0 var(--space-4, 1rem);
	}

	.fdy-mode legend {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-2);
		padding: 0 0.4rem;
	}

	.fdy-radio {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.fdy-cover-row {
		display: flex;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
	}

	.fdy-cover-preview {
		display: block;
		margin-top: var(--space-2, 0.5rem);
		max-width: 100%;
		max-height: 180px;
		object-fit: contain;
		background: var(--bg2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 6px);
	}

	.fdy-drop {
		border: 2px dashed var(--boundary);
		border-radius: var(--radius-md, 8px);
		background: var(--bg1);
		padding: var(--space-6, 2rem) var(--space-4, 1rem);
		text-align: center;
		cursor: pointer;
	}

	.fdy-drop:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.fdy-dragging {
		border-color: var(--green);
		background: var(--bg2);
	}

	.fdy-drop-lead {
		font-family: var(--font-display);
		font-size: 1.2rem;
		margin: 0 0 0.25rem;
	}

	.fdy-drop-sub {
		color: var(--text-2);
		margin: 0 0 var(--space-3, 0.75rem);
		font-size: 0.9rem;
	}

	.fdy-drop-actions {
		display: flex;
		gap: var(--space-2, 0.5rem);
		justify-content: center;
		flex-wrap: wrap;
	}

	.fdy-picked {
		display: flex;
		align-items: center;
		gap: var(--space-3, 0.75rem);
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		padding: var(--space-3, 0.75rem);
		margin-bottom: var(--space-3, 0.75rem);
		flex-wrap: wrap;
	}

	.fdy-picked-main {
		min-width: 0;
		flex: 1;
	}

	.fdy-picked-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		overflow-wrap: anywhere;
	}

	.fdy-picked-meta {
		margin: 0.1rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--cyan);
	}

	.fdy-busy {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--teal);
		margin: var(--space-2, 0.5rem) 0;
	}

	.fdy-pass {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		color: var(--green);
		margin: var(--space-3, 0.75rem) 0 0;
	}

	.fdy-draft-note,
	.fdy-queued {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.9rem;
		color: var(--text-2);
		max-width: 62ch;
		line-height: 1.5;
		margin: 0;
	}

	.fdy-queued {
		color: var(--text-1, var(--white));
	}

	.fdy-done-actions {
		display: flex;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
		align-items: center;
	}

	.fdy-files {
		margin: var(--space-3, 0.75rem) 0;
	}

	.fdy-files summary {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2);
		cursor: pointer;
	}

	.fdy-files ul {
		list-style: none;
		padding: 0;
		margin: var(--space-2, 0.5rem) 0 0;
		display: grid;
		gap: 0.15rem;
		max-height: 18rem;
		overflow-y: auto;
	}

	.fdy-files li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3, 0.75rem);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		min-width: 0;
	}

	.fdy-files code {
		overflow-wrap: anywhere;
		min-width: 0;
	}

	.fdy-files li span {
		color: var(--text-2);
		flex: none;
	}

	.fdy-actions {
		margin-top: var(--space-4, 1rem);
	}

	.fdy-primary {
		border-color: var(--green);
		color: var(--green);
	}

	.fdy-primary[disabled] {
		border-color: var(--hairline);
		color: var(--ice);
	}

	.fdy-contract-link {
		margin-bottom: var(--space-3, 0.75rem);
	}

	.fdy-done {
		display: grid;
		gap: var(--space-2, 0.5rem);
	}
</style>
