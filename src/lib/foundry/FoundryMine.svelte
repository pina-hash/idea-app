<script lang="ts">
	/**
	 * THE STUDENT'S OWN APPS, AS A MASTER-DETAIL SURFACE.
	 *
	 * A list of things and the contents of one of them is the case
	 * `IDEA_INTERFACE_STANDARDS` 1 names master-detail as the default for, and
	 * `$lib/shell/ClassSplit` is the one two-pane shell in this repo -- so this
	 * surface is a caller of it rather than a second split. Nothing selected
	 * renders NO detail pane and gives the list the whole measure; that is the
	 * arrangement at every width, not a placeholder state.
	 *
	 * SELECTION LIVES IN THE URL, so an app is linkable, the back button works,
	 * and a reload lands where the student was. The route owns the read; this
	 * component owns the arrangement and the intent.
	 *
	 * EVERY WRITE IS A TRANSPORT AND EVERY TRANSPORT IS OPTIONAL. A missing one
	 * removes its control outright, so a read-only mounting of this component is
	 * structural rather than a `readOnly` flag someone has to honour.
	 */
	import { env } from '$env/dynamic/public';

	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import '$lib/shell/split.css';

	import ForgeStatus from './ForgeStatus.svelte';
	import FoundryIssues from './FoundryIssues.svelte';
	import FoundryPlayStats from './FoundryPlayStats.svelte';
	import FoundryShare from './FoundryShare.svelte';
	import {
		foundryDownloadUrl,
		foundryDownloadable,
		foundryPreviewUrl,
		foundryPreviewable
	} from './bundle-url.ts';
	import { formatBytes, type FoundryIssue } from './preflight.ts';
	import {
		FOUNDRY_METADATA_FIELDS,
		deleteAppCostLine,
		draftIsSubmittable,
		metadataIsLive,
		rollbackTargets,
		versionIsDeletable,
		versionLabel
	} from './surface.ts';
	import type { FoundryApp, FoundryAppSummary, FoundryMineTransports } from './transports.ts';

	let {
		apps,
		selected = null,
		transports = {},
		coverUrl = (path: string) => path,
		onSelect,
		now,
		/**
		 * THE APPS ORIGIN, read here and handed to `FoundryShare`, exactly as
		 * `FoundryDetail` does it. A prop with the environment read as its
		 * default so a harness can drive the control without one; unset removes
		 * the link rather than falling back to the current origin, which on the
		 * portal is the cookie-carrying host the whole split exists to keep
		 * bundles off.
		 */
		appsOrigin = env.PUBLIC_FOUNDRY_APPS_ORIGIN ?? ''
	}: {
		apps: FoundryAppSummary[];
		selected?: FoundryApp | null;
		transports?: FoundryMineTransports;
		/** Turns a stored cover path into a URL. Injected, never built here. */
		coverUrl?: (path: string) => string;
		onSelect: (slug: string | null) => void;
		/** Threaded from the caller. A component that reads its own clock
		    silently disagrees with the ranking it is rendering. */
		now: Date;
		appsOrigin?: string;
	} = $props();

	let app = $state<FoundryApp | null>(null);
	$effect(() => {
		app = selected;
	});

	let problems = $state<FoundryIssue[]>([]);
	let busy = $state<string | null>(null);
	let saidAt = $state<string | null>(null);

	function note(message: string) {
		problems = [...problems, { file: null, line: null, message }];
	}

	/**
	 * Every write goes through here so the busy flag is cleared in `finally`.
	 * A throw mid-submit that skipped the reset would disable the surface until
	 * a reload, with nothing on screen saying why.
	 */
	async function run(label: string, work: () => Promise<{ ok: boolean; message?: string }>) {
		problems = [];
		busy = label;
		try {
			const result = await work();
			if (!result.ok) {
				note(result.message ?? 'That did not work.');
				return false;
			}
			// The acknowledgement, with the clock time of the write -- never the
			// dispatch. A status set beside the call says a request was made.
			saidAt = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
			if (app && transports.refresh) {
				const fresh = await transports.refresh(app.slug);
				if (fresh) app = fresh;
			}
			return true;
		} catch (err) {
			note(err instanceof Error ? err.message : 'That did not work.');
			return false;
		} finally {
			busy = null;
		}
	}

	/* -------------------------------------------------------------- deleting
	 *
	 * A DELETE DOES NOT GO THROUGH `run`, and the difference is the refresh.
	 * `run` re-reads the app it just wrote to, which for a deleted app is a
	 * read of something that no longer exists -- so the surface would ask the
	 * server about a row it had just removed and render whatever came back.
	 * These clear the selection instead, which is the honest next state: there
	 * is no app to be looking at.
	 *
	 * A FAILED OBJECT SWEEP IS NOT A FAILED DELETE. `storageProblem` arrives on
	 * a SUCCESSFUL outcome and is shown as a note beside the confirmation, not
	 * in the problem list: the app is gone either way, and what was left behind
	 * is bytes nothing serves. Presenting a completed delete as an error is how
	 * a student presses it again.
	 */

	/**
	 * TWO NOTES, BECAUSE THE TWO DELETES END IN DIFFERENT PLACES, and this is a
	 * defect a browser pass found rather than a distinction anyone predicted.
	 *
	 * A VERSION delete leaves the app open, so its acknowledgement belongs in
	 * the detail pane beside the list it just changed. An APP delete UNMOUNTS
	 * that pane -- there is no app to be looking at any more -- so an
	 * acknowledgement rendered there is destroyed by the very act it reports:
	 * measured, the card vanished from the list and nothing anywhere said a
	 * word. `removedNote` therefore lives in the LIST pane, which is what is on
	 * screen afterwards at every width (`narrow="swap"` shows the list exactly
	 * when no detail is open).
	 */
	let deleteNote = $state<string | null>(null);
	let removedNote = $state<string | null>(null);

	async function removeApp() {
		if (!app || !transports.deleteApp) return;
		const target = app;
		problems = [];
		deleteNote = null;
		removedNote = null;
		busy = 'Deleting';
		try {
			const result = await transports.deleteApp(target.id);
			if (!result.ok) {
				note(result.message);
				return;
			}
			removedNote = result.storageProblem
				? `"${target.title}" is deleted. ${result.storageProblem} An instructor can clear them up; nothing on the site can reach them.`
				: `"${target.title}" is deleted.`;
			// The app is gone, so nothing is selected. The route's own load then
			// answers with a list that no longer has it in.
			onSelect(null);
		} catch (err) {
			note(err instanceof Error ? err.message : 'That did not work.');
		} finally {
			busy = null;
		}
	}

	async function removeVersion(versionId: string, ordinal: number) {
		if (!transports.deleteVersion) return;
		const ok = await run('Deleting', () => transports.deleteVersion!(versionId));
		if (ok) deleteNote = `Version ${ordinal} is deleted.`;
	}

	/* ------------------------------------------------------------- editing */

	let editing = $state<string | null>(null);
	let draft = $state('');

	function beginEdit(field: string, value: string) {
		editing = field;
		draft = value;
	}

	async function saveEdit(field: string) {
		if (!app || !transports.saveField) return;
		const target = app;
		const value = draft;
		const ok = await run('Saving', () => transports.saveField!(target.id, field, value));
		if (ok) editing = null;
	}

	/* ---------------------------------------------------------- confirming */

	/** Two-step inline confirm for anything a student cannot undo by pressing again. */
	let armed = $state<string | null>(null);

	function fmt(iso: string): string {
		const d = new Date(iso);
		const sameYear = d.getFullYear() === now.getFullYear();
		return d.toLocaleDateString([], {
			month: 'short',
			day: 'numeric',
			...(sameYear ? {} : { year: 'numeric' })
		});
	}
</script>

<ClassSplit hasDetail={app !== null} narrow="swap" scroll="page" detailWidth="roomy">
	{#snippet nav()}
		<div class="fdy-list-pane">
			<header class="fdy-list-head">
				<h2>My apps</h2>
				<a class="btn fdy-new tap-44" href="/foundry/submit">New app</a>
			</header>

			{#if removedNote}
				<!-- The app this reports is gone, so the detail pane it was deleted from
				     is gone with it. This pane is what is still on screen. -->
				<p class="fdy-deleted" role="status">{removedNote}</p>
			{/if}

			{#if apps.length === 0}
				<div class="fdy-empty">
					<p>You have not published anything yet.</p>
					<p class="fdy-hint">
						Build a self-contained web app, then upload it. Start from the
						<a href="/foundry/contract">build contract</a> if you are using an AI tool.
					</p>
					<a class="btn fdy-primary tap-44" href="/foundry/submit">Upload your first app</a>
				</div>
			{:else}
				<!--
					auto-fit columns rather than one fixed column: with nothing
					selected this pane holds the whole measure, and a fixed-width
					column centred in the room it was just given is the same defect
					one level in.
				-->
				<ul class="fdy-cards" class:fdy-cards-wide={app === null}>
					{#each apps as row (row.id)}
						<li>
							<button
								type="button"
								class="fdy-card tap-44"
								class:fdy-card-on={app?.id === row.id}
								aria-current={app?.id === row.id ? 'true' : undefined}
								onclick={() => {
									removedNote = null;
									onSelect(row.slug);
								}}
							>
								{#if row.cover_path}
									<img class="fdy-card-cover" src={coverUrl(row.cover_path)} alt="" />
								{:else}
									<span class="fdy-card-cover fdy-card-nocover" aria-hidden="true"></span>
								{/if}
								<span class="fdy-card-text">
									<span class="fdy-card-title">{row.title}</span>
									{#if row.tagline}<span class="fdy-card-tag">{row.tagline}</span>{/if}
									<!-- The heat language: finished green, heating amber, cold iron,
									     shelved. Each state is a chip with its own glyph and word,
									     never a bare coloured dot. -->
									<span class="fdy-card-meta">
										{#if row.published_version_id}
											<!-- The ordinal can be null in a degraded payload; "Live" alone is
											     then the whole truth, never "Live vnull". -->
											<ForgeStatus
												tone="live"
												word={row.published_ordinal != null ? `Live v${row.published_ordinal}` : 'Live'}
											/>
										{:else}
											<ForgeStatus tone="quiet" word="Not published" />
										{/if}
										<span class="fdy-card-facts">
											{row.version_count}
											{row.version_count === 1 ? 'version' : 'versions'}
										</span>
										{#if row.submitted_version_id}
											<ForgeStatus tone="waiting" word="In review" />
										{/if}
										{#if row.hidden_at}
											<ForgeStatus tone="shelved" word="Hidden by staff" />
										{/if}
									</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/snippet}

	{#if app}
		{@const live = metadataIsLive(app)}
		{@const targets = rollbackTargets(app)}
		<article class="fdy-detail">
			<header class="fdy-detail-head">
				<button type="button" class="btn fdy-back tap-44" onclick={() => onSelect(null)}>
					Back to all apps
				</button>
				<h2>{app.title}</h2>
				<p class="fdy-slug">/foundry/{app.slug}</p>
			</header>

			{#if busy}
				<p class="fdy-busy" role="status">{busy}&hellip;</p>
			{:else if saidAt}
				<p class="fdy-saved" role="status">Saved at {saidAt}</p>
			{/if}

			{#if deleteNote}
				<!-- A COMPLETED DELETE, INCLUDING ONE WHOSE FILE SWEEP WAS PARTIAL.
				     It is not in the problem list, because nothing went wrong with
				     the thing the student asked for. -->
				<p class="fdy-deleted" role="status">{deleteNote}</p>
			{/if}

			<FoundryIssues title="Something went wrong" tone="failure" issues={problems} />

			{#if app.hidden_at}
				<p class="fdy-shelved">
					<ForgeStatus tone="shelved" word="Hidden by staff" />
					This app is off the gallery. Talk to your instructor about what to change.
				</p>
			{/if}

			{#if app.metadata_flagged_at}
				<p class="fdy-flagged">
					You have edited this app's details since it was approved. It stays live, and an
					instructor will see that the details changed.
				</p>
			{/if}

			<!--
				THE SHARE LINK, FIRST, AND THE SAME CONTROL THE GALLERY CARRIES.
				A student wants their own link more than a visitor does, so it sits
				above the editing surfaces rather than under them. It renders
				NOTHING until something is published and nothing at all for a
				hidden app, so it never pushes the working surfaces down for a
				student who is still building.
			-->
			<FoundryShare {app} {appsOrigin} sectionClass="fdy-block" />

			<!--
				HOW MUCH IT HAS BEEN PLAYED, beside the share link rather than under
				the version list, because both are about the app being out in the
				world rather than about building it.

				THE SAME COMPONENT THE REVIEW INSPECTOR MOUNTS, and the same four
				scalars: `foundry_app_play_stats` admits the owner and `is_admin()`
				and answers both identically. What staff have that a student does not
				is other people's apps, never more detail about one -- and there is no
				per-player read for anybody, so "who played it" has no answer here for
				the author either. Absent transport, absent block.
			-->
			<div class="fdy-block">
				<FoundryPlayStats appId={app.id} load={transports.playStats} />
			</div>

			<!-- ------------------------------------------------------ details -->
			<section class="fdy-block" aria-label="App details">
				<h3>Details</h3>
				{#if live}
					<p class="fdy-hint">
						This app is published, so a change here is visible straight away and raises a
						flag for your instructor.
					</p>
				{/if}

				{#each FOUNDRY_METADATA_FIELDS as f (f.field)}
					{@const current = String((app as unknown as Record<string, unknown>)[f.field] ?? '')}
					<div class="fdy-row">
						<span class="fdy-label">{f.label}</span>
						{#if editing === f.field && transports.saveField}
							{#if f.kind === 'text'}
								<textarea bind:value={draft} maxlength={f.max} rows="5"></textarea>
							{:else}
								<input type="text" bind:value={draft} maxlength={f.max} class="tap-44" />
							{/if}
							<div class="fdy-row-actions">
								<button
									type="button"
									class="btn fdy-primary tap-44"
									disabled={busy !== null}
									onclick={() => saveEdit(f.field)}
								>
									Save
								</button>
								<button type="button" class="btn tap-44" onclick={() => (editing = null)}>
									Cancel
								</button>
							</div>
						{:else}
							<p class="fdy-value" class:fdy-value-empty={current === ''}>
								{current || 'Not set'}
							</p>
							{#if transports.saveField}
								<!--
									`tap-44`, not `tap-reach-44`. This control OWNS its cell -- the
									third column of the row above 48rem, the whole 343px width
									below it -- so it can simply grow, which is what that class is
									for. The reach variant is for a control sitting inside a line
									of text, where growing would reflow the writing around it; used
									here it left the button computing 39px and expanding sideways
									into its neighbours instead of upward. Measured at 375px.
								-->
								<button
									type="button"
									class="btn tap-44"
									onclick={() => beginEdit(f.field, current)}
								>
									Edit
								</button>
							{/if}
						{/if}
					</div>
				{/each}

				{#if transports.uploadCover && transports.saveField}
					<div class="fdy-row">
						<span class="fdy-label">Cover</span>
						{#if app.cover_path}
							<img class="fdy-cover" src={coverUrl(app.cover_path)} alt="Current cover" />
						{:else}
							<p class="fdy-value fdy-value-empty">Not set</p>
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
									input.value = '';
									if (!file || !app) return;
									const target = app;
									await run('Uploading the cover', async () => {
										const up = await transports.uploadCover!(file);
										if (!up.ok) return up;
										return transports.saveField!(target.id, 'cover_path', up.path);
									});
								}}
							/>
						</label>
					</div>
				{/if}
			</section>

			<!-- ----------------------------------------------------- versions -->
			<section class="fdy-block" aria-label="Versions">
				<h3>Versions</h3>
				<ul class="fdy-versions">
					{#each app.versions as v (v.id)}
						{@const label = versionLabel(v, app.published_version_id)}
						<li class="fdy-version">
							<div class="fdy-version-main">
								<p class="fdy-version-line">
									<span class="fdy-ordinal">v{v.ordinal}</span>
									<ForgeStatus tone={label.tone} word={label.word} />
									<span class="fdy-version-meta">
										{fmt(v.created_at)} &middot; {v.file_count}
										{v.file_count === 1 ? 'file' : 'files'} &middot; {formatBytes(v.byte_size)}
									</span>
								</p>
								{#if v.review_note}
									<p class="fdy-review-note">
										<span class="fdy-label">What the reviewer said</span>
										{v.review_note}
									</p>
								{/if}
							</div>

							<div class="fdy-version-actions">
								<!--
									RUN IT. THIS IS THE ONE CONTROL EVERY VERSION GETS,
									whatever its status, because "does it work" is a question
									that does not depend on where a build is in review.

									IT OPENS IN A NEW TAB, WHICH IS THE POINT RATHER THAN A
									CONVENIENCE. A student needs to actually play the thing --
									type into it, lose, reload, try again -- and a frame inside
									a detail pane inside a two-pane split gets whatever is left
									after three layers of chrome. The new tab also means the
									list they came from is still there when they close it.

									`rel="noopener"` because the opened document is a student's
									own bundle: it lands in an opaque origin under the preview
									response's strict sandbox, so it cannot reach back through
									`window.opener` anyway, and stating it costs nothing.

									`foundryPreviewable` IS THE CONDITION, AND IT IS NOT SPELLED
									OUT HERE. It mirrors the two clauses of the server's gate that
									this surface can see -- an upload that never unpacked, and a
									shelved app, which the gate refuses to its OWNER -- so that no
									control is offered whose only possible answer is a refusal.
									Written inline, that expression is the one somebody adds a
									status clause to; in a predicate it is a pure function with a
									test on it, and the test says in words that the status is the
									thing it must never ask.
								-->
								{#if foundryPreviewable(app, v)}
									{@const previewHref = foundryPreviewUrl(app.id, v.id)}
									{#if previewHref}
										<a
											class="btn tap-44"
											href={previewHref}
											target="_blank"
											rel="noopener"
										>
											Run a preview
										</a>
									{/if}
								{/if}

								<!--
									TAKE IT AWAY. The one control every version gets beside
									Run a preview, and for the same reason: "can I have my
									work back" does not depend on where a build is in review.

									WHAT ARRIVES IS THE STORED BUNDLE, NOT THE UPLOAD -- the
									entry file as ingest settled it, the wrapper directory
									already stripped, the ignored files already gone -- so it
									is what a viewer sees and it re-uploads to the same app.
									The route says the rest.

									`foundryDownloadable` IS `foundryPreviewable`, by
									assignment rather than by resemblance: the server decides
									both with ONE predicate, so the surface mirrors it with
									one function. See `bundle-url.ts`.

									NO `target`, because the response is an attachment and a
									new tab would open and immediately close itself. `download`
									is the browser's hint; the `Content-Disposition` header is
									what actually names the file, and the header is the half
									that survives a right-click and a pasted URL.
								-->
								{#if foundryDownloadable(app, v)}
									{@const downloadHref = foundryDownloadUrl(app.id, v.id)}
									{#if downloadHref}
										<a class="btn tap-44" href={downloadHref} download>
											Download v{v.ordinal}
										</a>
									{/if}
								{/if}

								{#if v.status === 'draft' && transports.submitVersion}
									<button
										type="button"
										class="btn fdy-primary tap-44"
										disabled={busy !== null || !draftIsSubmittable(v)}
										onclick={() => run('Submitting', () => transports.submitVersion!(v.id))}
									>
										Submit for review
									</button>
									{#if !draftIsSubmittable(v)}
										<span class="fdy-hint">This upload did not finish unpacking.</span>
									{/if}
								{/if}

								{#if v.status === 'submitted' && transports.withdrawVersion}
									{#if armed === `w${v.id}`}
										<button
											type="button"
											class="btn fdy-danger tap-44"
											disabled={busy !== null}
											onclick={async () => {
												armed = null;
												await run('Withdrawing', () => transports.withdrawVersion!(v.id));
											}}
										>
											Yes, withdraw it
										</button>
										<button type="button" class="btn tap-44" onclick={() => (armed = null)}>
											Keep it in review
										</button>
									{:else}
										<button
											type="button"
											class="btn tap-44"
											onclick={() => (armed = `w${v.id}`)}
										>
											Withdraw
										</button>
									{/if}
								{/if}

								{#if transports.deleteVersion && versionIsDeletable(v, app.published_version_id)}
								<!--
									TWO STEPS, AND THE SECOND ONE NAMES THE VERSION. There is
									no undo and no restore, so a single press cannot be the
									whole interaction (IDEA_INTERFACE_STANDARDS 10).
								-->
								{#if armed === `d${v.id}`}
									<span class="fdy-arm">
										<span class="fdy-arm-word">
											Delete v{v.ordinal} and its files? There is no undo.
										</span>
										<button
											type="button"
											class="btn fdy-danger tap-44"
											disabled={busy !== null}
											onclick={async () => {
												armed = null;
												await removeVersion(v.id, v.ordinal);
											}}
										>
											Yes, delete v{v.ordinal}
										</button>
										<button type="button" class="btn tap-44" onclick={() => (armed = null)}>
											Keep it
										</button>
									</span>
								{:else}
									<button
										type="button"
										class="btn fdy-danger-quiet tap-44"
										onclick={() => (armed = `d${v.id}`)}
									>
										Delete
									</button>
								{/if}
							{:else if transports.deleteVersion}
								<!--
									THE LIVE BUILD, AND SAYING SO BEATS AN ABSENT CONTROL.
									Every other version in this list has a Delete beside it, so
									the one that has none reads as a bug unless the reason is
									on screen. `foundry_delete_version` refuses this exact case.
								-->
								<span class="fdy-hint">
									The live build cannot be deleted on its own. Make another approved version
									live first, or delete the whole app.
								</span>
							{/if}

							{#if transports.rollback && targets.some((t) => t.id === v.id)}
									{#if armed === `r${v.id}`}
										<button
											type="button"
											class="btn fdy-primary tap-44"
											disabled={busy !== null}
											onclick={async () => {
												armed = null;
												if (app) await run('Switching', () => transports.rollback!(app!.id, v.id));
											}}
										>
											Yes, make v{v.ordinal} live
										</button>
										<button type="button" class="btn tap-44" onclick={() => (armed = null)}>
											Cancel
										</button>
									{:else}
										<button
											type="button"
											class="btn tap-44"
											onclick={() => (armed = `r${v.id}`)}
										>
											Make this the live one
										</button>
									{/if}
								{/if}
							</div>
						</li>
					{/each}
				</ul>

				<!--
					WHAT A PREVIEW DOES NOT PROVE, SAID ONCE, WHERE IT WILL BE READ.

					A preview runs in an opaque origin, so `localStorage` is the
					injected in-memory shim and nothing in it survives a reload. A
					PUBLISHED app runs on the apps origin, which is a real origin, so
					its saves do persist. Without this sentence the first student with
					a high score files a bug about it.

					IT SAYS WHICH DIRECTION THE DIFFERENCE RUNS, which is the half that
					actually helps: everything else about a preview is the published
					response, byte for byte and header for header, minus that one
					sandbox flag -- so a preview that works is a published app that
					works, and only the reverse can surprise anybody.

					ONCE, NOT PER VERSION. It is a fact about previewing, not about any
					particular build, and repeating it down a list of six versions is
					how a true sentence stops being read.
				-->
				<p class="fdy-hint">
					A preview runs your app exactly as it will run published, with one
					difference: saved data does not survive a reload in a preview, and it does
					once the app is live. Anything that works in a preview works published.
				</p>

				{#if transports.rollback && targets.length > 0}
					<p class="fdy-hint">
						Switching to an approved version puts it back exactly as it was. It does not go
						through review again, because it has already been approved once.
					</p>
				{/if}

				<a class="btn tap-44" href={`/foundry/submit?app=${app.id}`}>Upload a new version</a>
			</section>

			<!-- ------------------------------------------------- deleting the app -->
			{#if transports.deleteApp}
				{@const appId = app.id}
				<!--
					LAST ON THE PAGE, AND IT SAYS WHAT IT COSTS BEFORE IT IS ARMED.
					The counts are real and come from `deleteAppCostLine`, which both
					this surface and the review console read -- one sentence, so the
					same act cannot be described two ways.

					HIDE IS NOT OFFERED HERE. It is a staff decision (0130's
					`foundry_set_app_hidden` is admin only), and a student who wants
					their app off the gallery for a while has no such control -- so
					this block does not pretend otherwise. What it does say is that
					deleting is the only removal they own, and that it is permanent.
				-->
				<section class="fdy-block fdy-danger-block" aria-label="Delete this app">
					<h3>Delete this app</h3>
					<p class="fdy-danger-line">{deleteAppCostLine(app)}</p>
					{#if armed === `app${appId}`}
						<div class="fdy-row-actions">
							<button
								type="button"
								class="btn fdy-danger tap-44"
								disabled={busy !== null}
								onclick={async () => {
									armed = null;
									await removeApp();
								}}
							>
								Yes, delete &ldquo;{app.title}&rdquo;
							</button>
							<button type="button" class="btn tap-44" onclick={() => (armed = null)}>
								Keep it
							</button>
						</div>
					{:else}
						<button
							type="button"
							class="btn fdy-danger-quiet tap-44"
							onclick={() => (armed = `app${appId}`)}
						>
							Delete this app
						</button>
					{/if}
				</section>
			{/if}
		</article>
	{/if}
</ClassSplit>

<style>
	.fdy-list-pane {
		padding: var(--space-3, 0.75rem) 0;
		min-width: 0;
	}

	.fdy-list-head {
		display: flex;
		align-items: center;
		gap: var(--space-3, 0.75rem);
		flex-wrap: wrap;
		margin-bottom: var(--space-3, 0.75rem);
	}

	.fdy-list-head h2 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.9rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-new {
		margin-left: auto;
	}

	.fdy-cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2, 0.5rem);
	}

	/*
	 * With nothing selected the list owns the whole surface, so it uses it. The
	 * 22rem column is where a card's title and tagline stop being ellipsised;
	 * `min()` keeps the same rule working as the single narrow column with no
	 * breakpoint of its own.
	 */
	.fdy-cards-wide {
		grid-template-columns: repeat(auto-fit, minmax(min(22rem, 100%), 1fr));
	}

	.fdy-card {
		display: flex;
		gap: var(--space-3, 0.75rem);
		align-items: center;
		width: 100%;
		text-align: left;
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		padding: var(--space-2, 0.5rem);
		color: inherit;
		cursor: pointer;
		min-width: 0;
	}

	.fdy-card-on {
		border-color: var(--green);
		background: var(--bg2);
	}

	.fdy-card-cover {
		width: 4rem;
		height: 3rem;
		flex: none;
		object-fit: cover;
		border-radius: var(--radius-sm, 6px);
		background: var(--bg2);
		border: 1px solid var(--hairline);
	}

	.fdy-card-nocover {
		display: block;
	}

	.fdy-card-text {
		min-width: 0;
		display: grid;
		gap: 0.1rem;
	}

	.fdy-card-title {
		font-family: var(--font-display);
		font-size: 1.05rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fdy-card-tag {
		font-size: 0.82rem;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* A wrapping row of status chips, not an ellipsised line: a chip cut in
	   half says less than no chip, and a second state is worth a second line
	   exactly when there is one. The dot rules that used to live here moved
	   into ForgeStatus, which is the ONE spelling of the heat language. */
	.fdy-card-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--text-2);
		min-width: 0;
	}

	.fdy-card-facts {
		white-space: nowrap;
	}

	.fdy-empty {
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-md, 8px);
		padding: var(--space-5, 1.5rem);
		display: grid;
		gap: var(--space-2, 0.5rem);
		justify-items: start;
		max-width: 46rem;
	}

	.fdy-detail {
		padding: var(--space-3, 0.75rem) 0;
		min-width: 0;
	}

	.fdy-detail-head h2 {
		margin: 0.25rem 0 0;
		font-family: var(--font-display);
		font-size: 1.6rem;
	}

	.fdy-slug {
		margin: 0.1rem 0 var(--space-3, 0.75rem);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--cyan);
	}

	.fdy-block {
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-4, 1rem);
		margin-top: var(--space-4, 1rem);
	}

	.fdy-block h3 {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: 0 0 var(--space-3, 0.75rem);
	}

	.fdy-row {
		display: grid;
		gap: 0.3rem;
		padding: var(--space-2, 0.5rem) 0;
		border-bottom: 1px solid var(--hairline);
	}

	@media (min-width: 48rem) {
		.fdy-row {
			grid-template-columns: 12rem minmax(0, 1fr) auto;
			align-items: start;
			gap: var(--space-3, 0.75rem);
		}
	}

	.fdy-label {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-value {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-width: 68ch;
		line-height: 1.5;
	}

	.fdy-value-empty {
		color: var(--dim);
	}

	.fdy-row input[type='text'],
	.fdy-row textarea {
		width: 100%;
		background: var(--bg2);
		color: var(--white);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 6px);
		padding: 0.45rem 0.6rem;
		font-family: var(--font-display);
		font-size: 1rem;
		max-width: 68ch;
	}

	.fdy-row-actions {
		display: flex;
		gap: var(--space-2, 0.5rem);
	}

	.fdy-cover {
		max-width: 14rem;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid var(--hairline);
	}

	.fdy-versions {
		list-style: none;
		margin: 0 0 var(--space-3, 0.75rem);
		padding: 0;
		display: grid;
		gap: var(--space-2, 0.5rem);
	}

	.fdy-version {
		display: flex;
		gap: var(--space-3, 0.75rem);
		align-items: flex-start;
		flex-wrap: wrap;
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		padding: var(--space-3, 0.75rem);
		min-width: 0;
	}

	.fdy-version-main {
		flex: 1;
		min-width: 0;
	}

	.fdy-version-line {
		margin: 0;
		display: flex;
		gap: var(--space-3, 0.75rem);
		align-items: baseline;
		flex-wrap: wrap;
	}

	.fdy-ordinal {
		font-family: var(--font-mono);
		font-size: 1rem;
		color: var(--white);
	}

	.fdy-version-meta {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}

	.fdy-review-note {
		margin: var(--space-2, 0.5rem) 0 0;
		max-width: 68ch;
		line-height: 1.5;
		font-size: 0.92rem;
	}

	.fdy-version-actions {
		display: flex;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
		align-items: center;
	}

	.fdy-hint {
		font-size: 0.85rem;
		color: var(--text-2);
		max-width: 62ch;
		line-height: 1.45;
		margin: 0.25rem 0 0;
	}

	.fdy-shelved {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		border-left: 3px solid var(--fg-st-shelf-edge, var(--hairline));
		background: var(--bg1);
		padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		margin: 0 0 var(--space-3, 0.75rem);
		font-size: 0.9rem;
		max-width: 68ch;
	}

	.fdy-flagged {
		border-left: 3px solid var(--amber);
		background: var(--bg1);
		padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
		margin: 0 0 var(--space-3, 0.75rem);
		font-size: 0.9rem;
		max-width: 68ch;
	}

	.fdy-busy {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--teal);
		margin: 0 0 var(--space-2, 0.5rem);
	}

	.fdy-saved {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--green);
		margin: 0 0 var(--space-2, 0.5rem);
	}

	.fdy-primary {
		border-color: var(--green);
		color: var(--green);
	}

	.fdy-primary[disabled] {
		border-color: var(--hairline);
		color: var(--ice);
	}

	.fdy-danger {
		border-color: var(--crimson);
		color: var(--crimson);
	}

	/*
	 * THE UNARMED CONTROL IS QUIET AND THE ARMED ONE IS CRIMSON. `--crimson` is
	 * reserved for live / rec / error status, and a resting Delete sitting in a
	 * list of ordinary controls is none of those -- it is only an error state
	 * once it is one press from happening. So the resting control takes the
	 * room's own boundary and its secondary ink, and the confirm takes the
	 * warning colour with the word beside it.
	 */
	.fdy-danger-quiet {
		border-color: var(--boundary);
		color: var(--text-2, var(--dim));
	}

	.fdy-danger-quiet:hover,
	.fdy-danger-quiet:focus-visible {
		border-color: var(--crimson);
		color: var(--crimson);
	}

	/* The forge reading: shelved metal, flat and no heat. A destructive block is
	   not IN PROGRESS, so nothing in it may wear the heat scale. */
	.fdy-danger-block {
		border-top-color: var(--fg-st-shelf-edge, var(--boundary));
	}

	.fdy-danger-block h3 {
		color: var(--fg-st-shelf-ink, var(--text-2));
	}

	.fdy-danger-line {
		margin: 0 0 var(--space-3, 0.75rem);
		max-width: 68ch;
		line-height: 1.5;
		font-size: 0.92rem;
		color: var(--text-1, var(--white));
	}

	/* The armed confirm keeps its words on one line with the buttons where
	   there is room, and wraps rather than ellipsising where there is not. */
	.fdy-arm {
		display: flex;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
		min-width: 0;
	}

	.fdy-arm-word {
		font-size: 0.85rem;
		color: var(--text-1, var(--white));
		max-width: 34ch;
	}

	.fdy-deleted {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-st-shelf-ink, var(--dim));
		margin: 0 0 var(--space-2, 0.5rem);
		max-width: 68ch;
		line-height: 1.5;
	}

	.fdy-back {
		font-size: 0.85rem;
	}
</style>
