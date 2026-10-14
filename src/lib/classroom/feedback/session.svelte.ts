/**
 * ONE PERSON'S VIEW OF THE FEEDBACK ON ONE PIECE OF WORK (0238, decision 60):
 * the threads, how they were last read, and the writes that change them.
 *
 * Built by the ROUTE (the student's item page) or by the grading console for
 * the student it has open, and read by every surface on that page: the panel
 * that lists the notes and the worksheet frame that pins them in place and
 * draws them over the pictures. One state, so the pin and the list can never
 * disagree about what a note says or whether it is resolved.
 *
 * IT FETCHES ONLY WHEN TOLD TO. The item page's call budget is spent, so a
 * student's copy re-reads when the heartbeat says the feedback moved
 * (`noteStamp`), when the class's live notice says so (`noticed`), and once on
 * open; it runs no interval of its own. The instructor's copy is driven by the
 * console. A write answers with the thread as it now stands, so the writer's own
 * screen moves without a second read.
 *
 * NOTHING HERE DECIDES WHO MAY DO WHAT. A student's transports carry no `post`
 * and no `update`, and every write is re-checked by 0238's definer functions.
 */
import {
	FEEDBACK_REFUSAL_WORDS,
	feedbackStamp,
	threadUnseen,
	type FeedbackThread,
	type FeedbackViewer,
	type Marks
} from './notes';
import type { FeedbackPostArgs, FeedbackResult, FeedbackTransports } from './transports';

export type FeedbackLoadState = 'pending' | 'ready' | 'unavailable' | 'failed';

/** A picture an instructor is drawing on: a new note on it, or an existing note's drawing again. */
export interface DrawingTarget {
	src: string;
	alt: string;
	fileId: string;
	blockId: string | null;
	threadId?: string | null;
	initialMarks?: Marks | null;
	initialBody?: string;
}

export interface FeedbackSessionOptions {
	transports: FeedbackTransports;
	side: FeedbackViewer;
	/** The work the notes are on; null is every note this caller may read (the instructor's inbox). */
	itemId: string | null;
	/** The student the instructor is reading; the student's own page leaves it null. */
	studentEmail?: string | null;
	/** Called after a write landed, so the page can tell the class (`ClassroomLive`). */
	onwrote?: ((thread: FeedbackThread | null) => void) | null;
	/** Threads a load already read; null is a database without 0238. Absent starts pending. */
	seed?: FeedbackThread[] | null;
}

export class FeedbackSession {
	readonly side: FeedbackViewer;
	readonly itemId: string | null;
	readonly studentEmail: string | null;
	readonly transports: FeedbackTransports;
	#onwrote: ((thread: FeedbackThread | null) => void) | null;

	threads = $state<FeedbackThread[]>([]);
	state = $state<FeedbackLoadState>('pending');
	/** The thread a pin asked the panel to show, and when (so a second press of the same pin still scrolls). */
	focus = $state<{ id: string; at: number } | null>(null);
	/** The picture being drawn on right now, or null. Only an instructor's session ever holds one. */
	drawing = $state<DrawingTarget | null>(null);

	#reading: Promise<boolean> | null = null;
	#again = false;
	#lastStamp: string | null = null;
	#destroyed = false;

	constructor(options: FeedbackSessionOptions) {
		this.side = options.side;
		this.itemId = options.itemId;
		this.studentEmail = options.studentEmail ?? null;
		this.transports = options.transports;
		this.#onwrote = options.onwrote ?? null;
		if (options.seed !== undefined) {
			this.state = options.seed === null ? 'unavailable' : 'ready';
			this.threads = options.seed ?? [];
			this.#lastStamp = feedbackStamp(this.threads);
		}
	}

	/** May this side start a note and draw (an instructor's transports, not a student's). */
	get canPost(): boolean {
		return !!this.transports.post;
	}

	/** Threads not yet read by this side. */
	get unseenCount(): number {
		return this.threads.filter((t) => threadUnseen(t, this.side)).length;
	}

	/**
	 * Read the threads again. Calls that arrive while a read is in flight fold
	 * into ONE more read after it, so a burst of notices costs two reads, never
	 * a pile.
	 */
	refresh(): Promise<boolean> {
		if (this.#destroyed) return Promise.resolve(false);
		if (this.#reading) {
			this.#again = true;
			return this.#reading;
		}
		this.#reading = (async () => {
			try {
				do {
					this.#again = false;
					const list = await this.transports.list({
						itemId: this.itemId,
						studentEmail: this.side === 'teacher' ? this.studentEmail : null
					});
					if (this.#destroyed) return false;
					if (list === null) {
						this.state = 'unavailable';
						this.threads = [];
					} else {
						this.state = 'ready';
						this.threads = list;
						this.#lastStamp = feedbackStamp(list);
					}
				} while (this.#again && !this.#destroyed);
				return true;
			} catch {
				// Keep what was on screen; say the read failed only when nothing ever arrived.
				if (!this.#destroyed && this.state === 'pending') this.state = 'failed';
				return false;
			} finally {
				this.#reading = null;
			}
		})();
		return this.#reading;
	}

	/**
	 * THE HEARTBEAT'S ANSWER: when this student's feedback on the item last
	 * moved. Re-read only when it differs from what this copy last read, which is
	 * the whole point of riding the beat rather than polling.
	 */
	noteStamp(at: string | null | undefined): void {
		if (this.state === 'unavailable') return;
		const next = at ?? null;
		if (next === this.#lastStamp) return;
		if (next && this.#lastStamp && Date.parse(next) <= Date.parse(this.#lastStamp)) return;
		void this.refresh();
	}

	/** A live notice said feedback moved somewhere in the class. */
	noticed(): void {
		if (this.state === 'unavailable') return;
		void this.refresh();
	}

	/**
	 * STAMP THIS SIDE AS HAVING SEEN WHAT IS ON SCREEN. Local copies take the
	 * stamp at once (to the thread's own `updatedAt`, which is what the database
	 * compares), so the unread marks go the moment the person has looked rather
	 * than at the next read.
	 */
	async markSeen(): Promise<void> {
		if (this.state !== 'ready' || !this.itemId || !this.threads.some((t) => threadUnseen(t, this.side))) return;
		const itemId = this.itemId;
		const stamp = new Date().toISOString();
		this.threads = this.threads.map((t) =>
			this.side === 'student'
				? { ...t, studentSeenAt: stamp > t.updatedAt ? stamp : t.updatedAt }
				: { ...t, teacherSeenAt: stamp > t.updatedAt ? stamp : t.updatedAt }
		);
		try {
			await this.transports.seen(itemId, this.side === 'teacher' ? this.studentEmail : null);
		} catch {
			/* Best effort: an unstamped receipt costs a mark that clears next time. */
		}
	}

	/**
	 * STAMP ONE THREAD'S STUDENT-AND-ITEM AS SEEN, for the inbox, where a row
	 * opened is the look. The database stamps every thread of that student on
	 * that item, which is what the instructor has in front of them once the
	 * work opens, so the local copy does the same.
	 */
	async markThreadSeen(thread: FeedbackThread): Promise<void> {
		if (!threadUnseen(thread, this.side)) return;
		const stamp = new Date().toISOString();
		const same = (t: FeedbackThread) => t.itemId === thread.itemId && t.studentEmail === thread.studentEmail;
		this.threads = this.threads.map((t) =>
			!same(t)
				? t
				: this.side === 'student'
					? { ...t, studentSeenAt: stamp > t.updatedAt ? stamp : t.updatedAt }
					: { ...t, teacherSeenAt: stamp > t.updatedAt ? stamp : t.updatedAt }
		);
		try {
			await this.transports.seen(thread.itemId, this.side === 'teacher' ? thread.studentEmail : null);
		} catch {
			/* Best effort. */
		}
	}

	/** Ask the panel to show one thread (a pin over the worksheet was pressed). */
	show(threadId: string): void {
		this.focus = { id: threadId, at: Date.now() };
	}

	/* ------------------------------------------------------------------ */
	/* Writes. Each resolves to null when it landed, or the sentence that */
	/* says why not, which the surface shows where the person was typing. */
	/* ------------------------------------------------------------------ */

	#apply(result: FeedbackResult, threadId: string | null): string | null {
		if (!result.ok) {
			if (result.reason === 'unavailable') this.state = 'unavailable';
			return FEEDBACK_REFUSAL_WORDS[result.reason];
		}
		const thread = result.thread;
		if (thread) {
			const at = this.threads.findIndex((t) => t.id === thread.id);
			this.threads = at >= 0 ? this.threads.map((t, i) => (i === at ? thread : t)) : [thread, ...this.threads];
			this.#lastStamp = feedbackStamp(this.threads);
		} else if (threadId) {
			this.threads = this.threads.filter((t) => t.id !== threadId);
		}
		this.#onwrote?.(thread);
		return null;
	}

	async #run(threadId: string | null, call: () => Promise<FeedbackResult>): Promise<string | null> {
		try {
			return this.#apply(await call(), threadId);
		} catch {
			return FEEDBACK_REFUSAL_WORDS.failed;
		}
	}

	post(args: Omit<FeedbackPostArgs, 'itemId' | 'studentEmail'>): Promise<string | null> {
		const post = this.transports.post;
		if (!post || !this.studentEmail || !this.itemId) return Promise.resolve(FEEDBACK_REFUSAL_WORDS.not_found);
		const email = this.studentEmail;
		const itemId = this.itemId;
		return this.#run(null, () => post({ ...args, itemId, studentEmail: email }));
	}

	update(threadId: string, body: string | null, marks?: Marks | null): Promise<string | null> {
		const update = this.transports.update;
		if (!update) return Promise.resolve(FEEDBACK_REFUSAL_WORDS.not_found);
		return this.#run(threadId, () => update(threadId, body, marks));
	}

	reply(threadId: string, body: string): Promise<string | null> {
		return this.#run(threadId, () => this.transports.reply(threadId, body));
	}

	setState(threadId: string, state: 'fixed' | 'open' | 'resolved'): Promise<string | null> {
		return this.#run(threadId, () => this.transports.setState(threadId, state));
	}

	remove(threadId: string, messageId: string | null = null): Promise<string | null> {
		return this.#run(messageId ? null : threadId, () => this.transports.remove(threadId, messageId));
	}

	/** Open the drawing tool on a picture. A student's session cannot. */
	startDrawing(target: DrawingTarget): void {
		if (this.canPost) this.drawing = target;
	}

	endDrawing(): void {
		this.drawing = null;
	}

	/**
	 * THE DRAWING TOOL'S SAVE: a new note with the drawing on that picture, or
	 * the existing note's drawing and words replaced. Resolves to null when it
	 * landed (the tool then closes) or the sentence saying why not (it stays
	 * open with everything still drawn).
	 */
	async saveDrawing(marks: Marks, body: string): Promise<string | null> {
		const target = this.drawing;
		if (!target) return FEEDBACK_REFUSAL_WORDS.not_found;
		const why = target.threadId
			? await this.update(target.threadId, body, marks)
			: await this.post({ blockId: target.blockId, fileId: target.fileId, body, marks });
		return why;
	}

	destroy(): void {
		this.#destroyed = true;
	}
}
