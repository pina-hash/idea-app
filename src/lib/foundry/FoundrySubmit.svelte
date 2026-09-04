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
	import { dropTarget, type DragLikeEvent } from '$lib/file-drop';
	import { preflightZipInBrowser, type BrowserPreflightResult } from './preflight-browser.ts';
	import {
		FOUNDRY_LIMITS,
		formatBytes,
		foundryContractProfiles,
		foundryFixPrompt,
		type FoundryIssue
	} from './preflight.ts';
	import { foundryPreviewUrl, foundryPreviewable } from './bundle-url.ts';
	import {
		FOUNDRY_PREVIEW_STORAGE_NOTE,
		slugLooksOk,
		suggestSlug
	} from './surface.ts';
	import { FOUNDRY_STARTER_PATH } from './preflight.ts';
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

	/**
	 * THE DROP IS THE SHARED ONE NOW, and what this replaced is worth naming
	 * because the differences were all invisible.
	 *
	 * This zone hand-rolled `ondragover`/`ondragleave`/`ondrop` -- a second
	 * implementation of drop, which prompt 0026 flagged and left for whoever
	 * owned this file. It cost three things at once. There was no
	 * `dragenter`/`dragleave` DEPTH COUNTING, so dragging across the two
	 * buttons inside the zone fired `dragleave` on the container and the
	 * highlight flickered off and on over its own children. There was no
	 * `isFileDrag` check, so dragging selected TEXT lit the whole zone up and
	 * `preventDefault`ed a drop it could do nothing with. And there was no
	 * paste path at all, so it never asked `claimPaste` and sat outside the one
	 * statement of "has a handler closer to the caret already taken this".
	 *
	 * `resolve` IS WHY THE SWAP IS NOT A LOSS. `dropTarget` reads
	 * `dataTransfer.files`, which does NOT enumerate a dropped FOLDER --
	 * and a folder is one of the three shapes this surface exists to accept.
	 * `filesFromDataTransfer` walks `webkitGetAsEntry()` for that, so it is
	 * handed in as the transfer READER while the drag state machine stays
	 * shared. One drop, one reading per surface.
	 *
	 * THE CAST IS THE MINIMAL SHAPE MEETING THE REAL ONE. `DragLikeEvent`'s
	 * `dataTransfer` is deliberately narrower than `DataTransfer` -- it names
	 * only `types` and `files`, which is all the state machine reads -- so the
	 * one caller that needs the whole object asks for it here, where a reader
	 * can see it happen.
	 */
	async function resolveDropped(dt: DragLikeEvent['dataTransfer']): Promise<File[]> {
		if (!dt) return [];
		return filesFromDataTransfer(dt as unknown as DataTransfer);
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
	/**
	 * THE APP THAT VERSION BELONGS TO, WHICH IS NOT `createdAppId`.
	 *
	 * `createdAppId` is the RESUME handle for the new-app path only: it exists so
	 * a retry after a partial create does not make a second app, and on the
	 * add-a-version path it is null for the whole flow. The preview URL needs the
	 * app id whichever path got here, so it is stamped from the settled `appId`
	 * at the same moment the version id is, and the two can therefore never name
	 * different things.
	 */
	let createdVersionAppId = $state<string | null>(null);
	let createdOrdinal = $state<number | null>(null);
	let submitting = $state(false);
	let submittedForReview = $state(false);

	/**
	 * THE PREVIEW OF WHAT WAS JUST UPLOADED.
	 *
	 * WHY IT BELONGS HERE AND NOT ONLY ON /foundry/mine. This is the moment a
	 * student most wants to run the thing they just made, and until now the done
	 * panel offered a file list, a Submit press and a link to another page --
	 * so the only way to actually SEE the upload was to leave, find the app, open
	 * it and find the version. The two ids are both in hand at this point and the
	 * builder is pure, so the control costs one line and a fact.
	 *
	 * IT IS `foundryPreviewable`, NOT AN INLINE CONDITION, for the reason that
	 * predicate's own header gives: written out, that expression is the one
	 * somebody adds a status clause to, and this surface's version is ALWAYS a
	 * draft, so a status clause here would be invisible until the day it was not.
	 * One predicate, two surfaces, one server gate behind both.
	 *
	 * `hidden_at: null` IS DERIVED RATHER THAN ASSUMED, and it is the only clause
	 * this surface cannot read off a row. Both paths into it settle it:
	 *
	 *   A NEW APP. `foundry_create_app` has no way to produce a hidden one --
	 *     hiding is `foundry_set_app_hidden`, which is admin only (0130) and is a
	 *     separate act after the fact.
	 *
	 *   AN EXISTING APP. The choice comes from `transports.existingApps`, which
	 *     the route fills from `foundry_list_apps` WITHOUT `p_include_hidden`,
	 *     and `_foundry_app_in_population` gates that flag on `is_admin()` inside
	 *     itself -- so a hidden app is not in the list to be chosen, for an admin
	 *     uploading their own work either.
	 *
	 * The cost of being wrong is a link that 404s in a new tab, never a
	 * disclosure: `previewViewerMayRun` is the boundary and it reads the flag
	 * itself.
	 */
	const previewHref = $derived(
		foundryPreviewable({ hidden_at: null }, { file_count: ingest?.fileCount ?? 0 })
			? foundryPreviewUrl(createdVersionAppId, createdVersionId)
			: null
	);

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
		createdVersionAppId = appId;
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

	/*
	 * THE SIX PROFILES, NAMED FROM THE PROFILES THEMSELVES.
	 *
	 * This paragraph is the whole reason a student opens the contract -- "there
	 * is one for what I am doing" is what makes someone click, where "read the
	 * build contract" is what they scroll past. Typed out in prose it would be
	 * a second statement of the list: a seventh profile, or a renamed one,
	 * would leave this page confidently naming five of six and inventing one
	 * that no longer exists. The labels and the count both come from the same
	 * function the contract page renders.
	 */
	const profileLabels = foundryContractProfiles().map((p) => p.label);

	/*
	 * THE WHOLE REFUSAL, WRAPPED AS AN INSTRUCTION FOR WHATEVER WROTE THE APP.
	 *
	 * This is the loop that has to close: an upload is refused, the student
	 * pastes the refusal back into the tool that generated the app, the tool
	 * fixes it, they upload again. A student who cannot read a stack trace
	 * cannot read a preflight message either, and copying five sentences one at
	 * a time and hoping the tool works out what to do with them is the version
	 * of that loop that fails.
	 *
	 * THE STRING IS BUILT IN `preflight.ts` FROM THE REAL ISSUE LIST. Nothing
	 * here summarises, counts or re-describes a message; `foundryFixPrompt`
	 * renders `failures` and `warnings` through the same `foundryIssueLine` the
	 * panels' own Copy buttons use, so the prompt and the one-at-a-time copies
	 * are word for word the same sentences.
	 *
	 * IT IS OFFERED FOR WARNINGS ALONE AS WELL, and that is deliberate rather
	 * than incidental: an upload that PASSED with a `<base href>` warning and an
	 * unprefixed storage key is exactly the app that will behave oddly next
	 * week, and the student is standing here now. `foundryFixPrompt` returns
	 * the empty string when there is nothing to act on, which is the one thing
	 * the control tests -- so a surface with no issues cannot offer an
	 * instruction with no instructions in it.
	 */
	const fixPrompt = $derived(foundryFixPrompt(failures, warnings));

	let fixCopied = $state(false);
	let fixTimer: ReturnType<typeof setTimeout> | null = null;

	async function copyFixPrompt() {
		try {
			await navigator.clipboard.writeText(fixPrompt);
			fixCopied = true;
		} catch {
			// A clipboard the browser refused is not worth a panel: every
			// sentence in the prompt is on screen and copyable on its own.
			fixCopied = false;
			return;
		}
		if (fixTimer) clearTimeout(fixTimer);
		fixTimer = setTimeout(() => (fixCopied = false), 2200);
	}
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

		<!--
			THE CONTRACT GOES IN FRONT OF A STUDENT BEFORE THEIR FIRST UPLOAD, NOT
			AFTER THEIR FIRST REFUSAL.

			It used to be one grey hint line among two, below the heading and
			above a drop zone that is the only thing on the pane anybody looks
			at -- so in practice the document was discovered by being refused,
			which is the expensive way to find out what the rules are. It is now
			a panel with an edge, at the top of the pane, and it names the SIX
			profiles rather than "the build contract": a student porting a Godot
			export and a student writing their first page are not looking for the
			same document, and "there is one for what you are doing" is what makes
			someone open it.

			IT IS NOT A DISCLOSURE. A collapsed panel is a panel nobody opens on
			the one visit that matters, and the whole point is the visit before
			the first upload.
		-->
		<div class="fdy-before">
			<p class="fdy-before-lead">Read this before you upload</p>
			<p class="fdy-before-body">
				The <a href="/foundry/contract">build contract</a> is the rules these checks are written
				against, written as instructions to paste into whatever is building your app. Pick the
				version that matches what you are doing and paste it in first.
			</p>
			<ul class="fdy-before-list">
				{#each profileLabels as label (label)}
					<li>{label}</li>
				{/each}
			</ul>
			<!--
				THE STARTER SITS BESIDE THE CONTRACT, not on the contract page
				alone. This is the surface a student is standing on when they
				discover their app is missing its libraries, and a file they can
				start from is a more useful answer at that moment than a document
				about the rules.
			-->
			<p class="fdy-before-body">
				Using React? <a href={FOUNDRY_STARTER_PATH} download="index.html">Download the starter
					file</a>
				-- an index.html with the platform libraries already linked and a marked spot for your component.
			</p>
		</div>

		{#if phase === 'idle'}
			<div
				class="fdy-drop"
				class:fdy-dragging={dragging}
				role="button"
				tabindex="0"
				use:dropTarget={{
					onfiles: (files) => void accept(files),
					onactive: (active) => (dragging = active),
					resolve: resolveDropped
				}}
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

		{#if fixPrompt}
			<!--
				ONE control over BOTH lists, so it lives here rather than inside a
				panel: a panel sees one tone, and an instruction that carried the
				failures without the warnings would send a tool back to fix half
				the app. The wording says what lands on the clipboard, because
				"Copy" beside a list of five sentences reads as those five
				sentences.
			-->
			<div class="fdy-fix">
				<div class="fdy-fix-text">
					<p class="fdy-fix-lead">Hand this back to whatever built your app</p>
					<p class="fdy-fix-body">
						Copies every message below, with the file and line, wrapped as an instruction
						telling the tool to fix them and hand back the changed files. Paste it into the
						same chat that wrote the app.
					</p>
				</div>
				<button type="button" class="btn fdy-fix-btn tap-44" onclick={copyFixPrompt}>
					{fixCopied ? 'Copied' : 'Copy as a fix prompt'}
				</button>
			</div>
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
					<!--
						RUN IT, FIRST IN THE ROW. The version that just unpacked is a DRAFT
						and nothing on the apps origin will serve one, so the preview mount
						on the portal is the only way to see it at all -- and this is the
						moment somebody wants to. It sits ahead of Submit for review on
						purpose and in the same order /foundry/mine uses: look at the build,
						then decide about it. Submitting stays the deliberate second press.

						A NEW TAB, exactly as on /foundry/mine: a student needs to actually
						play the thing -- type into it, lose, reload, try again -- and this
						page still holds the Submit press they came back for.
						`rel="noopener"` because the opened document is a student's own
						bundle; the preview response's sandbox already denies it
						`window.opener`, and stating it costs nothing.
					-->
					{#if previewHref}
						<a class="btn tap-44" href={previewHref} target="_blank" rel="noopener">
							Run a preview
						</a>
					{/if}
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
				<!--
					WHAT THE PREVIEW DOES NOT PROVE, beside the control that offers it.
					The words are `surface.ts`'s, not this file's, so this surface and
					/foundry/mine cannot end up describing what storage does differently.
					Only rendered when there is a preview to describe.
				-->
				{#if previewHref}
					<p class="fdy-hint">{FOUNDRY_PREVIEW_STORAGE_NOTE}</p>
				{/if}
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

	/*
	 * The pre-upload panel. A left edge in the room's own boundary token rather
	 * than an accent: it is a signpost, not a warning, and the heat colours in
	 * this room mean work in progress.
	 */
	.fdy-before {
		border: 1px solid var(--boundary);
		border-left: 3px solid var(--cyan);
		border-radius: var(--radius-md, 8px);
		background: var(--bg1);
		padding: var(--space-3, 0.75rem);
		margin-bottom: var(--space-3, 0.75rem);
		display: grid;
		gap: var(--space-2, 0.5rem);
	}

	.fdy-before-lead {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-before-body {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.5;
		max-width: 68ch;
	}

	/*
	 * The six read as a menu rather than as a sentence: a student is scanning
	 * for the one that describes them, and a comma-separated clause is the
	 * shape that gets skimmed past. Wrapping rather than a column, because six
	 * short labels in a stack is a page of its own on a phone.
	 */
	.fdy-before-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.fdy-before-list li {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}

	/*
	 * The fix prompt sits directly above the failure panel it summarises, with
	 * the same crimson edge, so the two read as one region rather than as an
	 * unrelated control that happens to be nearby.
	 */
	.fdy-fix {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3, 0.75rem);
		flex-wrap: wrap;
		border: 1px solid var(--boundary);
		border-left: 3px solid var(--crimson);
		border-radius: var(--radius-md, 8px);
		background: var(--bg1);
		padding: var(--space-3, 0.75rem);
		margin-bottom: var(--space-2, 0.5rem);
	}

	.fdy-fix-text {
		flex: 1;
		/* min-width: 0 on the flex child, or the paragraph's min-content forces
		   the pane wider than the viewport at 375px. */
		min-width: min(18rem, 100%);
	}

	.fdy-fix-lead {
		margin: 0 0 0.2rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
	}

	.fdy-fix-body {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--text-2);
		max-width: 68ch;
	}

	.fdy-fix-btn {
		flex: none;
		border-color: var(--green);
		color: var(--green);
	}

	.fdy-done {
		display: grid;
		gap: var(--space-2, 0.5rem);
	}
</style>
