<script lang="ts">
	/**
	 * HOW FAR A DROPPED FILE AND A PASTED SCREENSHOT REACH, in a real browser.
	 *
	 * Three surfaces that hold a file picker got a DROP in prompt 0032 -- the
	 * roster CSV import, the spec JSON import, and (as a migration off its own
	 * hand-rolled handlers) the Foundry submit zone -- and the interesting
	 * question about all three is not whether a drop works. It is what happens
	 * to the events they now listen to but must NOT act on.
	 *
	 * THE ONE THAT CANNOT BE PROVEN ANYWHERE ELSE. `SpecImporter` is mounted
	 * INSIDE `ContentComposer`, whose own `onpaste` stages a pasted screenshot
	 * onto the item's attachments. A paste BUBBLES, and `claimPaste` makes the
	 * first handler to ask the owner of the event -- so a drop target on the
	 * spec panel that claimed an image and then refused it for not being JSON
	 * would silently eat every screenshot pasted anywhere inside that panel,
	 * with nothing on screen to say so. The `accept` filter runs ahead of the
	 * claim precisely so that cannot happen, and this page is where that is
	 * measured against the real composer, the real Tiptap editor and the real
	 * bubbling tree rather than against a synthetic object in a node test.
	 *
	 * WHAT IS DISPATCHED IS NOT A SYSTEM PASTE OR A SYSTEM DRAG, and the report
	 * says so, exactly as /dev/composer-attach does. These are real
	 * `ClipboardEvent`/`DragEvent` objects carrying real `DataTransfer`s with
	 * real `File`s, dispatched into the real tree, so the real handlers run on
	 * them -- but they are `isTrusted: false`, and nothing here proves what the
	 * OS clipboard or a real drag would have handed over. Mr Pina's check on
	 * the preview is what settles that.
	 *
	 * A DROPPED FOLDER IS NOT REACHABLE FROM HERE AT ALL. `DataTransferItem`'s
	 * `webkitGetAsEntry()` cannot be synthesized -- a script may add Files to a
	 * DataTransfer but not filesystem entries -- so the Foundry zone's `resolve`
	 * hook is exercised for its FILE path here and its directory walk is
	 * asserted in tests/classroom-file-drop.test.ts against an injected
	 * resolver. Said out loud rather than left as a gap in a passing report.
	 */
	import PeoplePanel from '$lib/classroom/PeoplePanel.svelte';
	import SpecImporter from '$lib/classroom/SpecImporter.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import type {
		ClassroomComposerTransports,
		ClassroomPeopleTransports,
		ClassroomSection
	} from '$lib/classroom/classroom';
	import type { AssignmentTeacherTransports } from '$lib/classroom/assignment-spec';

	const SECTION: ClassroomSection = {
		id: 'sec-1',
		course_id: 'course-1',
		label: 'Block 3',
		block: '3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};

	/*
	 * In memory, no network. NOTHING BELOW IS REACHED BY A DROP OR A PASTE:
	 * both land in the surface's own text box and stop there, and this page
	 * never presses Import or Publish. The stubs exist so the REAL components
	 * mount rather than so anything is measured through them.
	 */
	const peopleTransports = {
		async loadRoster() {
			return { ok: true as const, data: [] };
		},
		async importRoster() {
			return { ok: true as const, data: { total: 0, succeeded: 0, refused: 0, results: [] } };
		},
		async setEnrollment() {
			return { ok: true as const, data: undefined };
		},
		async updateEnrollment() {
			return { ok: true as const, data: { ok: true } };
		},
		async upsertSection() {
			return { ok: true as const, data: { sectionId: 'sec-1' } };
		},
		async upsertCourse() {
			return { ok: true as const, data: { courseId: 'course-1' } };
		},
		async setSectionActive() {
			return { ok: true as const, data: undefined };
		},
		async deleteSection() {
			return { ok: true as const, data: { ok: false as const, reason: 'not_empty' } };
		},
		async reloadSections() {
			return { ok: true as const, data: [] };
		},
		async loadContent() {
			return { ok: true as const, data: [] };
		}
	} as unknown as ClassroomPeopleTransports;

	const composerTransports = {
		async createItem() {
			return { ok: true as const, itemId: 'item-1' };
		},
		async updateItem() {
			return { ok: true as const };
		},
		async uploadAttachment() {
			return { ok: true as const };
		},
		async uploadInstructorAttachment() {
			return { ok: true as const };
		},
		async deleteAttachment() {
			return { ok: true as const };
		},
		async loadCategorySuggestions() {
			return [] as string[];
		}
	} as unknown as ClassroomComposerTransports;

	/*
	 * WITHOUT THIS THE SPEC IMPORTER DOES NOT RENDER AT ALL, and that is the
	 * omitted-transport convention working exactly as designed: `canStageSpec`
	 * is `mode === 'create' && specKind === 'assignment' && !!teacherTransports`,
	 * so a composer handed no spec transport shows no spec panel. A harness that
	 * left this out would have measured a page with nothing on it and passed
	 * every "was not claimed" verdict vacuously.
	 */
	const teacherTransports = {
		async setSpec() {
			return { ok: true as const };
		}
	} as unknown as AssignmentTeacherTransports;

	/** A real one-pixel PNG, so what the clipboard carries is a picture. */
	function pngFile(name: string): File {
		const bytes = Uint8Array.from(
			atob(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
			),
			(c) => c.charCodeAt(0)
		);
		return new File([bytes], name, { type: 'image/png' });
	}

	function textFile(name: string, type: string, body: string): File {
		return new File([body], name, { type });
	}

	/**
	 * EVERY READ IS TAKEN AFTER A FLUSH. Svelte 5 applies a state change on a
	 * microtask and the drop handler reads the file asynchronously, so a value
	 * read on the line after `dispatchEvent` is the DOM as it was BEFORE. A
	 * macrotask plus a frame is the rAF-OR-TIMEOUT shape, and the timeout is the
	 * half that matters in a throttled tab.
	 */
	const settle = () =>
		new Promise<void>((resolve) => {
			setTimeout(() => requestAnimationFrame(() => resolve()), 0);
		});

	async function settleTwice() {
		await settle();
		await settle();
	}

	function dispatchDrop(node: Element | null, files: File[]) {
		if (!node) return null;
		const dt = new DataTransfer();
		for (const f of files) dt.items.add(f);
		const enter = new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true });
		node.dispatchEvent(enter);
		const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
		node.dispatchEvent(ev);
		return ev;
	}

	function dispatchImagePaste(node: Element | null) {
		if (!node) return null;
		const dt = new DataTransfer();
		dt.items.add(pngFile('shot.png'));
		const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
		node.dispatchEvent(ev);
		return ev;
	}

	function dispatchTextPaste(node: Element | null, text: string) {
		if (!node) return null;
		const dt = new DataTransfer();
		dt.setData('text/plain', text);
		const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
		node.dispatchEvent(ev);
		return ev;
	}

	/**
	 * CLEARING A BOUND TEXTAREA MEANS TELLING SVELTE, NOT JUST THE DOM.
	 *
	 * Measured here first, and it is the shape of bug this page exists to
	 * catch elsewhere: setting `el.value = ''` directly leaves `bind:value`'s
	 * state holding the old string, so when the drop then writes that SAME
	 * string back Svelte sees no change, does not re-render, and the box stays
	 * visibly empty. The first run of this harness reported `box: <the csv>`
	 * and the second reported `box: ''` for identical input, which reads as a
	 * flaky drop and was entirely the reset. The native setter plus a real
	 * `input` event is what a person typing produces.
	 */
	function clearBound(el: HTMLTextAreaElement | null) {
		if (!el) return;
		const proto = Object.getPrototypeOf(el) as object;
		const desc = Object.getOwnPropertyDescriptor(proto, 'value');
		desc?.set?.call(el, '');
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}

	const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
	const rosterBox = () => q<HTMLTextAreaElement>('[data-testid="csv-text"]');
	const specBox = () => q<HTMLTextAreaElement>('[data-testid="spec-paste"]');
	const rosterZone = () => q<HTMLElement>('.csv-import');
	const specZone = () => q<HTMLElement>('.import-body');
	const stagedIn = (role: string) =>
		q(`.fup[data-role="${role}"]`)
			? document.querySelectorAll(`.fup[data-role="${role}"] .fup-name`).length
			: -1;

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;

		/**
		 * The raw table, printed by the spec's prepare step so a PASSING run
		 * still hands the next reader the actual values rather than a tick.
		 */
		w.__reachTable = async () => {
			const rows: Record<string, unknown>[] = [];

			// ---- the roster CSV import ------------------------------------
			clearBound(rosterBox());
			await settleTwice();
			let ev = dispatchDrop(rosterZone(), [
				textFile('roster.csv', 'text/csv', 'ana@boscotech.net,Ana Reyes')
			]);
			await settleTwice();
			rows.push({
				case: 'roster: drop a .csv',
				prevented: ev?.defaultPrevented ?? null,
				box: rosterBox()?.value ?? null,
				note: q('[data-testid="roster-drop-note"]')?.textContent ?? null
			});

			// THE PASTE CASE FOLLOWS AN ACCEPTED DROP, DELIBERATELY. An accepted
			// drop clears the surface's note, so a note read after the paste is
			// a note THIS paste produced -- which is the whole claim. Run after
			// the refusal below instead and the assertion reads a leftover
			// sentence and calls it a refusal, which is what the first pass of
			// this harness did.
			let pev = dispatchImagePaste(rosterBox());
			await settleTwice();
			rows.push({
				case: 'roster: paste a screenshot',
				prevented: pev?.defaultPrevented ?? null,
				note: q('[data-testid="roster-drop-note"]')?.textContent ?? null,
				boxUnchanged: (rosterBox()?.value ?? null) === 'ana@boscotech.net,Ana Reyes'
			});

			const tev = dispatchTextPaste(rosterBox(), 'ordinary typing');
			await settleTwice();
			rows.push({ case: 'roster: paste plain text', prevented: tev?.defaultPrevented ?? null });

			const before = rosterBox()?.value ?? null;
			ev = dispatchDrop(rosterZone(), [pngFile('shot.png')]);
			await settleTwice();
			rows.push({
				case: 'roster: drop a .png',
				prevented: ev?.defaultPrevented ?? null,
				boxUnchanged: (rosterBox()?.value ?? null) === before,
				note: q('[data-testid="roster-drop-note"]')?.textContent ?? null
			});

			// ---- the spec JSON import, INSIDE the composer -----------------
			clearBound(specBox());
			await settleTwice();
			ev = dispatchDrop(specZone(), [
				textFile('spec.json', 'application/json', '{"version":"2.0"}')
			]);
			await settleTwice();
			rows.push({
				case: 'spec: drop a .json',
				prevented: ev?.defaultPrevented ?? null,
				box: specBox()?.value ?? null,
				note: q('[data-testid="spec-drop-note"]')?.textContent ?? null
			});

			// THE ONE THIS PAGE EXISTS FOR, taken right after that clean drop.
			const stagedBefore = stagedIn('attachment');
			pev = dispatchImagePaste(specBox());
			await settleTwice();
			rows.push({
				case: 'spec: paste a screenshot (must REACH the composer)',
				prevented: pev?.defaultPrevented ?? null,
				stagedBefore,
				stagedStudent: stagedIn('attachment'),
				specNote: q('[data-testid="spec-drop-note"]')?.textContent ?? null,
				specBoxUnchanged: (specBox()?.value ?? null) === '{"version":"2.0"}'
			});

			const t2 = dispatchTextPaste(specBox(), '{"typed":true}');
			await settleTwice();
			rows.push({ case: 'spec: paste plain text', prevented: t2?.defaultPrevented ?? null });

			const sbefore = specBox()?.value ?? null;
			ev = dispatchDrop(specZone(), [pngFile('shot.png')]);
			await settleTwice();
			rows.push({
				case: 'spec: drop a .png',
				prevented: ev?.defaultPrevented ?? null,
				boxUnchanged: (specBox()?.value ?? null) === sbefore,
				note: q('[data-testid="spec-drop-note"]')?.textContent ?? null
			});

			return JSON.stringify(rows, null, 1);
		};

		/**
		 * BOTH BOXES HAVE TO BE OPEN BEFORE ANYTHING IS MEASURABLE, and neither
		 * is by default: the roster import is a `<details>` and the spec
		 * importer renders its body only once its own Open control is pressed.
		 * A probe run against a closed panel finds no zone, reports `null` for
		 * every field and passes every verdict that reads "was not claimed" --
		 * which is a whole spec going vacuously green. So the page opens them
		 * itself and stamps a marker the spec waits on, rather than the spec
		 * waiting on a timer.
		 */
		const ready = () => {
			const details = document.querySelector<HTMLDetailsElement>('details.csv-import');
			if (details && !details.open) details.open = true;
			const openSpec = q<HTMLButtonElement>('[data-testid="spec-open-editor"]');
			if (openSpec && !specZone()) openSpec.click();
			if (rosterZone() && rosterBox() && specZone() && specBox() && q('.fup[data-role="attachment"]')) {
				document.documentElement.setAttribute('data-reach-ready', '');
				return true;
			}
			return false;
		};
		if (!ready()) {
			const timer = setInterval(() => {
				if (ready()) clearInterval(timer);
			}, 50);
		}

		/**
		 * The verdicts. Each NAMES what it checked, so a probe that stops
		 * existing changes the list rather than silently shrinking what ran.
		 */
		w.__reachVerdicts = async () => {
			const out: string[] = [];
			const table = w.__reachTable as () => Promise<string>;
			const rows = JSON.parse(await table()) as Record<string, unknown>[];
			const row = (name: string) => rows.find((r) => r.case === name) ?? {};

			const a = row('roster: drop a .csv');
			out.push(
				`roster drop csv fills the box: ${String(a.box ?? '').includes('ana@boscotech.net')}`
			);
			out.push(`roster drop csv cancels the default: ${a.prevented === true}`);
			out.push(`roster drop csv says nothing it should not: ${a.note === null}`);

			const c = row('roster: paste a screenshot');
			out.push(`roster does NOT claim a pasted screenshot: ${c.prevented === false}`);
			out.push(`roster reports no refusal for one: ${c.note === null}`);
			out.push(`roster box untouched by a screenshot: ${c.boxUnchanged === true}`);

			const d = row('roster: paste plain text');
			out.push(`roster leaves a plain-text paste alone: ${d.prevented === false}`);

			const b = row('roster: drop a .png');
			out.push(`roster drop png leaves the box alone: ${b.boxUnchanged === true}`);
			out.push(`roster drop png says why: ${typeof b.note === 'string' && b.note.length > 0}`);

			const e = row('spec: drop a .json');
			out.push(`spec drop json fills the box: ${String(e.box ?? '').includes('version')}`);
			out.push(`spec drop json says nothing it should not: ${e.note === null}`);

			const g = row('spec: paste a screenshot (must REACH the composer)');
			// THE DELTA, NOT THE COUNT. Staging is cumulative and nothing here
			// clears it between runs, so an absolute `=== 1` is true on the
			// first pass over this page and false on the second -- which is a
			// verdict that reports the number of times it has been asked rather
			// than what the paste did. Measured: table run 1 read 0 -> 1, run 2
			// read 1 -> 2, and the absolute form called the second one a
			// failure.
			out.push(
				`screenshot pasted at the spec box reaches the composer: ${
					typeof g.stagedBefore === 'number' &&
					typeof g.stagedStudent === 'number' &&
					g.stagedStudent === g.stagedBefore + 1
				}`
			);
			out.push(`the spec panel reported no refusal for it: ${g.specNote === null}`);
			out.push(`the spec box was untouched by it: ${g.specBoxUnchanged === true}`);

			const h = row('spec: paste plain text');
			out.push(`spec leaves a plain-text paste alone: ${h.prevented === false}`);

			const f = row('spec: drop a .png');
			out.push(`spec drop png leaves the box alone: ${f.boxUnchanged === true}`);
			out.push(`spec drop png says why: ${typeof f.note === 'string' && f.note.length > 0}`);

			// AN ARRAY, NOT A JOINED STRING: `orderResult` compares element for
			// element and reports a non-array as CANNOT COMPARE rather than as
			// a pass, which is the right refusal and is also how this was found.
			return out;
		};
	}
</script>

<svelte:head><title>attach reach harness</title></svelte:head>

<main class="cr-root harness">
	<h1>Attachment reach</h1>
	<p class="lede">
		The REAL roster import, and the REAL spec import mounted inside the REAL composer. Drop a file
		on either box, or paste a screenshot into the spec box and watch it land on the attachment
		list below rather than being eaten on the way past.
	</p>

	<section data-testid="roster-surface">
		<h2>Roster import (drop a .csv)</h2>
		<PeoplePanel section={SECTION} roster={[]} transports={peopleTransports} />
	</section>

	<section data-testid="composer-surface">
		<h2>Spec import, inside the composer (drop a .json; paste a screenshot)</h2>
		<ContentComposer
			mode="create"
			kind="assignment"
			sections={[SECTION]}
			initialTargets={['sec-1']}
			transports={composerTransports}
			{teacherTransports}
			onsaved={() => {}}
		/>
	</section>
</main>

<style>
	.harness {
		padding: var(--space-4);
		max-width: 92rem;
		margin: 0 auto;
	}
	.lede {
		color: var(--text-2);
		max-width: 60ch;
	}
	section {
		margin-top: var(--space-5);
	}
</style>
