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
import { laCalendarDay, schoolDayOf, weekOffset } from '$lib/classroom/school-calendar';
import { hxBlockPrompt, manifestBlocks, type HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import { manifestRubricIsDerived, stagedRubricAfterManifest } from '$lib/classroom/html-assignment/rubric';
import { htmlManifestDiff, stageHtmlDocument } from '$lib/classroom/html-assignment/store';
import type { RubricCriterion } from '$lib/classroom/assignment-spec';
import type { ToolContext } from './context';
import { resolveDue, resolveNoticeEnd } from './dates';
import { undoLast, write, NotRegistered, type WriteOptions, type WriteOutcome } from './engine';
import {
	callArgs,
	FACADES,
	findTools,
	FUNCTIONS,
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
		classes: p.sections.map((s) => s.title)
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
	const s = await resolveStudent(ctx, str(args.student) ?? '');
	if (s.status !== 'found') return unresolved('student', s);
	const rows = await pageAll<{ block_id: string; value: unknown; updated_at: string }>(ctx, {
		table: 'classroom_responses',
		columns: ['block_id', 'value', 'updated_at'],
		eq: { item_id: p.value.id, student_email: s.value.email },
		order: [['block_id', 'asc']]
	});
	const manifest = p.value.assignment_schema_version === 3 ? await storedManifest(ctx, p.value.id) : null;
	const want = pickQuestion(manifest, str(args.question), rows.map((r) => r.block_id));
	const order = manifest ? manifestBlocks(manifest) : null;
	const promptOf = new Map((order ?? []).map((b, i) => [b.id, { number: i + 1, prompt: hxBlockPrompt(b) ?? b.field }]));
	const answers = rows
		.filter((r) => !want || want.includes(r.block_id))
		.map((r) => ({ question: promptOf.get(r.block_id)?.number ?? null, prompt: promptOf.get(r.block_id)?.prompt ?? r.block_id, answer: r.value, saved: r.updated_at }))
		.sort((a, b) => (a.question ?? 999) - (b.question ?? 999));
	return {
		status: 'ok',
		post: p.value.title,
		student: s.value.name,
		answers,
		message: answers.length ? undefined : want ? 'No answer is stored for that question.' : 'No answers are stored yet.'
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
	const body = str(args.body) ?? '';
	if (kindSaid === 'notice') {
		if (!body) return { status: 'invalid', message: 'A notice needs its text.' };
		const end = resolveNoticeEnd(str(args.until), new Date(ctx.now()));
		if (!end.ok) return { status: 'invalid', message: end.refusal };
		const o = await write(
			ctx,
			{ tool: 'create_post', fn: 'classroom_quick_post_create', args: { p_section_ids: sections.map((s) => s.id), p_body: body, p_expires_at: end.iso } },
			opts
		);
		return { ...outcomeWords(o), classes: sections.map((s) => s.title), until: end.words };
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
	const html = typeof args.html === 'string' ? args.html : '';
	if (!html.trim()) return { status: 'invalid', message: 'Send the whole HTML document.' };
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
	if (missing.size > 0) {
		const ids = [...missing.keys()].sort();
		return {
			status: 'refused',
			reason: 'would_orphan_answers',
			post: p.value.title,
			missing_blocks: ids.map((id) => ({ block: id, students_with_answers: missing.get(id)?.size ?? 0 })),
			diff,
			message: `Not replaced. ${ids.length === 1 ? 'Block' : 'Blocks'} ${ids.join(', ')} ${ids.length === 1 ? 'has' : 'have'} student answers stored and ${ids.length === 1 ? 'is' : 'are'} not in the new document; those answers would stop showing. Give the new document the same block ids and send it again.`
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
		warnings: staged.warnings
	};
}

async function grade(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const p = await postFrom(ctx, { post: args.post });
	if (p.status !== 'found') return unresolved('post', p);
	if (p.value.kind !== 'assignment') return { status: 'invalid', message: `${p.value.title} is not an assignment.` };
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
		status: opts.dryRun ? 'preview' : done === results.length ? 'done' : done === 0 ? 'refused' : 'partial',
		kind: cat.name,
		each: cat.pricing_model === 'flat' ? cat.amount : amount,
		reason: reason ?? null,
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

async function siteCall(ctx: ToolContext, args: ToolArgs): Promise<ToolOutput> {
	const name = str(args.name) ?? '';
	const entry: FunctionEntry | null = liveFunction(name);
	if (!entry || (entry.surface ?? 'call') !== 'call') {
		const e = FUNCTIONS[name];
		return {
			status: 'not_available',
			message: e?.pending
				? `"${name}" is not reachable through Claude yet (${e.pending}).`
				: e?.exclude
					? `"${name}" is never reachable through Claude: ${e.exclude}`
					: `There is no site action called "${name}". Use site_find_tool to look.`
		};
	}
	return siteCallEntry(ctx, entry, args);
}

async function siteCallEntry(ctx: ToolContext, entry: FunctionEntry, args: ToolArgs): Promise<ToolOutput> {
	const name = entry.name;
	const given = (args.args && typeof args.args === 'object' ? args.args : {}) as Record<string, unknown>;
	const params = callArgs(entry);
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(given)) {
		const param = params.find((p) => p.name === k || p.param === k);
		if (!param) return { status: 'invalid', message: `"${name}" takes no argument called "${k}". It takes: ${params.map((p) => p.name).join(', ') || 'nothing'}.` };
		const r = await resolveArg(ctx, param.resolve, v);
		if (!r.ok) return r.out;
		out[param.param] = r.value;
	}
	const missing = params.filter((p) => p.required && !(p.param in out)).map((p) => p.name);
	if (missing.length) return { status: 'invalid', message: `"${name}" also needs: ${missing.join(', ')}.` };
	if (entry.level === 'read') {
		const r = await ctx.backend.rpc(ctx.session, entry.name, out);
		if (r.error) return { status: 'refused', message: r.error.message };
		return { status: 'ok', result: r.data };
	}
	const o = await write(ctx, { tool: entry.surface === 'tool' ? (entry.tool ?? entry.name) : `site_call:${entry.name}`, fn: entry.name, args: out }, writeOptions(args));
	return outcomeWords(o);
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
	grade,
	send_feedback: sendFeedback,
	award_coins: (ctx, a) => coins(ctx, a, 'award'),
	fine_coins: (ctx, a) => coins(ctx, a, 'fine'),
	coin_balance: coinBalance,
	undo_last: (ctx, a) => undoLast(ctx, writeOptions(a)),
	connector_disconnect: disconnect,
	site_find_tool: async (_ctx, a) => ({ status: 'ok', matches: findTools(str(a.query) ?? '') }),
	site_call: siteCall
};

/** The names `runTool` will answer: exactly the registry's tools. */
export function handledToolNames(): string[] {
	return Object.keys(HANDLERS).sort();
}

export class UnknownTool extends Error {}

/** A function entry marked `surface: tool` is its own tool, run the way site_call runs it. */
function directEntry(name: string): FunctionEntry | null {
	return Object.values(FUNCTIONS).find((e) => liveFunction(e.name) && e.surface === 'tool' && (e.tool ?? e.name) === name) ?? null;
}

export async function runTool(ctx: ToolContext, name: string, args: ToolArgs): Promise<ToolOutput> {
	const direct = directEntry(name);
	const known = name in FACADES || name === 'site_find_tool' || name === 'site_call' || direct !== null;
	const handler: ((ctx: ToolContext, args: ToolArgs) => Promise<ToolOutput>) | undefined = direct
		? (c, a) => {
				const { dry_run, request_id, confirm_token, again, ...rest } = a;
				return siteCallEntry(c, direct, { args: rest, dry_run, request_id, confirm_token, again });
			}
		: HANDLERS[name];
	if (!known || !handler) throw new UnknownTool(`There is no tool called "${name}".`);
	try {
		return await handler(ctx, args ?? {});
	} catch (e) {
		if (e instanceof ResolveFailure || e instanceof NotRegistered) return { status: 'refused', message: e.message };
		throw e;
	}
}
