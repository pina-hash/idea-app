<script lang="ts">
	import { onMount } from 'svelte';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import {
		buildGradingExport,
		gradingExportJson,
		type ExportIdentity
	} from '$lib/classroom/grading-export';
	import { readXlsxWorkbook } from '$lib/xlsx-read';
	import {
		filesByBlockCount,
		responsesMap,
		rubricFromSpec,
		specUnmet,
		unmetLabel,
		type AssignmentSpec,
		type AssignmentTeacherTransports,
		type ModuleApprovalRow,
		type ResponseRow,
		type RubricCriterion,
		type SubmissionFileRow,
		type SubmissionRow
	} from '$lib/classroom/assignment-spec';
	import type {
		ClassroomEnrollment,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';

	const ITEM_ID = 'i-grade-1';
	const SECTION_ID = 's-grade-1';
	const TEACHER = 'teacher@boscotech.edu';

	function iso(daysAgo: number): string {
		return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
	}

	/**
	 * Every constrained block kind `blockProgress` knows about, once each, plus
	 * the declaration and an approval gate. A spec missing one of them would
	 * leave that branch of `unmetLabel` unrendered here and nowhere else.
	 */
	const SPEC: AssignmentSpec = {
		schemaVersion: 1,
		meta: {
			assignmentId: 'idea100-bridge-01',
			title: 'Bridge Sketch Worksheet',
			totalPoints: 20,
			gradingCategory: 'Unit Labs'
		},
		modules: [
			{
				id: 'm1',
				title: 'Three Views',
				points: 8,
				aiLevel: 0,
				intro: 'Sketch the truss bridge from three views before you touch CAD.',
				blocks: [
					{
						type: 'instructions',
						content: ['1. Front, top, side.', '2. Label every member.'].join('\n')
					},
					{
						type: 'textField',
						id: 'f1',
						prompt: 'Which view was hardest to get right, and why?',
						minSentences: 3
					},
					{
						type: 'table',
						id: 't1',
						columns: [
							{ key: 'member', label: 'Member' },
							{ key: 'loading', label: 'Loading' }
						],
						minRows: 3
					}
				],
				rubric: [
					{
						id: 'views',
						criterion: 'All three views complete and labeled',
						levels: [
							{ points: 8, label: 'Complete', short: 'Three views, all labeled', descriptor: 'All three views drawn to scale with every member labeled.' },
							{ points: 5, label: 'Proficient', short: 'Some labels missing', descriptor: 'All three views drawn; two or three members unlabeled.' },
							{ points: 0, label: 'Absent', short: 'Nothing drawn', descriptor: 'No views drawn.' }
						]
					}
				]
			},
			{
				id: 'm2',
				title: 'Photo Evidence',
				points: 6,
				blocks: [
					{ type: 'imageZone', id: 'z1', minImages: 2, captions: true },
					{ type: 'checklist', id: 'c1', items: ['Sketch dated', 'Name on every page'] }
				],
				rubric: [
					{
						id: 'photos',
						criterion: 'Photos legible and captioned',
						levels: [
							{ points: 6, label: 'Complete', short: 'Both sharp and captioned', descriptor: 'Both photos in focus and captioned.' },
							{ points: 3, label: 'Partial', short: 'One photo or no captions', descriptor: 'One usable photo, or captions missing.' },
							{ points: 0, label: 'Absent', short: 'No photos', descriptor: 'No photos attached.' }
						]
					}
				]
			},
			{
				id: 'm3',
				title: 'Design Reflection',
				points: 6,
				blocks: [
					{
						type: 'textField',
						id: 'f2',
						prompt: 'Where would this bridge fail first under load? Explain.',
						minSentences: 2
					},
					/*
						A SECOND TABLE, WITH DIFFERENT COLUMNS FROM `t1`, so the
						workbook has to produce two table sheets with two different
						header rows rather than one shape it could have hard-coded.

						NO `minRows`, deliberately: an unconstrained table exports
						exactly like a constrained one, and leaving it unconstrained
						keeps this harness's unmet oracle measuring what it was
						written to measure.
					*/
					{
						type: 'table',
						id: 't2',
						columns: [
							{ key: 'component', label: 'Component' },
							{ key: 'selected', label: 'What you selected' },
							{ key: 'why', label: 'Why it clears' }
						]
					}
				],
				rubric: [
					{
						id: 'failure',
						criterion: 'Failure prediction is reasoned',
						levels: [
							{ points: 6, label: 'Reasoned', descriptor: 'Names a member and the loading that would fail it.' },
							{ points: 3, label: 'Partial', descriptor: 'Names a member with no loading reason.' },
							{ points: 0, label: 'Absent', descriptor: 'No prediction.' }
						]
					}
				]
			}
		],
		declarations: { academicIntegrity: true },
		approvalGate: { afterModule: 'm2', label: 'Instructor Approval Required' }
	};

	const RUBRIC: RubricCriterion[] = rubricFromSpec(SPEC);

	const SECTION: ClassroomSection = {
		id: SECTION_ID,
		course_id: 'c-1',
		label: 'Period 1',
		block: '1',
		teacher_email: TEACHER,
		active: true,
		course: { id: 'c-1', code: 'IDEA100', title: 'Engineering I Honors', active: true }
	};

	const ITEM: ClassroomItem = {
		id: ITEM_ID,
		kind: 'assignment',
		title: 'Bridge Sketch Worksheet',
		body: 'Sketch the truss bridge, photograph it, and say where it fails.',
		body_doc: null,
		points: 20,
		due_at: iso(-2),
		category: 'Unit Labs',
		author_email: TEACHER,
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: iso(9),
		edited_at: null,
		created_at: iso(9),
		updated_at: iso(9),
		links: [],
		attachments: [],
		postings: []
	};

	const ROSTER: ClassroomEnrollment[] = [
		{ section_id: SECTION_ID, student_email: 'alice@boscotech.net', display_name: 'Alice Alvarez', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'ben@boscotech.net', display_name: 'Ben Okafor', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'carla@boscotech.net', display_name: 'Carla Cardenas', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'dara@boscotech.net', display_name: 'Dara Nwosu', active: true, manages: false },
		{ section_id: SECTION_ID, student_email: 'eli@boscotech.net', display_name: 'Eli Ramos', active: true, manages: false }
	];

	function sub(over: Partial<SubmissionRow> & { id: string; student_email: string; state: SubmissionRow['state'] }): SubmissionRow {
		return {
			item_id: ITEM_ID,
			submitted_at: null,
			returned_at: null,
			rubric_scores: null,
			criterion_comments: null,
			score: null,
			teacher_comment: null,
			graded_by: null,
			graded_at: null,
			...over
		};
	}

	let submissions = $state<SubmissionRow[]>([
		sub({ id: 'sub-a', student_email: 'alice@boscotech.net', state: 'submitted', submitted_at: iso(1) }),
		sub({ id: 'sub-b', student_email: 'ben@boscotech.net', state: 'submitted', submitted_at: iso(1) }),
		sub({ id: 'sub-c', student_email: 'carla@boscotech.net', state: 'submitted', submitted_at: iso(1) }),
		// Dara has NO submission row at all: work started, never handed in.
		sub({
			id: 'sub-e',
			student_email: 'eli@boscotech.net',
			state: 'returned',
			submitted_at: iso(4),
			returned_at: iso(2),
			score: 14,
			teacher_comment: 'Good reasoning on the failure mode.',
			graded_by: TEACHER,
			graded_at: iso(2)
		})
	]);

	function text(email: string, blockId: string, value: string): ResponseRow {
		return { item_id: ITEM_ID, student_email: email, block_id: blockId, value: { text: value } };
	}
	function rows(email: string, blockId: string, n: number): ResponseRow {
		return {
			item_id: ITEM_ID,
			student_email: email,
			block_id: blockId,
			value: {
				rows: Array.from({ length: n }, (_, i) => ({ member: `Member ${i + 1}`, loading: i % 2 ? 'Tension' : 'Compression' }))
			}
		};
	}
	function checks(email: string, blockId: string, ...checked: boolean[]): ResponseRow {
		return { item_id: ITEM_ID, student_email: email, block_id: blockId, value: { checked } };
	}

	/**
	 * A PARAGRAPH IN ONE CELL, carrying the LaTeX a real student typed.
	 *
	 * It is here for two reasons. It is the case the OLD flattened rendering
	 * made unreadable, and it is the case the row-height cap exists for. And the
	 * LaTeX is the thing the export must NOT touch: what a student wrote is
	 * carried verbatim, however it renders.
	 */
	const PARAGRAPH =
		'It clears the minimum by about 34,468 PSI, which is the margin I was after. ' +
		'I checked the published figure against the McMaster listing and against the ' +
		'6061-T6 datasheet, and both agree. The governing case is $\\sigma = F/A$ at ' +
		'the shoulder, so the stock thickness is what matters here rather than the length.';

	/** A table whose rows are given verbatim, blanks included. */
	function table(email: string, blockId: string, rows: Record<string, string>[]): ResponseRow {
		return { item_id: ITEM_ID, student_email: email, block_id: blockId, value: { rows } };
	}

	const THREE = 'The top view was hardest. The chord spacing kept drifting. I redrew it twice.';
	const TWO = 'It fails at the lower chord near midspan. That member carries the most tension.';

	let responses = $state<ResponseRow[]>([
		// Alice: everything met, and a trailing row she left blank on BOTH
		// tables. A blank row is not data and never reaches the workbook; it
		// also does not change what `specUnmet` counts, which is why the oracle
		// above is unmoved by it.
		text('alice@boscotech.net', 'f1', THREE),
		table('alice@boscotech.net', 't1', [
			{ member: 'Member 1', loading: 'Compression' },
			{ member: 'Member 2', loading: 'Tension' },
			{ member: 'Member 3', loading: 'Compression' },
			{ member: '', loading: '   ' }
		]),
		table('alice@boscotech.net', 't2', [
			{ component: 'Arm Stock', selected: '6061 aluminum 1/2 McMaster-Carr', why: PARAGRAPH },
			// SOME cells filled: real work, kept whole.
			{ component: 'Speed Reduction', selected: 'WCP 1 Motor Gear Box', why: '' },
			{ component: '', selected: '', why: '' }
		]),
		checks('alice@boscotech.net', 'c1', true, true),
		text('alice@boscotech.net', 'f2', TWO),
		checks('alice@boscotech.net', '@declaration', true),
		// Ben: short on every constrained block, and the declaration unchecked.
		text('ben@boscotech.net', 'f1', 'The top view was hardest.'),
		rows('ben@boscotech.net', 't1', 1),
		checks('ben@boscotech.net', 'c1', true, false),
		text('ben@boscotech.net', 'f2', ''),
		// Carla: everything met EXCEPT the reflection, one sentence short.
		text('carla@boscotech.net', 'f1', THREE),
		rows('carla@boscotech.net', 't1', 3),
		table('carla@boscotech.net', 't2', [
			{ component: 'Gusset', selected: '1/8 steel plate', why: 'Shear area is four times the bolt.' },
			{ component: '', selected: '', why: '' }
		]),
		checks('carla@boscotech.net', 'c1', true, true),
		text('carla@boscotech.net', 'f2', 'It fails at the lower chord.'),
		checks('carla@boscotech.net', '@declaration', true),
		// Dara: started and plainly unfinished, but never handed in.
		text('dara@boscotech.net', 'f1', 'I think the side view.'),
		rows('dara@boscotech.net', 't1', 1),
		// Eli: m1 and the checklist met, photo zone one short, gate never approved.
		text('eli@boscotech.net', 'f1', THREE),
		rows('eli@boscotech.net', 't1', 3),
		checks('eli@boscotech.net', 'c1', true, true),
		text('eli@boscotech.net', 'f2', TWO),
		checks('eli@boscotech.net', '@declaration', true)
	]);

	function photo(id: string, submissionId: string): SubmissionFileRow {
		return {
			id,
			submission_id: submissionId,
			block_id: 'z1',
			caption: 'Sketch, sheet 1',
			filename: `${id}.png`,
			mime_type: 'application/octet-stream',
			storage_key: `${submissionId}/${id}.png`
		};
	}

	let files = $state<SubmissionFileRow[]>([
		photo('img-a1', 'sub-a'),
		photo('img-a2', 'sub-a'),
		photo('img-c1', 'sub-c'),
		photo('img-c2', 'sub-c'),
		// Eli handed in one photo where the zone asks for two.
		photo('img-e1', 'sub-e')
	]);

	// Approved for everyone who reached m3. Eli's gate is deliberately still
	// closed, which is what puts an `approval` entry in his list and suppresses
	// m3's own constraint behind it -- exactly as the server does.
	let approvals = $state<ModuleApprovalRow[]>([
		{ item_id: ITEM_ID, student_email: 'alice@boscotech.net', module_id: 'm2', approved_by: TEACHER, approved_at: iso(2) },
		{ item_id: ITEM_ID, student_email: 'ben@boscotech.net', module_id: 'm2', approved_by: TEACHER, approved_at: iso(2) },
		{ item_id: ITEM_ID, student_email: 'carla@boscotech.net', module_id: 'm2', approved_by: TEACHER, approved_at: iso(2) },
		{ item_id: ITEM_ID, student_email: 'dara@boscotech.net', module_id: 'm2', approved_by: TEACHER, approved_at: iso(2) }
	]);

	let log = $state<string[]>([]);
	function note(what: string, detail: unknown) {
		log = [`${new Date().toLocaleTimeString()} ${what} ${JSON.stringify(detail)}`, ...log].slice(0, 12);
	}

	/**
	 * The write transports are REAL enough to prove the thing that matters
	 * here: grading and returning an INCOMPLETE submission still works. They
	 * write the same rows the RPCs write, so the roster chip, the score and the
	 * returned state all move the way they do in production -- and the unmet
	 * list, being derived from responses rather than from the submission, is
	 * unaffected by a grade, which is itself the claim.
	 */
	const transports: AssignmentTeacherTransports = {
		async setSpec(itemId, spec) {
			note('setSpec', { itemId, spec: spec ? 'set' : null });
			return { ok: true, data: undefined };
		},
		async setRubric(itemId, criteria) {
			note('setRubric', { itemId, criteria: criteria?.length ?? null });
			return { ok: true, data: undefined };
		},
		async gradeSubmission(itemId, studentEmail, scores, comment, release, criterionComments) {
			note('gradeSubmission', { studentEmail, scores, comment, release, criterionComments });
			const total = Object.values(scores).reduce((n, v) => n + Number(v || 0), 0);
			const existing = submissions.find((s) => s.student_email === studentEmail);
			const next: SubmissionRow = existing
				? { ...existing }
				: sub({ id: `sub-${studentEmail}`, student_email: studentEmail, state: 'draft' });
			next.rubric_scores = { ...scores };
			next.criterion_comments = criterionComments ? { ...criterionComments } : null;
			next.score = total;
			next.teacher_comment = comment;
			next.graded_by = TEACHER;
			next.graded_at = new Date().toISOString();
			if (release) {
				next.state = 'returned';
				next.returned_at = new Date().toISOString();
			}
			submissions = existing
				? submissions.map((s) => (s.student_email === studentEmail ? next : s))
				: [...submissions, next];
			return { ok: true, data: { ok: true, state: next.state } };
		},
		async approveModule(itemId, studentEmail, moduleId, approved) {
			note('approveModule', { studentEmail, moduleId, approved });
			approvals = approved
				? [
						...approvals.filter((a) => !(a.student_email === studentEmail && a.module_id === moduleId)),
						{ item_id: ITEM_ID, student_email: studentEmail, module_id: moduleId, approved_by: TEACHER, approved_at: new Date().toISOString() }
					]
				: approvals.filter((a) => !(a.student_email === studentEmail && a.module_id === moduleId));
			return { ok: true, data: undefined };
		},
		async loadGrading(itemId, sectionId) {
			note('loadGrading', { itemId, sectionId });
			return {
				ok: true,
				data: {
					roster: ROSTER.filter((e) => e.section_id === sectionId),
					submissions: submissions.filter((s) => s.item_id === itemId),
					responses: responses.filter((r) => r.item_id === itemId),
					files,
					filesStorageReady: true,
					approvals: approvals.filter((a) => a.item_id === itemId)
				}
			};
		}
	};

	/**
	 * THE ORACLE, PRINTED BESIDE THE CONSOLE.
	 *
	 * A browser pass asserting "the open view names every unmet check" needs a
	 * number that did NOT come from the surface under test. This is `specUnmet`
	 * called directly on the same fixture, so the check is console-against-pure-
	 * function rather than console-against-itself. It is also what makes the
	 * mutation proof legible: force `specUnmet` to return [] and BOTH sides go
	 * to zero here, which is the tell that the mutation actually landed.
	 */
	const oracle = $derived(
		ROSTER.map((e) => {
			const mine = responses.filter((r) => r.student_email === e.student_email);
			const subRow = submissions.find((s) => s.student_email === e.student_email) ?? null;
			const myFiles = files.filter((f) => f.submission_id === subRow?.id);
			const entries = specUnmet(
				SPEC,
				responsesMap(mine),
				filesByBlockCount(myFiles),
				approvals.filter((a) => a.student_email === e.student_email)
			);
			const state = subRow?.state ?? null;
			const handedIn = state === 'submitted' || state === 'returned';
			return {
				name: e.display_name,
				email: e.student_email,
				state: state ?? 'none',
				handedIn,
				count: entries.length,
				expectMark: handedIn ? entries.length : 0,
				labels: entries.map((x) => unmetLabel(SPEC, x))
			};
		})
	);

	// -----------------------------------------------------------------------
	// THE EXPORT CAPTURE.
	//
	// The three graded-work exports end in a real `<a download>` click, which in
	// a headless pass would either write a file nothing here can read or do
	// nothing at all. So the harness INTERCEPTS the download rather than
	// simulating one: `URL.createObjectURL` is wrapped to keep a reference to
	// the Blob (the console revokes the url on the next line, so fetching it
	// back afterwards is a race the harness would lose), and the anchor's own
	// `click` is wrapped to record the pair instead of navigating.
	//
	// THE POINT IS THAT IT MEASURES THE REAL CONTROL. Every capture below came
	// out of pressing the button the teacher presses, through
	// `buildGradingExport` and the console's own `download` helper. The oracle
	// beside it calls the pure builder directly on the same fixture, so a
	// browser pass compares a produced FILE against a function rather than
	// against itself.
	// -----------------------------------------------------------------------
	interface Capture {
		/** A monotonic id, because two presses of ONE control produce two files
		 *  with the same name and the same size -- and keying the list on those
		 *  is a duplicate-key crash the moment somebody presses twice. */
		id: number;
		name: string;
		size: number;
		type: string;
		/** JSON only: the file's own text, for reading counts and identity out of it. */
		text: string | null;
		/** Does this file contain a roster name. The identity switch's own proof. */
		hasName: boolean | null;
		/** JSON only: read back OUT of the produced file, never from the builder. */
		students: number | null;
		unmet: number | null;
		/**
		 * XLSX only, inflated through `$lib/xlsx-read` -- the same reader the
		 * vitest suite uses. Every figure here is read out of the produced
		 * workbook's own XML, never off the object that was handed to the writer.
		 */
		sheets: string | null;
		tableHeader: string | null;
		tableRows: number | null;
		maxHeight: number | null;
		blankDropped: string | null;
	}
	let captures = $state<Capture[]>([]);
	let captureSeq = 0;
	const NAMES = ROSTER.map((e) => e.display_name);
	/** The table sheet the browser pass reads its header row out of. */
	const TABLE_SHEET = 'Design Reflection';

	onMount(() => {
		const realCreate = URL.createObjectURL.bind(URL);
		const realClick = HTMLAnchorElement.prototype.click;
		const blobs = new Map<string, Blob>();
		URL.createObjectURL = (obj: Blob | MediaSource) => {
			const url = realCreate(obj);
			if (obj instanceof Blob) blobs.set(url, obj);
			return url;
		};
		HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
			const blob = blobs.get(this.href);
			if (!blob || !this.download) return realClick.call(this);
			const isText = blob.type.includes('json') || blob.type.includes('csv');
			const isWorkbook = this.download.endsWith('.xlsx');
			/** Filled in for a workbook, left null for everything else. */
			let book: Partial<Capture> = {};
			const record = (text: string | null) => {
				// PARSED BACK OUT OF THE FILE, not read off the builder: a count
				// taken from the object that produced the bytes cannot tell you
				// whether the bytes carry it.
				let students: number | null = null;
				let unmet: number | null = null;
				if (text && blob.type.includes('json')) {
					try {
						const parsed = JSON.parse(text);
						students = parsed.export?.counts?.students ?? null;
						unmet = (parsed.assignments?.[0]?.students ?? []).reduce(
							(n: number, s: { completeness?: { unmetCount?: number } }) =>
								n + (s.completeness?.unmetCount ?? 0),
							0
						);
					} catch {
						// A file that does not parse is itself the finding; leave both null.
					}
				}
				captures = [
					{
						id: ++captureSeq,
						name: this.download,
						size: blob.size,
						type: blob.type,
						text,
						hasName: text === null ? null : NAMES.some((n) => text.includes(n)),
						students,
						unmet,
						sheets: null,
						tableHeader: null,
						tableRows: null,
						maxHeight: null,
						blankDropped: null,
						...book
					},
					...captures
				].slice(0, 8);
			};
			if (isText) {
				void blob.text().then(record);
			} else if (isWorkbook) {
				// THE WORKBOOK IS INFLATED AND READ, not just weighed. Its sheet
				// names, a table sheet's real header row, that sheet's row count
				// and the tallest row in the file all come off the bytes the
				// control just produced.
				void blob
					.arrayBuffer()
					.then((buf) => readXlsxWorkbook(new Uint8Array(buf)))
					.then((wb) => {
						const table = wb.get(TABLE_SHEET);
						const heights = [...wb.values()].flatMap((sheet) =>
							sheet.heights.filter((h): h is number => h != null)
						);
						const about = wb.get('About this export');
						book = {
							sheets: [...wb.keys()].join(' | '),
							tableHeader: table ? table.header.join(' | ') : 'no such sheet',
							tableRows: table ? table.rows.length : null,
							maxHeight: heights.length ? Math.max(...heights) : null,
							blankDropped:
								about?.rows.find((r) => r[0] === 'Blank table rows dropped')?.[1] ?? null
						};
						record(null);
					})
					.catch((err) => {
						book = { sheets: `unreadable: ${err instanceof Error ? err.message : String(err)}` };
						record(null);
					});
			} else {
				record(null);
			}
			// Deliberately NOT calling through: a real download in a headless
			// pass is a file nothing here can read.
		};
		return () => {
			URL.createObjectURL = realCreate;
			HTMLAnchorElement.prototype.click = realClick;
		};
	});

	/**
	 * THE EXPORT ORACLE, the same shape as the unmet one above: the pure builder
	 * called directly, both ways on the identity switch, so a pass compares the
	 * file the console produced against a function rather than against the
	 * console's own claim about it.
	 */
	function oracleFor(identity: ExportIdentity) {
		const rows = ROSTER.map((e) => ({
			email: e.student_email,
			displayName: e.display_name,
			active: e.active,
			submission: submissions.find((s) => s.student_email === e.student_email) ?? null,
			responses: responses.filter((r) => r.student_email === e.student_email),
			files: files.filter(
				(f) => f.submission_id === submissions.find((s) => s.student_email === e.student_email)?.id
			),
			approvals: approvals.filter((a) => a.student_email === e.student_email)
		}));
		const payload = buildGradingExport({
			section: SECTION,
			item: ITEM,
			spec: SPEC,
			rubric: RUBRIC,
			roster: rows,
			selectedEmail: rows[0]?.email ?? null,
			scope: 'section',
			identity,
			now: new Date('2026-08-31T12:00:00.000Z')
		});
		const text = gradingExportJson(payload);
		return {
			identity,
			students: payload.export.counts.students,
			assignments: payload.export.counts.assignments,
			unmetTotal: payload.assignments[0].students.reduce(
				(n, s) => n + s.completeness.unmetCount,
				0
			),
			emptyRecords: payload.assignments[0].students.filter((s) => !s.submission.handedIn).length,
			hasName: NAMES.some((n) => text.includes(n)),
			bytes: text.length
		};
	}
	const exportOracle = $derived([oracleFor('included'), oracleFor('omitted')]);
</script>

<svelte:head><title>Grading console: incomplete submissions // dev harness</title></svelte:head>

<div class="cr-root">
	<section class="oracle" data-testid="oracle">
		<h1>Grading console &middot; incomplete hand-ins (0160)</h1>
		<p class="lede">
			The REAL <code>GradingConsole</code> below, against an inert fixture. The table is
			<code>specUnmet</code> called directly, so a measurement compares the console with the pure
			function and not with itself. <strong>expectMark</strong> is what the roster should show:
			zero for anyone who has not handed in, however unfinished their work is.
		</p>
		<div class="table-scroll">
			<table>
			<thead>
				<tr><th>Student</th><th>State</th><th>unmet</th><th>expectMark</th><th>Labels</th></tr>
			</thead>
			<tbody>
				{#each oracle as row (row.email)}
					<tr data-testid="oracle-row" data-email={row.email} data-count={row.count} data-expect={row.expectMark}>
						<td>{row.name}</td>
						<td>{row.state}</td>
						<td>{row.count}</td>
						<td>{row.expectMark}</td>
						<td>
							{#if row.labels.length}
								<ul>{#each row.labels as l, i (i)}<li>{l}</li>{/each}</ul>
							{:else}
								<span class="none">none</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
			</table>
		</div>
	</section>

	<section class="oracle" data-testid="export-oracle">
		<h2>Graded-work export &middot; oracle and captures</h2>
		<p class="lede">
			The left table is <code>buildGradingExport</code> called directly on this fixture, both ways
			on the identity switch. The right table is what the console's own controls actually
			produced: the harness intercepts the <code>&lt;a download&gt;</code> and keeps the Blob, so
			these rows are real files rather than a claim about them.
		</p>
		<div class="table-scroll">
			<table>
			<thead>
				<tr><th>identity</th><th>students</th><th>assignments</th><th>unmet</th><th>empty records</th><th>name in file</th><th>bytes</th></tr>
			</thead>
			<tbody>
				{#each exportOracle as row (row.identity)}
					<tr
						data-testid="export-oracle-row"
						data-identity={row.identity}
						data-students={row.students}
						data-unmet={row.unmetTotal}
						data-empty={row.emptyRecords}
						data-hasname={row.hasName}
					>
						<td>{row.identity}</td>
						<td>{row.students}</td>
						<td>{row.assignments}</td>
						<td>{row.unmetTotal}</td>
						<td>{row.emptyRecords}</td>
						<td>{row.hasName}</td>
						<td>{row.bytes}</td>
					</tr>
				{/each}
			</tbody>
			</table>
		</div>
		<h2 class="captures-head">Files the controls produced</h2>
		{#if captures.length}
			<div class="table-scroll">
			<table>
				<thead>
					<tr><th>filename</th><th>bytes</th><th>type</th><th>name in file</th><th>students</th><th>unmet</th><th>sheets</th><th>table header</th><th>table rows</th><th>tallest row</th><th>blank rows dropped</th></tr>
				</thead>
				<tbody>
					{#each captures as c (c.id)}
						<tr
							data-testid="capture-row"
							data-name={c.name}
							data-size={c.size}
							data-hasname={c.hasName}
							data-students={c.students}
							data-unmet={c.unmet}
							data-sheets={c.sheets}
							data-tableheader={c.tableHeader}
							data-tablerows={c.tableRows}
							data-maxheight={c.maxHeight}
							data-blankdropped={c.blankDropped}
						>
							<td>{c.name}</td>
							<td>{c.size}</td>
							<td>{c.type}</td>
							<td>{c.hasName === null ? 'binary, not read here' : String(c.hasName)}</td>
							<td>{c.students ?? '-'}</td>
							<td>{c.unmet ?? '-'}</td>
							<td>{c.sheets ?? '-'}</td>
							<td>{c.tableHeader ?? '-'}</td>
							<td>{c.tableRows ?? '-'}</td>
							<td>{c.maxHeight ?? '-'}</td>
							<td>{c.blankDropped ?? '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			</div>
		{:else}
			<p class="none" data-testid="capture-empty">
				Nothing exported yet. Press one of the export controls below.
			</p>
		{/if}
	</section>

	<GradingConsole section={SECTION} item={ITEM} spec={SPEC} rubric={RUBRIC} {transports} basePath="/dev/grading-incomplete" />

	{#if log.length}
		<section class="oracle log" data-testid="transport-log">
			<h2>Transport log</h2>
			<ul>{#each log as line, i (i)}<li>{line}</li>{/each}</ul>
		</section>
	{/if}
</div>

<style>
	.oracle {
		margin: var(--space-3) auto;
		max-width: 72rem;
		padding: var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
		color: var(--text-1);
	}
	h1 {
		margin: 0 0 var(--space-2);
		font-size: 1.05rem;
	}
	h2 {
		margin: 0 0 var(--space-2);
		font-size: 0.9rem;
	}
	.lede {
		margin: 0 0 var(--space-2);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text-1);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.72rem;
	}
	th,
	td {
		border: 1px solid var(--hairline);
		padding: 0.3rem 0.45rem;
		text-align: left;
		vertical-align: top;
		color: var(--text-1);
	}
	th {
		font-family: var(--font-mono);
		color: var(--text-2);
	}
	ul {
		margin: 0;
		padding-left: 1rem;
	}
	.none {
		color: var(--text-2);
	}
	.captures-head {
		margin-top: var(--space-3);
	}
	/* Wide content scrolls inside its own box; the PAGE never scrolls sideways.
	   Measured at 375px before this: 45px of overhang, all of it these tables. */
	.table-scroll {
		overflow-x: auto;
	}
	.log {
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}
</style>
