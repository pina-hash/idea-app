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

	let mode = $state<Mode>('normal');
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

	/**
	 * The harness's transports. `uploadDeck` ignores the File it is handed and
	 * ingests the fixture instead -- there is no real zip to pick in a browser
	 * that has not got one -- but everything downstream (the refusal shapes, the
	 * candidate prompt, the warnings) is the real thing coming back from the
	 * real planner.
	 */
	const transports: DeckTransports = {
		async uploadDeck(_itemId, _file, entryPath): Promise<DeckUploadResult> {
			const nextId = `dev-deck-${++deckSeq}`;
			const res = await fetch('/dev/classroom-deck/ingest', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: nextId,
					withoutStateFile: mode === 'no-state',
					ambiguous: mode === 'ambiguous',
					traversal: mode === 'traversal',
					entryPath
				})
			});
			const body = await res.json();
			if (!body.ok) {
				note(`refused: ${body.error}`);
				return { ok: false, message: body.error, candidates: body.candidates ?? [] };
			}
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
			deck = body.deck as ClassroomDeck;
			deckId = nextId;
			paths = body.paths as string[];
			note(`ingested ${body.deck.file_count} files, state file: ${body.deck.has_state_file}`);
			return {
				ok: true,
				message: 'ok',
				warnings: body.warnings,
				replaced: false,
				fileCount: body.deck.file_count
			};
		},
		async deleteDeck() {
			deck = null;
			paths = [];
			if (deckId) clearLocalDeckUrls(deckId);
			note('deck removed');
			return { ok: true, message: 'removed' };
		}
	};

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
