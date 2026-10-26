/**
 * THE TOOLS: what each facade in registry/tools.yaml does, plus `site_find_tool`
 * and `site_call`. A facade is voice-shaped: it resolves the names he said
 * (resolve.ts), reads what it needs as him, and writes ONLY through
 * `engine.write`, so every write takes its function entry's level, preview,
 * repeat protection, audit row and undo. Nothing here is a tool the registry
 * does not list: `runTool` refuses any name that is not a facade, a direct
 * function tool, or one of the two built-ins.
 */
import { formatDue } from '$lib/classroom/classroom';
import { FEEDBACK_MEDIA_BUCKET } from '$lib/feedback/screenshot';
import { laCalendarDay, schoolDayOf, weekOffset } from '$lib/classroom/school-calendar';
import { hxBlockPrompt, manifestBlocks, type HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import { manifestRubricIsDerived, stagedRubricAfterManifest } from '$lib/classroom/html-assignment/rubric';
import { htmlManifestDiff, stageHtmlDocument } from '$lib/classroom/html-assignment/store';
import type { RubricCriterion } from '$lib/classroom/assignment-spec';
import type { ToolContext } from './context';
import { resolveDue, resolveNoticeEnd } from './dates';
import { readBefore, undoLast, write, NotRegistered, type WriteOptions, type WriteOutcome } from './engine';
import { runEndpoint } from './endpoints';
import {
	callArgs,
	directEntries,
	ENDPOINTS,
	FACADES,
	findTools,
	fitOverload,
	FUNCTIONS,
	liveEndpoint,
	liveFunction,
	type FunctionEntry
} from './registry';
import {
	mySections,
	myPosts,
	myStudents,
	resolveClass,
	resolveClasses,
	resolvePost,
	resolveStudent,
	ResolveFailure,
	type MySection,
	type PostRow,
	type Resolution,
	type RosterStudent
} from './resolve';
import { opaqueToken } from './crypto';
import { lookupId, lookupKindFor, looksLikeId, lookupWords } from './lookup';
import { decideCoin, parseVoiceCatalog } from './coin-voice';
import { notesForExport, parseThreads } from '$lib/classroom/feedback/notes';
import { hxIsTeamManifest } from '$lib/classroom/html-assignment/team-doc';

export type ToolArgs = Record<string, unknown>;
export type ToolOutput = Record<string, unknown>;

const KIND_WORDS: Record<string, string> = { post: 'announcement', assignment: 'assignment', material: 'material' };

function str(v: unknown): string | undefined {
	return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}
function bool(v: unknown): boolean | undefined {
	return typeof v === 'boolean' ? v : undefined;
}
function num(v: unknown): number | undefined {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
	return undefined;
}
function list(v: unknown): string[] {
	if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
	const s = str(v);
	return s ? [s] : [];
}

export function writeOptions(args: ToolArgs): WriteOptions {
	return {
		dryRun: bool(args.dry_run) ?? false,
		requestId: str(args.request_id),
		confirmToken: str(args.confirm_token),
		again: bool(args.again) ?? false
	};
}

/** A resolution that did not land, as the answer the tool gives: write nothing and say why. */
function unresolved<T>(what: string, r: Exclude<Resolution<T>, { status: 'found' }>): ToolOutput {
	if (r.status === 'ambiguous') {
		return {
			status: 'ambiguous',
			what,
			said: r.said,
			candidates: r.candidates,
			message: `More than one ${what} matches "${r.said}". Nothing was changed. Ask him which one, then call again naming it exactly.`
		};
	}
	return { status: 'not_found', what, said: r.said, message: `${r.message} Nothing was changed.` };
}

function postSummary(p: PostRow, today: string) {
	const scheduled = p.publish_at !== null && Date.parse(p.publish_at) > Date.now();
	return {
		post: p.title ?? p.body.slice(0, 80),
		id: p.id,
		kind: KIND_WORDS[p.kind] ?? p.kind,
		points: p.points,
		due: p.due_at ? formatDue(p.due_at, today) : null,
		due_at: p.due_at,
		visible_to_students: p.published && !scheduled,
		draft: !p.published,
		scheduled_for: scheduled ? p.publish_at : null,
		pinned: p.pinned,
		html_assignment: p.assignment_schema_version === 3,
		classes: p.sections.map((s) => s.title),
		...(p.sections.length > 1
			? { shared: `One copy posted to ${p.sections.length} classes: any change to it changes it in every one of them.` }
			: {})
	};
}

function outcomeWords(o: WriteOutcome): ToolOutput {
	return { ...o };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function findStudent(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const name = str(args.name);
	if (!name) return { status: 'invalid', message: 'Say a name to look for.' };
	const r = await resolveStudent(ctx, name, str(args.class));
	if (r.status !== 'found') return unresolved('student', r);
	return { status: 'found', student: r.value.name, email: r.value.email, classes: r.value.classes.map((c) => c.title) };
}

async function listClasses(ctx: ToolContext): Promise<ToolOutput> {
	const sections = await mySections(ctx);
	return {
		status: 'ok',
		classes: sections.map((s) => ({ class: s.title, course: s.courseCode, course_title: s.courseTitle, id: s.id })),
		message: sections.length ? undefined : 'You are not teacher of record for any class.'
	};
}

function inWindow(p: PostRow, window: string | undefined, now: number): boolean {
	if (!window) return true;
	const w = window.toLowerCase();
	const today = laCalendarDay(new Date(now));
	if (!p.due_at) return false;
	const day = schoolDayOf(p.due_at) ?? '';
	if (/overdue|late|past/.test(w)) return Date.parse(p.due_at) < now;
	if (/today/.test(w)) return day === today;
	if (/tomorrow/.test(w)) return day === laCalendarDay(new Date(now + 86_400_000));
	if (/next week/.test(w)) return weekOffset(day, today) === 1;
	if (/this week|week/.test(w)) return weekOffset(day, today) === 0;
	return true;
}

async function listPosts(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const said = str(args.class);
	if (!said) return { status: 'invalid', message: 'Name the class.' };
	const c = await resolveClass(ctx, said);
	if (c.status !== 'found') return unresolved('class', c);
	const kindSaid = str(args.kind)?.toLowerCase();
	const kind = kindSaid ? (kindSaid.startsWith('announ') ? 'post' : kindSaid.replace(/s$/, '')) : undefined;
	const today = laCalendarDay(new Date(ctx.now()));
	const posts = (await myPosts(ctx, [c.value]))
		.filter((p) => !kind || p.kind === kind)
		.filter((p) => inWindow(p, str(args.due), ctx.now()));
	return { status: 'ok', class: c.value.title, count: posts.length, posts: posts.slice(0, 100).map((p) => postSummary(p, today)) };
}

async function rubricOf(ctx: ToolContext, itemId: string): Promise<RubricCriterion[] | null> {
	const r = await ctx.backend.select<{ criteria: RubricCriterion[] }>(ctx.session, {
		table: 'classroom_rubrics',
		columns: ['criteria'],
		eq: { item_id: itemId }
	});
	if (r.error) throw new ResolveFailure(`The rubric could not be read: ${r.error.message}`);
	return r.data[0]?.criteria ?? null;
}

async function storedManifest(ctx: ToolContext, itemId: string): Promise<HtmlAssignmentManifest | null> {
	const r = await ctx.backend.select<{ manifest: HtmlAssignmentManifest }>(ctx.session, {
		table: 'classroom_html_assignments',
		columns: ['manifest'],
		eq: { item_id: itemId }
	});
	if (r.error) throw new ResolveFailure(`The HTML assignment could not be read: ${r.error.message}`);
	return r.data[0]?.manifest ?? null;
}

async function postFrom(ctx: ToolContext, args: ToolArgs): Promise<Resolution<PostRow>> {
	const said = str(args.post);
	if (!said) return { status: 'none', said: '', message: 'Name the post.' };
	return resolvePost(ctx, said, str(args.class));
}

async function getPost(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const p = await postFrom(ctx, args);
	if (p.status !== 'found') return unresolved('post', p);
	const today = laCalendarDay(new Date(ctx.now()));
	const rubric = p.value.kind === 'assignment' ? await rubricOf(ctx, p.value.id) : null;
	const manifest = p.value.assignment_schema_version === 3 ? await storedManifest(ctx, p.value.id) : null;
	return {
		status: 'ok',
		...postSummary(p.value, today),
		text: p.value.body.length > 3000 ? `${p.value.body.slice(0, 3000)}...` : p.value.body,
		category: p.value.category,
		rubric: rubric?.map((c) => ({ criterion: c.criterion, points: c.points, levels: (c.levels ?? []).map((l) => `${l.label} ${l.points}`) })) ?? null,
		questions: manifest ? questionList(manifest) : null
	};
}

function questionList(manifest: HtmlAssignmentManifest) {
	return manifestBlocks(manifest).map((b, i) => ({ number: i + 1, id: b.id, type: b.type, prompt: hxBlockPrompt(b) ?? b.field }));
}

async function pageAll<T>(ctx: ToolContext, spec: Parameters<ToolContext['backend']['select']>[1]): Promise<T[]> {
	const out: T[] = [];
	for (let offset = 0; ; offset += 1000) {
		const r = await ctx.backend.select<T>(ctx.session, { ...spec, limit: 1000, offset });
		if (r.error) throw new ResolveFailure(`${spec.table} could not be read: ${r.error.message}`);
		out.push(...r.data);
		if (r.data.length < 1000) return out;
	}
}

async function readGrades(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const p = await postFrom(ctx, { post: args.post });
	if (p.status !== 'found') return unresolved('post', p);
	let sections: MySection[] = (await mySections(ctx)).filter((s) => p.value.sections.some((x) => x.id === s.id));
	const classSaid = str(args.class);
	if (classSaid) {
		const c = await resolveClasses(ctx, classSaid);
		if (c.status !== 'found') return unresolved('class', c);
		sections = sections.filter((s) => c.value.some((x) => x.id === s.id));
		if (sections.length === 0) return { status: 'not_found', message: `${p.value.title} is not posted in ${classSaid}.` };
	}
	const roster = await myStudents(ctx, sections);
	const subs = await pageAll<{ student_email: string; state: string; submitted_at: string | null; returned_at: string | null; score: number | null; direct_score: number | null; graded_at: string | null }>(
		ctx,
		{
			table: 'classroom_submissions',
			columns: ['student_email', 'state', 'submitted_at', 'returned_at', 'score', 'direct_score', 'graded_at'],
			eq: { item_id: p.value.id },
			order: [['student_email', 'asc']]
		}
	);
	const byEmail = new Map(subs.map((s) => [s.student_email, s]));
	let answered: Map<string, number> | null = null;
	let blockCount: number | null = null;
	if (p.value.assignment_schema_version === 3) {
		const rows = await pageAll<{ student_email: string; block_id: string }>(ctx, {
			table: 'classroom_responses',
			columns: ['student_email', 'block_id'],
			eq: { item_id: p.value.id },
			order: [['student_email', 'asc'], ['block_id', 'asc']]
		});
		answered = new Map();
		for (const r of rows) answered.set(r.student_email, (answered.get(r.student_email) ?? 0) + 1);
		const manifest = await storedManifest(ctx, p.value.id);
		blockCount = manifest ? manifestBlocks(manifest).length : null;
	}
	const students = roster.map((st) => {
		const s = byEmail.get(st.email);
		const turnedIn = !!s && s.submitted_at !== null;
		return {
			student: st.name,
			classes: st.classes.map((c) => c.title),
			turned_in: turnedIn,
			state: s?.state ?? 'not started',
			score: s?.score ?? s?.direct_score ?? null,
			graded: !!s?.graded_at,
			returned: !!s?.returned_at,
			...(answered ? { answers_saved: answered.get(st.email) ?? 0, questions: blockCount } : {})
		};
	});
	return {
		status: 'ok',
		post: p.value.title,
		points: p.value.points,
		classes: sections.map((s) => s.title),
		not_turned_in: students.filter((s) => !s.turned_in).map((s) => s.student),
		students,
		note:
			p.value.assignment_schema_version === 3
				? 'An HTML worksheet has no turn-in; answers_saved counts the questions each student has an answer stored for.'
				: undefined
	};
}

function pickQuestion(manifest: HtmlAssignmentManifest | null, said: string | undefined, ids: string[]): string[] | null {
	if (!said) return null;
	const t = said.toLowerCase().trim();
	const n = /(\d+)/.exec(t);
	if (manifest) {
		const blocks = manifestBlocks(manifest);
		if (n && /^(q|question|#|number)?\s*\d+$/.test(t.replace(/\s+/g, ' '))) {
			const b = blocks[Number(n[1]) - 1];
			return b ? [b.id] : [];
		}
		const hits = blocks.filter((b) => b.id.toLowerCase() === t || b.field.toLowerCase() === t || (hxBlockPrompt(b) ?? '').toLowerCase().includes(t));
		return hits.map((b) => b.id);
	}
	return ids.filter((id) => id.toLowerCase().includes(t));
}

async function readAnswers(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const p = await postFrom(ctx, { post: args.post });
	if (p.status !== 'found') return unresolved('post', p);
	const manifest = p.value.assignment_schema_version === 3 ? await storedManifest(ctx, p.value.id) : null;
	const order = manifest ? manifestBlocks(manifest) : null;
	const promptOf = new Map((order ?? []).map((b, i) => [b.id, { number: i + 1, prompt: hxBlockPrompt(b) ?? b.field }]));
	const studentSaid = str(args.student);

	// EVERY STUDENT AT ONCE (gap e40c6d2d): with no student named, one read of
	// every answer stored for the post, grouped by student, named from the
	// rosters of the classes it is posted to.
	if (!studentSaid) {
		const rows = await pageAll<{ student_email: string; block_id: string; value: unknown; updated_at: string }>(ctx, {
			table: 'classroom_responses',
			columns: ['student_email', 'block_id', 'value', 'updated_at'],
			eq: { item_id: p.value.id },
			order: [['student_email', 'asc'], ['block_id', 'asc']]
		});
		const want = pickQuestion(manifest, str(args.question), rows.map((r) => r.block_id));
		const roster = await myStudents(ctx, p.value.sections.map((s) => ({ id: s.id, title: s.title }) as MySection)).catch(() => [] as RosterStudent[]);
		const nameOf = new Map(roster.map((r) => [r.email, r.name]));
		const by = new Map<string, Array<{ question: number | null; prompt: string; answer: unknown; saved: string }>>();
		for (const r of rows) {
			if (want && !want.includes(r.block_id)) continue;
			const list = by.get(r.student_email) ?? [];
			list.push({ question: promptOf.get(r.block_id)?.number ?? null, prompt: promptOf.get(r.block_id)?.prompt ?? r.block_id, answer: r.value, saved: r.updated_at });
			by.set(r.student_email, list);
		}
		// FILE AND PICTURE ANSWERS (gap 8fd1c0bb): each hand-in as a short-lived
		// link signed as him, beside the text answers.
		const files = await answerFiles(ctx, p.value.id, null, want, (id) => ({ number: promptOf.get(id ?? '')?.number ?? null, prompt: promptOf.get(id ?? '')?.prompt ?? id }));
		for (const email of files.keys()) if (!by.has(email)) by.set(email, []);
		const students = [...by.entries()]
			.map(([email, answers]) => ({
				student: nameOf.get(email) ?? email.split('@')[0],
				email,
				answers: answers.sort((a, b) => (a.question ?? 999) - (b.question ?? 999)),
				files: files.get(email) ?? []
			}))
			.sort((a, b) => a.student.localeCompare(b.student));
		return {
			status: 'ok',
			post: p.value.title,
			students,
			count: students.length,
			message: students.length ? undefined : want ? 'No student has an answer stored for that question.' : 'No answers are stored yet.'
		};
	}

	const s = await resolveStudent(ctx, studentSaid);
	if (s.status !== 'found') return unresolved('student', s);
	const rows = await pageAll<{ block_id: string; value: unknown; updated_at: string }>(ctx, {
		table: 'classroom_responses',
		columns: ['block_id', 'value', 'updated_at'],
		eq: { item_id: p.value.id, student_email: s.value.email },
		order: [['block_id', 'asc']]
	});
	const want = pickQuestion(manifest, str(args.question), rows.map((r) => r.block_id));
	const answers = rows
		.filter((r) => !want || want.includes(r.block_id))
		.map((r) => ({ question: promptOf.get(r.block_id)?.number ?? null, prompt: promptOf.get(r.block_id)?.prompt ?? r.block_id, answer: r.value, saved: r.updated_at }))
		.sort((a, b) => (a.question ?? 999) - (b.question ?? 999));
	const files = (await answerFiles(ctx, p.value.id, s.value.email, want, (id) => ({ number: promptOf.get(id ?? '')?.number ?? null, prompt: promptOf.get(id ?? '')?.prompt ?? id }))).get(s.value.email) ?? [];
	return {
		status: 'ok',
		post: p.value.title,
		student: s.value.name,
		answers,
		files,
		...(files.length ? { links_expire_at: new Date(ctx.now() + GRADING_LINK_SECONDS * 1000).toISOString() } : {}),
		message: answers.length || files.length ? undefined : want ? 'No answer is stored for that question.' : 'No answers are stored yet.'
	};
}

/** Every handed-in file on one item (one student's, or everyone's), linked, by address. */
async function answerFiles(
	ctx: ToolContext,
	itemId: string,
	email: string | null,
	want: string[] | null,
	question: (blockId: string | null) => { number: number | null; prompt: string | null }
): Promise<Map<string, ReturnType<typeof fileOut>[]>> {
	const subs = await pageAll<{ id: string; student_email: string }>(ctx, {
		table: 'classroom_submissions',
		columns: ['id', 'student_email'],
		eq: email ? { item_id: itemId, student_email: email } : { item_id: itemId },
		order: [['student_email', 'asc']]
	});
	const rows = (await submissionFiles(ctx, subs.map((x) => x.id))).filter((f) => !want || (f.block_id !== null && want.includes(f.block_id)));
	const links = await signFiles(ctx, 'submission-files', rows);
	const emailOf = new Map(subs.map((x) => [x.id, x.student_email.toLowerCase()]));
	const out = new Map<string, ReturnType<typeof fileOut>[]>();
	rows.forEach((f, i) => {
		const e = emailOf.get(f.submission_id);
		if (!e) return;
		const list = out.get(e) ?? [];
		list.push(fileOut(f, links[i], question));
		out.set(e, list);
	});
	return out;
}

// ---------------------------------------------------------------------------
// FULL GRADING FROM A CHAT (ledger 0438, feedback 6db4fbe5, gap 8fd1c0bb).
//
// Every read here is HIS OWN, through the minted session, so RLS and the
// storage policies decide exactly as on the grading console: a submission
// row is own-row-or-reviewer, a hand-in object is readable by its owner or a
// reviewer (`classroom_can_read_submission_object`), an answer key by a
// manager of the item. Nothing here is a service-role read and nothing widens
// a policy. A file reaches the chat as a SHORT-LIVED SIGNED LINK signed as
// him, never as bytes in an answer, and a link is an attachment download on
// the storage origin, the same object the console's Download opens.
// ---------------------------------------------------------------------------

/** How long a file link in a packet stays good: long enough to look at a class's work. */
export const GRADING_LINK_SECONDS = 3600;

type FileRow = {
	id: string;
	submission_id: string;
	block_id: string | null;
	caption: string | null;
	filename: string;
	storage_key: string | null;
	size_bytes: number | null;
	created_at: string | null;
};

const PICTURE = /\.(png|jpe?g|gif|webp|heic|heif|bmp|svg)$/i;

/** Links for many stored files, signed as him, ten at a time. A file that will not sign says why. */
async function signFiles(ctx: ToolContext, bucket: string, rows: Array<{ storage_key: string | null }>): Promise<Array<string | null>> {
	const out: Array<string | null> = new Array(rows.length).fill(null);
	for (let i = 0; i < rows.length; i += 10) {
		await Promise.all(
			rows.slice(i, i + 10).map(async (row, j) => {
				if (!row.storage_key) return;
				const r = await ctx.backend.signStorage(ctx.session, bucket, row.storage_key, GRADING_LINK_SECONDS).catch(() => null);
				out[i + j] = r && !r.error ? r.data : null;
			})
		);
	}
	return out;
}

/** The files hanging off these submissions, read as him (0133's storage key on the wide rung). */
async function submissionFiles(ctx: ToolContext, submissionIds: string[]): Promise<FileRow[]> {
	const rows: FileRow[] = [];
	for (let i = 0; i < submissionIds.length; i += 100) {
		rows.push(
			...(await pageAll<FileRow>(ctx, {
				table: 'classroom_submission_files',
				columns: ['id', 'submission_id', 'block_id', 'caption', 'filename', 'storage_key', 'size_bytes', 'created_at'],
				in: { submission_id: submissionIds.slice(i, i + 100) },
				order: [['id', 'asc']]
			}))
		);
	}
	return rows;
}

/** One file as the chat sees it: what it is, which question, and a link to open it. */
function fileOut(f: FileRow, link: string | null, question: (blockId: string | null) => { number: number | null; prompt: string | null }) {
	const q = question(f.block_id);
	return {
		filename: f.filename,
		question: f.block_id ? q.number : null,
		prompt: f.block_id ? q.prompt : 'Handed in with the work',
		caption: f.caption ?? undefined,
		picture: PICTURE.test(f.filename),
		size_bytes: f.size_bytes ?? undefined,
		uploaded: f.created_at ?? undefined,
		link: link ?? undefined,
		...(link ? {} : { note: f.storage_key ? 'This file could not be linked just now. Open it from the grading console.' : 'An older file kept in Drive. Open it from the grading console.' })
	};
}

/** Every question an assignment asks: a worksheet's blocks (retired ones last) or a spec's. */
async function questionsOf(ctx: ToolContext, p: PostRow): Promise<{ list: Array<{ number: number; id: string; type: string; prompt: string; module?: string; retired?: true }>; manifest: HtmlAssignmentManifest | null }> {
	if (p.assignment_schema_version === 3) {
		const manifest = await storedManifest(ctx, p.id);
		if (!manifest) return { list: [], manifest: null };
		const list: Array<{ number: number; id: string; type: string; prompt: string; module?: string; retired?: true }> = questionList(manifest).map((q) => ({ ...q, prompt: String(q.prompt) }));
		const retired = await ctx.backend.rpc<Array<{ block_id: string; block: Record<string, unknown>; module_title: string | null }>>(ctx.session, 'classroom_html_retired_blocks', { p_item_id: p.id });
		if (!retired.error && Array.isArray(retired.data)) {
			for (const r of retired.data) {
				if (list.some((q) => q.id === r.block_id)) continue;
				list.push({
					number: list.length + 1,
					id: r.block_id,
					type: typeof r.block.type === 'string' ? r.block.type : 'text',
					prompt: `${typeof r.block.prompt === 'string' ? r.block.prompt : r.block_id}${r.module_title ? ` (was in ${r.module_title})` : ''}`,
					retired: true
				});
			}
		}
		return { list, manifest };
	}
	const spec = await ctx.backend.select<{ spec: { modules?: Array<{ title?: string; blocks?: Array<Record<string, unknown>> }> } }>(ctx.session, {
		table: 'classroom_assignment_specs',
		columns: ['spec'],
		eq: { item_id: p.id }
	});
	const list: Array<{ number: number; id: string; type: string; prompt: string; module?: string }> = [];
	for (const m of spec.data?.[0]?.spec?.modules ?? []) {
		for (const b of m.blocks ?? []) {
			if (typeof b.id !== 'string') continue;
			const prompt = typeof b.prompt === 'string' ? b.prompt : typeof b.content === 'string' ? b.content.slice(0, 200) : b.id;
			list.push({ number: list.length + 1, id: b.id, type: String(b.type ?? 'block'), prompt, module: m.title });
		}
	}
	return { list, manifest: null };
}

/** The post's own files (what the class sees) and its answer keys (managers only), linked. */
async function postFiles(ctx: ToolContext, itemId: string) {
	const shown = await ctx.backend.select<{ filename: string; storage_key: string | null }>(ctx.session, {
		table: 'classroom_attachments',
		columns: ['filename', 'storage_key'],
		eq: { item_id: itemId }
	});
	const keys = await ctx.backend.select<{ filename: string; storage_key: string | null }>(ctx.session, {
		table: 'classroom_instructor_attachments',
		columns: ['filename', 'storage_key'],
		eq: { item_id: itemId }
	});
	const a = shown.data ?? [];
	const k = keys.data ?? [];
	const [al, kl] = await Promise.all([signFiles(ctx, 'classroom-attachments', a), signFiles(ctx, 'instructor-attachments', k)]);
	return {
		attachments: a.map((f, i) => ({ filename: f.filename, picture: PICTURE.test(f.filename), link: al[i] ?? undefined })),
		answer_keys: k.map((f, i) => ({ filename: f.filename, picture: PICTURE.test(f.filename), link: kl[i] ?? undefined }))
	};
}

type NoteThread = { blockId: string | null; state: string; messages: Array<{ from: string; at: string; text: string }> };

/** His notes on each student's work on this item, by address, oldest first. */
async function notesByStudent(ctx: ToolContext, itemId: string): Promise<Map<string, NoteThread[]>> {
	const r = await ctx.backend.rpc<unknown>(ctx.session, 'classroom_feedback_list', { p_item_id: itemId, p_student_email: null, p_section_id: null });
	const out = new Map<string, NoteThread[]>();
	if (r.error) return out;
	for (const [email, threads] of notesForExport(parseThreads(r.data))) out.set(email, threads);
	return out;
}

type SubRow = {
	id: string;
	student_email: string;
	state: string;
	submitted_at: string | null;
	returned_at: string | null;
	graded_at: string | null;
	score: number | null;
	direct_score: number | null;
	rubric_scores: Record<string, number> | null;
	criterion_comments: Record<string, string> | null;
	teacher_comment: string | null;
	extra_credit: number | null;
};
const SUB_COLUMNS = ['id', 'student_email', 'state', 'submitted_at', 'returned_at', 'graded_at', 'score', 'direct_score', 'rubric_scores', 'criterion_comments', 'teacher_comment', 'extra_credit'];

/**
 * ONE READ FOR A WHOLE ASSIGNMENT: what was asked, how it is scored, and every
 * student's work, status, earlier grade, notes and file links, so a class fits
 * in one call and the grades go back in one `grade` call with `grades`.
 */
async function gradingPacket(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const p = await postFrom(ctx, { post: args.post, class: args.class });
	if (p.status !== 'found') return unresolved('post', p);
	if (p.value.kind !== 'assignment') return { status: 'invalid', message: `${p.value.title} is not an assignment, so there is nothing to grade.` };
	let sections: MySection[] = (await mySections(ctx)).filter((s) => p.value.sections.some((x) => x.id === s.id));
	const classSaid = str(args.class);
	if (classSaid) {
		const c = await resolveClasses(ctx, classSaid);
		if (c.status !== 'found') return unresolved('class', c);
		sections = sections.filter((s) => c.value.some((x) => x.id === s.id));
		if (sections.length === 0) return { status: 'not_found', message: `${p.value.title} is not posted in ${classSaid}.` };
	}
	const today = laCalendarDay(new Date(ctx.now()));
	const [roster, rubric, questions, files, notes] = await Promise.all([
		myStudents(ctx, sections),
		rubricOf(ctx, p.value.id),
		questionsOf(ctx, p.value),
		postFiles(ctx, p.value.id),
		notesByStudent(ctx, p.value.id)
	]);
	const onRoster = new Set(roster.map((r) => r.email));
	const studentSaid = str(args.student);
	let only: string | null = null;
	if (studentSaid) {
		const s = await resolveStudent(ctx, studentSaid);
		if (s.status !== 'found') return unresolved('student', s);
		only = s.value.email;
	}
	const wanted = (email: string) => onRoster.has(email) && (!only || email === only);

	const subs = (
		await pageAll<SubRow>(ctx, { table: 'classroom_submissions', columns: SUB_COLUMNS, eq: { item_id: p.value.id }, order: [['student_email', 'asc']] })
	).filter((s) => wanted(s.student_email.toLowerCase()));
	const subByEmail = new Map(subs.map((s) => [s.student_email.toLowerCase(), s]));
	const responses = (
		await pageAll<{ student_email: string; block_id: string; value: unknown; updated_at: string }>(ctx, {
			table: 'classroom_responses',
			columns: ['student_email', 'block_id', 'value', 'updated_at'],
			eq: { item_id: p.value.id },
			order: [['student_email', 'asc'], ['block_id', 'asc']]
		})
	).filter((r) => wanted(r.student_email.toLowerCase()));
	const fileRows = await submissionFiles(ctx, subs.map((s) => s.id));
	const links = await signFiles(ctx, 'submission-files', fileRows);
	const byQuestion = new Map(questions.list.map((q) => [q.id, q]));
	const question = (id: string | null) => {
		const q = id ? byQuestion.get(id) : undefined;
		return { number: q?.number ?? null, prompt: q?.prompt ?? id };
	};
	const emailOfSub = new Map(subs.map((s) => [s.id, s.student_email.toLowerCase()]));
	const filesBy = new Map<string, ReturnType<typeof fileOut>[]>();
	fileRows.forEach((f, i) => {
		const email = emailOfSub.get(f.submission_id);
		if (!email) return;
		const list = filesBy.get(email) ?? [];
		list.push(fileOut(f, links[i], question));
		filesBy.set(email, list);
	});
	const answersBy = new Map<string, Array<{ question: number | null; prompt: string; answer: unknown; saved: string }>>();
	for (const r of responses) {
		const email = r.student_email.toLowerCase();
		const list = answersBy.get(email) ?? [];
		const q = question(r.block_id);
		list.push({ question: q.number, prompt: q.prompt ?? r.block_id, answer: r.value, saved: r.updated_at });
		answersBy.set(email, list);
	}

	// A TEAM ASSIGNMENT (ledger 0436, 0305): the teams, who owns which role, the
	// team's shared answers and each member's grade, read through the site's
	// own team grading screen.
	let teams: ToolOutput[] | undefined;
	const teamOf = new Map<string, string>();
	if (questions.manifest && hxIsTeamManifest(questions.manifest)) {
		teams = [];
		const listed = await ctx.backend.rpc<{ sections?: Array<{ section_id: string; label: string; teams: Array<{ id: string; name: string }> }> }>(ctx.session, 'classroom_item_teams', { p_item_id: p.value.id });
		const wantedSections = new Set(sections.map((s) => s.id));
		for (const sec of listed.data?.sections ?? []) {
			if (!wantedSections.has(sec.section_id)) continue;
			for (const t of sec.teams ?? []) {
				const [g, doc] = await Promise.all([
					ctx.backend.rpc<Record<string, unknown>>(ctx.session, 'classroom_team_grading', { p_item_id: p.value.id, p_team_id: t.id }),
					ctx.backend.rpc<Record<string, unknown>>(ctx.session, 'classroom_team_document_for', { p_item_id: p.value.id, p_team_id: t.id })
				]);
				const members = (g.data?.members as Array<Record<string, unknown>> | undefined) ?? [];
				for (const m of members) teamOf.set(String(m.email).toLowerCase(), t.name);
				const values = (doc.data?.values ?? {}) as Record<string, { value?: unknown; by?: string; at?: string }>;
				teams.push({
					team: t.name,
					team_id: t.id,
					class: sec.label,
					roles: g.data?.roles ?? [],
					team_criteria: g.data?.team_criteria ?? [],
					role_of: g.data?.role_of ?? {},
					out_of: g.data?.out_of ?? null,
					members: members.map((m) => ({ student: m.name, roles: m.roles, score: m.score, scores: m.scores, comment: m.comment, graded: !!m.graded_at })),
					answers: Object.entries(values).map(([blockId, v]) => ({ question: question(blockId).number, prompt: question(blockId).prompt, answer: v?.value, by: v?.by, saved: v?.at }))
				});
			}
		}
	}

	const nameOf = new Map(roster.map((r) => [r.email, r]));
	const students = roster
		.filter((r) => wanted(r.email))
		.map((st) => {
			const s = subByEmail.get(st.email);
			return {
				student: st.name,
				email: st.email,
				classes: st.classes.map((c) => c.title),
				...(teamOf.has(st.email) ? { team: teamOf.get(st.email) } : {}),
				state: s?.state ?? 'not started',
				turned_in: !!s?.submitted_at,
				turned_in_at: s?.submitted_at ?? undefined,
				late: !!(s?.submitted_at && p.value.due_at && Date.parse(s.submitted_at) > Date.parse(p.value.due_at)) || undefined,
				graded: !!s?.graded_at,
				returned: !!s?.returned_at,
				score: s?.score ?? null,
				typed_score: s?.direct_score ?? undefined,
				rubric_scores: s?.rubric_scores && Object.keys(s.rubric_scores).length ? s.rubric_scores : undefined,
				criterion_comments: s?.criterion_comments && Object.keys(s.criterion_comments).length ? s.criterion_comments : undefined,
				comment: s?.teacher_comment ?? undefined,
				extra_credit: s?.extra_credit ?? undefined,
				answers: (answersBy.get(st.email) ?? []).sort((a, b) => (a.question ?? 999) - (b.question ?? 999)),
				files: filesBy.get(st.email) ?? [],
				notes: notes.get(st.email) ?? []
			};
		})
		.sort((a, b) => (nameOf.get(a.email)?.last ?? '').localeCompare(nameOf.get(b.email)?.last ?? ''));

	let document: ToolOutput | undefined;
	if (p.value.assignment_schema_version === 3) {
		const d = await ctx.backend.select<{ document: string; filename: string | null }>(ctx.session, {
			table: 'classroom_html_assignments',
			columns: bool(args.document) ? ['document', 'filename'] : ['filename'],
			eq: { item_id: p.value.id }
		});
		const row = d.data?.[0];
		document = row
			? {
					filename: row.filename ?? undefined,
					...(bool(args.document) ? { html: row.document } : { note: 'Call again with document true for the worksheet HTML itself.' })
				}
			: undefined;
	}

	const outOf = rubric?.length ? rubric.reduce((sum, c) => sum + Number(c.points ?? 0), 0) : p.value.points;
	return {
		status: 'ok',
		...postSummary(p.value, today),
		classes: sections.map((s) => s.title),
		out_of: outOf,
		assignment: {
			text: p.value.body.length > 6000 ? `${p.value.body.slice(0, 6000)}...` : p.value.body,
			...(document ? { document } : {}),
			questions: questions.list,
			rubric: rubric?.map((c) => ({ id: c.id, criterion: c.criterion, points: c.points, levels: (c.levels ?? []).map((l) => ({ label: l.label, points: l.points, means: (l as { descriptor?: string }).descriptor })) })) ?? null,
			...files
		},
		...(teams
			? {
					teams,
					team_note:
						'A team assignment is graded by team: once per team, site_call classroom_grade_team with the post, the team_id, the team and role scores keyed by rubric id, and any per-student scores; each team asks first.'
				}
			: {}),
		students,
		counts: { students: students.length, turned_in: students.filter((s) => s.turned_in).length, graded: students.filter((s) => s.graded).length },
		links_expire_at: new Date(ctx.now() + GRADING_LINK_SECONDS * 1000).toISOString(),
		how_to_grade: teams
			? 'Propose each team\'s scores to him first, then grade each team as team_note says.'
			: 'Propose each score to him first. Then one grade call with grades: [{student, score or scores by rubric criterion, comment}] saves them all held (students do not see them yet); after he looks, grade with returnHeld true returns them.'
	};
}

async function coinBalance(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const s = await resolveStudent(ctx, str(args.student) ?? '');
	if (s.status !== 'found') return unresolved('student', s);
	const r = await ctx.backend.rpc<{ balance: number; recent_transactions: Array<Record<string, unknown>> }>(ctx.session, 'coin_admin_lookup', { p_email: s.value.email });
	if (r.error) return { status: 'refused', message: r.error.message };
	return {
		status: 'ok',
		student: s.value.name,
		balance: Number(r.data?.balance ?? 0),
		recent: (r.data?.recent_transactions ?? []).slice(0, 5)
	};
}

// ---------------------------------------------------------------------------
// The site's own feedback list (ledger 0416)
// ---------------------------------------------------------------------------

interface FeedbackRow {
	id: string;
	app: string;
	context: string | null;
	kind: string;
	message: string;
	status: string;
	horizon?: string | null;
	created_at: string;
	anonymous?: boolean;
	tried?: string | null;
	screenshot_path?: string | null;
	submitter_name?: string | null;
}

/** Every report, both horizons, newest first: the console's own read, as him. */
async function feedbackRows(ctx: ToolContext, app: string | null, horizon: string | null): Promise<FeedbackRow[] | { refused: string }> {
	const r = await ctx.backend.rpc<FeedbackRow[]>(ctx.session, 'app_feedback_admin_list', { p_app: app, p_limit: 500, p_horizon: horizon });
	if (r.error) return { refused: r.error.message };
	return Array.isArray(r.data) ? r.data : [];
}

/**
 * list_site_feedback: the console's list, filtered and cut down to what a
 * person reads (gap 3157f5d8: the unfiltered read returned about 300,000
 * characters and was cut off). Status and the date are filtered here, after
 * the read, because the database function takes neither.
 */
async function listSiteFeedback(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const status = (str(args.status) ?? 'open').toLowerCase();
	const horizonSaid = (str(args.horizon) ?? 'fix_soon').toLowerCase().replace(/[\s-]+/g, '_');
	const horizon = /^(fix_soon|now|soon)$/.test(horizonSaid) ? 'now' : /^long/.test(horizonSaid) ? 'long_term' : null;
	const since = str(args.since);
	const sinceMs = since ? Date.parse(since) : NaN;
	if (since && !Number.isFinite(sinceMs)) return { status: 'invalid', message: `"${since}" is not a date. Say it like 2026-10-16.` };
	const count = Math.min(Math.max(num(args.count) ?? 25, 1), 200);
	const rows = await feedbackRows(ctx, str(args.app) ?? null, horizon);
	if (!Array.isArray(rows)) return { status: 'refused', message: rows.refused };
	const wanted = rows
		.filter((r) => (status === 'all' ? true : status === 'open' ? r.status === 'new' || r.status === 'seen' : r.status === status))
		.filter((r) => !Number.isFinite(sinceMs) || Date.parse(r.created_at) >= sinceMs);
	return {
		status: 'ok',
		count: wanted.length,
		shown: Math.min(count, wanted.length),
		reports: wanted.slice(0, count).map((r) => ({
			report: r.id,
			short: r.id.slice(0, 8),
			filed: r.created_at,
			app: r.app,
			page: r.context,
			kind: r.kind,
			status: r.status,
			horizon: r.horizon === 'long_term' ? 'long term' : 'fix soon',
			from: r.anonymous ? 'anonymous' : (r.submitter_name ?? null),
			message: r.message.length > 1200 ? `${r.message.slice(0, 1200)}... (${r.message.length} characters)` : r.message,
			tried: r.tried ?? null,
			screenshot: !!r.screenshot_path
		})),
		message: wanted.length > count ? `Showing the newest ${count} of ${wanted.length}. Ask for a higher count, a narrower filter, or a date to see more.` : undefined
	};
}

/** feedback_screenshot: a five-minute link to one report's screenshot, signed as him, as the console signs it. */
async function feedbackScreenshot(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const said = (str(args.report) ?? '').trim().toLowerCase();
	if (said.length < 6) return { status: 'invalid', message: 'Say which report: its id, or at least its first eight characters.' };
	const rows = await feedbackRows(ctx, null, null);
	if (!Array.isArray(rows)) return { status: 'refused', message: rows.refused };
	const hits = rows.filter((r) => r.id.toLowerCase().startsWith(said));
	if (hits.length === 0) return { status: 'not_found', message: `No report starts with "${said}". Nothing was changed.` };
	if (hits.length > 1) return { status: 'ambiguous', candidates: hits.map((r) => ({ report: r.id, message: r.message.slice(0, 80) })), message: 'More than one report starts with that. Ask him which.' };
	const row = hits[0];
	if (!row.screenshot_path) return { status: 'none', report: row.id, message: 'That report has no screenshot.' };
	const signed = await ctx.backend.signStorage(ctx.session, FEEDBACK_MEDIA_BUCKET, row.screenshot_path, 300);
	if (signed.error) return { status: 'refused', message: signed.error.message };
	return {
		status: 'ok',
		report: row.id,
		url: signed.data,
		expires_at: new Date(ctx.now() + 300_000).toISOString(),
		message: 'A link to the screenshot, good for five minutes. Open it to look; do not share it.'
	};
}

// ---------------------------------------------------------------------------
// Bulk status on the three feedback lists, and one Armory incident whole
// (ledger 0432, feedback 114d8101, gap 7432f89f). One call, one write, one
// audit row and one undo, however many rows: a status flip is reversible, so
// it needs no confirm (Mr. Pina, 2026-10-23).
// ---------------------------------------------------------------------------

type ListRow = { id: string; status: string; created_at: string; app_version?: string; app?: string; message?: string; summary?: string; body?: string; kind?: string };

/** His word for a status, as one of the four the lists keep. */
export function feedbackStatusWord(said: string | undefined): 'new' | 'seen' | 'resolved' | 'spam' | null {
	const w = (said ?? '').trim().toLowerCase();
	if (/^(new|open|reopen(ed)?|unread)$/.test(w)) return 'new';
	if (/^(seen|read|reviewed|reviewing|looked at|acknowledged)$/.test(w)) return 'seen';
	if (/^(resolved|done|fixed|closed|close|finished|complete(d)?)$/.test(w)) return 'resolved';
	if (/^(spam|junk|garbage)$/.test(w)) return 'spam';
	return null;
}

interface BulkList {
	tool: string;
	fn: string;
	noun: { one: string; many: string };
	read: (ctx: ToolContext) => Promise<ListRow[] | { refused: string }>;
}

const BULK_LISTS: Record<string, BulkList> = {
	mark_feedback_reports: {
		tool: 'mark_feedback',
		fn: 'app_feedback_set_status_many',
		noun: { one: 'report', many: 'reports' },
		read: (ctx) => feedbackRows(ctx, null, null) as Promise<ListRow[] | { refused: string }>
	},
	mark_armory_notes: {
		tool: 'mark_feedback',
		fn: 'armory_app_feedback_set_status_many',
		noun: { one: 'Armory note', many: 'Armory notes' },
		read: async (ctx) => {
			const r = await ctx.backend.rpc<ListRow[]>(ctx.session, 'armory_app_feedback_admin_list', { p_limit: 1000 });
			return r.error ? { refused: r.error.message } : Array.isArray(r.data) ? r.data : [];
		}
	},
	mark_armory_incidents: {
		tool: 'mark_feedback',
		fn: 'armory_app_incidents_set_status_many',
		noun: { one: 'Armory incident', many: 'Armory incidents' },
		read: async (ctx) => {
			const r = await ctx.backend.rpc<ListRow[]>(ctx.session, 'armory_app_incidents_admin_list', { p_limit: 1000 });
			return r.error ? { refused: r.error.message } : Array.isArray(r.data) ? r.data : [];
		}
	}
};

/** His word for a list, as one of the three. */
function bulkListFor(said: string | undefined): BulkList {
	const w = (said ?? '').toLowerCase();
	if (/incident|crash|slow/.test(w)) return BULK_LISTS.mark_armory_incidents;
	if (/armory|note/.test(w)) return BULK_LISTS.mark_armory_notes;
	return BULK_LISTS.mark_feedback_reports;
}

/** list_armory_reports: the Armory app's incidents or notes, filtered and cut to what a person reads. */
async function listArmoryReports(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const notes = /note/i.test(str(args.list) ?? '');
	const spec = notes ? BULK_LISTS.mark_armory_notes : BULK_LISTS.mark_armory_incidents;
	const statusSaid = (str(args.status) ?? 'open').toLowerCase();
	const status = statusSaid === 'all' || statusSaid === 'open' ? statusSaid : feedbackStatusWord(statusSaid);
	if (!status) return { status: 'invalid', message: `"${statusSaid}" is not a status: say open, all, new, seen, resolved or spam.` };
	const since = str(args.since);
	const sinceMs = since ? Date.parse(since) : NaN;
	if (since && !Number.isFinite(sinceMs)) return { status: 'invalid', message: `"${since}" is not a date. Say it like 2026-10-16.` };
	const version = str(args.version);
	const kind = str(args.kind)?.toLowerCase();
	const count = Math.min(Math.max(num(args.count) ?? 25, 1), 200);
	const rows = await spec.read(ctx);
	if (!Array.isArray(rows)) return { status: 'refused', message: rows.refused };
	const wanted = rows
		.filter((r) => (status === 'all' ? true : status === 'open' ? r.status === 'new' || r.status === 'seen' : r.status === status))
		.filter((r) => !version || (r.app_version ?? '') === version)
		.filter((r) => !kind || (r.kind ?? '').toLowerCase() === kind)
		.filter((r) => !Number.isFinite(sinceMs) || Date.parse(r.created_at) >= sinceMs);
	const byStatus: Record<string, number> = {};
	const byVersion: Record<string, number> = {};
	for (const r of wanted) {
		byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
		if (r.app_version) byVersion[r.app_version] = (byVersion[r.app_version] ?? 0) + 1;
	}
	const cut = (t: string | undefined) => (t && t.length > 400 ? `${t.slice(0, 400)}...` : (t ?? null));
	return {
		status: 'ok',
		list: notes ? 'notes' : 'incidents',
		count: wanted.length,
		shown: Math.min(count, wanted.length),
		by_status: byStatus,
		by_version: byVersion,
		items: wanted.slice(0, count).map((r) => ({
			id: r.id,
			short: r.id.slice(0, 8),
			sent: r.created_at,
			version: r.app_version ?? null,
			kind: r.kind ?? null,
			status: r.status,
			text: cut(notes ? r.body : r.summary)
		})),
		message: wanted.length > count ? `Showing the newest ${count} of ${wanted.length}. To change them all at once, use mark feedback with the same filters.` : undefined
	};
}

async function markMany(ctx: ToolContext, args: ToolArgs, spec: BulkList): Promise<ToolOutput> {
	const status = feedbackStatusWord(str(args.status));
	if (!status) return { status: 'invalid', message: 'Say the status: new, seen, resolved or spam. Nothing was changed.' };
	const said = list(args.ids).map((x) => x.toLowerCase());
	const fromStatus = str(args.currently) ? feedbackStatusWord(str(args.currently)) : null;
	if (str(args.currently) && !fromStatus) return { status: 'invalid', message: `"${str(args.currently)}" is not a status. Nothing was changed.` };
	const version = str(args.version);
	const since = str(args.since);
	const sinceMs = since ? Date.parse(since) : NaN;
	if (since && !Number.isFinite(sinceMs)) return { status: 'invalid', message: `"${since}" is not a date. Say it like 2026-10-16. Nothing was changed.` };
	if (said.length === 0 && !fromStatus && !version && !since) {
		return { status: 'invalid', message: `Name the ${spec.noun.many} (their ids or first eight characters), or say which ones: by status, version or date. Nothing was changed.` };
	}
	const rows = await spec.read(ctx);
	if (!Array.isArray(rows)) return { status: 'refused', message: rows.refused };
	let picked: ListRow[];
	if (said.length) {
		picked = [];
		for (const s of said) {
			if (s.length < 6) return { status: 'invalid', message: `"${s}" is too short to name one ${spec.noun.one}; use at least eight characters. Nothing was changed.` };
			const hits = rows.filter((r) => r.id.toLowerCase().startsWith(s));
			if (hits.length === 0) return { status: 'not_found', said: s, message: `No ${spec.noun.one} starts with "${s}". Nothing was changed.` };
			if (hits.length > 1) return { status: 'ambiguous', said: s, candidates: hits.map((r) => r.id), message: `More than one ${spec.noun.one} starts with "${s}". Nothing was changed. Use more of the id.` };
			if (!picked.some((p) => p.id === hits[0].id)) picked.push(hits[0]);
		}
	} else {
		picked = rows
			.filter((r) => !fromStatus || r.status === fromStatus)
			.filter((r) => !version || (r.app_version ?? '') === version)
			.filter((r) => !Number.isFinite(sinceMs) || Date.parse(r.created_at) >= sinceMs);
	}
	if (picked.length === 0) return { status: 'not_found', message: `No ${spec.noun.many} match that. Nothing was changed.` };
	const o = await write(ctx, { tool: spec.tool, fn: spec.fn, args: { p_ids: picked.map((r) => r.id), p_status: status } }, writeOptions(args));
	const result = (o as { result?: { changed?: number; missing?: number } }).result;
	return {
		...outcomeWords(o),
		to: status,
		count: picked.length,
		...(result ? { changed: result.changed ?? null, missing: result.missing ?? null } : {}),
		...(said.length === 0 && rows.length >= 1000 ? { note: `Only the newest 1000 ${spec.noun.many} were looked at; ask again for the rest.` } : {})
	};
}

/** read_armory_incident: one incident whole, its report JSON included, by id or its first eight characters. */
async function readArmoryIncident(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const said = (str(args.incident) ?? '').toLowerCase();
	if (said.length < 6) return { status: 'invalid', message: 'Say which incident: its id, or at least its first eight characters.' };
	let id = said;
	if (!/^[0-9a-f-]{36}$/.test(said)) {
		const rows = await BULK_LISTS.mark_armory_incidents.read(ctx);
		if (!Array.isArray(rows)) return { status: 'refused', message: rows.refused };
		const hits = rows.filter((r) => r.id.toLowerCase().startsWith(said));
		if (hits.length !== 1) return { status: hits.length ? 'ambiguous' : 'not_found', candidates: hits.map((r) => r.id), message: hits.length ? 'More than one incident starts with that. Ask him which.' : `No incident starts with "${said}".` };
		id = hits[0].id;
	}
	const r = await ctx.backend.rpc<Record<string, unknown>>(ctx.session, 'armory_app_incident_report', { p_id: id });
	if (r.error) return { status: 'refused', message: r.error.message };
	if (!r.data || r.data.ok !== true) return { status: 'not_found', message: 'No incident has that id.' };
	const text = JSON.stringify(r.data.report ?? {});
	const LIMIT = 200_000;
	return {
		status: 'ok',
		...r.data,
		...(text.length > LIMIT ? { report: undefined, report_text: `${text.slice(0, LIMIT)}... (${text.length} characters; the rest is in the download on the Armory incidents page)` } : {})
	};
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function createPost(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const opts = writeOptions(args);
	const kindSaid = (str(args.kind) ?? '').toLowerCase();
	const said = list(args.classes);
	if (said.length === 0) return { status: 'invalid', message: 'Name at least one class.' };
	const ids = new Map<string, MySection>();
	for (const one of said) {
		const r = await resolveClasses(ctx, one);
		if (r.status !== 'found') return unresolved('class', r);
		for (const s of r.value) ids.set(s.id, s);
	}
	const sections = [...ids.values()];
	let body = str(args.body) ?? '';
	if (kindSaid === 'notice') {
		// A NAMED LINK KEY (gap f386c075): the link goes on its own line as
		// [name](address), which the class page shows as a key reading
		// "Open <name>" rather than the bare host.
		const link = str(args.link);
		if (link) {
			if (!/^https?:\/\/\S+$/i.test(link)) return { status: 'invalid', message: 'The link must be a whole web address starting with https://.' };
			const linkName = str(args.linkName)?.replace(/[[\]()\n]/g, ' ').trim().slice(0, 60);
			body = `${body}${body ? '\n' : ''}${linkName ? `[${linkName}](${link})` : link}`;
		}
		if (!body) return { status: 'invalid', message: 'A notice needs its text.' };
		const end = resolveNoticeEnd(str(args.until), new Date(ctx.now()));
		if (!end.ok) return { status: 'invalid', message: end.refusal };
		const o = await write(
			ctx,
			{ tool: 'create_post', fn: 'classroom_quick_post_create', args: { p_section_ids: sections.map((s) => s.id), p_body: body, p_expires_at: end.iso } },
			opts
		);
		// IMPORTANT (gap f386c075): marked in the same request, on the notice
		// just made, through the site's own switch.
		let important: ToolOutput | undefined;
		const postId = (o as { result?: { id?: string } }).result?.id;
		if (bool(args.important) && o.status === 'done' && typeof postId === 'string') {
			const m = await write(
				ctx,
				{ tool: 'create_post', fn: 'classroom_quick_post_set_important', args: { p_post_id: postId, p_important: true } },
				{ ...opts, requestId: opts.requestId ? `${opts.requestId}:important` : undefined, confirmToken: undefined }
			);
			important = outcomeWords(m);
		}
		return {
			...outcomeWords(o),
			classes: sections.map((s) => s.title),
			until: end.words,
			...(bool(args.important) ? { important: important ?? 'marked important once he confirms the notice' } : {})
		};
	}
	const kind = kindSaid.startsWith('announ') ? 'post' : kindSaid;
	if (!['assignment', 'material', 'post'].includes(kind)) {
		return { status: 'invalid', message: 'The kind is assignment, material, announcement or notice.' };
	}
	let due: { iso: string | null; words: string } = { iso: null, words: 'no due date' };
	const dueSaid = str(args.due);
	if (dueSaid) {
		const d = resolveDue(dueSaid, new Date(ctx.now()));
		if (!d.ok) return { status: 'invalid', message: d.refusal };
		due = d;
	}
	const o = await write(
		ctx,
		{
			tool: 'create_post',
			fn: 'classroom_create_item',
			args: {
				p_kind: kind,
				p_section_ids: sections.map((s) => s.id),
				p_title: str(args.title) ?? null,
				p_body: body,
				p_points: kind === 'assignment' ? (num(args.points) ?? null) : null,
				p_due_at: kind === 'assignment' ? due.iso : null,
				p_published: bool(args.published) ?? true
			}
		},
		opts
	);
	return { ...outcomeWords(o), classes: sections.map((s) => s.title), due: kind === 'assignment' ? due.words : undefined };
}

async function updateItem(ctx: ToolContext, tool: string, p: PostRow, change: { points?: number | null; due?: string | null }, opts: WriteOptions) {
	return write(
		ctx,
		{
			tool,
			fn: 'classroom_update_item',
			args: {
				p_id: p.id,
				p_title: p.title,
				p_body: p.body,
				p_points: change.points !== undefined ? change.points : p.points,
				p_due_at: change.due !== undefined ? change.due : p.due_at,
				p_category: p.category,
				p_published: p.published,
				p_resources: null,
				p_body_doc: p.body_doc ?? null,
				p_publish_at: p.publish_at
			},
			before: { points: p.points, due_at: p.due_at }
		},
		opts
	);
}

async function setPoints(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const points = num(args.points);
	if (points === undefined || !Number.isInteger(points)) return { status: 'invalid', message: 'Say a whole number of points.' };
	const p = await postFrom(ctx, args);
	if (p.status !== 'found') return unresolved('post', p);
	if (p.value.kind !== 'assignment') return { status: 'invalid', message: `${p.value.title} is not an assignment, so it has no points.` };
	const o = await updateItem(ctx, 'set_points', p.value, { points }, writeOptions(args));
	return { ...outcomeWords(o), post: p.value.title, points_before: p.value.points, points };
}

async function setDue(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const p = await postFrom(ctx, args);
	if (p.status !== 'found') return unresolved('post', p);
	if (p.value.kind !== 'assignment') return { status: 'invalid', message: `${p.value.title} is not an assignment, so it has no due date.` };
	const d = resolveDue(str(args.due) ?? '', new Date(ctx.now()));
	if (!d.ok) return { status: 'invalid', message: d.refusal };
	const o = await updateItem(ctx, 'set_due', p.value, { due: d.iso }, writeOptions(args));
	return { ...outcomeWords(o), post: p.value.title, due: d.words, due_before: p.value.due_at ? formatDue(p.value.due_at) : 'no due date' };
}

function criterionId(name: string, taken: Set<string>): string {
	const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'criterion';
	let id = base;
	for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;
	taken.add(id);
	return id;
}

/**
 * THREE PLAIN BANDS when he names a criterion and its points and nothing else:
 * full, half (to the nearest half point) and none. The database requires three
 * or four levels with the top at the maximum and the bottom at zero; these are
 * the least a reader can mistake for a judgment, and the result says so.
 */
function defaultBands(points: number) {
	const rounded = Math.round(points) / 2;
	const half = rounded < points ? rounded : points / 2;
	return [
		{ label: 'Full', short: 'Full', points, descriptor: 'Meets this criterion in full.' },
		{ label: 'Partial', short: 'Partial', points: half, descriptor: 'Meets part of this criterion.' },
		{ label: 'Missing', short: 'Missing', points: 0, descriptor: 'Does not meet this criterion yet.' }
	];
}

async function setRubric(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const p = await postFrom(ctx, args);
	if (p.status !== 'found') return unresolved('post', p);
	if (p.value.kind !== 'assignment') return { status: 'invalid', message: `${p.value.title} is not an assignment, so it has no rubric.` };
	const raw = Array.isArray(args.criteria) ? args.criteria : [];
	if (raw.length === 0) return { status: 'invalid', message: 'Say at least one criterion with its points.' };
	const taken = new Set<string>();
	const criteria: RubricCriterion[] = [];
	const banded: string[] = [];
	for (const c of raw) {
		const o = (c ?? {}) as Record<string, unknown>;
		const name = str(o.name);
		const points = num(o.points);
		if (!name || points === undefined) return { status: 'invalid', message: 'Every criterion needs a name and points.' };
		if (points <= 0) return { status: 'invalid', message: `${name} needs more than zero points.` };
		const given = Array.isArray(o.levels) ? (o.levels as Array<Record<string, unknown>>) : [];
		const levels = given.length
			? given.map((l) => ({
					label: str(l.label) ?? '',
					short: str(l.label) ?? '',
					points: num(l.points) ?? 0,
					descriptor: str(l.descriptor) ?? ''
				}))
			: defaultBands(points);
		if (!given.length) banded.push(name);
		criteria.push({ id: criterionId(name, taken), criterion: name, points, levels } as RubricCriterion);
	}
	const o = await write(ctx, { tool: 'set_rubric', fn: 'classroom_set_rubric', args: { p_item_id: p.value.id, p_criteria: criteria } }, writeOptions(args));
	return {
		...outcomeWords(o),
		post: p.value.title,
		total: criteria.reduce((s, c) => s + c.points, 0),
		criteria: criteria.map((c) => ({ criterion: c.criterion, points: c.points })),
		note: banded.length
			? `${banded.join(', ')} got three plain score bands (full, half, none) because none were said; rewrite them on the site if they need real descriptors.`
			: undefined
	};
}

async function setPublished(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const published = bool(args.published);
	if (published === undefined) return { status: 'invalid', message: 'Say whether to show it or hide it.' };
	const p = await postFrom(ctx, args);
	if (p.status !== 'found') return unresolved('post', p);
	const o = await write(ctx, { tool: 'set_published', fn: 'classroom_set_published', args: { p_item_id: p.value.id, p_published: published } }, writeOptions(args));
	return { ...outcomeWords(o), post: p.value.title, visible_to_students: published };
}

async function replaceHtml(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const opts = writeOptions(args);
	let html = typeof args.html === 'string' ? args.html : '';
	// A DOCUMENT TOO BIG TO SEND AS AN ARGUMENT COMES AS AN UPLOAD (gap d782fd4e).
	const uploadId = str(args.upload);
	if (!html.trim() && uploadId) {
		const got = await ctx.backend.readUpload(ctx.session.user.id, uploadId);
		if (!got) return { status: 'invalid', message: 'That upload has no file yet. Send the bytes first (start upload says how), then call again.' };
		html = new TextDecoder('utf-8').decode(got.bytes);
		if (!args.filename) args = { ...args, filename: got.slot.filename };
	}
	if (!html.trim()) return { status: 'invalid', message: 'Send the whole HTML document, or name an upload that holds it.' };
	const p = await postFrom(ctx, args);
	if (p.status !== 'found') return unresolved('post', p);
	if (p.value.kind !== 'assignment') return { status: 'invalid', message: `${p.value.title} is not an assignment.` };
	const filename = str(args.filename) ?? `${(p.value.title ?? 'assignment').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
	// THE IMPORTER'S OWN PARSER, never a second one.
	const staged = stageHtmlDocument(filename, html);
	if (!staged.staged) return { status: 'refused', message: 'The document did not pass the importer.', problems: staged.errors, warnings: staged.warnings };
	const manifest = staged.staged.manifest;
	const previous = await storedManifest(ctx, p.value.id);
	const newIds = new Set(manifestBlocks(manifest).map((b) => b.id));
	const diff = previous
		? htmlManifestDiff(previous, manifest)
		: { kept: [], removed: [], added: [...newIds] };

	// THE ORPHAN RULE: any block a student has an answer stored under (any
	// class this item is posted to; the answers are keyed on the item) must
	// survive, or the document is refused and nothing is written.
	const answered = await pageAll<{ block_id: string; student_email: string }>(ctx, {
		table: 'classroom_responses',
		columns: ['block_id', 'student_email'],
		eq: { item_id: p.value.id },
		order: [['block_id', 'asc'], ['student_email', 'asc']]
	});
	const missing = new Map<string, Set<string>>();
	for (const a of answered) {
		if (newIds.has(a.block_id)) continue;
		const set = missing.get(a.block_id) ?? new Set();
		set.add(a.student_email);
		missing.set(a.block_id, set);
	}
	// RETIRE INSTEAD OF ORPHAN (gap 03246300): with retire set, the dropped
	// questions that hold answers are kept beside the assignment for grading,
	// out of the worksheet, and the document is replaced. Asked first.
	let retired: ToolOutput | undefined;
	if (missing.size > 0 && bool(args.retire)) {
		const ids = [...missing.keys()].sort();
		const old = previous ? manifestBlocks(previous as HtmlAssignmentManifest) : [];
		const modules = ((previous as HtmlAssignmentManifest | null)?.modules ?? []) as Array<{ title?: string; blocks?: Array<{ id: string }> }>;
		const moduleOf = new Map<string, string>();
		for (const m of modules) for (const b of m.blocks ?? []) if (m.title) moduleOf.set(b.id, m.title);
		const blocks = ids.map((id) => ({
			block_id: id,
			block: old.find((b) => b.id === id) ?? { id },
			module_title: moduleOf.get(id) ?? null
		}));
		const r = await write(
			ctx,
			{ tool: 'replace_html_assignment', fn: 'classroom_html_retire_blocks', args: { p_item_id: p.value.id, p_blocks: blocks } },
			opts
		);
		if (r.status !== 'done' && r.status !== 'repeated') {
			return {
				...outcomeWords(r),
				post: p.value.title,
				retiring: ids.map((id) => ({ block: id, students_with_answers: missing.get(id)?.size ?? 0 })),
				message:
					r.status === 'preview'
						? `Nothing has changed yet. Replacing it retires ${ids.length === 1 ? 'question' : 'questions'} ${ids.join(', ')}: ${ids.length === 1 ? 'it leaves' : 'they leave'} the worksheet, and the answers students gave stay with the assignment for grading. Read this to him; if he says yes, call again with the same arguments and this confirm_token.`
						: r.message
			};
		}
		retired = { questions: ids, ...outcomeWords(r) };
		missing.clear();
	}
	if (missing.size > 0) {
		const ids = [...missing.keys()].sort();
		return {
			status: 'refused',
			reason: 'would_orphan_answers',
			post: p.value.title,
			missing_blocks: ids.map((id) => ({ block: id, students_with_answers: missing.get(id)?.size ?? 0 })),
			diff,
			message: `Not replaced. ${ids.length === 1 ? 'Block' : 'Blocks'} ${ids.join(', ')} ${ids.length === 1 ? 'has' : 'have'} student answers stored and ${ids.length === 1 ? 'is' : 'are'} not in the new document; those answers would stop showing. Either give the new document the same block ids, or call again with retire set to retire ${ids.length === 1 ? 'that question' : 'those questions'}: out of the worksheet, answers kept for grading.`
		};
	}

	const groupKey = `html:${p.value.id}:${opaqueToken(ctx.random).slice(0, 12)}`;
	const document = await write(
		ctx,
		{ tool: 'replace_html_assignment', fn: 'classroom_set_html_assignment', args: { p_item_id: p.value.id, p_document: html, p_manifest: manifest, p_filename: filename }, groupKey },
		opts
	);
	// THE RUBRIC FOLLOWS THE DOCUMENT exactly as the importer decides it: a
	// rubric a person built is left alone; one generated from the previous
	// document is regenerated from this one.
	let rubric: WriteOutcome | null = null;
	if (document.status === 'done' || document.status === 'preview') {
		const stored = await rubricOf(ctx, p.value.id);
		const next = stagedRubricAfterManifest(manifest, true, {
			rubric: stored,
			derived: !stored?.length || manifestRubricIsDerived(previous, stored)
		});
		if (next.derived && next.rubric?.length) {
			rubric = await write(
				ctx,
				{ tool: 'replace_html_assignment', fn: 'classroom_set_rubric', args: { p_item_id: p.value.id, p_criteria: next.rubric }, groupKey },
				opts
			);
		}
	}
	return {
		status: document.status,
		post: p.value.title,
		diff,
		document: outcomeWords(document),
		rubric: rubric ? outcomeWords(rubric) : 'left as it is',
		...(retired ? { retired } : {}),
		warnings: staged.warnings
	};
}

async function grade(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const p = await postFrom(ctx, { post: args.post });
	if (p.status !== 'found') return unresolved('post', p);
	if (p.value.kind !== 'assignment') return { status: 'invalid', message: `${p.value.title} is not an assignment.` };
	// A WHOLE CLASS IN ONE CALL, AND RETURNING WHAT WAS HELD (ledger 0438).
	if (bool(args.returnHeld)) return returnHeld(ctx, p.value, args);
	if (Array.isArray(args.grades)) return gradeMany(ctx, p.value, args);
	const s = await resolveStudent(ctx, str(args.student) ?? '');
	if (s.status !== 'found') return unresolved('student', s);
	const rubric = await rubricOf(ctx, p.value.id);
	const outOf = rubric?.length ? rubric.reduce((sum, c) => sum + Number(c.points ?? 0), 0) : p.value.points;
	let score = num(args.score);
	if (bool(args.perfect)) {
		if (outOf === null || outOf === undefined) return { status: 'invalid', message: `${p.value.title} has no total, so there is no perfect score.` };
		score = outOf;
	}
	if (score === undefined) return { status: 'invalid', message: 'Say the score.' };
	const before = await ctx.backend.select<{ direct_score: number | null; score: number | null; teacher_comment: string | null; returned_at: string | null; extra_credit: number | null; graded_at: string | null }>(
		ctx.session,
		{ table: 'classroom_submissions', columns: ['direct_score', 'score', 'teacher_comment', 'returned_at', 'extra_credit', 'graded_at'], eq: { item_id: p.value.id, student_email: s.value.email } }
	);
	if (before.error) return { status: 'refused', message: before.error.message };
	const prior = before.data[0];
	const priorDirect = prior?.graded_at && prior.direct_score !== null;
	const o = await write(
		ctx,
		{
			tool: 'grade',
			fn: 'classroom_grade_direct',
			args: {
				p_item_id: p.value.id,
				p_student_email: s.value.email,
				p_score: score,
				p_comment: str(args.comment) ?? prior?.teacher_comment ?? null,
				p_return: !(bool(args.hold) ?? false),
				p_extra_credit: prior?.extra_credit ?? null
			},
			before: {
				graded: !!priorDirect,
				fresh: !prior?.graded_at,
				score: prior?.direct_score ?? null,
				comment: prior?.teacher_comment ?? null,
				returned: !!prior?.returned_at,
				extra_credit: prior?.extra_credit ?? null
			}
		},
		writeOptions(args)
	);
	return {
		...outcomeWords(o),
		post: p.value.title,
		student: s.value.name,
		score,
		out_of: outOf,
		returned: !(bool(args.hold) ?? false),
		note:
			o.status === 'done' && !o.undo_available
				? 'This replaced a grade given by rubric score, so undo_last cannot put that one back; the grading console still can.'
				: undefined
	};
}

/** A rubric criterion named by its id, its name, or the start of its name. */
function rubricCriterionId(rubric: RubricCriterion[], said: string): string | null {
	const t = said.trim().toLowerCase();
	const hit =
		rubric.find((c) => c.id.toLowerCase() === t) ??
		rubric.find((c) => c.criterion.trim().toLowerCase() === t) ??
		(rubric.filter((c) => c.criterion.toLowerCase().startsWith(t)).length === 1 ? rubric.find((c) => c.criterion.toLowerCase().startsWith(t)) : undefined);
	return hit ? hit.id : null;
}

function byRubric(rubric: RubricCriterion[], raw: unknown): { ok: true; scores: Record<string, number> } | { ok: false; message: string } {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Criterion scores are a list of criterion and points.' };
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		const id = rubricCriterionId(rubric, k);
		const n = num(v);
		if (!id) return { ok: false, message: `"${k}" is not a criterion on this rubric: ${rubric.map((c) => c.criterion).join(', ')}.` };
		if (n === undefined) return { ok: false, message: `The score for ${k} is not a number.` };
		out[id] = n;
	}
	return { ok: true, scores: out };
}

/**
 * EVERY STUDENT'S GRADE IN ONE CALL (ledger 0438). Each grade is its own write
 * through the site's own grading function, so each is checked, logged and
 * undoable exactly as one grade is; they share one group, so undo_last takes
 * the whole batch back. HELD BY DEFAULT: students see nothing until he says
 * so (`return true` now, or `returnHeld` later). A team assignment's grades
 * go by team, through the Teams screen's own function (classroom_grade_team,
 * which asks first), never through here.
 */
async function gradeMany(ctx: ToolContext, p: PostRow, args: ToolArgs): Promise<ToolOutput> {
	const opts = writeOptions(args);
	const giveBack = bool(args.return) ?? false;
	const rubric = (await rubricOf(ctx, p.id)) ?? [];
	const manifest = p.assignment_schema_version === 3 ? await storedManifest(ctx, p.id) : null;
	const team = !!manifest && hxIsTeamManifest(manifest);
	const outOf = rubric.length ? rubric.reduce((sum, c) => sum + Number(c.points ?? 0), 0) : p.points;
	const groupKey = `grade:${p.id}:${opts.requestId ?? opaqueToken(ctx.random).slice(0, 16)}`;
	const entries = (args.grades as unknown[]).filter((e): e is Record<string, unknown> => !!e && typeof e === 'object');
	if (entries.length === 0) return { status: 'invalid', message: 'Give at least one grade.' };
	if (entries.length > 200) return { status: 'invalid', message: 'At most 200 grades in one call.' };
	const results: ToolOutput[] = [];

	if (team) {
		return {
			status: 'invalid',
			message:
				'This is a team assignment, graded by team: use the grade team call (site_call classroom_grade_team) once per team with the team id from the grading packet. Each team asks first.'
		};
	}

	const seen = new Set<string>();
	for (const e of entries) {
		const s = await resolveStudent(ctx, str(e.student) ?? '');
		if (s.status !== 'found') {
			results.push(unresolved('student', s));
			continue;
		}
		const email = s.value.email;
		if (seen.has(email)) {
			results.push({ status: 'invalid', student: s.value.name, message: `${s.value.name} is in this list twice; grade each student once.` });
			continue;
		}
		seen.add(email);
		const ropts = { ...opts, requestId: opts.requestId ? `${opts.requestId}:${email}` : undefined };
		if (e.scores !== undefined) {
			if (!rubric.length) {
				results.push({ status: 'invalid', student: s.value.name, message: `${p.title} has no rubric; give a single score instead.` });
				continue;
			}
			const sc = byRubric(rubric, e.scores);
			if (!sc.ok) {
				results.push({ status: 'invalid', student: s.value.name, message: sc.message });
				continue;
			}
			// A NOTE PER CRITERION, by its name or id. The site requires one on any
			// score that lands between two levels (an override).
			const notes: Record<string, string> = {};
			if (e.notes && typeof e.notes === 'object') {
				for (const [k, v] of Object.entries(e.notes as Record<string, unknown>)) {
					const id = rubricCriterionId(rubric, k);
					if (id && typeof v === 'string' && v.trim()) notes[id] = v.trim();
				}
			}
			const callArgs = {
				p_item_id: p.id,
				p_student_email: email,
				p_scores: sc.scores,
				p_comment: str(e.comment) ?? null,
				p_return: giveBack,
				p_criterion_comments: Object.keys(notes).length ? notes : null,
				p_extra_credit: null
			};
			const before = await readBefore(ctx, FUNCTIONS['classroom_grade_submission']?.before, callArgs);
			const o = await write(ctx, { tool: 'grade', fn: 'classroom_grade_submission', args: callArgs, before, groupKey }, ropts);
			const override = (o as { code?: string }).code === 'override_needs_comment';
			results.push({
				student: s.value.name,
				scores: e.scores,
				...outcomeWords(o),
				...(override ? { message: 'A score between two rubric levels needs a note on that criterion: give notes with the criterion and why. Nothing was saved for this student.' } : {})
			});
			continue;
		}
		let score = num(e.score);
		if (bool(e.perfect)) score = outOf ?? undefined;
		if (score === undefined) {
			results.push({ status: 'invalid', student: s.value.name, message: 'Give a score, perfect, or criterion scores.' });
			continue;
		}
		const prior = (
			await ctx.backend.select<{ direct_score: number | null; teacher_comment: string | null; returned_at: string | null; extra_credit: number | null; graded_at: string | null }>(ctx.session, {
				table: 'classroom_submissions',
				columns: ['direct_score', 'teacher_comment', 'returned_at', 'extra_credit', 'graded_at'],
				eq: { item_id: p.id, student_email: email }
			})
		).data?.[0];
		const o = await write(
			ctx,
			{
				tool: 'grade',
				fn: 'classroom_grade_direct',
				args: { p_item_id: p.id, p_student_email: email, p_score: score, p_comment: str(e.comment) ?? prior?.teacher_comment ?? null, p_return: giveBack, p_extra_credit: prior?.extra_credit ?? null },
				before: {
					graded: !!(prior?.graded_at && prior.direct_score !== null),
					fresh: !prior?.graded_at,
					score: prior?.direct_score ?? null,
					comment: prior?.teacher_comment ?? null,
					returned: !!prior?.returned_at,
					extra_credit: prior?.extra_credit ?? null
				},
				groupKey
			},
			ropts
		);
		results.push({ student: s.value.name, score, ...outcomeWords(o) });
	}
	const done = results.filter((r) => r.status === 'done' || r.status === 'repeated').length;
	return {
		status: done === results.length ? 'done' : done === 0 ? (results.every((r) => r.status === 'preview') ? 'preview' : 'refused') : 'partial',
		post: p.title,
		out_of: outOf,
		graded: done,
		of: results.length,
		returned: giveBack,
		results,
		message: giveBack
			? undefined
			: 'Saved and held: students do not see these yet. When he says to, call grade with returnHeld true to return them.'
	};
}

/**
 * RETURN WHAT WAS HELD (ledger 0438): every graded, unreturned grade on the
 * assignment (or only the students named), returned with the score and
 * comment it already has, through the same grading functions.
 */
async function returnHeld(ctx: ToolContext, p: PostRow, args: ToolArgs): Promise<ToolOutput> {
	const opts = writeOptions(args);
	const manifest = p.assignment_schema_version === 3 ? await storedManifest(ctx, p.id) : null;
	if (manifest && hxIsTeamManifest(manifest)) {
		return { status: 'invalid', message: 'A team assignment is returned by team: grade each team again with return true, or use the Teams screen.' };
	}
	const names = list(args.students);
	let only: Set<string> | null = null;
	if (names.length) {
		only = new Set();
		for (const n of names) {
			const s = await resolveStudent(ctx, n);
			if (s.status !== 'found') return unresolved('student', s);
			only.add(s.value.email);
		}
	}
	const held = (
		await pageAll<SubRow>(ctx, { table: 'classroom_submissions', columns: SUB_COLUMNS, eq: { item_id: p.id }, order: [['student_email', 'asc']] })
	).filter((s) => s.graded_at && !s.returned_at && (!only || only.has(s.student_email.toLowerCase())));
	if (held.length === 0) return { status: 'none', post: p.title, message: 'Nothing is held on this assignment.' };
	const roster = await myStudents(ctx, p.sections.map((s) => ({ id: s.id, title: s.title }) as MySection)).catch(() => [] as RosterStudent[]);
	const nameOf = new Map(roster.map((r) => [r.email, r.name]));
	const groupKey = `return:${p.id}:${opts.requestId ?? opaqueToken(ctx.random).slice(0, 16)}`;
	const results: ToolOutput[] = [];
	for (const s of held) {
		const email = s.student_email.toLowerCase();
		const ropts = { ...opts, requestId: opts.requestId ? `${opts.requestId}:${email}` : undefined };
		const who = nameOf.get(email) ?? email.split('@')[0];
		if (s.direct_score !== null) {
			const o = await write(
				ctx,
				{
					tool: 'grade',
					fn: 'classroom_grade_direct',
					args: { p_item_id: p.id, p_student_email: email, p_score: s.direct_score, p_comment: s.teacher_comment, p_return: true, p_extra_credit: s.extra_credit },
					before: { graded: true, fresh: false, score: s.direct_score, comment: s.teacher_comment, returned: false, extra_credit: s.extra_credit },
					groupKey
				},
				ropts
			);
			results.push({ student: who, ...outcomeWords(o) });
			continue;
		}
		const callArgs = {
			p_item_id: p.id,
			p_student_email: email,
			p_scores: s.rubric_scores ?? {},
			p_comment: s.teacher_comment,
			p_return: true,
			p_criterion_comments: s.criterion_comments ?? null,
			p_extra_credit: s.extra_credit
		};
		const before = await readBefore(ctx, FUNCTIONS['classroom_grade_submission']?.before, callArgs);
		const o = await write(ctx, { tool: 'grade', fn: 'classroom_grade_submission', args: callArgs, before, groupKey }, ropts);
		results.push({ student: who, ...outcomeWords(o) });
	}
	const done = results.filter((r) => r.status === 'done' || r.status === 'repeated').length;
	return { status: done === results.length ? 'done' : done ? 'partial' : 'refused', post: p.title, returned: done, of: results.length, results };
}

async function sendFeedback(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const message = str(args.message);
	if (!message) return { status: 'invalid', message: 'Say what the note should say.' };
	const p = await postFrom(ctx, { post: args.post });
	if (p.status !== 'found') return unresolved('post', p);
	const s = await resolveStudent(ctx, str(args.student) ?? '');
	if (s.status !== 'found') return unresolved('student', s);
	let block: string | null = null;
	const q = str(args.question);
	if (q) {
		const manifest = p.value.assignment_schema_version === 3 ? await storedManifest(ctx, p.value.id) : null;
		const hits = pickQuestion(manifest, q, []) ?? [];
		if (hits.length !== 1) return { status: 'not_found', message: `"${q}" is not one question on ${p.value.title}. Nothing was sent.` };
		block = hits[0];
	}
	const o = await write(
		ctx,
		{
			tool: 'send_feedback',
			fn: 'classroom_feedback_post',
			args: { p_item_id: p.value.id, p_student_email: s.value.email, p_block_id: block, p_file_id: null, p_body: message, p_marks: null }
		},
		writeOptions(args)
	);
	return { ...outcomeWords(o), post: p.value.title, student: s.value.name };
}

interface CoinCategory {
	id: string;
	name: string;
	kind: string;
	pricing_model: string;
	amount: number | null;
	min_amount: number | null;
	max_amount: number | null;
	active: boolean;
	loggable: boolean;
}

async function categories(ctx: ToolContext, kind: 'award' | 'fine'): Promise<CoinCategory[]> {
	const r = await ctx.backend.select<CoinCategory>(ctx.session, {
		table: 'coin_categories',
		columns: ['id', 'name', 'kind', 'pricing_model', 'amount', 'min_amount', 'max_amount', 'active', 'loggable'],
		eq: { kind, active: true, loggable: true }
	});
	if (r.error) throw new ResolveFailure(`The coin categories could not be read: ${r.error.message}`);
	// Formula categories (Perfect Score, property damage, extra credit) have
	// their own logging functions and are not logged this way.
	return r.data
		.filter((c) => c.pricing_model !== 'formula' && c.id !== 'extra_credit')
		.map((c) => ({ ...c, amount: c.amount === null ? null : Number(c.amount), min_amount: c.min_amount === null ? null : Number(c.min_amount), max_amount: c.max_amount === null ? null : Number(c.max_amount) }));
}

function categoryOption(c: CoinCategory) {
	const price =
		c.pricing_model === 'flat'
			? `${c.amount} each, set`
			: c.pricing_model === 'range'
				? `${c.min_amount} to ${c.max_amount}`
				: 'any amount, with a note';
	return { kind: c.name, id: c.id, amount: price };
}

function amountFits(c: CoinCategory, amount: number | undefined): boolean {
	if (amount === undefined) return c.pricing_model === 'flat';
	if (c.pricing_model === 'flat') return Number(c.amount) === amount;
	if (c.pricing_model === 'range') return amount >= Number(c.min_amount) && amount <= Number(c.max_amount);
	return amount > 0;
}

async function coins(ctx: ToolContext, args: ToolArgs, kind: 'award' | 'fine'): Promise<ToolOutput> {
	const tool = kind === 'award' ? 'award_coins' : 'fine_coins';
	const opts = writeOptions(args);
	const reason = str(args.reason);
	if (kind === 'award' && !reason) return { status: 'invalid', message: 'Say the reason; it is the note on the coin record.' };
	const amount = num(args.amount);
	const all = await categories(ctx, kind);
	const kindSaid = str(args.kind)?.toLowerCase();
	const fits = all.filter((c) => amountFits(c, amount));
	if (!kindSaid) {
		return {
			status: 'needs_category',
			message: `Which ${kind} category is this? Nothing was changed. Ask him, then call again with kind set.${amount !== undefined ? ` These take ${amount}:` : ''}`,
			options: (fits.length ? fits : all).map(categoryOption)
		};
	}
	const named = all.filter((c) => c.id === kindSaid || c.name.toLowerCase() === kindSaid);
	const loose = named.length ? named : all.filter((c) => c.name.toLowerCase().includes(kindSaid) || c.id.includes(kindSaid.replace(/\s+/g, '_')));
	if (loose.length !== 1) {
		return {
			status: loose.length ? 'ambiguous' : 'not_found',
			what: `${kind} category`,
			message: `${loose.length ? 'More than one' : 'No'} ${kind} category matches "${str(args.kind)}". Nothing was changed.`,
			options: (loose.length ? loose : all).map(categoryOption)
		};
	}
	const cat = loose[0];
	if (!amountFits(cat, amount) && !(amount === undefined && cat.pricing_model === 'flat')) {
		return {
			status: 'invalid',
			message:
				cat.pricing_model === 'flat'
					? `${cat.name} is set at ${cat.amount}, not ${amount}. Nothing was changed. Use the set amount, or another category.`
					: cat.pricing_model === 'range'
						? `${cat.name} takes ${cat.min_amount} to ${cat.max_amount}${amount === undefined ? '; say the amount' : `, not ${amount}`}. Nothing was changed.`
						: `${cat.name} needs an amount. Nothing was changed.`,
			options: fits.map(categoryOption)
		};
	}
	if (cat.pricing_model === 'variable' && !reason) return { status: 'invalid', message: `${cat.name} needs a reason. Nothing was changed.` };

	// Who: every name resolved, or the whole class; one unresolved name writes nothing for anybody.
	const names = list(args.students);
	const classSaid = str(args.class);
	let people: RosterStudent[] = [];
	if (names.length === 0) {
		if (kind === 'fine' || !classSaid) return { status: 'invalid', message: 'Name the students.' };
		const c = await resolveClasses(ctx, classSaid);
		if (c.status !== 'found') return unresolved('class', c);
		people = await myStudents(ctx, c.value);
		if (people.length === 0) return { status: 'not_found', message: `No one is enrolled in ${c.value.map((s) => s.title).join(', ')}.` };
	} else {
		for (const n of names) {
			const r = await resolveStudent(ctx, n, classSaid);
			if (r.status !== 'found') return unresolved('student', r);
			if (!people.some((p) => p.email === r.value.email)) people.push(r.value);
		}
	}
	const groupKey = `${tool}:${opts.requestId ?? opaqueToken(ctx.random).slice(0, 16)}`;
	const results: ToolOutput[] = [];
	for (const person of people) {
		const o = await write(
			ctx,
			{
				tool,
				fn: 'coin_log_transaction',
				args: {
					p_email: person.email,
					p_category_id: cat.id,
					p_amount: cat.pricing_model === 'flat' ? null : (amount ?? null),
					p_quantity: null,
					p_note: reason ?? null
				},
				groupKey
			},
			opts
		);
		results.push({ student: person.name, ...outcomeWords(o) });
	}
	const done = results.filter((r) => r.status === 'done' || r.status === 'repeated').length;
	return {
		status: opts.dryRun || ctx.practice ? 'preview' : done === results.length ? 'done' : done === 0 ? 'refused' : 'partial',
		kind: cat.name,
		each: cat.pricing_model === 'flat' ? cat.amount : amount,
		reason: reason ?? null,
		students: results
	};
}

/**
 * coin_transact (ledger 0432): one call from his words to one coin record per
 * student, or one short question and nothing written. The student is matched
 * on the server, award, fine or purchase from his verb, the category from his
 * words or a phrase he used before, and the amount by his rule
 * (`decideCoin` in coin-voice.ts, the one statement of it).
 */
async function coinTransact(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const opts = writeOptions(args);
	const said = str(args.said) ?? '';
	const what = str(args.what);
	const words = what ? `${said} ${what}`.trim() : said;
	if (!words) return { status: 'invalid', message: 'Pass his words in said. Nothing was changed.' };
	const names = list(args.student);
	const classSaid = str(args.class);
	let people: RosterStudent[] = [];
	if (names.length === 0) {
		if (!classSaid) return { status: 'invalid', message: 'Name the student, as he said it. Nothing was changed.' };
		const c = await resolveClasses(ctx, classSaid);
		if (c.status !== 'found') return unresolved('class', c);
		people = await myStudents(ctx, c.value);
		if (people.length === 0) return { status: 'not_found', message: `No one is enrolled in ${c.value.map((x) => x.title).join(', ')}. Nothing was changed.` };
	} else {
		for (const n of names) {
			const r = await resolveStudent(ctx, n, classSaid);
			if (r.status !== 'found') return unresolved('student', r);
			if (!people.some((p) => p.email === r.value.email)) people.push(r.value);
		}
	}
	const cat = await ctx.backend.rpc<unknown>(ctx.session, 'coin_voice_catalog', {});
	if (cat.error) return { status: 'refused', message: cat.error.message };
	const nameWords = [...names.flatMap((n) => n.split(/\s+/)), ...people.flatMap((p) => p.name.split(/\s+/)), ...(classSaid ? classSaid.split(/\s+/) : [])];
	const decision = decideCoin({ said: words, amount: num(args.amount) ?? null, nameWords, catalog: parseVoiceCatalog(cat.data) });
	if (decision.action === 'ask') {
		return { status: decision.status, question: decision.question, students: people.map((p) => p.name), message: `Nothing was changed. Ask him: ${decision.question} Then call again with his answer.` };
	}
	const groupKey = `coin_transact:${opts.requestId ?? opaqueToken(ctx.random).slice(0, 16)}`;
	const results: ToolOutput[] = [];
	for (const person of people) {
		const o = await write(
			ctx,
			{
				tool: 'coin_transact',
				fn: 'coin_voice_log',
				args: { p_email: person.email, p_category_id: decision.category.id, p_amount: decision.amount, p_note: decision.note, p_phrase: decision.phrase },
				groupKey
			},
			opts
		);
		results.push({ student: person.name, ...outcomeWords(o) });
	}
	const done = results.filter((r) => r.status === 'done' || r.status === 'repeated').length;
	return {
		status: opts.dryRun || ctx.practice ? 'preview' : done === results.length ? 'done' : done === 0 ? 'refused' : 'partial',
		kind: decision.kind,
		category: decision.category.name,
		each: decision.amount,
		amount_from: decision.amountFrom === 'listed' ? 'the category\'s set amount' : decision.amountFrom === 'saved' ? 'the amount he gave last time for these words' : 'the number he said',
		reason: decision.note,
		students: results
	};
}

async function disconnect(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	if (!ctx.token) return { status: 'invalid', message: 'This connection has no token to disconnect.' };
	const o = await write(ctx, { tool: 'connector_disconnect', fn: 'connector_admin_disconnect', args: { p_token_id: ctx.token.id } }, writeOptions(args));
	return { ...outcomeWords(o), connection: ctx.token.label };
}

// ---------------------------------------------------------------------------
// site_find_tool and site_call
// ---------------------------------------------------------------------------

async function resolveArg(ctx: ToolContext, kind: string | undefined, value: unknown): Promise<{ ok: true; value: unknown } | { ok: false; out: ToolOutput }> {
	if (typeof value !== 'string' || !kind) return { ok: true, value };
	if (kind === 'student') {
		const r = await resolveStudent(ctx, value);
		return r.status === 'found' ? { ok: true, value: r.value.email } : { ok: false, out: unresolved('student', r) };
	}
	if (kind === 'class') {
		const r = await resolveClass(ctx, value);
		return r.status === 'found' ? { ok: true, value: r.value.id } : { ok: false, out: unresolved('class', r) };
	}
	if (kind === 'post') {
		const r = await resolvePost(ctx, value);
		return r.status === 'found' ? { ok: true, value: r.value.id } : { ok: false, out: unresolved('post', r) };
	}
	if (kind === 'due') {
		const d = resolveDue(value, new Date(ctx.now()));
		return d.ok ? { ok: true, value: d.iso } : { ok: false, out: { status: 'invalid', message: d.refusal } };
	}
	return { ok: true, value };
}

/** The words site_find_tool uses when it finds nothing: say so, and record what he wanted. */
const NOTHING_FOUND =
	'Nothing the site can do matches. Tell him plainly that the site cannot do this yet, then call report_gap with what he asked for and what is missing, so it gets built. Do not try other actions to fake it.';

async function siteFindTool(_ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const matches = findTools(str(args.query) ?? '');
	if (matches.length === 0) return { status: 'none', matches: [], message: NOTHING_FOUND };
	return {
		status: 'ok',
		matches,
		message:
			'Pick the one match that does what he asked, then call site_call with its call exactly, filling in the angle-bracketed values from what he said. If none of them does it, tell him so and call report_gap.'
	};
}

async function siteCall(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const name = str(args.name) ?? '';
	const endpoint = liveEndpoint(name);
	if (endpoint) {
		const given = (args.args && typeof args.args === 'object' ? args.args : {}) as Record<string, unknown>;
		return runEndpoint(ctx, endpoint, given, writeOptions(args));
	}
	const entry: FunctionEntry | null = liveFunction(name);
	if (!entry || (entry.surface ?? 'call') !== 'call') {
		const e = FUNCTIONS[name];
		const excludedRoute = Object.values(ENDPOINTS).find((x) => x.tool === name || x.route === name);
		if (e?.surface === 'tool' && liveFunction(name)) {
			return { status: 'not_available', message: `"${name}" has its own tool, ${e.tool}. Call that tool instead. Nothing was changed.` };
		}
		if (e?.exclude || excludedRoute?.exclude) {
			return { status: 'not_available', message: `"${name}" is never reachable through Claude: ${e?.exclude ?? excludedRoute?.exclude} Nothing was changed.` };
		}
		// A NAME THE REGISTRY DOES NOT HAVE IS A GAP, recorded by the server
		// whether or not the model remembers to (DESIGN.md section 9).
		const gap = ctx.practice ? null : await recordGap(ctx, `The site has no action called "${name}".`, [`site_call:${name}`]);
		return {
			status: 'not_available',
			message: `There is no site action called "${name}". Nothing was changed. Use site_find_tool to look; if it finds nothing, tell him the site cannot do it yet.`,
			...(gap ? { gap_recorded: true } : {})
		};
	}
	return siteCallEntry(ctx, entry, args);
}

function freshUuid(ctx: ToolContext): string {
	const b = ctx.random(16);
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = b.toString('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function siteCallEntry(ctx: ToolContext, entry: FunctionEntry, args: ToolArgs): Promise<ToolOutput> {
	const name = entry.name;
	const given = (args.args && typeof args.args === 'object' ? args.args : {}) as Record<string, unknown>;
	const params = callArgs(entry);
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(given)) {
		const param = params.find((p) => p.name === k || p.param === k);
		if (!param) return { status: 'invalid', message: `"${name}" takes no argument called "${k}". It takes: ${params.map((p) => p.name).join(', ') || 'nothing'}. Nothing was changed.` };
		// AN ID MAY ALWAYS BE GIVEN AS A NAME (ledger 0422): an argument that
		// names a kind of record (lookup-kinds.json) is looked up as him when
		// what was given is not already the id.
		const kind = param.resolve ? null : lookupKindFor(name, param.param);
		if (kind && typeof v === 'string' && v.trim() !== '' && !looksLikeId(kind, v)) {
			const l = await lookupId(ctx, kind, v.trim());
			if (l.status === 'found') {
				out[param.param] = l.id;
				continue;
			}
			if (l.status === 'ambiguous') {
				return {
					status: 'ambiguous',
					what: lookupWords(kind),
					said: l.said,
					candidates: l.candidates,
					message: `More than one ${lookupWords(kind)} matches "${l.said}". Nothing was changed. Ask him which one, then call again with its exact name or its id.`
				};
			}
			return { status: 'not_found', what: lookupWords(kind), said: l.said, message: `${l.message} Nothing was changed.` };
		}
		const r = await resolveArg(ctx, param.resolve, v);
		if (!r.ok) return r.out;
		out[param.param] = r.value;
	}
	const filled: string[] = [];
	for (const p of params) {
		if (p.param in out) continue;
		if (p.fill === 'uuid') {
			out[p.param] = freshUuid(ctx);
			filled.push(p.param);
		} else if (p.hasDefault) out[p.param] = p.default ?? null;
	}
	const missing = params.filter((p) => p.required && !(p.param in out)).map((p) => p.name);
	if (missing.length) return { status: 'invalid', message: `"${name}" also needs: ${missing.join(', ')}. Ask him for it. Nothing was changed.` };
	// ONE FORM OF THE FUNCTION MUST TAKE EXACTLY THESE ARGUMENTS (gap 3157f5d8):
	// with two forms, a subset can fit neither, and the database's own "could
	// not find the function" is no answer to give him.
	const fit = fitOverload(entry.name, out);
	if (!fit.ok) {
		const spoken = (ps: string[]) => ps.map((x) => params.find((p) => p.param === x)?.name ?? x).join(', ');
		return {
			status: 'invalid',
			message: fit.missing.length
				? `"${name}" given those also needs: ${spoken(fit.missing)}. Ask him for it. Nothing was changed.`
				: `"${name}" takes ${spoken(Object.keys(out))} in no single form. Leave one out. Nothing was changed.`
		};
	}
	if (entry.level === 'read' && !entry.level_when?.length) {
		const r = await ctx.backend.rpc(ctx.session, entry.name, out);
		if (r.error) return { status: 'refused', message: r.error.message };
		return { status: 'ok', result: r.data };
	}
	const before = await readBefore(ctx, entry.before, out);
	const o = await write(
		ctx,
		{ tool: entry.surface === 'tool' ? (entry.tool ?? entry.name) : `site_call:${entry.name}`, fn: entry.name, args: out, before, filled },
		writeOptions(args)
	);
	return outcomeWords(o);
}

// ---------------------------------------------------------------------------
// Requests, gaps and the replay of saved requests (DESIGN.md section 9)
// ---------------------------------------------------------------------------

async function recordGap(ctx: ToolContext, missing: string, tried: string[]): Promise<string | null> {
	const said = ctx.said ?? '';
	if (!said.trim()) return null;
	const r = await ctx.backend
		.rpc<{ gap_id: string }>(ctx.session, 'connector_report_gap', { p_said: said, p_missing: missing, p_tried: tried, p_model: ctx.model ?? null })
		.catch(() => null);
	return r && !r.error ? (r.data?.gap_id ?? null) : null;
}

async function reportGap(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const missing = str(args.missing);
	if (!missing) return { status: 'invalid', message: 'Say what the site would need to be able to do.' };
	const tried = list(args.tried);
	if (ctx.practice || bool(args.dry_run)) {
		return { status: 'preview', message: ctx.practice ? 'This is the practice connector: no gap was recorded.' : 'Preview only: no gap was recorded.', missing, tried };
	}
	const id = await recordGap(ctx, missing, tried);
	if (!id) return { status: 'refused', message: 'The gap could not be recorded. Nothing else was changed.' };
	return {
		status: 'done',
		gap_id: id,
		message: 'Recorded. Tell him the site cannot do this yet, and that it is now on the list of things to build.'
	};
}

async function recordEvalResult(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const n = num(args.request);
	const passed = bool(args.passed);
	if (n === undefined || passed === undefined) return { status: 'invalid', message: 'Say which saved request, by number, and whether it passed.' };
	if (bool(args.dry_run)) return { status: 'preview', message: 'Preview only: nothing was recorded.' };
	const r = await ctx.backend.rpc<{ run_id: string }>(ctx.session, 'connector_eval_record', {
		p_eval: n,
		p_passed: passed,
		p_path: list(args.path),
		// Ledger 0432: how many calls the request took, so a run scores calls per request as well as passes.
		p_detail: { note: str(args.note) ?? null, practice: !!ctx.practice, calls: list(args.path).length },
		p_model: str(args.model) ?? ctx.model ?? null
	});
	if (r.error) return { status: 'refused', message: r.error.message };
	return { status: 'done', run_id: r.data?.run_id ?? null, message: 'Recorded.' };
}

/** What a request came to, in the five words the request log keeps. */
export function requestOutcome(tool: string, out: ToolOutput): 'done' | 'previewed' | 'asked' | 'refused' | 'gap' {
	const status = String(out.status ?? '');
	if (tool === 'report_gap' || out.gap_recorded === true) return 'gap';
	if (status === 'preview') return out.confirm_token ? 'asked' : 'previewed';
	if (['ambiguous', 'needs_category', 'needs_confirmation', 'not_found', 'none', 'needs_kind', 'needs_amount', 'needs_choice'].includes(status)) return 'asked';
	if (['refused', 'invalid', 'not_available'].includes(status)) return 'refused';
	if (status === 'partial') return 'done';
	return 'done';
}

function auditIdsOf(out: unknown, into: Set<string> = new Set()): Set<string> {
	if (Array.isArray(out)) for (const x of out) auditIdsOf(x, into);
	else if (out && typeof out === 'object') {
		for (const [k, v] of Object.entries(out as Record<string, unknown>)) {
			if (k === 'audit_id' && typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)) into.add(v);
			else if (v && typeof v === 'object') auditIdsOf(v, into);
		}
	}
	return into;
}

/** Arguments as the request log keeps them: no write switches, and no whole documents. */
function loggedArgs(args: ToolArgs): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(args)) {
		if (['said', 'confirm_token'].includes(k)) continue;
		out[k] = typeof v === 'string' && v.length > 500 ? `${v.slice(0, 500)}... (${v.length} characters)` : v;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, (ctx: ToolContext, args: ToolArgs) => Promise<ToolOutput>> = {
	find_student: findStudent,
	list_classes: (ctx) => listClasses(ctx),
	list_posts: listPosts,
	get_post: getPost,
	create_post: createPost,
	set_points: setPoints,
	set_due: setDue,
	set_rubric: setRubric,
	set_published: setPublished,
	replace_html_assignment: replaceHtml,
	read_grades: readGrades,
	read_answers: readAnswers,
	grading_packet: gradingPacket,
	grade,
	send_feedback: sendFeedback,
	coin_transact: coinTransact,
	award_coins: (ctx, a) => coins(ctx, a, 'award'),
	fine_coins: (ctx, a) => coins(ctx, a, 'fine'),
	coin_balance: coinBalance,
	list_site_feedback: listSiteFeedback,
	feedback_screenshot: feedbackScreenshot,
	mark_feedback: (ctx, a) => markMany(ctx, a, bulkListFor(str(a.list))),
	list_armory_reports: listArmoryReports,
	read_armory_incident: readArmoryIncident,
	undo_last: (ctx, a) => undoLast(ctx, writeOptions(a)),
	connector_disconnect: disconnect,
	site_find_tool: siteFindTool,
	site_call: siteCall,
	report_gap: reportGap,
	record_eval_result: recordEvalResult
};

/** The names `runTool` will answer: exactly the registry's tools. */
export function handledToolNames(): string[] {
	return Object.keys(HANDLERS).sort();
}

export class UnknownTool extends Error {}

/** A function entry marked `surface: tool` is its own tool, run the way site_call runs it. */
function directEntry(name: string): FunctionEntry | null {
	return directEntries().find((e) => (e.tool ?? e.name) === name) ?? null;
}

/**
 * Runs one tool call, and records it in the request log as him (DESIGN.md
 * section 9): his words (`said`), the tool, the arguments, what it came to and
 * the audit rows it produced. A request whose words match no saved request
 * becomes one, automatically. The practice endpoint records nothing.
 */
export async function runTool(ctx: ToolContext, name: string, args: ToolArgs): Promise<ToolOutput> {
	const direct = directEntry(name);
	const known = name in FACADES || name === 'site_find_tool' || name === 'site_call' || direct !== null;
	const handler: ((ctx: ToolContext, args: ToolArgs) => Promise<ToolOutput>) | undefined = direct
		? (c, a) => {
				const { dry_run, request_id, confirm_token, again, said: _said, ...rest } = a;
				return siteCallEntry(c, direct, { args: rest, dry_run, request_id, confirm_token, again });
			}
		: HANDLERS[name];
	if (!known || !handler) throw new UnknownTool(`There is no tool called "${name}".`);
	const input = args ?? {};
	const said = str(input.said);
	ctx.said = said ?? null;
	let out: ToolOutput;
	try {
		out = await handler(ctx, input);
	} catch (e) {
		if (e instanceof ResolveFailure || e instanceof NotRegistered) out = { status: 'refused', message: e.message };
		else throw e;
	}
	if (!ctx.practice && said && name !== 'record_eval_result') {
		await ctx.backend
			.rpc(ctx.session, 'connector_request_log', {
				p_request_key: str(input.request_id) ?? null,
				p_said: said,
				p_tool: name === 'site_call' ? `site_call:${str(input.name) ?? ''}` : name,
				p_args: loggedArgs(input),
				p_outcome: requestOutcome(name, out),
				p_audit_ids: [...auditIdsOf(out)],
				p_model: ctx.model ?? null
			})
			.catch(() => undefined);
	}
	return out;
}
