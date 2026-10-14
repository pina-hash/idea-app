/**
 * PROGRESSIVE FEEDBACK'S TRANSPORTS (0238): the RPCs, and an in-memory twin.
 *
 * Two shapes from one factory, and ABSENCE IS THE MECHANISM: a student's
 * transports carry no `post` and no `update`, so no surface handed them can
 * render a composer or a drawing tool, whatever its props say. Who may do what
 * is the database's; this only decides what a surface is offered.
 *
 * A missing function (0238 not applied) reads as `null` from `list`, which every
 * surface turns into no feedback region at all rather than an empty one, and
 * as the `unavailable` refusal from a write.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	normText,
	parseThread,
	parseThreads,
	refusalOf,
	type FeedbackRefusal,
	type FeedbackThread,
	type FeedbackViewer,
	type Marks
} from './notes';

export type FeedbackResult = { ok: true; thread: FeedbackThread | null } | { ok: false; reason: FeedbackRefusal };

export interface FeedbackListArgs {
	itemId?: string | null;
	studentEmail?: string | null;
	sectionId?: string | null;
}

export interface FeedbackPostArgs {
	itemId: string;
	studentEmail: string;
	blockId: string | null;
	fileId: string | null;
	body: string;
	marks: Marks | null;
}

export interface FeedbackTransports {
	/** The threads this caller may read; null where feedback is not switched on. */
	list(args: FeedbackListArgs): Promise<FeedbackThread[] | null>;
	/** Answer a thread, from either side. */
	reply(threadId: string, body: string): Promise<FeedbackResult>;
	/** Fixed it and Not fixed (a student); Resolve and Reopen (an instructor). */
	setState(threadId: string, state: 'fixed' | 'open' | 'resolved'): Promise<FeedbackResult>;
	/** A message (its author or an instructor), or a whole thread (an instructor). */
	remove(threadId: string, messageId?: string | null): Promise<FeedbackResult>;
	/** Stamp this side as having seen the item's threads (one student's, for an instructor). */
	seen(itemId: string, studentEmail?: string | null): Promise<void>;
	/** An instructor starts a thread. Absent on a student's side. */
	post?(args: FeedbackPostArgs): Promise<FeedbackResult>;
	/**
	 * An instructor changes the note or its drawing. `marks` undefined keeps the
	 * drawing, null clears it. Absent on a student's side.
	 */
	update?(threadId: string, body: string | null, marks?: Marks | null): Promise<FeedbackResult>;
}

/** A Postgres or PostgREST error that means "this function is not there". */
function missing(error: { code?: string } | null): boolean {
	return !!error && (error.code === 'PGRST202' || error.code === '42883');
}

function answer(data: unknown, error: { code?: string } | null): FeedbackResult {
	if (missing(error)) return { ok: false, reason: 'unavailable' };
	if (error) return { ok: false, reason: 'failed' };
	const raw = data as { ok?: unknown; thread?: unknown };
	if (raw?.ok === true) return { ok: true, thread: raw.thread ? parseThread(raw.thread) : null };
	return { ok: false, reason: refusalOf(raw) };
}

/** The real thing, for one side. */
export function createFeedbackTransports(supabase: SupabaseClient, side: FeedbackViewer): FeedbackTransports {
	const base: FeedbackTransports = {
		async list({ itemId = null, studentEmail = null, sectionId = null }) {
			const { data, error } = await supabase.rpc('classroom_feedback_list', {
				p_item_id: itemId,
				p_student_email: studentEmail,
				p_section_id: sectionId
			});
			if (missing(error)) return null;
			if (error) throw error;
			return parseThreads(data);
		},
		async reply(threadId, body) {
			const { data, error } = await supabase.rpc('classroom_feedback_reply', { p_thread_id: threadId, p_body: body });
			return answer(data, error);
		},
		async setState(threadId, state) {
			const { data, error } = await supabase.rpc('classroom_feedback_set_state', { p_thread_id: threadId, p_state: state });
			return answer(data, error);
		},
		async remove(threadId, messageId = null) {
			const { data, error } = await supabase.rpc('classroom_feedback_remove', {
				p_thread_id: threadId,
				p_message_id: messageId
			});
			return answer(data, error);
		},
		async seen(itemId, studentEmail = null) {
			await supabase.rpc('classroom_feedback_seen', { p_item_id: itemId, p_student_email: studentEmail });
		}
	};
	if (side === 'student') return base;
	return {
		...base,
		async post({ itemId, studentEmail, blockId, fileId, body, marks }) {
			const { data, error } = await supabase.rpc('classroom_feedback_post', {
				p_item_id: itemId,
				p_student_email: studentEmail,
				p_block_id: blockId,
				p_file_id: fileId,
				p_body: body,
				p_marks: marks
			});
			return answer(data, error);
		},
		async update(threadId, body, marks) {
			const { data, error } = await supabase.rpc('classroom_feedback_update', {
				p_thread_id: threadId,
				p_body: body,
				p_marks: marks === undefined ? null : marks === null ? { v: 1, shapes: [] } : marks
			});
			return answer(data, error);
		}
	};
}

/* ========================================================================== */
/* THE IN-MEMORY TWIN, for the dev harness and tests/dom. A real              */
/* implementation of the interface over one shared store, enforcing 0238's    */
/* rules that a surface can see: who may post and edit, that a student reads  */
/* only their own, Fixed it versus Resolve, seen never moving updatedAt.      */
/* ========================================================================== */

interface MemoryThread extends Omit<FeedbackThread, 'viewer' | 'messages'> {
	removed: boolean;
	messages: (FeedbackThread['messages'][number] & { authorKey: string; removed: boolean })[];
}

export interface MemoryFeedback {
	/** The instructor's transports (reviews every student in the store). */
	teacher: FeedbackTransports;
	/** One student's transports. */
	student(email: string): FeedbackTransports;
	/** Every live thread, as the instructor reads them. */
	all(): FeedbackThread[];
	/** Calls made, for a harness that counts them. */
	readonly calls: string[];
}

export function createMemoryFeedback(options: {
	now?: () => number;
	teacherName?: string;
	itemTitle?: (itemId: string) => string;
	studentName?: (email: string) => string;
	seed?: FeedbackThread[];
} = {}): MemoryFeedback {
	const now = options.now ?? (() => Date.now());
	const iso = () => new Date(now()).toISOString();
	const teacherName = options.teacherName ?? 'Mr. Pina';
	let seq = 0;
	const id = (p: string) => `${p}-${++seq}`;
	const calls: string[] = [];
	const store: MemoryThread[] = (options.seed ?? []).map((t) => ({
		...t,
		removed: false,
		messages: t.messages.map((m) => ({ ...m, authorKey: m.role === 'teacher' ? 'teacher' : t.studentEmail, removed: false }))
	}));

	const view = (t: MemoryThread, viewer: FeedbackViewer, me: string): FeedbackThread => ({
		...t,
		viewer,
		messages: t.messages.filter((m) => !m.removed).map(({ authorKey, removed: _r, ...m }) => ({ ...m, mine: authorKey === me }))
	});
	const find = (threadId: string) => store.find((t) => t.id === threadId && !t.removed) ?? null;

	function side(viewer: FeedbackViewer, me: string): FeedbackTransports {
		const mayRead = (t: MemoryThread) => viewer === 'teacher' || t.studentEmail === me;
		const touch = (t: MemoryThread) => {
			t.updatedAt = iso();
			if (viewer === 'teacher') t.teacherSeenAt = t.updatedAt;
			else t.studentSeenAt = t.updatedAt;
		};
		const base: FeedbackTransports = {
			async list({ itemId = null, studentEmail = null }) {
				calls.push(`${viewer}:list`);
				return store
					.filter((t) => !t.removed && mayRead(t))
					.filter((t) => !itemId || t.itemId === itemId)
					.filter((t) => !studentEmail || t.studentEmail === studentEmail)
					.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
					.map((t) => view(t, viewer, me));
			},
			async reply(threadId, body) {
				calls.push(`${viewer}:reply`);
				const t = find(threadId);
				if (!t || !mayRead(t)) return { ok: false, reason: 'not_found' };
				const words = normText(body);
				if (!words) return { ok: false, reason: 'empty' };
				if (words.length > 2000) return { ok: false, reason: 'too_long' };
				t.messages.push({
					id: id('m'),
					role: viewer,
					name: viewer === 'teacher' ? teacherName : t.studentName,
					body: words,
					createdAt: iso(),
					editedAt: null,
					mine: true,
					authorKey: me,
					removed: false
				});
				touch(t);
				return { ok: true, thread: view(t, viewer, me) };
			},
			async setState(threadId, state) {
				calls.push(`${viewer}:state:${state}`);
				const t = find(threadId);
				if (!t || !mayRead(t)) return { ok: false, reason: 'not_found' };
				if (viewer === 'student' && state === 'fixed') t.fixedAt ??= iso();
				else if (viewer === 'student' && state === 'open') t.fixedAt = null;
				else if (viewer === 'teacher' && state === 'resolved') t.resolvedAt ??= iso();
				else if (viewer === 'teacher' && state === 'open') {
					t.resolvedAt = null;
					t.fixedAt = null;
				} else return { ok: false, reason: 'state' };
				touch(t);
				return { ok: true, thread: view(t, viewer, me) };
			},
			async remove(threadId, messageId = null) {
				calls.push(`${viewer}:remove`);
				const t = find(threadId);
				if (!t || !mayRead(t)) return { ok: false, reason: 'not_found' };
				if (!messageId) {
					if (viewer !== 'teacher') return { ok: false, reason: 'not_found' };
					t.removed = true;
					return { ok: true, thread: null };
				}
				const m = t.messages.find((x) => x.id === messageId && !x.removed && (viewer === 'teacher' || x.authorKey === me));
				if (!m) return { ok: false, reason: 'not_found' };
				m.removed = true;
				t.updatedAt = iso();
				return { ok: true, thread: view(t, viewer, me) };
			},
			async seen(itemId, studentEmail = null) {
				calls.push(`${viewer}:seen`);
				for (const t of store) {
					if (t.removed || t.itemId !== itemId) continue;
					if (viewer === 'student' && t.studentEmail === me) t.studentSeenAt = t.updatedAt;
					if (viewer === 'teacher' && (!studentEmail || t.studentEmail === studentEmail)) t.teacherSeenAt = t.updatedAt;
				}
			}
		};
		if (viewer === 'student') return base;
		return {
			...base,
			async post({ itemId, studentEmail, blockId, fileId, body, marks }) {
				calls.push('teacher:post');
				const words = normText(body);
				const drawn = !!marks && marks.shapes.length > 0;
				if (!words && !drawn) return { ok: false, reason: 'empty' };
				if (words.length > 2000) return { ok: false, reason: 'too_long' };
				if (drawn && !fileId) return { ok: false, reason: 'file' };
				const at = iso();
				const t: MemoryThread = {
					id: id('t'),
					itemId,
					itemTitle: options.itemTitle?.(itemId) ?? 'Worksheet',
					studentEmail,
					studentName: options.studentName?.(studentEmail) ?? studentEmail.split('@')[0],
					blockId,
					fileId,
					marks: drawn ? marks : null,
					authorName: teacherName,
					createdAt: at,
					updatedAt: at,
					editedAt: null,
					fixedAt: null,
					resolvedAt: null,
					studentSeenAt: null,
					teacherSeenAt: at,
					sections: ['s1'],
					removed: false,
					messages: words
						? [{ id: id('m'), role: 'teacher', name: teacherName, body: words, createdAt: at, editedAt: null, mine: true, authorKey: me, removed: false }]
						: []
				};
				store.push(t);
				return { ok: true, thread: view(t, 'teacher', me) };
			},
			async update(threadId, body, marks) {
				calls.push('teacher:update');
				const t = find(threadId);
				if (!t) return { ok: false, reason: 'not_found' };
				if (marks !== undefined) t.marks = marks && marks.shapes.length ? marks : null;
				if (body !== null) {
					const words = normText(body);
					const first = t.messages.find((m) => m.role === 'teacher' && !m.removed);
					if (!words && !t.marks) return { ok: false, reason: 'empty' };
					if (first) {
						if (words) {
							first.body = words;
							first.editedAt = iso();
						} else first.removed = true;
					} else if (words) {
						t.messages.unshift({ id: id('m'), role: 'teacher', name: teacherName, body: words, createdAt: iso(), editedAt: null, mine: true, authorKey: me, removed: false });
					}
				}
				t.editedAt = iso();
				touch(t);
				return { ok: true, thread: view(t, 'teacher', me) };
			}
		};
	}

	return {
		teacher: side('teacher', 'teacher'),
		student: (email) => side('student', email),
		all: () => store.filter((t) => !t.removed).map((t) => view(t, 'teacher', 'teacher')),
		calls
	};
}
