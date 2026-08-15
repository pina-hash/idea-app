<script lang="ts">
	import DeckPanel from '$lib/classroom/DeckPanel.svelte';
	import DeckViewer from '$lib/classroom/DeckViewer.svelte';
	import {
		clearLocalDeckUrls,
		deckUploadSizeIssue,
		DECK_UPLOAD_MAX_ZIP_BYTES,
		registerLocalDeckUrl,
		type ClassroomDeck,
		type DeckTransports,
		type DeckUploadResult
	} from '$lib/classroom/deck';
	import { DeckUploadCancelled, postDeckZip } from '$lib/classroom/deck-upload';

	/**
	 * /dev/classroom-deck -- the deck harness (404 in production, no auth, no
	 * Supabase, no Drive).
	 *
	 * It ingests the REAL committed deck (static/fsp/day2) through the SHIPPING
	 * unpacker and mounts the REAL DeckPanel and DeckViewer against it. The one
	 * substitution is where the files come from: a dev endpoint that mirrors the
	 * production proxy's URL shape, content types and CSP, so the deck's own
	 * relative fetches -- `.image-slots.state.json` included -- resolve exactly
	 * as they do live.
	 *
	 * IT DRIVES THE REAL `postDeckZip` UPLOADER (deck-upload.ts), pointed at
	 * `/dev/classroom-deck/ingest` instead of the production route: the same
	 * multipart POST, the same real upload progress via XHR, the same parsing
	 * of the server's response. Only the endpoint is a stand-in, since this
	 * harness has no session and no Drive to authorize an upload against.
	 *
	 * THE REGRESSION IT EXISTS FOR: the "without the hidden state file" toggle.
	 * An unframed image looks plausible rather than broken, so the only way to
	 * see the difference is to have both readings side by side.
	 */

	type Mode = 'normal' | 'no-state' | 'ambiguous' | 'traversal';
	/**
	 * Fault injection for the DIAGNOSIS half. Every one of these looks like
	 * "something went wrong" from a browser unless it is named, which is the
	 * whole reason the codes exist -- and none of them can be produced locally
	 * without asking the server to misbehave on purpose. `fail-upload` /
	 * `hang-upload` hit the single combined multipart request; the other three
	 * hit the `files` stage of unpacking, unchanged from before.
	 */
	type Fault = 'none' | 'fail-upload' | 'hang-upload' | 'fail-files' | 'hang-files' | 'interrupt-once';
	interface IngestBody {
		deck: ClassroomDeck;
		warnings: string[];
		paths: string[];
	}

	/**
	 * Padded past DECK_UPLOAD_MAX_ZIP_BYTES on purpose: the "oversize" toggle
	 * below exists to demonstrate the real client-side size refusal against
	 * real bytes, not to exercise a chunked transfer (there is no more
	 * chunking -- a deck upload is one request now, capped at a few MB).
	 */
	const PAD_BYTES = DECK_UPLOAD_MAX_ZIP_BYTES + 1024 * 1024;

	let mode = $state<Mode>('normal');
	let fault = $state<Fault>('none');
	let oversize = $state(false);
	let view = $state<'panel' | 'viewer'>('panel');
	let deck = $state<ClassroomDeck | null>(null);
	let log = $state<string[]>([]);
	let paths = $state<string[]>([]);

	/**
	 * A FRESH id per ingest, exactly as production behaves: classroom_replace_deck
	 * mints a new deck row, so every file URL changes and the ten-minute cache on
	 * the old tree can never be mistaken for the new one. Found the hard way --
	 * with a fixed id, re-ingesting WITHOUT the state file still showed framed
	 * images, because the browser was serving the previous ingest's cached
	 * `.image-slots.state.json`.
	 */
	let deckSeq = 0;
	let deckId = $state('');

	function note(line: string) {
		log = [line, ...log].slice(0, 12);
	}

	/** One `files`/`finish`/`abort` stage call, the SAME failure taxonomy the real one uses. */
	const STAGE_TIMEOUT_MS = 6000;

	async function stage(
		payload: Record<string, unknown>,
		signal?: AbortSignal
	): Promise<Record<string, unknown>> {
		const controller = new AbortController();
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, STAGE_TIMEOUT_MS);
		const onAbort = () => controller.abort();
		signal?.addEventListener('abort', onAbort, { once: true });
		try {
			const res = await fetch('/dev/classroom-deck/ingest', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload),
				signal: controller.signal
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				return { failed: true, code: body.code ?? `http_${res.status}`, error: body.error, body };
			}
			return body;
		} catch (e) {
			if (signal?.aborted && !timedOut) throw new DeckUploadCancelled();
			return {
				failed: true,
				code: timedOut ? 'ingest_timeout' : 'ingest_network',
				error: timedOut
					? `The server did not answer within ${STAGE_TIMEOUT_MS / 1000}s.`
					: `The connection to the server dropped. (${(e as Error).message})`
			};
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
		}
	}

	/**
	 * The harness's transports, which follow the SAME SHAPE the real ones do --
	 * one multipart upload (authorize + write-to-Drive + plan, folded into one
	 * request against the real deployment), then drive files x N / finish
	 * against a stand-in ingest endpoint instead of Drive.
	 *
	 * `uploadDeck` ignores the File it is handed (a browser has no real export to
	 * pick) and downloads the fixture zip instead, but from there the bytes are
	 * REAL and make the whole round trip: the SHIPPING `postDeckZip` posts them
	 * with real XHR progress, the stand-in endpoint stores what actually
	 * arrived, and the SHIPPING planner unpacks it. So the progress arithmetic,
	 * the cancel, and the "no residue" claim are measured rather than mocked.
	 */
	const transports: DeckTransports = {
		async uploadDeck(_itemId, _file, options): Promise<DeckUploadResult> {
			const { entryPath = null, onProgress, signal } = options ?? {};
			const nextId = `dev-deck-${++deckSeq}`;
			let jobId: string | null = null;
			try {
				onProgress?.({ phase: 'preparing', loaded: 0, total: 0 });

				const params = new URLSearchParams();
				if (mode === 'no-state') params.set('state', 'off');
				if (mode === 'ambiguous') params.set('ambiguous', '1');
				if (mode === 'traversal') params.set('traversal', '1');
				if (oversize) params.set('pad', String(PAD_BYTES));
				const zipRes = await fetch(`/dev/classroom-deck/fixture?${params}`);
				const zip = await zipRes.blob();
				const file = new File([zip], 'IDEA FSP Day 2.zip', { type: 'application/zip' });
				note(`fixture zip: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

				// EXACTLY the check DeckPanel and the real transport run before
				// sending anything -- driven here too, over real bytes, so the
				// "refused before it is attempted" claim is measured rather than
				// assumed.
				const sizeIssue = deckUploadSizeIssue(file.size);
				if (sizeIssue) {
					note(`refused before sending: over the limit`);
					return { ok: false, code: 'too_large', message: sizeIssue };
				}

				const form = new FormData();
				form.set('id', nextId);
				if (entryPath) form.set('entry_path', entryPath);
				if (fault === 'fail-upload') form.set('fail', '1');
				if (fault === 'hang-upload') form.set('hang', '1');
				form.set('file', file, file.name);

				const started = await postDeckZip({
					form,
					total: file.size,
					signal,
					onProgress: (loaded) => onProgress?.({ phase: 'uploading', loaded, total: file.size }),
					url: '/dev/classroom-deck/ingest'
				});
				if (!started.ok) {
					note(`refused: ${started.message}`);
					return {
						ok: false,
						code: started.code,
						message: started.message,
						candidates: started.candidates ?? []
					};
				}
				jobId = started.jobId;
				const total = started.totalFiles;
				const warnings = started.warnings;
				note(`begin: job ${jobId}, ${total} files planned`);

				// --- files x N -----------------------------------------------
				let done = 0;
				let interrupted = false;
				onProgress?.({ phase: 'unpacking', loaded: 0, total });
				for (let call = 0; call < total + 12; call++) {
					const injectInterrupt = fault === 'interrupt-once' && !interrupted;
					if (injectInterrupt) interrupted = true;
					let step = await stage(
						{
							stage: 'files',
							job_id: jobId,
							fail: fault === 'fail-files',
							hang: fault === 'hang-files',
							interrupt: injectInterrupt
						},
						signal
					);
					// A transport-shaped failure is retried, because every stage
					// is resumable -- which is exactly what makes the injected
					// interruption recoverable rather than fatal.
					for (
						let retry = 0;
						retry < 3 &&
						step.failed === true &&
						(step.code === 'ingest_network' ||
							step.code === 'ingest_timeout' ||
							step.code === 'drive_upload');
						retry++
					) {
						note(`stage failed (${step.code}) -- retrying`);
						if (fault === 'fail-files' || fault === 'hang-files') break;
						await new Promise((r) => setTimeout(r, 200));
						step = await stage({ stage: 'files', job_id: jobId }, signal);
					}
					if (step.failed === true) {
						note(`gave up: ${step.code}`);
						return { ok: false, code: step.code as string, message: String(step.error) };
					}
					done = Number(step.files_done ?? done);
					onProgress?.({ phase: 'unpacking', loaded: done, total });
					note(`unpacked ${done}/${total}`);
					if (step.complete === true) break;
				}

				// --- finish ---------------------------------------------------
				onProgress?.({ phase: 'storing', loaded: total, total });
				const stored = await stage({ stage: 'finish', job_id: jobId }, signal);
				if (stored.failed === true || !stored.ok) {
					return { ok: false, code: stored.code as string, message: String(stored.error) };
				}
				jobId = null;
				return finish(nextId, stored as unknown as IngestBody, warnings);
			} catch (e) {
				if (e instanceof DeckUploadCancelled) {
					note('upload cancelled -- nothing stored');
					return { ok: false, cancelled: true, message: 'Upload cancelled.' };
				}
				const err = e as { code?: string; message?: string };
				note(`failed: ${err.code ?? '?'} -- ${err.message}`);
				return { ok: false, code: err.code, message: err.message ?? 'Upload failed.' };
			} finally {
				if (jobId) {
					note('abandoning the job -- nothing partial is kept');
					void fetch('/dev/classroom-deck/ingest', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ stage: 'abort', job_id: jobId })
					}).catch(() => {});
				}
			}
		},
		async deleteDeck() {
			deck = null;
			paths = [];
			if (deckId) clearLocalDeckUrls(deckId);
			note('deck removed');
			return { ok: true, message: 'removed' };
		}
	};

	/** Registers the ingested deck's local URLs and shows it, as the panel expects. */
	function finish(nextId: string, body: IngestBody, warnings: string[] = []): DeckUploadResult {
		clearLocalDeckUrls(nextId);
		registerLocalDeckUrl(
			nextId,
			body.deck.entry_path,
			`/dev/classroom-deck/f/${nextId}/${body.deck.entry_path.split('/').map(encodeURIComponent).join('/')}`
		);
		if (body.deck.thumbnail_path) {
			registerLocalDeckUrl(
				nextId,
				body.deck.thumbnail_path,
				`/dev/classroom-deck/f/${nextId}/${body.deck.thumbnail_path}`
			);
		}
		deck = body.deck;
		deckId = nextId;
		paths = body.paths;
		note(`ingested ${body.deck.file_count} files, state file: ${body.deck.has_state_file}`);
		return {
			ok: true,
			message: 'ok',
			warnings: [...warnings, ...(body.warnings ?? [])].filter(
				(w, i, all) => all.indexOf(w) === i
			),
			replaced: false,
			fileCount: body.deck.file_count
		};
	}

	const stateFile = $derived(paths.find((p) => p === '.image-slots.state.json') ?? null);
</script>

<svelte:head><title>dev // classroom deck</title></svelte:head>

{#if view === 'viewer' && deck}
	<DeckViewer {deck} backHref="#" backLabel="Back to the harness" />
	<button class="escape" onclick={() => (view = 'panel')}>close viewer</button>
{:else}
	<main class="wrap">
		<h1>Classroom deck harness</h1>
		<p class="sub">
			Ingests the real committed deck (static/fsp/day2) through the shipping unpacker, uploaded
			through the shipping <code>postDeckZip</code> transport. No auth, no Supabase, no Drive.
		</p>

		<div class="controls">
			<label>
				zip shape
				<select bind:value={mode}>
					<option value="normal">normal export (wrapper folder + hidden state file)</option>
					<option value="no-state">WITHOUT .image-slots.state.json</option>
					<option value="ambiguous">two candidate entry pages</option>
					<option value="traversal">contains ../escaped.html</option>
				</select>
			</label>
			<label>
				inject a fault
				<select bind:value={fault}>
					<option value="none">none</option>
					<option value="fail-upload">the combined upload request answers 502</option>
					<option value="hang-upload">the combined upload request never answers (client timeout)</option>
					<option value="interrupt-once">interrupt one files stage (then resume)</option>
					<option value="fail-files">files stage answers 502</option>
					<option value="hang-files">files stage never answers (client timeout)</option>
				</select>
			</label>
			<label class="row">
				<input type="checkbox" bind:checked={oversize} />
				oversize -- pad past the {Math.floor(DECK_UPLOAD_MAX_ZIP_BYTES / 1024 / 1024)} MB upload limit
			</label>
			{#if deck}
				<button class="btn secondary" onclick={() => (view = 'viewer')}>Open viewer</button>
			{/if}
		</div>

		<DeckPanel
			{deck}
			itemId="00000000-0000-4000-8000-000000000001"
			sectionId="00000000-0000-4000-8000-000000000002"
			basePath="/dev/classroom-deck"
			canManage={true}
			{transports}
		/>

		{#if deck}
			<section class="card">
				<h2>What was stored</h2>
				<p class="mono">
					entry: {deck.entry_path} · slides: {deck.slides.length} · files: {deck.file_count}
				</p>
				<p class="mono" class:good={!!stateFile} class:bad={!stateFile}>
					hidden state file: {stateFile ?? 'ABSENT -- every image will render uncropped'}
				</p>
				<details>
					<summary>{paths.length} paths</summary>
					<ul class="paths">
						{#each paths as p (p)}<li>{p}</li>{/each}
					</ul>
				</details>
			</section>
		{/if}

		{#if log.length}
			<section class="card">
				<h2>Log</h2>
				<ul class="paths">{#each log as line, i (i)}<li>{line}</li>{/each}</ul>
			</section>
		{/if}
	</main>
{/if}

<style>
	.wrap {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 4rem;
	}
	.sub {
		color: var(--dim);
		font-size: 0.86rem;
	}
	.controls {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin: 1rem 0;
	}
	.controls label.row {
		flex-direction: row;
		align-items: center;
		gap: 0.45rem;
	}
	.controls label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
	}
	.mono {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
		overflow-wrap: anywhere;
	}
	.mono.good {
		color: var(--green);
	}
	.mono.bad {
		color: var(--amber);
	}
	.paths {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.escape {
		position: fixed;
		top: 0.6rem;
		right: 0.6rem;
		z-index: 10;
		background: rgba(10, 10, 10, 0.9);
		color: var(--white);
		border: 1px solid var(--line);
		border-radius: 999px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		padding: 0.6rem 0.9rem;
		cursor: pointer;
	}
</style>
