<script lang="ts">
	import '$lib/classroom/classroom.css';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import type { ClassroomComposerTransports, ClassroomSection } from '$lib/classroom/classroom';
	import type { AssignmentTeacherTransports } from '$lib/classroom/assignment-spec';
	import type { DeckTransports } from '$lib/classroom/deck';
	import { buildZip } from '$lib/foundry/zip-write';

	/**
	 * A FILE DROPPED ON THE COMPOSER REACHES THE BOX BUILT FOR IT, in a real
	 * browser (ledger 0297, package ITEM). `tests/dom/composer-drop-routing-mount`
	 * pins the routing in happy-dom; this is the same four cases through a real
	 * layout, where the question a node test cannot ask is whether the box that
	 * RECEIVED the file is somewhere the teacher can see it.
	 *
	 * WHAT IS DISPATCHED IS A SYNTHETIC DROP, and a report must say so: a real
	 * `DragEvent` carrying a real `DataTransfer` with real `File`s on it, which
	 * the browser's own drop pipeline did not produce and the OS did not hand
	 * over. It runs every handler a dragged desktop file runs.
	 *
	 *   window.__composerDrop(kind)   kind: 'png' | 'spec' | 'html' | 'pictures'
	 *                                  | 'deck'. Drops one file on the title
	 *                                  field and resolves once the composer has
	 *                                  had time to route it.
	 *   window.__composerState()      what each box holds right now.
	 */
	const SECTION: ClassroomSection = {
		id: 'sec-1',
		course_id: 'course-1',
		label: 'Block 3',
		block: '3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};

	/** In memory. Nothing is saved on this page: staging is local until Post. */
	const answer = async () => ({ ok: true as const, data: undefined });
	const transports = new Proxy(
		{
			async loadCategorySuggestions() {
				return [];
			}
		},
		{ get: (target, key) => (key in target ? target[key as keyof typeof target] : answer) }
	) as unknown as ClassroomComposerTransports;
	const teacherTransports = new Proxy({}, { get: () => answer }) as unknown as AssignmentTeacherTransports;
	const deckTransports = { uploadDeck: answer, deleteDeck: answer } as unknown as DeckTransports;
	const htmlAssignmentTransports = { setHtmlAssignment: answer };

	const SPEC_TEXT = JSON.stringify(
		{
			schemaVersion: 1,
			meta: { assignmentId: 'lab-03', title: 'Lab 03, gear ratios', totalPoints: 10 },
			modules: [
				{
					id: 'm1',
					title: 'Ratios',
					points: 10,
					blocks: [{ type: 'textField', id: 'b1', prompt: 'Driver teeth over driven teeth.' }]
				}
			]
		},
		null,
		2
	);

	async function png(label: string, w = 320, h = 240): Promise<Uint8Array> {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const g = c.getContext('2d');
		if (g) {
			g.fillStyle = '#2b4a3a';
			g.fillRect(0, 0, w, h);
			g.fillStyle = '#efeee6';
			g.font = 'bold 28px sans-serif';
			g.fillText(label, 20, h / 2);
		}
		const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
		return new Uint8Array(await blob.arrayBuffer());
	}

	async function fileFor(kind: string): Promise<File> {
		if (kind === 'png') return new File([(await png('bench')) as BlobPart], 'bench.png', { type: 'image/png' });
		if (kind === 'spec') return new File([SPEC_TEXT], 'lab-03.json', { type: 'application/json' });
		if (kind === 'html') {
			const text = await (await fetch('/hx/worksheet')).text();
			return new File([text], 'worksheet.html', { type: 'text/html' });
		}
		if (kind === 'pictures') {
			const zip = await buildZip([
				{ path: 'bench/photo2.png', bytes: await png('photo 2') },
				{ path: 'bench/photo10.png', bytes: await png('photo 10') },
				{ path: 'bench/photo1.png', bytes: await png('photo 1') }
			]);
			return new File([zip as BlobPart], 'bench photos.zip', { type: 'application/zip' });
		}
		// 'deck': a web page and its pictures, which is what a presentation is.
		const zip = await buildZip([
			{ path: 'index.html', bytes: new TextEncoder().encode('<!doctype html><title>Deck</title><img src="a.png">') },
			{ path: 'a.png', bytes: await png('slide 1') }
		]);
		return new File([zip as BlobPart], 'lesson deck.zip', { type: 'application/zip' });
	}

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		w.__composerDrop = async (kind: string) => {
			const file = await fileFor(kind);
			const title = document.querySelector('.composer input[type="text"]') as HTMLElement | null;
			if (!title) return 'no title field';
			const dt = new DataTransfer();
			dt.items.add(file);
			for (const type of ['dragenter', 'dragover', 'drop']) {
				title.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
			}
			await new Promise((r) => setTimeout(r, 600));
			return file.name;
		};
		w.__composerState = () => {
			const panel = document.querySelector('.fup[data-role="attachment"]');
			return {
				files: panel ? [...panel.querySelectorAll('.fup-name')].map((n) => (n.textContent ?? '').trim()) : null,
				spec: ((document.querySelector('[data-testid="spec-paste"]') as HTMLTextAreaElement | null)?.value ?? '').slice(0, 40),
				html: document.querySelectorAll('[data-testid="staged-html-current"]').length,
				htmlIssues: document.querySelectorAll('[data-testid="staged-html-issues"]').length,
				zips: [...document.querySelectorAll('[data-testid="zip-choice"]')].map((z) =>
					[...z.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim().replace(/\s+/g, ' '))
				),
				note: (document.querySelector('[data-testid="composer-drop-note"]')?.textContent ?? '').trim()
			};
		};
	}
</script>

<svelte:head><title>Composer drop harness</title></svelte:head>

<div class="cr-root">
	<div class="harness">
		<h1>Composer drop: every file to its own box</h1>
		<p class="lede">
			The real ContentComposer with the spec importer, the presentation box and the ported
			assignment box. A file dropped anywhere on the form goes to the box whose type it is.
		</p>
		<ContentComposer
			mode="create"
			kind="assignment"
			sections={[SECTION]}
			initialTargets={['sec-1']}
			{transports}
			{teacherTransports}
			{deckTransports}
			{htmlAssignmentTransports}
			htmlAssignmentAdmin={true}
			attachmentsEnabled={true}
			instructorAttachmentsEnabled={true}
			onsaved={() => {}}
		/>
	</div>
</div>

<style>
	.harness {
		padding: 1rem;
		max-width: 72rem;
		margin: 0 auto;
	}
	h1 {
		font-size: 1.2rem;
		margin: 0 0 0.4rem;
	}
	.lede {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0 0 1rem;
	}
</style>
