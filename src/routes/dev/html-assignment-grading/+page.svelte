<script lang="ts">
	import { page } from '$app/state';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import HtmlGradingWork from '$lib/classroom/html-assignment/HtmlGradingWork.svelte';
	import type { HtmlAssignmentData } from '$lib/classroom/html-assignment/mount';
	import type { BulkGradingTransports } from '$lib/classroom/grading-bulk';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import {
		registerLocalSubmissionFileUrl,
		type AssignmentTeacherTransports,
		type ResponseRow,
		type RubricCriterion,
		type StudentWork,
		type SubmissionFileRow,
		type SubmissionRow
	} from '$lib/classroom/assignment-spec';
	import type {
		ClassroomEnrollment,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';
	// THE ROOM'S OWN STYLESHEET, not just its class. `.cr-root` with no rules
	// behind it paints the portal plate while claiming to be the classroom,
	// which is a worse fixture than no wrapper at all.
	import '$lib/classroom/classroom.css';
	import { createMemoryClassroomLive, type ClassroomLive } from '$lib/classroom/live';
	import { onMount } from 'svelte';
	import { readXlsxWorkbook } from '$lib/xlsx-read';

	/** `empty` selects the student with nothing stored; `broken` points the one
	    photo at a URL that cannot decode, so the fallback row is measurable. */
	// NOT NAMED `state`: a local of that name shadows the `$state` rune and
	// every later `$state(...)` in this file becomes a store read.
	const viewState = $derived(page.url.searchParams.get('state') ?? '');
	const wantEmpty = $derived(viewState === 'empty');
	const broken = $derived(viewState === 'broken');
	/**
	 * `closed` PUTS ALICE'S ROW IN THE ONE STATE ONLY AN INSTRUCTOR CAN WRITE
	 * (0198): `submitted` with NO `submitted_at`.
	 *
	 * That pair is the whole discriminator -- a student's own hand-in always
	 * stamps the column -- and on a ported assignment it is the only way the row
	 * can reach `submitted` at all, because there is no turn-in here. It is the
	 * state that makes the roster chip read "Closed" rather than "Submitted",
	 * puts the notice above the document, and shuts the frame.
	 */
	const closed = $derived(viewState === 'closed');
	/**
	 * THE THREE READINGS OF A FINISHED WORKSHEET (decision 37, ledger 0298).
	 * Alice has answered every counted block, so the roster reads "Complete"
	 * in the ordinary state; `late` puts the due instant between her earlier
	 * answers and her photo, so it reads "Complete, late"; `graded` stamps a
	 * grade between her checkbox and her last two changes, so the work pane
	 * lists those two blocks as changed after grading; `partial` takes her
	 * photo away, which is the one block still unmet, so it reads In progress.
	 */
	const late = $derived(viewState === 'late');
	const graded = $derived(viewState === 'graded');
	const partial = $derived(viewState === 'partial');
	/**
	 * `export` IS THE GRADED-WORK EXPORT OF A WORKSHEET (ledger 0298, R24),
	 * with EVERY manifest block type answered somewhere in the class: the
	 * fixture's own text, longText, checkbox and image, plus a second module
	 * carrying a radio and two tables (one stored as a list of objects, one as
	 * a list of lists), an answer to a block the manifest no longer declares,
	 * and a third student. Alice was returned and then edited her reflection
	 * and added her photo, both after the grade and after the due instant;
	 * Bruno is part way; Cara finished on time. The exports are INTERCEPTED
	 * (below) and read back, so a pass compares real files against values typed
	 * from this fixture.
	 */
	const exporting = $derived(viewState === 'export');
	/**
	 * `unpublished` IS THE ITEM NOBODY CAN SEE YET (ledger 0278's answers
	 * without the document). `/hx/` refuses a document whose item is not live,
	 * so the work column prints the notice and then the student's answers read
	 * straight from their rows. This branch had never been rendered in a browser
	 * while this harness carried its own copy of the work snippet; it mounts the
	 * routes' shared `HtmlGradingWork` now, so it is.
	 */
	const unpublished = $derived(viewState === 'unpublished');
	/**
	 * `console=across` MOUNTS THE CONSOLE THE WAY `/classroom/grading/<item>`
	 * DOES (ledger 0298): a bulk transport carrying `loadAcross`, no live bus
	 * and no close control, and the same `HtmlGradingWork` in the work column.
	 * Before this bundle that route handed in no snippet, and the column read
	 * "Nothing handed in yet" for a student with every answer typed.
	 */
	const across = $derived(page.url.searchParams.get('console') === 'across');
	/** `live=stalled` makes the bus report the one status the memory twin never
	    produces on its own, which is the one that earns a sentence. */
	const liveStalled = $derived(page.url.searchParams.get('live') === 'stalled');

	const ITEM_ID = 'i-hx-smoke';
	const SECTION_ID = 's-hx';
	const TEACHER = 'teacher@boscotech.edu';

	/** Fixed instants, never `new Date()`: a fixture that moves cannot be asserted. */
	const NOW = Date.parse('2026-09-10T17:00:00Z');
	const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

	const SECTION: ClassroomSection = {
		id: SECTION_ID,
		course_id: 'c-1',
		label: 'Block 4',
		block: '4',
		teacher_email: TEACHER,
		active: true,
		course: { id: 'c-1', code: 'IDEA100', title: 'Engineering Essentials', active: true }
	};

	/**
	 * PUBLISHED AND NOT SCHEDULED, so `htmlAssignmentServed` is true and the
	 * frame is mounted. The not-live sentence is the other branch and has its
	 * own measurement; here it would hide the pane this route exists to measure.
	 */
	const ITEM_BASE = {
		id: ITEM_ID,
		kind: 'assignment',
		title: 'HX Smoke Test',
		body: '',
		points: 10,
		due_at: null,
		category: null,
		author_email: TEACHER,
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: iso(4),
		edited_at: null,
		created_at: iso(4),
		updated_at: iso(4),
		attachments: [],
		publish_at: null,
		// THE DISCRIMINATOR A REAL LOAD STAMPS (`loadHtmlAssignment`), which is
		// what `htmlAssignmentMount` reads inside the work column.
		assignment_schema_version: 3
	};
	/** `late` gives the item a due instant between Alice's answers and her photo. */
	const ITEM = $derived({
		...ITEM_BASE,
		published: !unpublished,
		due_at: late || exporting ? iso(1.1) : null
	} as unknown as ClassroomItem);

	/**
	 * THE FIELDS ARE THE `/hx/worksheet` FIXTURE'S OWN (`teamName`,
	 * `reflection`, `checkedOff`) AND THE BLOCK IDS ARE NOT.
	 *
	 * The document knows only its fields and has never been told a block id, so
	 * these ids are this fixture's alone -- and they are deliberately different
	 * strings from the fields, because a lookup that is the identity function
	 * cannot be observed. They also satisfy `HTML_ID_RE` (`[A-Za-z0-9_-]{1,40}`),
	 * which the dev document's own map predates and does not.
	 */
	const MANIFEST = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'HX Smoke Test',
		course: 'IDEA100',
		points: 10,
		header: [{ id: 'hxw-team', field: 'teamName', type: 'text' }],
		modules: [
			{
				id: 'hxw-work',
				title: 'Work',
				points: 10,
				audience: 'individual',
				blocks: [
					{ id: 'hxw-reflection', field: 'reflection', type: 'longText', minSentences: 2 },
					{ id: 'hxw-done', field: 'checkedOff', type: 'checkbox' },
					{ id: 'hxw-photo', field: 'photo', type: 'image' }
				],
				criteria: [
					{
						id: 'work',
						text: 'Everything answered',
						points: 10,
						levels: [
							{ points: 10, label: 'Complete', short: 'All answered', descriptor: 'Every field is filled in.' },
							{ points: 5, label: 'Developing', short: 'Some answered', descriptor: 'Some fields are filled in.' },
							{ points: 0, label: 'Absent', short: 'Nothing answered', descriptor: 'Nothing is filled in.' }
						]
					}
				]
			}
		]
	} as unknown as HtmlAssignmentManifest;

	const RUBRIC: RubricCriterion[] = MANIFEST.modules[0].criteria as unknown as RubricCriterion[];

	/**
	 * THE EXPORT STATE'S MANIFEST: the fixture's own, plus a module holding the
	 * two block types it lacks. The `/hx/worksheet` document has no inputs for
	 * the new fields, which costs nothing here -- the frame is read only and
	 * the export reads the stored rows, never the document.
	 */
	const EXPORT_MANIFEST = {
		...MANIFEST,
		modules: [
			...MANIFEST.modules,
			{
				id: 'hxw-build',
				title: 'Build',
				points: 5,
				audience: 'individual',
				blocks: [
					{ id: 'hxw-material', field: 'material', type: 'radio' },
					{ id: 'hxw-measure', field: 'measurements', type: 'table' },
					{ id: 'hxw-grid', field: 'grid', type: 'table' }
				],
				criteria: []
			}
		]
	} as unknown as HtmlAssignmentManifest;
	const manifest = $derived(exporting ? EXPORT_MANIFEST : MANIFEST);

	/** Cara, who is on the roster only in the export state. */
	const CARA: ClassroomEnrollment = {
		section_id: SECTION_ID,
		student_email: 'cara@boscotech.net',
		display_name: 'Cara Chen',
		active: true,
		manages: false
	};

	const ROSTER: ClassroomEnrollment[] = [
		{
			section_id: SECTION_ID,
			student_email: 'alice@boscotech.net',
			display_name: 'Alice Alvarez',
			active: true,
			manages: false
		},
		{
			section_id: SECTION_ID,
			student_email: 'bruno@boscotech.net',
			display_name: 'Bruno Baptiste',
			active: true,
			manages: false
		}
	];

	/**
	 * AN 8x5 PNG AS A DATA URI, REGISTERED THROUGH THE EXISTING DEV OVERRIDE.
	 * Its bytes were CHECKED IN A BROWSER rather than typed from memory: the
	 * first one here was valid base64 carrying malformed PNG, which decoded to
	 * nothing and silently put the fallback row on screen in the state meant to
	 * show a working thumbnail -- a fixture that measures the wrong branch and
	 * looks entirely correct.
	 * The real proxy needs a session and a row; `registerLocalSubmissionFileUrl`
	 * is the hook the attachment surfaces already use for exactly this.
	 * `?state=broken` registers a URL that cannot decode instead, which is what
	 * puts the fallback row on screen.
	 */
	const PNG =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAIAAAD38zoCAAAAEUlEQVR4nGOIWpCHFTHQQQIAucA4QbqkH88AAAAASUVORK5CYII=';
	// REGISTERED AT MODULE SCOPE AND NOT FROM AN `$effect`, which was the first
	// shape and is measurably wrong: `hxImagesFromFiles` reads
	// `submissionFileSrc` while the console builds its rows, which happens
	// BEFORE effects run, so the override landed after the URL had already been
	// taken and every thumbnail fell back. Measured: `missing: 1`, `thumbs: []`.
	// svelte-ignore state_referenced_locally
	registerLocalSubmissionFileUrl(
		'f-photo-1',
		page.url.searchParams.get('state') === 'broken' ? 'data:image/png;base64,Zm9v' : PNG
	);

	/**
	 * ALICE HAS A SUBMISSION ROW BECAUSE SHE ATTACHED A FILE, which is 0086's
	 * own rule and not a fixture convenience: responses are deliberately
	 * independent of the submissions table so autosave never has to create one,
	 * and the row is created lazily by the first file attach, the first grade or
	 * the submit. BRUNO HAS NO ROW AT ALL, which is what a student who has typed
	 * nothing and attached nothing looks like -- and there is no turn-in on a
	 * ported assignment, so neither of them is ever "submitted" by their own
	 * hand.
	 */
	const SUBMISSIONS: SubmissionRow[] = [
		{
			id: 'sub-alice',
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			state: 'draft',
			submitted_at: null,
			returned_at: null,
			scores: null,
			total: null,
			comment: null,
			updated_at: iso(0)
		} as unknown as SubmissionRow
	];

	const RESPONSES: ResponseRow[] = [
		{
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			block_id: 'hxw-team',
			value: { text: 'Team Meridian' },
			updated_at: iso(3)
		},
		{
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			block_id: 'hxw-reflection',
			value: {
				text: 'I modelled the blade root and the hub today. The fillet at the root took three tries before it would rebuild.'
			},
			updated_at: iso(1.2)
		},
		{
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			block_id: 'hxw-done',
			value: { checked: [true] },
			updated_at: iso(2)
		}
	];

	const FILES: SubmissionFileRow[] = [
		{
			id: 'f-photo-1',
			submission_id: 'sub-alice',
			block_id: 'hxw-photo',
			filename: 'blade-root-fillet.png',
			caption: 'The fillet after the third rebuild',
			mime_type: 'application/octet-stream',
			sort_order: 1,
			created_at: iso(1)
		}
	];

	/*
		THE EXPORT STATE'S ROWS. Every instant is relative to the fixture's own
		clock: the grade is at 1.5 days ago and the due instant at 1.1, so
		Alice's reflection (1.2) and photo (1.0) are both after the grade and her
		photo is after the due instant.
	*/
	const EXPORT_SUBMISSIONS: SubmissionRow[] = [
		{
			id: 'sub-alice',
			item_id: ITEM_ID,
			student_email: 'alice@boscotech.net',
			state: 'returned',
			submitted_at: null,
			returned_at: iso(1.5),
			rubric_scores: { work: 5 },
			criterion_comments: null,
			score: 5,
			teacher_comment: 'Add the photo of the fillet.',
			graded_by: TEACHER,
			graded_at: iso(1.5),
			updated_at: iso(1.5)
		},
		{
			id: 'sub-cara',
			item_id: ITEM_ID,
			student_email: 'cara@boscotech.net',
			state: 'draft',
			submitted_at: null,
			returned_at: null,
			rubric_scores: null,
			criterion_comments: null,
			score: null,
			teacher_comment: null,
			graded_by: null,
			graded_at: null,
			updated_at: iso(3)
		}
	] as unknown as SubmissionRow[];

	const answer = (email: string, block: string, value: ResponseRow['value'], daysAgo: number): ResponseRow =>
		({ item_id: ITEM_ID, student_email: email, block_id: block, value, updated_at: iso(daysAgo) }) as ResponseRow;
	const ALICE_E = 'alice@boscotech.net';
	const BRUNO_E = 'bruno@boscotech.net';
	const CARA_E = 'cara@boscotech.net';
	const EXPORT_RESPONSES: ResponseRow[] = [
		...RESPONSES,
		answer(ALICE_E, 'hxw-material', { text: 'aluminum' }, 2),
		answer(
			ALICE_E,
			'hxw-measure',
			{
				text: JSON.stringify([
					{ limit: 'Diameter (in)', measured: '2.5' },
					{ limit: 'Mass (g)', measured: '' },
					{ limit: '', measured: '' }
				])
			},
			2
		),
		answer(ALICE_E, 'hxw-grid', { text: JSON.stringify([['pass', 'mm'], ['1', 0.4]]) }, 2),
		answer(ALICE_E, 'hxw-old', { text: 'From the first upload' }, 4),
		answer(BRUNO_E, 'hxw-reflection', { text: 'It bent.' }, 2),
		answer(BRUNO_E, 'hxw-done', { checked: [false] }, 2),
		answer(
			BRUNO_E,
			'hxw-measure',
			{ text: JSON.stringify([{ limit: 'Diameter (in)', measured: '3', note: 'rough' }]) },
			2
		),
		answer(CARA_E, 'hxw-team', { text: 'Team Vega' }, 3),
		answer(CARA_E, 'hxw-reflection', { text: 'The hub cracked first. I thickened the web.' }, 3),
		answer(CARA_E, 'hxw-done', { checked: [true] }, 3),
		answer(CARA_E, 'hxw-material', { text: 'steel' }, 3),
		answer(CARA_E, 'hxw-measure', { text: JSON.stringify([{ limit: 'Diameter (in)', measured: '2.4' }]) }, 3),
		answer(CARA_E, 'hxw-grid', { text: JSON.stringify([['fail', 'mm']]) }, 3)
	];
	const EXPORT_FILES: SubmissionFileRow[] = [
		...FILES,
		{
			id: 'f-photo-cara',
			submission_id: 'sub-cara',
			block_id: 'hxw-photo',
			filename: 'hub-web.png',
			caption: null,
			mime_type: 'application/octet-stream',
			sort_order: 1,
			created_at: iso(3)
		}
	];
	// svelte-ignore state_referenced_locally
	registerLocalSubmissionFileUrl('f-photo-cara', PNG);

	let log = $state<string[]>([]);
	function note(what: string) {
		log = [...log, what];
	}

	const transports: AssignmentTeacherTransports = {
		async setSpec(itemId) {
			note(`setSpec ${itemId}`);
			return { ok: true, data: undefined };
		},
		async setRubric(itemId) {
			note(`setRubric ${itemId}`);
			return { ok: true, data: undefined };
		},
		async gradeSubmission(itemId, studentEmail) {
			note(`gradeSubmission ${studentEmail}`);
			return { ok: true, data: { ok: true, state: 'submitted' } };
		},
		async approveModule(itemId, studentEmail, moduleId) {
			note(`approveModule ${studentEmail} ${moduleId}`);
			return { ok: true, data: undefined };
		},
		async loadGrading() {
			return {
				ok: true,
				data: {
					roster: exporting ? [...ROSTER, CARA] : ROSTER,
					/*
						THE CLOSED STATE IS APPLIED HERE AND NOT IN THE FIXTURE CONST,
						for the same reason the empty state is: `loadGrading` runs per
						load, so a query-string change re-reads it, where a `$derived`
						read inside a module-scope `const` is evaluated exactly once and
						the fixture would silently keep whatever state the page first
						mounted with.

						0198's instructor lock is `submitted` with NO `submitted_at`.
						Both halves matter: the stamp is the whole discriminator between
						a close and a student's own hand-in, and stamping it here would
						make this fixture measure the wrong one of the two.
					*/
					submissions: exporting
						? EXPORT_SUBMISSIONS
						: closed
						? SUBMISSIONS.map((r) =>
								r.student_email === 'alice@boscotech.net'
									? { ...r, state: 'submitted' as const, submitted_at: null }
									: r
							)
						: graded
							? SUBMISSIONS.map((r) =>
									r.student_email === 'alice@boscotech.net' ? { ...r, graded_at: iso(1.5) } : r
								)
							: SUBMISSIONS,
					// The empty state is the SAME fixture with the stored rows taken
					// away, so the only difference on screen is the one being measured.
					responses: wantEmpty ? [] : exporting ? EXPORT_RESPONSES : RESPONSES,
					files: wantEmpty || partial ? [] : exporting ? EXPORT_FILES : FILES,
					filesStorageReady: true,
					extraCreditReady: true,
					approvals: []
				}
			};
		}
	};

	/**
	 * THE CLOSE TRANSPORT, IN MEMORY. It writes nothing -- this page holds no
	 * Supabase client -- and exists so the CONTROL is mounted and measurable.
	 * `classroom_close_assignment` is proved against real Postgres in
	 * `tests/db/html-assignment-close.test.ts`; what a browser pass settles is
	 * that the two-step confirm is on screen, reachable and legible.
	 */
	async function closeAssignment(itemId: string, studentEmail: string | null, shut: boolean) {
		note(`closeAssignment ${itemId} ${studentEmail ?? 'ALL'} closed=${shut}`);
		return { ok: true, data: { ok: true, total: 2, changed: shut ? 2 : 1, refused: 0 } };
	}

	/**
	 * THE LIVE BUS. The memory twin is a REAL implementation of the interface,
	 * not a stub of it, so the console's subscribe/unsubscribe path is the
	 * shipping one. `?live=stalled` reports the one status the twin never
	 * reaches on its own, which is the one that earns a sentence.
	 */
	const bus = createMemoryClassroomLive();
	const live: ClassroomLive = {
		subscribe(sectionId, onChange, onStatus) {
			const off = bus.subscribe(sectionId, onChange, onStatus);
			if (liveStalled) onStatus?.('stalled');
			return off;
		},
		announce: (sectionId, topic) => bus.announce(sectionId, topic)
	};

	/**
	 * WHAT A GRADE ROUTE'S LOAD HANDS THE WORK COLUMN: the `/hx/worksheet`
	 * fixture document with this page's manifest. The src is resolved inside
	 * `HtmlGradingWork` exactly as the routes resolve it, with no sandbox origin
	 * (the dev and preview configuration).
	 */
	const HX = $derived<HtmlAssignmentData>({
		documentId: 'worksheet',
		manifest,
		filename: 'worksheet.html',
		updatedAt: null
	});

	/**
	 * THE CROSS-CLASS READ, IN MEMORY: the per-class payload with the one
	 * section in play, which is what `loadGradingAcrossSections` returns for a
	 * teacher of one class. The batch write is refused outright; this state is
	 * about what the work column shows.
	 */
	const acrossBulk: BulkGradingTransports = {
		async loadAcross() {
			note('loadAcross');
			const res = await transports.loadGrading(ITEM_ID, SECTION_ID);
			return res.ok ? { ok: true, data: { sections: [SECTION], data: res.data } } : res;
		},
		async gradeMany() {
			note('gradeMany');
			return { ok: false, message: 'The harness writes no grades.' };
		}
	};

	// -----------------------------------------------------------------------
	// THE EXPORT CAPTURE (ledger 0298, R24), the `/dev/grading-incomplete`
	// shape: the console's exports end in a real `<a download>` click, which a
	// headless pass cannot read, so `URL.createObjectURL` is wrapped to keep the
	// Blob and the anchor's `click` to record it instead of navigating. Every
	// capture came out of pressing the control a teacher presses. What is kept
	// is READ BACK OUT OF THE FILE -- the JSON parsed, the workbook inflated
	// through `$lib/xlsx-read`, the CSV split -- never off the builder.
	// -----------------------------------------------------------------------
	interface Capture {
		id: number;
		name: string;
		kind: 'json' | 'xlsx' | 'csv' | 'other';
		size: number;
		/** The read-back, serialized for a browser pass to parse. */
		data: string;
	}
	let captures = $state<Capture[]>([]);
	let captureSeq = 0;

	/** What a pass needs out of a JSON export, per student, parsed back out of the file. */
	function jsonReadback(text: string): string {
		try {
			const parsed = JSON.parse(text);
			const a = parsed.assignments?.[0] ?? {};
			return JSON.stringify({
				schemaVersion: parsed.export?.schemaVersion ?? null,
				spec: a.spec ?? null,
				manifestModules: (a.manifest?.modules ?? []).map((m: { id: string }) => m.id),
				students: (a.students ?? []).map(
					(st: {
						label: string;
						submission: { stateLabel: string; changedAfterGrading: unknown };
						completeness: { basis?: string; complete: boolean; late?: boolean; unmetCount: number };
						responses: {
							blockId: string;
							blockType: string;
							prompt: string;
							started: boolean;
							value: unknown;
							changedAfterGrading?: { kind: string } | null;
						}[];
					}) => ({
						label: st.label,
						state: st.submission.stateLabel,
						changed: !!st.submission.changedAfterGrading,
						basis: st.completeness.basis ?? null,
						complete: st.completeness.complete,
						late: st.completeness.late ?? null,
						unmet: st.completeness.unmetCount,
						responses: st.responses.map((r) => ({
							blockId: r.blockId,
							type: r.blockType,
							prompt: r.prompt,
							started: r.started,
							value: r.value,
							changed: r.changedAfterGrading?.kind ?? null
						}))
					})
				)
			});
		} catch (err) {
			return JSON.stringify({ unreadable: err instanceof Error ? err.message : String(err) });
		}
	}

	onMount(() => {
		const realCreate = URL.createObjectURL.bind(URL);
		const realClick = HTMLAnchorElement.prototype.click;
		const blobs = new Map<string, Blob>();
		const record = (name: string, kind: Capture['kind'], size: number, data: string) => {
			captures = [...captures, { id: ++captureSeq, name, kind, size, data }];
		};
		URL.createObjectURL = (obj: Blob | MediaSource) => {
			const url = realCreate(obj);
			if (obj instanceof Blob) blobs.set(url, obj);
			return url;
		};
		HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
			const blob = blobs.get(this.href);
			if (!blob || !this.download) return realClick.call(this);
			const name = this.download;
			if (name.endsWith('.json')) {
				void blob.text().then((text) => record(name, 'json', blob.size, jsonReadback(text)));
			} else if (name.endsWith('.csv')) {
				void blob.text().then((text) => record(name, 'csv', blob.size, JSON.stringify(text)));
			} else if (name.endsWith('.xlsx')) {
				void blob
					.arrayBuffer()
					.then((buf) => readXlsxWorkbook(new Uint8Array(buf)))
					.then((wb) =>
						record(
							name,
							'xlsx',
							blob.size,
							JSON.stringify(
								Object.fromEntries(
									[...wb.entries()].map(([sheet, v]) => [sheet, { header: v.header, rows: v.rows }])
								)
							)
						)
					)
					.catch((err) =>
						record(name, 'xlsx', blob.size, JSON.stringify({ unreadable: String(err) }))
					);
			} else {
				record(name, 'other', blob.size, '');
			}
			// Deliberately NOT calling through: a real download in a headless
			// pass is a file nothing here can read.
		};
		return () => {
			URL.createObjectURL = realCreate;
			HTMLAnchorElement.prototype.click = realClick;
		};
	});
</script>

<svelte:head><title>dev: grading console, ported HTML assignment</title></svelte:head>

<!--
	THE REAL ROUTE'S OWN MEASURE, AND WITHOUT IT THIS FIXTURE MEASURED A
	CONSOLE THAT DOES NOT EXIST (0288).

	`src/routes/classroom/+layout.svelte` sets `--cr-measure-route` from
	`classroomMeasure(loc)`, which answers `console` for `item-grade` -- and
	`--measure-console` is `100%`, the window less the room's gutter. A harness
	that omits it falls back through `classroom.css` to `--measure-page`
	(60rem), so `main.cr-console` capped itself at 960px HERE while the page an
	instructor opens takes the whole window.

	THAT IS NOT A COSMETIC GAP. The rubric was withheld from a ported document
	on a measurement taken on this route -- "the split gets 562 at 1440 and at
	1920 alike, so the wide arrangement never has room" -- which was true of
	this fixture and false of the console. Measured with the real measure in
	place: 1009.6px at 1440 and 1489.6px at 1920, and 509.7px of document
	rather than 280. A harness must mirror the whole mechanism it stands in
	for, and this is what the gap cost.

	`cr-app` goes with it, for the same reason and from the same answer: the
	layout adds it exactly when the measure is `console`, and it is what turns
	the console into a full-height application frame with three independently
	scrolling regions. Setting the width without it would be half the mirror.
-->
<div
	class="cr-root cr-app harness"
	style="--cr-measure-route: var(--measure-console)"
	data-testid="hx-grading-harness"
>
	<header class="hx-head">
		<h1>Grading console, ported HTML assignment</h1>
		<p class="hx-note">
			The REAL <code>GradingConsole</code> with <code>spec = null</code> -- the real
			schema-3 configuration -- and the grade routes' REAL <code>HtmlGradingWork</code> in its
			work pane, whose frame is pointed at the real <code>/hx/worksheet</code>. Before ledger 0141 no
			<code>htmlWork</code> snippet was passed and this pane was empty.
		</p>
		<nav class="hx-states">
			<a class="hx-state" class:is-on={viewState === ''} href="/dev/html-assignment-grading">work</a>
			<a class="hx-state" class:is-on={wantEmpty} href="/dev/html-assignment-grading?state=empty">no answers</a>
			<a class="hx-state" class:is-on={broken} href="/dev/html-assignment-grading?state=broken">photo will not decode</a>
			<a class="hx-state" class:is-on={closed} href="/dev/html-assignment-grading?state=closed">closed by the teacher</a>
			<a class="hx-state" class:is-on={liveStalled} href="/dev/html-assignment-grading?live=stalled">live stalled</a>
			<a class="hx-state" class:is-on={late} href="/dev/html-assignment-grading?state=late">finished late</a>
			<a class="hx-state" class:is-on={graded} href="/dev/html-assignment-grading?state=graded">changed after grading</a>
			<a class="hx-state" class:is-on={partial} href="/dev/html-assignment-grading?state=partial">photo missing</a>
			<a class="hx-state" class:is-on={exporting} href="/dev/html-assignment-grading?state=export">graded-work export</a>
			<a class="hx-state" class:is-on={unpublished} href="/dev/html-assignment-grading?state=unpublished">not published</a>
			<a class="hx-state" class:is-on={across} href="/dev/html-assignment-grading?console=across">all classes console</a>
		</nav>
	</header>

	{#key `${viewState}|${liveStalled}|${across}`}
		<GradingConsole
			section={SECTION}
			item={ITEM}
			spec={null}
			rubric={RUBRIC}
			{transports}
			live={across ? null : live}
			close={across ? null : closeAssignment}
			bulk={across ? acrossBulk : null}
			{htmlWork}
			{manifest}
		/>
	{/key}

	{#snippet htmlWork(student: StudentWork)}
		<!-- THE ROUTES' OWN COMPONENT, not a copy of it: both grade routes mount
		     `HtmlGradingWork`, and so does this page. -->
		<HtmlGradingWork {student} item={ITEM} htmlAssignment={HX} sandboxOrigin="" />
	{/snippet}

	<section class="hx-captures" aria-label="Exported files" data-testid="hx-captures">
		<h2>Exported files</h2>
		{#if captures.length}
			<ul>
				{#each captures as c (c.id)}
					<li
						data-testid="hx-capture"
						data-name={c.name}
						data-kind={c.kind}
						data-size={c.size}
						data-readback={c.data}
					>
						{c.name} ({c.kind}, {c.size} bytes)
					</li>
				{/each}
			</ul>
		{:else}
			<p data-testid="hx-capture-empty">Nothing exported yet.</p>
		{/if}
	</section>

	<section class="hx-log" aria-label="Transport calls">
		<h2>Transport calls</h2>
		<ul data-testid="hx-log">
			{#each log as line, i (i)}<li>{line}</li>{/each}
		</ul>
	</section>
</div>

<style>
	.harness {
		padding: var(--space-4, 1.2rem);
	}
	.hx-head {
		margin-bottom: var(--space-4, 1.2rem);
	}
	.hx-head h1 {
		font-family: var(--font-title, var(--font-display));
		font-size: 1.1rem;
		margin: 0 0 0.4rem;
	}
	.hx-note {
		color: var(--text-2);
		font-size: 0.85rem;
		max-width: var(--measure-reading, 62ch);
		margin: 0 0 0.8rem;
	}
	.hx-states {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.hx-state {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		text-decoration: none;
	}
	.hx-state.is-on {
		color: var(--green);
		border-color: var(--green);
	}
	.hx-log,
	.hx-captures {
		margin-top: var(--space-4, 1.2rem);
	}
	.hx-captures h2 {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.hx-captures ul,
	.hx-captures p {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		padding-left: 1.2rem;
		overflow-wrap: anywhere;
	}
	.hx-log h2 {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.hx-log ul {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		padding-left: 1.2rem;
	}
</style>
