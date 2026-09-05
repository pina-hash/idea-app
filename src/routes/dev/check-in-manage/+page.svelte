<script lang="ts">
	import SessionManager from '$lib/notebook/SessionManager.svelte';
	import type {
		GridCell,
		GridSession,
		GridStudent,
		ReviewResult,
		ReviewSection,
		SectionGrid,
		SessionInput
	} from '$lib/notebook-review';
	import type { TiptapNode } from '$lib/rich-text';

	/**
	 * MANAGING A CHECK-IN THAT ALREADY HAS WORK ON IT.
	 *
	 * The real `SessionManager`, mounted against a store that reaches the four
	 * states the warnings are written for and that nothing else in the repo can
	 * reach on demand:
	 *
	 *   `heavy`   answered by 3 of 4 students, with 1 excusal granted. Both the
	 *             rename warning and the full delete confirm render here.
	 *   `excused` no answers, 1 excusal. The delete confirm must still name the
	 *             excusal, because that is the one thing a delete destroys.
	 *   `empty`   covered by the grid, nothing filed. Every warning must be
	 *             ABSENT -- the negative control, without which "the warning
	 *             appeared" proves only that it always appears.
	 *   `unseen`  NOT covered by the grid at all (it is in another unit). The
	 *             count is unknown and every sentence must say so rather than
	 *             render a zero.
	 *
	 * The last of those is the one worth having a harness for. A grid narrowed
	 * to one unit is the ordinary state of the console, and a check-in outside
	 * that filter is exactly where a "0 students have answered" would be
	 * produced by a naive index and believed.
	 *
	 * TRANSPORTS ARE LOGGED VERBATIM AND WRITE NOTHING. What is being verified
	 * is which sentence renders before a destructive control is pressed, not
	 * what the RPC does with it -- that is the database test's job, against the
	 * real functions.
	 */

	const SECTION = 's-1';

	/** The check-ins the grid payload COVERS. `chk-unseen` is deliberately absent. */
	const COVERED = ['chk-heavy', 'chk-excused', 'chk-empty'];

	const sections: ReviewSection[] = [
		{
			id: SECTION,
			course_code: 'IDEA209H',
			course_title: 'Engineering I Honors',
			label: 'Block 3',
			block: '3',
			teacher_email: 'teacher@boscotech.edu',
			manages: true
		},
		{
			id: 's-2',
			course_code: 'IDEA209H',
			course_title: 'Engineering I Honors',
			label: 'Block 5',
			block: '5',
			teacher_email: 'teacher@boscotech.edu',
			manages: true
		}
	];

	let sessions = $state<GridSession[]>([
		{
			id: 'chk-heavy',
			unit_number: 3,
			session_date: '2026-09-01',
			session_label: 'Bearing teardown',
			guidance_doc: null,
			section_ids: [SECTION, 's-2']
		},
		{
			id: 'chk-excused',
			unit_number: 3,
			session_date: '2026-09-02',
			session_label: 'Shaft tolerance stack',
			guidance_doc: null,
			section_ids: [SECTION]
		},
		{
			id: 'chk-empty',
			unit_number: 3,
			session_date: '2026-09-15',
			session_label: 'Gearbox assembly',
			guidance_doc: null,
			section_ids: [SECTION]
		},
		{
			id: 'chk-unseen',
			unit_number: 4,
			session_date: '2026-10-01',
			session_label: 'Motor characterisation',
			guidance_doc: null,
			section_ids: [SECTION]
		}
	]);

	const students: GridStudent[] = [
		{ student_key: 'ana@boscotech.net', id: 'u-1', name: 'Ana Reyes', email: 'ana@boscotech.net' },
		{ student_key: 'ben@boscotech.net', id: 'u-2', name: 'Ben Ortiz', email: 'ben@boscotech.net' },
		{ student_key: 'cy@boscotech.net', id: 'u-3', name: 'Cy Nakamura', email: 'cy@boscotech.net' },
		{ student_key: 'dee@boscotech.net', id: 'u-4', name: 'Dee Alvarez', email: 'dee@boscotech.net' }
	] as GridStudent[];

	function cell(session: string, student: GridStudent, entry: boolean, excused = false): GridCell {
		return {
			student_key: student.student_key,
			student_id: student.id,
			session_id: session,
			status: entry ? 'on_time' : excused ? 'excused' : 'missing',
			entry_id: entry ? `e-${session}-${student.student_key}` : null,
			entry_count: entry ? 1 : 0,
			upload_timestamp: entry ? '2026-09-01T17:00:00Z' : null,
			on_time: entry ? true : null,
			excused,
			flag_reason: null
		} as GridCell;
	}

	/**
	 * THE GRID COVERS UNIT 3 ONLY, which is what makes `chk-unseen` unknown
	 * rather than empty. `sessions` above lists four check-ins and this lists
	 * three: that difference IS the test.
	 */
	const grid: SectionGrid = {
		section: {
			id: SECTION,
			course_code: 'IDEA209H',
			course_title: 'Engineering I Honors',
			label: 'Block 3',
			block: '3',
			teacher_email: 'teacher@boscotech.edu'
		},
		unit_number: 3,
		generated_at: '2026-09-04T00:00:00Z',
		// SPELLED OUT, not filtered off the live `sessions` state. A grid payload
		// is a SNAPSHOT of one read, so deriving it from a list the manager is
		// editing would make it silently follow local edits -- and reading
		// `$state` here is the `state_referenced_locally` warning telling you the
		// same thing.
		sessions: COVERED.map((id) => ({
			id,
			unit_number: 3,
			session_date: '2026-09-01',
			session_label: 'covered',
			section_ids: [SECTION]
		})),
		students,
		cells: [
			// heavy: three answered, one excused and unanswered.
			cell('chk-heavy', students[0], true),
			cell('chk-heavy', students[1], true),
			cell('chk-heavy', students[2], true),
			cell('chk-heavy', students[3], false, true),
			// excused: nobody answered, one excusal.
			cell('chk-excused', students[0], false, true),
			cell('chk-excused', students[1], false),
			cell('chk-excused', students[2], false),
			cell('chk-excused', students[3], false),
			// empty: covered, nothing on it.
			cell('chk-empty', students[0], false),
			cell('chk-empty', students[1], false),
			cell('chk-empty', students[2], false),
			cell('chk-empty', students[3], false)
		]
	};

	let log = $state<string[]>([]);
	function note(line: string) {
		log = [...log, line];
	}

	async function onSave(input: SessionInput): Promise<ReviewResult<{ session_id: string }>> {
		note(`onSave ${JSON.stringify(input)}`);
		if (input.id) {
			sessions = sessions.map((s) =>
				s.id === input.id
					? {
							...s,
							unit_number: input.unit_number,
							session_date: input.session_date,
							session_label: input.session_label
						}
					: s
			);
			return { ok: true, value: { session_id: input.id } };
		}
		return { ok: true, value: { session_id: 'chk-new' } };
	}

	async function onDelete(sessionId: string): Promise<ReviewResult<{ detached_entries: number }>> {
		note(`onDelete ${sessionId}`);
		const n = grid.cells.filter((c) => c.session_id === sessionId && c.entry_id).length;
		sessions = sessions.filter((s) => s.id !== sessionId);
		return { ok: true, value: { detached_entries: n } };
	}

	async function onAddSections(id: string, ids: string[]): Promise<ReviewResult<{ added: number }>> {
		note(`onAddSections ${id} ${ids.join(',')}`);
		return { ok: true, value: { added: ids.length } };
	}

	async function onRemoveSection(id: string, sectionId: string) {
		note(`onRemoveSection ${id} ${sectionId}`);
		return { ok: true as const, value: { ok: true, detached_entries: 0, remaining: 1 } };
	}

	async function onSetGuidance(
		id: string,
		doc: TiptapNode | null
	): Promise<ReviewResult<{ cleared: boolean }>> {
		note(`onSetGuidance ${id} ${doc ? 'doc' : 'null'}`);
		return { ok: true, value: { cleared: doc === null } };
	}

	/**
	 * WITH AND WITHOUT THE GRID, on one page, because the degradation is a
	 * claim that has to be looked at: the manager handed no grid must still
	 * offer every control and must say "cannot tell" rather than "nothing".
	 */
	let withGrid = $state(true);

	// -----------------------------------------------------------------------
	// The browser-verify driver.
	//
	// PAINT IS NOT INTERACTIVITY, and this page is the reason the rule is
	// written down: `waitForApp` settles on DOM stability, which the
	// server-rendered markup satisfies before hydration has attached a single
	// handler. So nothing here waits on a timer or on a global -- every click
	// RETRIES AGAINST ITS OWN EFFECT (did the form open? did the confirm
	// appear?) and reports how many attempts it took and how long it waited.
	// A step that "failed" through twelve attempts whose clicks were all
	// working is the other shape, and the counts are what tell them apart.
	// -----------------------------------------------------------------------

	const attempts: Record<string, { tries: number; ms: number }> = {};

	function sleep(ms: number) {
		return new Promise((r) => setTimeout(r, ms));
	}

	/** Click `selector` until `effect()` is true, or give up and say so. */
	async function clickUntil(name: string, selector: string, effect: () => boolean, max = 40) {
		const started = performance.now();
		for (let i = 1; i <= max; i += 1) {
			const el = document.querySelector<HTMLElement>(selector);
			el?.click();
			// A timeout, never rAF: the pane this may run in does not tick
			// animation frames, and a driver that never resolves reads exactly
			// like a broken page.
			await sleep(25);
			if (effect()) {
				attempts[name] = { tries: i, ms: Math.round(performance.now() - started) };
				return true;
			}
		}
		attempts[name] = { tries: max, ms: Math.round(performance.now() - started) };
		return false;
	}

	const q = (sel: string) => document.querySelector<HTMLElement>(sel);
	const row = (id: string) => `[data-session-id="${id}"]`;
	const text = (sel: string) => q(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

	/** Type into a bound input the way a person does, so Svelte sees it. */
	function type(sel: string, value: string) {
		const el = q(sel) as HTMLInputElement | null;
		if (!el) return;
		el.value = value;
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}

	async function openEditor(sessionId: string) {
		return clickUntil(
			`open-${sessionId}`,
			`${row(sessionId)} [data-testid="session-edit"]`,
			() => !!q('[data-testid="session-label"]')
		);
	}

	function closeEditor() {
		const buttons = Array.from(document.querySelectorAll<HTMLElement>('.session-form .btn'));
		buttons.find((b) => b.textContent?.trim() === 'Cancel')?.click();
	}

	const verdicts: string[] = [];
	function verdict(ok: boolean, label: string) {
		verdicts.push(`${label} ${ok ? 'ok' : 'FAILED'}`);
	}

	async function drive() {
		verdicts.length = 0;

		// 1. The standing count, before anything is opened.
		verdict(
			text(`${row('chk-heavy')} [data-testid="session-load"]`) === '3 filed',
			'row names what is filed'
		);

		// 2. RENAME a check-in with answers on it -> the warning, naming 3.
		await openEditor('chk-heavy');
		type('[data-testid="session-label"]', 'Bearing teardown (rev 2)');
		await sleep(60);
		const warn = text('[data-testid="edit-answers-warning"]');
		verdict(
			warn.includes('3 students have already filed') && warn.includes('1 excusal'),
			'renaming with answers warns and names them'
		);
		verdict(
			(q('[data-testid="session-save"]')?.textContent ?? '').trim() === 'Rename and save',
			'the button names the rename'
		);

		// 3. RESCHEDULE the SAME check-in -> no answers warning at all.
		type('[data-testid="session-label"]', 'Bearing teardown');
		type('[data-testid="session-date"]', '2026-09-08');
		await sleep(60);
		verdict(
			!q('[data-testid="edit-answers-warning"]') && !!q('[data-testid="edit-reschedule-note"]'),
			'rescheduling the same check-in warns about no answers'
		);
		verdict(
			(q('[data-testid="session-save"]')?.textContent ?? '').trim() === 'Reschedule',
			'the button names the reschedule'
		);
		closeEditor();
		await sleep(60);

		// 4. NEGATIVE CONTROL: renaming a check-in with NOTHING filed must warn
		//    about nothing. Without this, "the warning appeared" proves only that
		//    it always appears.
		await openEditor('chk-empty');
		type('[data-testid="session-label"]', 'Gearbox assembly (rev 2)');
		await sleep(60);
		verdict(
			!q('[data-testid="edit-answers-warning"]'),
			'renaming an unanswered check-in warns about nothing'
		);
		closeEditor();
		await sleep(60);

		// 5. The check-in the grid does not cover: CANNOT TELL, never a zero.
		await openEditor('chk-unseen');
		type('[data-testid="session-label"]', 'Motor characterisation (rev 2)');
		await sleep(60);
		const unknown = text('[data-testid="edit-answers-warning"]');
		verdict(
			unknown.includes('not counted on screen right now') && !unknown.includes('0 students'),
			'an uncovered check-in says cannot tell rather than zero'
		);
		closeEditor();
		await sleep(60);

		// 6. THE DELETE CONFIRM NAMES THE COUNT BEFORE IT DESTROYS ANYTHING.
		await clickUntil(
			'delete-heavy',
			`${row('chk-heavy')} [data-testid="session-delete"]`,
			() => !!q('[data-testid="delete-confirm-hint"]')
		);
		const confirm = text('[data-testid="delete-confirm-hint"]');
		verdict(
			confirm.includes('3 students have already filed'),
			'the delete confirm names the students before the button'
		);
		verdict(confirm.includes('kept'), 'the delete confirm says entries are kept');
		verdict(
			confirm.includes('excusal') && confirm.includes('cannot be restored'),
			'the delete confirm names the excusal it destroys'
		);
		q(`${row('chk-heavy')} .btn.secondary`)?.click();
	}

	if (typeof window !== 'undefined') {
		(window as unknown as Record<string, unknown>).__ciDrive = async () => {
			await drive();
			return verdicts;
		};
		(window as unknown as Record<string, unknown>).__ciVerdicts = () => verdicts;
		// A STRING, because the harness prints a returned string and reports an
		// object as "nothing printable" -- and an attempt count nobody can read is
		// not a report. This is printed rather than asserted: one try and twelve
		// tries both pass, and the difference is what says whether the retry loop
		// is doing work or papering over a page that never hydrated.
		(window as unknown as Record<string, unknown>).__ciAttempts = () =>
			Object.entries(attempts)
				.map(([name, a]) => `${name}: ${a.tries} try/tries in ${a.ms}ms`)
				.join(' | ');
	}

	/**
	 * THE HYDRATION MARKER, and it is an attribute rather than a global because
	 * the harness's `waitFor` reads the DOM. It is set from an effect, so it
	 * cannot appear in the server-rendered markup -- which is exactly the
	 * distinction `waitForApp` cannot make on its own.
	 */
	$effect(() => {
		document.documentElement.setAttribute('data-check-in-manage-ready', '1');
	});
</script>

<svelte:head><title>Check-in management harness</title></svelte:head>

<div class="nb-root harness">
	<h1>Managing a check-in that already exists</h1>
	<p class="lede">
		The real <code>SessionManager</code>. Unit 3 is covered by the grid; unit 4 is not, so
		<strong>Motor characterisation</strong> is the "cannot tell" case.
	</p>

	<label class="toggle">
		<input type="checkbox" bind:checked={withGrid} data-testid="toggle-grid" />
		<span>Hand the manager the grid ({withGrid ? 'counts known' : 'counts unknown'})</span>
	</label>

	<SessionManager
		sectionId={SECTION}
		{sections}
		{sessions}
		{onSave}
		{onDelete}
		{onAddSections}
		{onRemoveSection}
		{onSetGuidance}
		grid={withGrid ? grid : null}
	/>

	<h2>Transport log</h2>
	<ul class="log" data-testid="harness-log">
		{#each log as line, i (i)}
			<li>{line}</li>
		{/each}
	</ul>
</div>

<style>
	.harness {
		padding: var(--space-4);
		display: grid;
		gap: var(--space-4);
		background: var(--nb-bg);
		min-height: 100vh;
	}
	.lede {
		color: var(--text-2);
		max-width: 60ch;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 44px;
	}
	.log {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		display: grid;
		gap: var(--space-1);
	}
</style>
