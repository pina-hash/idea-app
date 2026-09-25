<script lang="ts">
	// The room the real route renders in: the classroom stylesheet and the
	// route's own measure, or every width read here is one production never has.
	import '$lib/classroom/classroom.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import type { BulkGradingTransports } from '$lib/classroom/grading-bulk';
	import type {
		AssignmentTeacherTransports,
		GradingData,
		RubricCriterion,
		SubmissionFileRow,
		SubmissionRow
	} from '$lib/classroom/assignment-spec';
	import type {
		ClassroomEnrollment,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';
	import { blockLabelsFromManifest } from '$lib/classroom/bulk-download';
	import type { BulkFileSource } from '$lib/classroom/bulk-download-source';
	import { inflateEntry, readCentralDirectory } from '$lib/foundry/zip';

	const viewSource = $derived(page.url.searchParams.get('source') ?? '');
	const viewMode = $derived(page.url.searchParams.get('mode') ?? '');
	const noSource = $derived(viewSource === 'none');
	const perSection = $derived(viewMode === 'section');

	const ITEM_ID = 'i-files-1';
	const TEACHER = 'apina@boscotech.edu';

	const course = { id: 'c-100', code: 'IDEA100', title: 'Engineering Essentials', active: true };
	const P1: ClassroomSection = {
		id: 's-p1',
		course_id: 'c-100',
		label: 'Period 1',
		block: '1',
		teacher_email: TEACHER,
		active: true,
		course
	};
	const P3: ClassroomSection = { ...P1, id: 's-p3', label: 'Period 3', block: '3' };

	const ITEM = {
		id: ITEM_ID,
		kind: 'assignment',
		title: 'Blade CAD 01: Root & Hub',
		body: '',
		points: 10,
		// 23:59 Pacific on Saturday 19 September.
		due_at: '2026-09-20T06:59:00Z',
		category: null,
		author_email: TEACHER,
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		sort_order: 0,
		attachments: [],
		publish_at: null
	} as unknown as ClassroomItem;

	/** A ported document's manifest: the block names the zip reads. */
	const MANIFEST = {
		schemaVersion: 3,
		header: [{ id: 'hx-team', field: 'teamName', type: 'text' }],
		modules: [
			{
				id: 'm1',
				title: 'Sketches',
				blocks: [
					{ id: 'hx-blade', field: 'bladePhoto', type: 'image' },
					{ id: 'hx-notes', field: 'notes', type: 'longText' }
				]
			},
			{ id: 'm2', title: 'Hub', blocks: [{ id: 'hx-hub', field: 'hubPhoto', type: 'image' }] }
		]
	};

	const RUBRIC: RubricCriterion[] = [
		{
			id: 'work',
			criterion: 'Photos show the blade root and the hub',
			points: 10,
			levels: [
				{ points: 10, label: 'Complete', short: 'Both shown', descriptor: 'Both photos show the part clearly.' },
				{ points: 0, label: 'Absent', short: 'Missing', descriptor: 'No photo shows the part.' }
			]
		} as unknown as RubricCriterion
	];

	const enrol = (
		section_id: string,
		student_email: string,
		display_name: string,
		extra: Partial<ClassroomEnrollment> = {}
	): ClassroomEnrollment => ({
		section_id,
		student_email,
		display_name,
		active: true,
		manages: false,
		...extra
	});

	/** Both classes. The per-class console sees only Period 1 of this. */
	const ROSTER: ClassroomEnrollment[] = [
		enrol('s-p1', 'eva@boscotech.net', 'Eva Reyes'),
		enrol('s-p1', 'jose1@boscotech.net', 'José Pérez'),
		enrol('s-p1', 'jose2@boscotech.net', 'Jose Perez'),
		enrol('s-p1', 'dana@boscotech.net', 'Kim, Dana', { active: false }),
		enrol('s-p1', 'omar@boscotech.net', 'Omar Haddad'),
		enrol('s-p1', TEACHER, 'A. Pina', { manages: true }),
		enrol('s-p3', 'ana@boscotech.net', 'Ana Alvarez'),
		enrol('s-p3', 'ben@boscotech.net', 'Ben Okafor')
	];

	const sub = (id: string, student_email: string, extra: Partial<SubmissionRow> = {}): SubmissionRow =>
		({
			id,
			item_id: ITEM_ID,
			student_email,
			state: 'draft',
			submitted_at: null,
			returned_at: null,
			rubric_scores: null,
			criterion_comments: null,
			score: null,
			teacher_comment: null,
			graded_by: null,
			graded_at: null,
			...extra
		}) as SubmissionRow;

	const SUBMISSIONS: SubmissionRow[] = [
		sub('sub-eva', 'eva@boscotech.net', { state: 'returned', score: 8, rubric_scores: { work: 8 } }),
		sub('sub-jose1', 'jose1@boscotech.net'),
		sub('sub-jose2', 'jose2@boscotech.net'),
		sub('sub-dana', 'dana@boscotech.net', { state: 'submitted', submitted_at: '2026-09-19T21:00:00Z' }),
		sub('sub-teacher', TEACHER),
		sub('sub-ana', 'ana@boscotech.net'),
		sub('sub-ben', 'ben@boscotech.net'),
		sub('sub-ghost', 'ghost@boscotech.net')
	];

	const file = (
		id: string,
		submission_id: string,
		block_id: string | null,
		filename: string,
		extra: Partial<SubmissionFileRow> = {}
	): SubmissionFileRow => ({
		id,
		submission_id,
		block_id,
		caption: null,
		filename,
		mime_type: 'application/octet-stream',
		size_bytes: 120,
		sort_order: 1,
		storage_key: `${submission_id}/${id}.bin`,
		...extra
	});

	const FILES: SubmissionFileRow[] = [
		file('f1', 'sub-eva', 'hx-blade', 'IMG_0001.JPG', { sort_order: 1, size_bytes: 2_400_000 }),
		file('f2', 'sub-eva', 'hx-blade', 'IMG_0002.jpg', { sort_order: 2, size_bytes: 2_100_000 }),
		file('f3', 'sub-eva', 'hx-hub', 'hub (final).png', { size_bytes: 900_000 }),
		// A LEGACY DRIVE ROW: no key, no recorded size.
		file('f4', 'sub-eva', null, 'Blade Assembly.SLDASM', { storage_key: null, size_bytes: null }),
		// A BLOCK THE MANIFEST DOES NOT KNOW, and the fetch that fails.
		file('f5', 'sub-eva', 'hx-retired', 'old.pdf', { size_bytes: 10_000 }),
		file('f6', 'sub-jose1', 'hx-blade', 'foto.heic'),
		file('f7', 'sub-jose2', 'hx-blade', 'photo.jpg'),
		file('f8', 'sub-dana', null, 'notes.txt'),
		// LEFT OUT OF PERIOD 1: the teacher's own file, and Period 3's students.
		file('f10', 'sub-teacher', 'hx-blade', 'key.png'),
		file('f11', 'sub-ana', 'hx-blade', 'ana.png'),
		file('f12', 'sub-ben', 'hx-hub', 'ben hub.png'),
		// ON NO ROSTER, and a file whose submission never arrived.
		file('f13', 'sub-ghost', 'hx-blade', 'ghost.png'),
		file('f14', 'sub-missing', null, 'orphan.bin')
	];

	/** When each file arrived: one before the due time, one after it. */
	const UPLOADED = new Map([
		['f1', '2026-09-19T20:00:00Z'],
		['f2', '2026-09-20T08:30:00Z']
	]);

	let log = $state<string[]>([]);
	function note(line: string) {
		log = [...log, line];
	}

	function gradingData(roster: ClassroomEnrollment[]): GradingData {
		return {
			roster,
			submissions: SUBMISSIONS,
			responses: [],
			files: FILES,
			filesStorageReady: true,
			extraCreditReady: true,
			approvals: []
		};
	}

	const transports: AssignmentTeacherTransports = {
		async setSpec() {
			return { ok: true, data: undefined };
		},
		async setRubric() {
			return { ok: true, data: undefined };
		},
		async gradeSubmission() {
			return { ok: true, data: { ok: true } };
		},
		async approveModule() {
			return { ok: true, data: undefined };
		},
		async loadGrading() {
			// THE PER-CLASS READ: one class's roster, and every file the item has,
			// which is what RLS legitimately returns a teacher of both classes.
			return { ok: true, data: gradingData(ROSTER.filter((e) => e.section_id === P1.id)) };
		}
	};

	const crossClass: BulkGradingTransports = {
		async loadAcross() {
			return { ok: true, data: { sections: [P1, P3], data: gradingData(ROSTER) } };
		},
		async gradeMany() {
			return { ok: true, data: { ok: true, total: 0, succeeded: 0, refused: 0, results: [] } };
		}
	};
	const { loadAcross: _across, ...batchOnly } = crossClass;
	const bulk = $derived(perSection ? batchOnly : crossClass);

	const source: BulkFileSource = {
		blocks: blockLabelsFromManifest(MANIFEST),
		async fetchFile(f) {
			await new Promise((r) => setTimeout(r, 15));
			if (f.id === 'f5') return { ok: false, reason: 'The file is no longer in storage.' };
			return { ok: true, bytes: new TextEncoder().encode(`bytes of ${f.filename}`) };
		},
		async uploadTimes() {
			return UPLOADED;
		},
		async managedRoster() {
			return ROSTER;
		}
	};
	const fileDownload = $derived(noSource ? null : source);

	// -----------------------------------------------------------------------
	// THE CAPTURE: the console's own `download` helper runs; the Blob is kept
	// and the zip is read BACK, so every path and CSV row below came out of
	// the bytes the control produced.
	// -----------------------------------------------------------------------
	interface Capture {
		id: number;
		name: string;
		size: number;
		paths: string[];
		index: string;
	}
	let captures = $state<Capture[]>([]);
	let seq = 0;

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
			const name = this.download;
			void blob.arrayBuffer().then(async (buf) => {
				const bytes = new Uint8Array(buf);
				const records = readCentralDirectory(bytes) ?? [];
				const indexRecord = records.find((r) => r.name === 'index.csv');
				const index = indexRecord
					? new TextDecoder().decode(await inflateEntry(bytes, indexRecord, indexRecord.name))
					: 'NO index.csv IN THIS ZIP';
				captures = [
					{ id: ++seq, name, size: blob.size, paths: records.map((r) => r.name), index },
					...captures
				];
				note(`saved ${name} (${records.length} entries)`);
			});
		};
		return () => {
			URL.createObjectURL = realCreate;
			HTMLAnchorElement.prototype.click = realClick;
		};
	});
</script>

<svelte:head><title>dev: grading console, download all files</title></svelte:head>

<div
	class="cr-root cr-app harness"
	style="--cr-measure-route: var(--measure-console)"
	data-testid="grading-files-harness"
>
	<header class="gf-head">
		<h1>Grading console: download all files</h1>
		<p class="gf-note">
			The REAL <code>GradingConsole</code> with the REAL <code>BulkFileDownload</code> in its
			export panel. The file transport answers from memory; one fetch fails on purpose.
		</p>
		<nav class="gf-states">
			<a class="gf-state" class:is-on={!noSource && !perSection} href="/dev/grading-files">all classes</a>
			<a class="gf-state" class:is-on={perSection} href="/dev/grading-files?mode=section">one class</a>
			<a class="gf-state" class:is-on={noSource} href="/dev/grading-files?source=none">no transport</a>
		</nav>
	</header>

	{#key `${viewSource}|${viewMode}`}
		<GradingConsole
			section={P1}
			item={ITEM}
			spec={null}
			rubric={RUBRIC}
			{transports}
			{bulk}
			{fileDownload}
		/>
	{/key}

	<section class="gf-captures" aria-label="Zips the control produced">
		<h2>Zips produced</h2>
		{#if captures.length === 0}
			<p class="gf-note" data-testid="zip-none">Nothing downloaded yet.</p>
		{/if}
		{#each captures as c (c.id)}
			<article class="gf-capture" data-testid="zip-capture" data-name={c.name} data-count={c.paths.length}>
				<h3>{c.name} ({c.size} bytes)</h3>
				<ol>
					{#each c.paths as p (p)}<li data-testid="zip-path">{p}</li>{/each}
				</ol>
				<pre data-testid="zip-index">{c.index}</pre>
			</article>
		{/each}
	</section>

	<section class="gf-log" aria-label="Transport calls">
		<h2>Log</h2>
		<ul>
			{#each log as line, i (i)}<li>{line}</li>{/each}
		</ul>
	</section>
</div>

<style>
	.harness {
		padding: var(--space-4, 1.2rem);
	}
	.gf-head {
		margin-bottom: var(--space-4, 1.2rem);
	}
	.gf-head h1 {
		font-family: var(--font-title, var(--font-display));
		font-size: 1.1rem;
		margin: 0 0 0.4rem;
	}
	.gf-note {
		color: var(--text-2);
		font-size: 0.85rem;
		max-width: var(--measure-reading, 62ch);
		margin: 0 0 0.8rem;
	}
	.gf-states {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.gf-state {
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
	.gf-state.is-on {
		color: var(--green);
		border-color: var(--green);
	}
	.gf-captures,
	.gf-log {
		margin-top: var(--space-4, 1.2rem);
		min-width: 0;
	}
	.gf-captures h2,
	.gf-log h2 {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.gf-capture h3 {
		font-size: 0.8rem;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.gf-capture ol,
	.gf-log ul {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
		padding-left: 1.2rem;
		overflow-wrap: anywhere;
	}
	.gf-capture pre {
		font-size: 0.62rem;
		color: var(--text-2);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
