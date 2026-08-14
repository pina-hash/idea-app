<script lang="ts">
	import DeckPanel from '$lib/classroom/DeckPanel.svelte';
	import DeckViewer from '$lib/classroom/DeckViewer.svelte';
	import {
		clearLocalDeckUrls,
		registerLocalDeckUrl,
		type ClassroomDeck,
		type DeckTransports,
		type DeckUploadResult
	} from '$lib/classroom/deck';
	import { DeckUploadCancelled, uploadZipToDrive } from '$lib/classroom/deck-upload';

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
	 * THE REGRESSION IT EXISTS FOR: the "without the hidden state file" toggle.
	 * An unframed image looks plausible rather than broken, so the only way to
	 * see the difference is to have both readings side by side.
	 */

	type Mode = 'normal' | 'no-state' | 'ambiguous' | 'traversal';
	/**
	 * Fault injection for the DIAGNOSIS half. Every one of these looks like
	 * "something went wrong" from a browser unless it is named, which is the
	 * whole reason the codes exist -- and none of them can be produced locally
	 * without asking the server to misbehave on purpose.
	 */
	type Fault = 'none' | 'fail-files' | 'hang-files' | 'interrupt-once';
	interface IngestBody {
		deck: ClassroomDeck;
		warnings: string[];
		paths: string[];
	}

	/**
	 * A pad big enough to force several chunks through the shipping uploader
	 * (its chunk is 8 MiB), so progress across a chunk boundary and cancelling
	 * mid-transfer are exercised rather than assumed. The committed deck alone
	 * is ~3 MB and goes up in one request.
	 */
	const PAD_BYTES = 36 * 1024 * 1024;

	let mode = $state<Mode>('normal');
	let fault = $state<Fault>('none');
	let large = $state(false);
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

	/** One ingest stage, with the same timeout and failure taxonomy the real one uses. */
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
	 * The harness's transports, which follow the SAME STAGES the real ones do --
	 * authorize, upload the bytes direct, then drive begin / files x N / finish
	 * -- against a stand-in session instead of Drive.
	 *
	 * `uploadDeck` ignores the File it is handed (a browser has no real export to
	 * pick) and downloads the fixture zip instead, but from there the bytes are
	 * REAL and make the whole round trip: the SHIPPING uploader chunks them, the
	 * stand-in session reassembles them, and the SHIPPING planner unpacks what
	 * actually arrived. So the progress arithmetic, the cancel, the resumption
	 * and the "no residue" claim are measured rather than mocked.
	 */
	const transports: DeckTransports = {
		async uploadDeck(_itemId, _file, options): Promise<DeckUploadResult> {
			const { entryPath = null, onProgress, signal } = options ?? {};
			const nextId = `dev-deck-${++deckSeq}`;
			let uploadId: string | null = null;
			let jobId: string | null = null;
			try {
				onProgress?.({ phase: 'preparing', loaded: 0, total: 0 });

				const params = new URLSearchParams();
				if (mode === 'no-state') params.set('state', 'off');
				if (mode === 'ambiguous') params.set('ambiguous', '1');
				if (mode === 'traversal') params.set('traversal', '1');
				if (large) params.set('pad', String(PAD_BYTES));
				const zipRes = await fetch(`/dev/classroom-deck/fixture?${params}`);
				const zip = await zipRes.blob();
				const file = new File([zip], 'IDEA FSP Day 2.zip', { type: 'application/zip' });
				note(`fixture zip: ${(file.size / 1024 / 1024).toFixed(1)} MB`);

				const openRes = await fetch('/dev/classroom-deck/upload', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ upload_id: `up-${deckSeq}`, size_bytes: file.size })
				});
				const open = await openRes.json();
				uploadId = open.upload_id as string;

				const driveFileId = await uploadZipToDrive({
					uploadUrl: open.upload_url,
					file,
					signal,
					onProgress: (p) => onProgress?.({ phase: 'uploading', ...p })
				});
				note(`uploaded, file id ${driveFileId}`);

				// --- begin ---------------------------------------------------
				onProgress?.({ phase: 'unpacking', loaded: 0, total: 0 });
				const begun = await stage(
					{ stage: 'begin', id: nextId, upload_id: uploadId, drive_file_id: driveFileId, entryPath },
					signal
				);
				uploadId = null;
				if (begun.failed || !begun.ok) {
					note(`refused: ${begun.error}`);
					// A refusal's detail rides in the response BODY, which the
					// failure wrapper carries under `body` -- the real transport
					// reads it from exactly there, and an entry-page question with
					// no candidates is a dead end for the uploader.
					const detail = ((begun.body as Record<string, unknown>) ?? begun) as Record<
						string,
						unknown
					>;
					return {
						ok: false,
						code: (begun.code as string) ?? undefined,
						message: String(begun.error ?? detail.error ?? 'refused'),
						candidates: (detail.candidates as string[]) ?? []
					};
				}
				jobId = String(begun.job_id);
				const total = Number(begun.total_files ?? 0);
				const warnings = (begun.warnings as string[]) ?? [];
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
				note(`failed: ${(e as Error).message}`);
				return { ok: false, message: (e as Error).message };
			} finally {
				if (uploadId) {
					void fetch(`/dev/classroom-deck/upload/${uploadId}`, { method: 'DELETE' }).catch(() => {});
				}
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
			Ingests the real committed deck (static/fsp/day2) through the shipping unpacker. No auth, no
			Supabase, no Drive.
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
					<option value="interrupt-once">interrupt one files stage (then resume)</option>
					<option value="fail-files">files stage answers 502</option>
					<option value="hang-files">files stage never answers (client timeout)</option>
				</select>
			</label>
			<label class="row">
				<input type="checkbox" bind:checked={large} />
				pad to ~{Math.round(PAD_BYTES / 1024 / 1024)} MB (multi-chunk upload)
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
