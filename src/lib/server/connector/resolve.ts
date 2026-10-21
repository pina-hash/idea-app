/**
 * NAMES TO RECORDS, the way he says them: a student, a class, a post. Every
 * lookup reads through his own session, so it can only ever find what his own
 * account can see, and it looks only at the classes he TEACHES (teacher of
 * record), never every class an admin can manage, which is the whole school.
 *
 * AN AMBIGUOUS NAME IS NEVER GUESSED. Two Daniels answer with both, each with
 * their class; no Alex answers that there is none. A tool that receives either
 * writes nothing and says so (docs/connector/DESIGN.md section 2).
 */
import { sectionTitle, type ClassroomSection } from '$lib/classroom/classroom';
import type { ToolContext } from './context';

export interface MySection {
	id: string;
	title: string;
	label: string;
	block: string | null;
	courseCode: string;
	courseTitle: string;
}

export interface RosterStudent {
	email: string;
	name: string;
	first: string;
	last: string;
	/**
	 * THE OTHER NAMES THE SAME PERSON GOES BY (ledger 0422, gap e40c6d2d): the
	 * name on their account when the roster spells it differently. The roster
	 * read "Maximum Chen" while grades showed the account's "Maximus Chen", so
	 * the name he read off the grades found nobody.
	 */
	aliases?: string[];
	classes: Array<{ id: string; title: string }>;
}

export interface PostRow {
	id: string;
	kind: string;
	title: string | null;
	body: string;
	body_doc: unknown;
	points: number | null;
	due_at: string | null;
	category: string | null;
	published: boolean;
	publish_at: string | null;
	pinned: boolean;
	assignment_schema_version: number | null;
	created_at: string;
	sections: Array<{ id: string; title: string }>;
}

export type Resolution<T> =
	| { status: 'found'; value: T }
	| { status: 'ambiguous'; said: string; candidates: Array<Record<string, unknown>> }
	| { status: 'none'; said: string; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function norm(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9@.\s-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

async function memo<T>(ctx: ToolContext, key: string, load: () => Promise<T>): Promise<T> {
	if (ctx.cache.has(key)) return ctx.cache.get(key) as T;
	const value = await load();
	ctx.cache.set(key, value);
	return value;
}

export class ResolveFailure extends Error {}

function failed(what: string, message: string): never {
	throw new ResolveFailure(`${what} could not be read: ${message}`);
}

/** The classes he is teacher of record for, active ones only. */
export function mySections(ctx: ToolContext): Promise<MySection[]> {
	return memo(ctx, 'sections', async () => {
		const email = ctx.session.user.email.toLowerCase();
		const sections = await ctx.backend.select<{ id: string; course_id: string; label: string; block: string | null; teacher_email: string; active: boolean | null }>(
			ctx.session,
			{ table: 'classroom_sections', columns: ['id', 'course_id', 'label', 'block', 'teacher_email', 'active'], eq: { teacher_email: email } }
		);
		if (sections.error) failed('Your classes', sections.error.message);
		const live = sections.data.filter((s) => s.active !== false);
		const courseIds = [...new Set(live.map((s) => s.course_id))];
		const courses = courseIds.length
			? await ctx.backend.select<{ id: string; code: string; title: string }>(ctx.session, {
					table: 'classroom_courses',
					columns: ['id', 'code', 'title'],
					in: { id: courseIds }
				})
			: { data: [], error: null };
		if (courses.error) failed('Your courses', courses.error.message);
		const byId = new Map(courses.data.map((c) => [c.id, c]));
		return live
			.map((s) => {
				const course = byId.get(s.course_id) ?? null;
				const asSection = {
					id: s.id,
					course_id: s.course_id,
					label: s.label,
					block: s.block,
					teacher_email: s.teacher_email,
					course: course ? { id: course.id, code: course.code, title: course.title } : null
				} as unknown as ClassroomSection;
				return {
					id: s.id,
					title: sectionTitle(asSection),
					label: s.label,
					block: s.block,
					courseCode: course?.code ?? '',
					courseTitle: course?.title ?? ''
				};
			})
			.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
	});
}

/** Class titles by id, for classes he may not teach (a shared post's other classes). */
async function sectionTitles(ctx: ToolContext, ids: string[]): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	if (ids.length === 0) return out;
	const sections = await ctx.backend.select<{ id: string; course_id: string; label: string; block: string | null; teacher_email: string }>(ctx.session, {
		table: 'classroom_sections',
		columns: ['id', 'course_id', 'label', 'block', 'teacher_email'],
		in: { id: ids }
	});
	if (sections.error) failed('The other classes', sections.error.message);
	const courseIds = [...new Set(sections.data.map((s) => s.course_id))];
	const courses = courseIds.length
		? await ctx.backend.select<{ id: string; code: string; title: string }>(ctx.session, { table: 'classroom_courses', columns: ['id', 'code', 'title'], in: { id: courseIds } })
		: { data: [], error: null };
	if (courses.error) failed('The other courses', courses.error.message);
	const byId = new Map(courses.data.map((c) => [c.id, c]));
	for (const s of sections.data) {
		const course = byId.get(s.course_id) ?? null;
		out.set(
			s.id,
			sectionTitle({
				id: s.id,
				course_id: s.course_id,
				label: s.label,
				block: s.block,
				teacher_email: s.teacher_email,
				course: course ? { id: course.id, code: course.code, title: course.title } : null
			} as unknown as ClassroomSection)
		);
	}
	return out;
}

function numbersIn(s: string): string[] {
	return [...s.matchAll(/(\d+)/g)].map((m) => String(Number(m[1])));
}

/** The class or classes a phrase names: "209H Block 2", "Block 2", "all 209H", "every IDEA100 section". */
export async function resolveClasses(ctx: ToolContext, said: string): Promise<Resolution<MySection[]>> {
	const sections = await mySections(ctx);
	const raw = said.trim();
	if (UUID.test(raw)) {
		const hit = sections.find((s) => s.id === raw.toLowerCase());
		return hit ? { status: 'found', value: [hit] } : { status: 'none', said, message: 'That class is not one you teach.' };
	}
	const t = norm(raw);
	const wantsAll = /\b(all|every|each|both)\b/.test(t);
	const tokens = t
		.replace(/\b(all|every|each|both|my|the|of|in|class|classes|section|sections|course|block|blocks|period|periods|b|p)\b/g, ' ')
		.split(/\s+/)
		.filter((w) => w && !/^[bp]\d+$/.test(w));
	const blockNumbers = [...t.matchAll(/\b(?:block|period|b|p)\s*(\d+)\b/g)].map((m) => String(Number(m[1])));
	const words = tokens.filter((w) => !/^\d+$/.test(w) || !blockNumbers.includes(String(Number(w))));
	const matches = sections.filter((s) => {
		const code = s.courseCode.toLowerCase().replace(/\s+/g, '');
		const hay = `${code} ${norm(s.courseTitle)} ${norm(s.label)}`;
		const sectionNumbers = new Set([...numbersIn(s.label), ...numbersIn(s.block ?? '')]);
		for (const n of blockNumbers) if (!sectionNumbers.has(n)) return false;
		for (const w of words) {
			const bare = w.replace(/\s+/g, '');
			if (code.includes(bare) || hay.includes(w)) continue;
			// A bare number that is not a course number may still be the block.
			if (/^\d+$/.test(w) && blockNumbers.length === 0 && sectionNumbers.has(String(Number(w))) && !code.includes(w)) continue;
			return false;
		}
		return true;
	});
	const candidates = matches.map((s) => ({ class: s.title, id: s.id }));
	if (matches.length === 0) {
		return {
			status: 'none',
			said,
			message: `None of your classes matches "${said}". Your classes: ${sections.map((s) => s.title).join('; ') || 'none'}.`
		};
	}
	if (matches.length > 1 && !wantsAll) return { status: 'ambiguous', said, candidates };
	return { status: 'found', value: matches };
}

export async function resolveClass(ctx: ToolContext, said: string): Promise<Resolution<MySection>> {
	const r = await resolveClasses(ctx, said);
	if (r.status !== 'found') return r;
	if (r.value.length > 1) {
		return { status: 'ambiguous', said, candidates: r.value.map((s) => ({ class: s.title, id: s.id })) };
	}
	return { status: 'found', value: r.value[0] };
}

function splitName(display: string): { first: string; last: string; name: string } {
	const d = display.trim();
	if (d.includes(',')) {
		const [last, rest] = d.split(',', 2).map((x) => x.trim());
		const first = (rest ?? '').split(/\s+/)[0] ?? '';
		return { first, last, name: `${rest} ${last}`.trim() };
	}
	const parts = d.split(/\s+/);
	return { first: parts[0] ?? '', last: parts.length > 1 ? parts[parts.length - 1] : '', name: d };
}

/** Everyone actively enrolled in the classes he teaches (or one of them), deduplicated by address. */
export async function myStudents(ctx: ToolContext, only?: MySection[]): Promise<RosterStudent[]> {
	const sections = only ?? (await mySections(ctx));
	const byEmail = new Map<string, RosterStudent>();
	for (const s of sections) {
		const rows = await memo(ctx, `roster:${s.id}`, async () => {
			const r = await ctx.backend.rpc<Array<{ student_email: string; display_name: string; active: boolean; manages?: boolean }>>(
				ctx.session,
				'classroom_section_roster',
				{ p_section_id: s.id }
			);
			if (r.error) failed(`The roster for ${s.title}`, r.error.message);
			return r.data ?? [];
		});
		for (const row of rows) {
			if (!row.active || row.manages === true) continue;
			const email = row.student_email.toLowerCase();
			const split = splitName(row.display_name || email.split('@')[0]);
			const prior = byEmail.get(email);
			if (prior) prior.classes.push({ id: s.id, title: s.title });
			else byEmail.set(email, { email, ...split, classes: [{ id: s.id, title: s.title }] });
		}
	}
	const students = [...byEmail.values()];
	await addAccountNames(ctx, students);
	return students;
}

/** Each student's account names, as aliases beside the roster's. Best effort: a failed read adds none. */
async function addAccountNames(ctx: ToolContext, students: RosterStudent[]): Promise<void> {
	if (students.length === 0) return;
	const key = `aliases:${students.map((s) => s.email).sort().join(',')}`;
	const rows = await memo(ctx, key, async () => {
		const r = await ctx.backend.select<{ email: string | null; full_name: string | null; display_name: string | null }>(ctx.session, {
			table: 'profiles',
			columns: ['email', 'full_name', 'display_name'],
			in: { email: students.map((s) => s.email) },
			limit: 2000
		});
		return r.error ? [] : (r.data ?? []);
	});
	const byEmail = new Map(students.map((s) => [s.email, s]));
	for (const row of rows) {
		const st = byEmail.get((row.email ?? '').toLowerCase());
		if (!st) continue;
		const names = [row.full_name, row.display_name].map((n) => (n ?? '').trim()).filter((n) => n && norm(n) !== norm(st.name));
		if (names.length) st.aliases = [...new Set([...(st.aliases ?? []), ...names])];
	}
}

/** One letter apart (a typo in a roster, a misheard name), for words of five letters or more. */
function oneEditApart(a: string, b: string): boolean {
	if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
	let i = 0;
	let j = 0;
	let edits = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			i++;
			j++;
			continue;
		}
		if (++edits > 1) return false;
		if (a.length > b.length) i++;
		else if (b.length > a.length) j++;
		else {
			i++;
			j++;
		}
	}
	return edits + (a.length - i) + (b.length - j) <= 1;
}

function scoreStudent(st: RosterStudent, tokens: string[]): number {
	let best = scoreOneName(st, tokens);
	for (const alias of st.aliases ?? []) best = Math.max(best, scoreOneName({ ...st, ...splitName(alias), aliases: [] }, tokens));
	return best;
}

function scoreOneName(st: RosterStudent, tokens: string[]): number {
	const first = norm(st.first);
	const last = norm(st.last);
	const full = norm(st.name);
	const local = st.email.split('@')[0].toLowerCase();
	if (tokens.join(' ') === full || tokens.join(' ') === `${last} ${first}`) return 100;
	let score = 0;
	for (const tk of tokens) {
		if (tk === first) score += 10;
		else if (tk === last) score += 10;
		else if (full.split(' ').includes(tk)) score += 8;
		else if (tk.length === 1 && last.startsWith(tk)) score += 6;
		else if (tk.length >= 2 && (first.startsWith(tk) || last.startsWith(tk))) score += 4;
		else if (tk.length >= 3 && local.includes(tk)) score += 3;
		else if (oneEditApart(tk, first) || oneEditApart(tk, last)) score += 2;
		else return 0;
	}
	return score;
}

/** One student by the name he said, or the candidates, or none. */
export async function resolveStudent(ctx: ToolContext, said: string, classSaid?: string): Promise<Resolution<RosterStudent>> {
	let pool: MySection[] | undefined;
	if (classSaid) {
		const c = await resolveClasses(ctx, classSaid);
		if (c.status !== 'found') return c;
		pool = c.value;
	}
	const students = await myStudents(ctx, pool);
	const raw = said.trim();
	if (raw.includes('@')) {
		const hit = students.find((s) => s.email === raw.toLowerCase());
		return hit
			? { status: 'found', value: hit }
			: { status: 'none', said, message: `${raw} is not on the roster of a class you teach.` };
	}
	const tokens = norm(raw)
		.split(/\s+/)
		.map((t) => t.replace(/\.$/, ''))
		.filter(Boolean);
	if (tokens.length === 0) return { status: 'none', said, message: 'Say a student name.' };
	const scored = students.map((s) => ({ s, score: scoreStudent(s, tokens) })).filter((x) => x.score > 0);
	if (scored.length === 0) {
		return {
			status: 'none',
			said,
			message: `No student named "${said}" is on the roster of ${pool ? pool.map((p) => p.title).join(' or ') : 'any class you teach'}.`
		};
	}
	scored.sort((a, b) => b.score - a.score);
	const best = scored[0].score;
	const top = scored.filter((x) => x.score === best);
	if (top.length > 1) {
		return {
			status: 'ambiguous',
			said,
			candidates: top.map((x) => ({ student: x.s.name, email: x.s.email, classes: x.s.classes.map((c) => c.title) }))
		};
	}
	return { status: 'found', value: top[0].s };
}

const POST_COLUMNS = [
	'id',
	'kind',
	'title',
	'body',
	'body_doc',
	'points',
	'due_at',
	'category',
	'published',
	'publish_at',
	'pinned',
	'assignment_schema_version',
	'created_at'
];

/** Every post in the classes he teaches (or the ones named), each once with the classes it is in. */
export async function myPosts(ctx: ToolContext, only?: MySection[]): Promise<PostRow[]> {
	const sections = only ?? (await mySections(ctx));
	const key = `posts:${sections.map((s) => s.id).sort().join(',')}`;
	return memo(ctx, key, async () => {
		if (sections.length === 0) return [];
		const titleOf = new Map(sections.map((s) => [s.id, s.title]));
		const postings: Array<{ item_id: string; section_id: string }> = [];
		for (let offset = 0; ; offset += 1000) {
			const page = await ctx.backend.select<{ item_id: string; section_id: string }>(ctx.session, {
				table: 'classroom_postings',
				columns: ['item_id', 'section_id'],
				in: { section_id: sections.map((s) => s.id) },
				order: [['item_id', 'asc'], ['section_id', 'asc']],
				limit: 1000,
				offset
			});
			if (page.error) failed('Your posts', page.error.message);
			postings.push(...page.data);
			if (page.data.length < 1000) break;
		}
		// EVERY CLASS A POST IS IN, NOT ONLY THE ONES ASKED ABOUT (gap ae4a495d):
		// one shared copy posted to Blocks 2, 3 and 4 read as Block 4's alone when
		// the list was asked for Block 4, so nothing said an edit changes all
		// three. The posts are picked by the classes asked about; the classes
		// each one is in are read across the school.
		const picked = [...new Set(postings.map((p) => p.item_id))];
		if (only) {
			const seen = new Set(postings.map((p) => `${p.item_id}|${p.section_id}`));
			for (let i = 0; i < picked.length; i += 200) {
				const page = await ctx.backend.select<{ item_id: string; section_id: string }>(ctx.session, {
					table: 'classroom_postings',
					columns: ['item_id', 'section_id'],
					in: { item_id: picked.slice(i, i + 200) },
					order: [['item_id', 'asc'], ['section_id', 'asc']],
					limit: 1000
				});
				if (page.error) failed('Your posts', page.error.message);
				for (const p of page.data) if (!seen.has(`${p.item_id}|${p.section_id}`)) postings.push(p);
			}
			const unknown = [...new Set(postings.map((p) => p.section_id).filter((id) => !titleOf.has(id)))];
			for (const [id, title] of await sectionTitles(ctx, unknown)) titleOf.set(id, title);
		}
		const sectionsOf = new Map<string, Array<{ id: string; title: string }>>();
		for (const p of postings) {
			const list = sectionsOf.get(p.item_id) ?? [];
			list.push({ id: p.section_id, title: titleOf.get(p.section_id) ?? '' });
			sectionsOf.set(p.item_id, list);
		}
		for (const list of sectionsOf.values()) list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
		const ids = [...sectionsOf.keys()];
		const out: PostRow[] = [];
		for (let i = 0; i < ids.length; i += 200) {
			const chunk = ids.slice(i, i + 200);
			const items = await ctx.backend.select<Omit<PostRow, 'sections'>>(ctx.session, {
				table: 'classroom_items',
				columns: POST_COLUMNS,
				in: { id: chunk },
				limit: 1000
			});
			if (items.error) failed('Your posts', items.error.message);
			for (const it of items.data) out.push({ ...it, sections: sectionsOf.get(it.id) ?? [] });
		}
		return out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
	});
}

/** One post by its title as he said it (or part of it), or the candidates, or none. */
export async function resolvePost(ctx: ToolContext, said: string, classSaid?: string): Promise<Resolution<PostRow>> {
	let pool: MySection[] | undefined;
	if (classSaid) {
		const c = await resolveClasses(ctx, classSaid);
		if (c.status !== 'found') return c;
		pool = c.value;
	}
	const posts = await myPosts(ctx, pool);
	const raw = said.trim();
	if (UUID.test(raw)) {
		const hit = posts.find((p) => p.id === raw.toLowerCase());
		return hit ? { status: 'found', value: hit } : { status: 'none', said, message: 'That post is not in a class you teach.' };
	}
	const t = norm(raw).replace(/^(the|my) /, '');
	const titleOf = (p: PostRow) => norm(p.title ?? p.body.slice(0, 80));
	let hits = posts.filter((p) => titleOf(p) === t);
	if (hits.length === 0) {
		const words = t.split(/\s+/).filter((w) => w.length > 1 && !['the', 'post', 'assignment', 'worksheet'].includes(w));
		hits = posts.filter((p) => words.length > 0 && words.every((w) => titleOf(p).includes(w)));
	}
	if (hits.length === 0) {
		return { status: 'none', said, message: `No post called "${said}" is in ${pool ? pool.map((p) => p.title).join(' or ') : 'a class you teach'}.` };
	}
	if (hits.length > 1) {
		return {
			status: 'ambiguous',
			said,
			candidates: hits.slice(0, 12).map((p) => ({
				post: p.title ?? p.body.slice(0, 60),
				id: p.id,
				kind: p.kind,
				classes: p.sections.map((s) => s.title),
				created: p.created_at.slice(0, 10)
			}))
		};
	}
	return { status: 'found', value: hits[0] };
}
