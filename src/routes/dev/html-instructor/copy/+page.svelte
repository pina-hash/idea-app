<script lang="ts">
	/**
	 * AN INSTRUCTOR FILLING IN A PORTED WORKSHEET (0199).
	 *
	 * THE DEFECT THIS SURFACE CLOSES. A manager's item page mounted a ported
	 * document READ-ONLY -- structurally, by handing down no answers controller
	 * -- so nobody could open a worksheet and confirm it records anything before
	 * a class used it. The first person to find a document whose fields save
	 * nothing was a student, mid-period, with their work already typed in.
	 *
	 * IT MOUNTS THE REAL `HtmlInstructorCopy` over the REAL `/hx/worksheet`
	 * document, with a real `HxAnswersStore` behind it. The only stand-ins are
	 * the four 0128 transports, which record what they were asked to write
	 * instead of calling Supabase -- so the readings below are what the RPC
	 * would have been handed, block id and value, and the block ids are the ones
	 * the REAL manifest resolved from the REAL document's own bytes.
	 *
	 * THE TWO THINGS TO DRIVE:
	 *   1. TYPE IN THE DOCUMENT. Each field is an `idea:change` by FIELD; the
	 *      controller resolves it to a block id through the manifest and the
	 *      write list below fills in. A field the manifest does not declare
	 *      records nothing, which is the renamed-field failure made visible.
	 *   2. DESIGNATE THE COPY. It flushes everything pending first (a key
	 *      published one debounce short of the screen is 0128's own rule), then
	 *      asks. The empty-copy refusal is the server's answer and is rendered
	 *      where the instructor is working.
	 *
	 * THE PHOTOGRAPH SWITCH IS THE HALF THAT REGRESSES SILENTLY. There is no
	 * instructor counterpart to `classroom_submission_files`, so the projection
	 * carries no file transports at all and each picture message settles a
	 * REFUSAL that travels back into the document. `Send a synthetic idea:image`
	 * is how that path is driven without a camera: it calls the controller
	 * exactly as the frame would.
	 *
	 * AND WHAT DRIVING IT SHOWED, WHICH IS WHY THE NOTE ABOVE THE FRAME IS
	 * UNCONDITIONAL: the refusal REASON travels, but whether it is SHOWN is the
	 * document author's decision. Rasterized on this fixture, the blade
	 * document's own header reads `Saved <timestamp>` after a change and flips
	 * to its own generic `Not saved. Your work is still on screen; it has not
	 * reached the server.` after the refused picture -- its wording, not the
	 * controller's, and global to the whole worksheet even though only the
	 * picture was refused. That is a property of the bridge's single
	 * acknowledgement channel and is the same on the student path; what it
	 * means here is that the only sentence guaranteed to reach an instructor
	 * about photographs is the one in PARENT chrome, which is why
	 * `HTML_INSTRUCTOR_COPY_UPLOAD_NOTE` is rendered before anybody presses
	 * anything.
	 *
	 * Geometry, contrast and tap targets are `npm run verify:browser`'s, through
	 * `tools/browser-verify/routes/html-instructor-copy.mjs`.
	 */
	import { onDestroy } from 'svelte';
	import HtmlInstructorCopy from '$lib/classroom/html-assignment/HtmlInstructorCopy.svelte';
	import { HxAnswersStore } from '$lib/classroom/html-assignment/answers-store.svelte';
	import { hxInstructorAnswerTransports } from '$lib/classroom/html-assignment/instructor';
	import type {
		InstructorCopyData,
		InstructorCopyTransports,
		InstructorKeyRow,
		ResponseValue
	} from '$lib/classroom/assignment-spec';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const ITEM_ID = 'item-1';
	const ME = 'reyes@boscotech.edu';

	/** WHAT THE DATABASE WOULD HOLD. Keyed the way 0128's table is, so the list
	    on screen is the row set an instructor's copy would consist of. */
	let rows = $state<{ block_id: string; value: ResponseValue; at: string }[]>([]);
	let key = $state<InstructorKeyRow | null>(null);
	let refusals = $state<string[]>([]);
	let saveFails = $state(false);

	const copy = $derived<InstructorCopyData>({
		myEmail: ME,
		mine: rows.map((r) => ({
			item_id: ITEM_ID,
			instructor_email: ME,
			block_id: r.block_id,
			value: r.value
		})),
		key,
		keyResponses: []
	});

	/**
	 * 0128'S FOUR WRITES, IN MEMORY. `saveResponse` is the one the projection
	 * takes; the other three are the answer-key machinery the surface calls
	 * directly. `designateKey` reproduces the server's `empty_copy` refusal
	 * rather than the page deciding for itself, because that refusal is the
	 * thing worth being able to see.
	 */
	const transports: InstructorCopyTransports = {
		async saveResponse(_itemId: string, blockId: string, value: ResponseValue) {
			if (saveFails) {
				return { ok: false as const, message: 'The network went away, so that was not saved.' };
			}
			const at = new Date().toISOString().slice(11, 19);
			const held = rows.findIndex((r) => r.block_id === blockId);
			if (held >= 0) rows[held] = { block_id: blockId, value, at };
			else rows = [...rows, { block_id: blockId, value, at }];
			return { ok: true as const, data: { ok: true } };
		},
		async designateKey() {
			if (!rows.length) {
				return { ok: true as const, data: { ok: false, reason: 'empty_copy' } };
			}
			key = {
				item_id: ITEM_ID,
				instructor_email: ME,
				designated_at: new Date().toISOString(),
				designated_by: ME
			};
			return { ok: true as const, data: { ok: true, instructor_email: ME } };
		},
		async undesignateKey() {
			if (!key) return { ok: true as const, data: { ok: false, reason: 'no_key' } };
			key = null;
			return { ok: true as const, data: { ok: true } };
		},
		async reload() {
			return { ok: true as const, data: copy };
		}
	};

	/**
	 * THE REAL CONTROLLER, BUILT THE WAY THE ITEM ROUTE BUILDS IT: the manifest
	 * from the document, `hxInstructorAnswerTransports` over 0128's own save,
	 * and NO file transports at all.
	 *
	 * `values` SEEDS EMPTY, because an instructor opening their copy for the
	 * first time has written nothing. Re-seeding it from `rows` as they type
	 * would be the harness deciding what the document shows instead of the
	 * controller, which is the one thing a harness must not do.
	 */
	// BUILT ONCE AND OWNED, which is the controller's contract everywhere it is
	// mounted: it holds a live `SaveState` per block with real debounce timers,
	// so rebuilding it because `data` changed identity would drop whatever those
	// machines still owed. The load runs once on this route and `data.manifest`
	// is the document's own, read out of its bytes at load time.
	// svelte-ignore state_referenced_locally
	const answers = new HxAnswersStore({
		itemId: ITEM_ID,
		manifest: data.manifest,
		transports: hxInstructorAnswerTransports(transports),
		values: {},
		images: {},
		fileIds: new Map()
	});

	$effect(() => answers.attach());
	onDestroy(() => answers.destroy());

	/**
	 * DRIVE THE PICTURE PATH WITHOUT A CAMERA. It calls the controller with the
	 * same message shape `HtmlAssignmentFrame` builds from an `idea:image`, so
	 * the refusal below is the one a real press produces. A one-pixel PNG, so
	 * the bytes are real bytes and `hxFileFromBase64` is genuinely exercised on
	 * the path where the transport is missing.
	 */
	const ONE_PIXEL_PNG =
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

	async function sendImage() {
		const before = answers.saved;
		await answers.image?.({
			blockId: 'sketches-images',
			field: 'sketch-images',
			name: 'sketch.png',
			bytes: ONE_PIXEL_PNG
		});
		const ack = answers.saved;
		if (ack && ack !== before && !ack.ok) refusals = [...refusals, ack.reason ?? '(no reason)'];
	}

	function reset() {
		rows = [];
		key = null;
		refusals = [];
		saveFails = false;
	}
</script>

<svelte:head><title>An instructor working copy of a ported worksheet</title></svelte:head>

<main class="harness">
	<h1>An instructor's working copy of a ported worksheet</h1>
	<p class="lede">
		The real <code>HtmlInstructorCopy</code> over the real ported document, IDEA100 Blade CAD 01.
		Every change inside the frame travels the bridge by FIELD, the controller resolves it to a
		permanent block id through the manifest read out of that document's own bytes, and the write
		lands in the list below as <code>classroom_save_instructor_response</code> would have
		received it. The frame is sandboxed with no <code>allow-same-origin</code>, so nothing on this
		page can reach into the document and the bridge is the only way an answer gets out.
	</p>

	<div class="panel" data-testid="hxi-state">
		<div class="counters">
			<span class="counter" data-testid="hxi-count-rows">instructor rows {rows.length}</span>
			<span class="counter" data-testid="hxi-count-refusals">picture refusals {refusals.length}</span>
			<span class="counter" data-testid="hxi-key">
				key {key ? key.instructor_email : 'not designated'}
			</span>
		</div>
		<p class="reading" data-testid="hxi-fields">
			Fields the manifest declares: <code>{Object.keys(data.fieldToBlockId).join(', ')}</code>
		</p>

		{#if rows.length}
			<ul class="rows" data-testid="hxi-rows">
				{#each rows as r (r.block_id)}
					<li>
						<code>{r.block_id}</code> &middot; {JSON.stringify(r.value)} &middot; {r.at}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="reading" data-testid="hxi-empty">Nothing written yet.</p>
		{/if}

		{#if refusals.length}
			<ul class="rows" data-testid="hxi-refusals">
				{#each refusals as r, i (i)}<li>{r}</li>{/each}
			</ul>
		{/if}

		<div class="controls">
			<button type="button" class="btn secondary tap-44" data-testid="hxi-image" onclick={sendImage}>
				Send a synthetic idea:image
			</button>
			<button type="button" class="btn secondary tap-44" data-testid="hxi-reset" onclick={reset}>
				Reset
			</button>
			<label class="switch">
				<input type="checkbox" bind:checked={saveFails} data-testid="hxi-fail" />
				<span>Saving fails (the retry path)</span>
			</label>
		</div>
	</div>

	<div class="copy-host">
		<HtmlInstructorCopy
			itemId={ITEM_ID}
			src={data.src}
			title="IDEA100 Blade CAD 01"
			fieldToBlockId={data.fieldToBlockId}
			{answers}
			data={copy}
			{transports}
		/>
	</div>
</main>

<style>
	.harness {
		max-width: 68rem;
		margin: 0 auto;
		padding: 1.5rem 1.2rem 4rem;
	}
	h1 {
		margin: 0 0 0.4rem;
	}
	.lede {
		margin: 0 0 1.2rem;
		color: var(--text-2);
		max-width: 46rem;
	}
	.panel {
		margin: 0 0 1.4rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
	}
	.counters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}
	.counter {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		color: var(--text-2);
	}
	.reading {
		margin: 0 0 0.4rem;
		font-size: 0.86rem;
		color: var(--text-2);
	}
	.rows {
		margin: 0.6rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.84rem;
		color: var(--text-2);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		font-size: 0.84rem;
		color: var(--text-1);
	}
	.copy-host {
		position: relative;
	}
</style>
