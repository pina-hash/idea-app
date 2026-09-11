<script lang="ts">
	/**
	 * REPLACING A POSTED PORTED DOCUMENT, AND WHAT IT COSTS (ledger 0154).
	 *
	 * A posted HTML assignment could not be changed at all: the composer's
	 * upload panel was create-only, so a typo in a worksheet a class was already
	 * working in was permanent. Decision 10's recorded narrowing is that the
	 * instructor edit path IS re-upload producing a new revision, because a
	 * sandboxed document cannot be edited in place.
	 *
	 * THE RULE THIS PAGE EXISTS TO SHOW. A BLOCK ID IS THE JOIN KEY FOR EVERY
	 * STORED ANSWER, so a new document that renames one leaves the rows under
	 * the old id in the database and out of the worksheet -- no error, no empty
	 * row, just work that has quietly stopped rendering. Measured against real
	 * Postgres in `tests/db/html-assignment-revision.test.ts`.
	 *
	 * IT MOUNTS THE REAL COMPONENT, and every one of the three shapes is driven
	 * through the REAL pick path: the buttons build a real `File` from a real
	 * document and push it into the composer's own `<input type="file">`, so
	 * `readStagedHtml` and `validateHtmlManifest` run exactly as they do for a
	 * teacher's export. Nothing here is a copy of the panel, the diff or the
	 * sentences.
	 *
	 * THE COUNTER IS REAL TOO, in the sense that matters: it reads the in-memory
	 * ANSWERS table below rather than returning a number this page chose, so the
	 * figure in the confirmation and the rows on screen cannot disagree. The
	 * failing and absent counters are switches beside it, because "cannot tell
	 * must not read as nothing at risk" is the half that regresses silently.
	 *
	 * Geometry, contrast and tap targets are `npm run verify:browser`'s, through
	 * `tools/browser-verify/routes/html-instructor.mjs`.
	 */
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import type {
		ClassroomComposerTransports,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';
	import type { HtmlAssignmentData } from '$lib/classroom/html-assignment/mount';
	import type { HtmlAssignmentTransports } from '$lib/classroom/html-assignment/store';
	import {
		HX_HARNESS_BLOCKS,
		hxHarnessDocument,
		hxHarnessStoredManifest,
		type HxHarnessShape
	} from './fixture';

	const SECTION: ClassroomSection = {
		id: 'sec-1',
		course_id: 'course-1',
		label: 'Block 3',
		block: '3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'course-1', code: 'IDEA100', title: 'Introduction to Engineering', active: true }
	};

	const ITEM = {
		id: 'item-1',
		kind: 'assignment',
		title: 'Bench setup',
		body: 'Work through the document. Your answers save as you type.',
		points: 6,
		published: true,
		publish_at: null,
		due_at: null,
		created_at: '2026-09-01T15:00:00Z',
		updated_at: '2026-09-01T15:00:00Z',
		attachments: [],
		links: [],
		postings: [{ section_id: 'sec-1' }],
		assignment_schema_version: 3
	} as unknown as ClassroomItem;

	/**
	 * WHAT IS STORED. Three students x three blocks, typed out, so the count the
	 * confirmation names is a number a reader can check against the list. `who`
	 * carries a name per student, which is what makes a renamed HEADER block
	 * cost something too.
	 */
	const STUDENTS = ['ana.perez', 'luis.ortiz', 'mia.chen'];
	let answers = $state<{ blockId: string; student: string }[]>(
		STUDENTS.flatMap((student) =>
			[...HX_HARNESS_BLOCKS.stored, 'who'].map((blockId) => ({ blockId, student }))
		)
	);

	/** How the counter behaves. `real` reads the table; the other two are the
	    fail-closed paths, which are the ones that regress quietly. */
	let counterMode = $state<'real' | 'refuses' | 'absent'>('real');

	let stored = $state<HtmlAssignmentData>({
		documentId: 'doc-1',
		manifest: hxHarnessStoredManifest(),
		filename: 'bench-setup.html',
		updatedAt: '2026-09-01T15:00:00Z'
	});

	type Write = { n: number; filename: string; kept: number; orphaned: number };
	let writes = $state<Write[]>([]);
	let lastCount = $state<string>('not asked yet');

	const orphanedNow = $derived.by(() => {
		const live = new Set(
			(hxHarnessStoredManifest() as { modules: { blocks: { id: string }[] }[]; header: { id: string }[] })
				.modules.flatMap((m) => m.blocks.map((b) => b.id))
				.concat(['who'])
		);
		return answers.filter((a) => !live.has(a.blockId)).length;
	});

	const transports = {
		async updateItem(itemId: string, _input: unknown, _published: boolean) {
			return { ok: true as const, data: { itemId } };
		},
		async createItem() {
			return { ok: true as const, data: { itemId: 'item-1' } };
		},
		async loadCategorySuggestions() {
			return { ok: true as const, data: [] as string[] };
		}
	} as unknown as ClassroomComposerTransports;

	const htmlAssignmentTransports: HtmlAssignmentTransports = {
		async setHtmlAssignment(_itemId, html, manifest, filename) {
			// THE STORED DOCUMENT GENUINELY MOVES, so a second re-upload is
			// diffed against the FIRST re-upload and not against the original --
			// which is the state a teacher is actually in on their second pass,
			// and the one a harness holding a frozen "stored" value would never
			// reach.
			const before = new Set(blockIdsOf(stored.manifest));
			const after = blockIdsOf(manifest);
			const kept = after.filter((id) => before.has(id)).length;
			const orphaned = [...before].filter((id) => !after.includes(id));
			stored = { ...stored, manifest, filename };
			writes = [
				...writes,
				{
					n: writes.length + 1,
					filename,
					kept,
					orphaned: answers.filter((a) => orphaned.includes(a.blockId)).length
				}
			];
			void html;
			return { ok: true as const, revision: writes.length };
		},
		async setRubric() {
			return { ok: true as const };
		},
		async countOrphanedAnswers(_itemId, blockIds) {
			if (counterMode === 'refuses') {
				lastCount = 'refused';
				return { ok: false as const, message: 'permission denied for table classroom_responses' };
			}
			const responses = answers.filter((a) => blockIds.includes(a.blockId)).length;
			lastCount = `${blockIds.join(', ')} -> ${responses} answer(s)`;
			return { ok: true as const, responses, files: 0 };
		}
	};

	/** The transports object the composer is handed. `absent` drops the counter
	    entirely, which is the missing-transport path rather than a failing one. */
	const liveHtmlTransports = $derived(
		counterMode === 'absent'
			? { ...htmlAssignmentTransports, countOrphanedAnswers: null }
			: htmlAssignmentTransports
	);

	function blockIdsOf(manifest: unknown): string[] {
		const m = manifest as {
			header?: { id: string }[];
			modules?: { blocks?: { id: string }[] }[];
		};
		return [
			...(m.header ?? []).map((b) => b.id),
			...(m.modules ?? []).flatMap((mod) => (mod.blocks ?? []).map((b) => b.id))
		];
	}

	/**
	 * PUSH A REAL FILE INTO THE COMPOSER'S OWN PICKER.
	 *
	 * `DataTransfer` is how a `FileList` is built outside a user gesture, so the
	 * component's `onchange` handler receives exactly what a picked file gives
	 * it. The alternative -- calling the component's internal stage function --
	 * would skip `readStagedHtml` and measure a path no teacher walks.
	 */
	function upload(shape: HxHarnessShape) {
		const doc = hxHarnessDocument(shape);
		const input = document.querySelector<HTMLInputElement>('[data-testid="staged-html-input"]');
		if (!input) return;
		const dt = new DataTransfer();
		dt.items.add(new File([doc.html], doc.filename, { type: 'text/html' }));
		input.files = dt.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}

	function resetAll() {
		stored = {
			documentId: 'doc-1',
			manifest: hxHarnessStoredManifest(),
			filename: 'bench-setup.html',
			updatedAt: '2026-09-01T15:00:00Z'
		};
		answers = STUDENTS.flatMap((student) =>
			[...HX_HARNESS_BLOCKS.stored, 'who'].map((blockId) => ({ blockId, student }))
		);
		writes = [];
		lastCount = 'not asked yet';
	}
</script>

<svelte:head><title>Replacing a ported document</title></svelte:head>

<main class="harness">
	<h1>Replacing a posted HTML assignment</h1>
	<p class="lede">
		The real <code>ContentComposer</code> in <strong>edit</strong> mode on an item that already
		carries a ported document. Press one of the three uploads below: each pushes a real
		<code>.html</code> file into the composer's own picker, so the import, the manifest diff and
		the orphan count all run the way they do for a teacher's export.
	</p>

	<div class="panel" data-testid="hx-state">
		<div class="counters">
			<span class="counter" data-testid="count-answers">stored answers {answers.length}</span>
			<span class="counter" data-testid="count-writes">documents written {writes.length}</span>
			<span class="counter" data-testid="count-orphaned">orphaned now {orphanedNow}</span>
		</div>
		<p class="reading" data-testid="hx-current">
			On the item: <strong>{stored.filename}</strong> &middot; blocks
			<code>{blockIdsOf(stored.manifest).join(', ')}</code>
		</p>
		<p class="reading" data-testid="hx-lastcount">Last count asked: {lastCount}</p>

		<div class="controls">
			<button type="button" class="btn secondary tap-44" data-testid="upload-kept" onclick={() => upload('kept')}>
				Upload the corrected document (same ids)
			</button>
			<button type="button" class="btn secondary tap-44" data-testid="upload-renamed" onclick={() => upload('renamed')}>
				Upload one that renames b-reading
			</button>
			<button type="button" class="btn secondary tap-44" data-testid="upload-added" onclick={() => upload('added')}>
				Upload one that adds a block
			</button>
			<button type="button" class="btn secondary tap-44" data-testid="hx-reset" onclick={resetAll}>
				Reset
			</button>
		</div>

		<div class="controls">
			<label class="switch">
				<input type="radio" bind:group={counterMode} value="real" data-testid="counter-real" />
				<span>The counter reads the stored answers</span>
			</label>
			<label class="switch">
				<input type="radio" bind:group={counterMode} value="refuses" data-testid="counter-refuses" />
				<span>The counter is refused (fail closed)</span>
			</label>
			<label class="switch">
				<input type="radio" bind:group={counterMode} value="absent" data-testid="counter-absent" />
				<span>No counter at all (fail closed)</span>
			</label>
		</div>

		{#if writes.length}
			<ul class="writes" data-testid="hx-writes">
				{#each writes as w (w.n)}
					<li>
						#{w.n} <strong>{w.filename}</strong> &middot; {w.kept} block(s) kept &middot;
						{w.orphaned} answer(s) orphaned
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="composer-host">
		<ContentComposer
			mode="edit"
			item={ITEM}
			sections={[SECTION]}
			{transports}
			htmlAssignmentTransports={liveHtmlTransports}
			htmlAssignmentAdmin
			htmlAssignment={stored}
			htmlCurrentRubric={null}
			onsaved={() => {}}
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
	.writes {
		margin: 0.8rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.84rem;
		color: var(--text-2);
	}
	.composer-host {
		position: relative;
	}
</style>
