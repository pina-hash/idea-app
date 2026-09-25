/**
 * LIVE SYNC FOR THE DIRECT MODELER (feedback R34, the no-migration half of
 * decision 38). Pure: no Svelte, no Supabase, no clock. `SolidWorkspace`
 * holds one `SolidLiveState`, feeds it what happened, and asks `liveDecide`
 * what to do; the route hands in a `SolidLiveTransport` and an absent one
 * removes the whole layer.
 *
 * THE DATABASE IS THE ONLY THING THAT CAN MOVE THIS SESSION'S MODEL, and that
 * is the rule "no frame can write state" applied to the direct modeler. After
 * each accepted save the workspace broadcasts a PING, `{documentId, conceptId,
 * revision}` and nothing else, on the document's private `ideacad-doc:<id>`
 * topic (0211's policies, which 0216 widened to solid-v1 writers). A receiver
 * never takes the revision in a ping as a fact: a ping only asks for a
 * database read sooner. `remote` below is set by `liveHead` (the concept's
 * committed revision, read from the table) and by nothing else.
 *
 * THE POLL IS THE FLOOR, THE PING IS THE SPEED LAYER. A session reads the
 * committed revision every `SOLID_LIVE_POLL_MS` and whenever its window comes
 * back into focus, whether or not the channel is live, so a refused or
 * dropped channel costs a delay and never a missed change.
 *
 * WHAT HAPPENS WHEN THE DATABASE IS AHEAD depends on the session:
 *   - CLEAN and idle: pull the missing history rows after the session's own
 *     last committed row, replay them, and say who changed it.
 *   - DIRTY (unsaved or unsent work): keep every bit of it and say, in words,
 *     that a newer version exists, with a control to load it after a backup.
 *     Loading discards local work only after a second, explicit press.
 *   - A SAVE IN FLIGHT: wait. The newer revision may be this session's own
 *     write, and telling somebody "another person changed this" about their
 *     own save is a false claim.
 *   - BUSY (a drag, an open sketch, the rollback bar, the time-lapse, a menu):
 *     wait, and say a newer version is waiting. Replacing the model under a
 *     gesture is the one thing this layer must never do.
 */
import { ideacadDocumentChannelName, type IdeacadLive, type IdeacadLiveStatus, type IdeacadPing } from '../live';
import { stateAt } from '../history';
import { canonical, groupHistory, type DirectRow, type HistoryPage } from './history';
import { timelineActors, type TimelineEntry } from '../ui/timeline';
import type { GeometryArtifact } from './types';

/** The poll floor, inside the 10 to 15 s window decision 38's build note asked for. */
export const SOLID_LIVE_POLL_MS = 12_000;
/** How often the workspace re-asks `liveDecide` with no network: a session that was busy picks up a waiting version within a second of finishing. */
export const SOLID_LIVE_TICK_MS = 1_000;

/* -------------------------------------------------------------------------
 * 1. THE TRANSPORT
 * ---------------------------------------------------------------------- */

/** What a pull brings back: the rows after the session's last committed one, the head it pinned, and the BREP bytes those rows name that the session did not hold. */
export interface SolidPull { rows: DirectRow[]; head: number; artifacts: GeometryArtifact[] }
export interface SolidLiveHandlers { ping(p: IdeacadPing): void; status(s: IdeacadLiveStatus): void }
export interface SolidLiveConnection { send(p: IdeacadPing): void; close(): void }
/**
 * The live layer's server calls. OPTIONAL AS A WHOLE: `SolidWorkspace` renders
 * no live word, runs no poll and sends no ping when the route hands in none,
 * so a harness mounts without it and a surface cannot half-wire it.
 */
export interface SolidLiveTransport {
	/** The broadcast speed layer. Absent means the poll alone, which the status word says. */
	connect?(documentId: string, handlers: SolidLiveHandlers): SolidLiveConnection;
	/** The poll floor: the concept's committed revision, read from the database. */
	head(conceptId: string): Promise<number>;
	/** History rows with seq greater than `afterSeq`; with `artifacts`, the verified bytes they name that `have` lacks. */
	pull(input: { documentId: string; conceptId: string; afterSeq: number; have: ReadonlySet<string>; artifacts: boolean }): Promise<SolidPull>;
	/** The reader's own address, so their own edits from another window read "you". */
	viewerEmail?: string | null;
}

/**
 * Adapt an `IdeacadLive` (the real private-channel client or the in-memory
 * bus) into one document's connection. A live object that cannot carry
 * document pings reports `refused` at once, which the word renders as
 * "Live unavailable" and the poll covers. `release` runs on close, which is
 * where a per-connection client is destroyed.
 */
export function connectIdeacadLive(live: IdeacadLive, documentId: string, handlers: SolidLiveHandlers, release?: () => void): SolidLiveConnection {
	const name = ideacadDocumentChannelName(documentId);
	if (!live.subscribeDocumentPings || !live.sendDocumentPing) {
		handlers.status('refused');
		return { send() {}, close() { release?.(); } };
	}
	let open = true;
	const offStatus = live.onStatus?.((channel, status) => { if (open && channel === name) handlers.status(status); });
	const offPing = live.subscribeDocumentPings(documentId, (p) => { if (open) handlers.ping(p); });
	const now = live.statusOf?.(name);
	if (now) handlers.status(now);
	return {
		send(p) { if (open) live.sendDocumentPing?.({ documentId: p.documentId, conceptId: p.conceptId, revision: p.revision }); },
		close() { if (!open) return; open = false; offStatus?.(); offPing(); release?.(); }
	};
}

/* -------------------------------------------------------------------------
 * 2. THE STATE AND THE ONE DECISION
 * ---------------------------------------------------------------------- */

export interface SolidLiveState {
	readonly documentId: string;
	readonly conceptId: string;
	/** The committed revision this session holds as the server's. */
	readonly local: number;
	/** The highest committed revision the DATABASE has reported. A ping never sets this. */
	readonly remote: number;
	/** The highest revision a ping has claimed. Only a reason to read sooner. */
	readonly hint: number;
}

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 1;

export function liveStart(documentId: string, conceptId: string, revision: number): SolidLiveState {
	const r = whole(revision) ? revision : 1;
	return { documentId, conceptId, local: r, remote: r, hint: r };
}

/**
 * A ping arrived. It is IGNORED (the same object comes back) when it names
 * another document or concept, carries no whole revision, or claims nothing
 * newer than what is already known -- which covers this session's own echo, a
 * duplicate, and an older ping arriving after a newer one.
 */
export function livePing(state: SolidLiveState, ping: IdeacadPing | null | undefined): SolidLiveState {
	if (!ping || ping.documentId !== state.documentId || ping.conceptId !== state.conceptId || !whole(ping.revision)) return state;
	if (ping.revision <= Math.max(state.local, state.remote, state.hint)) return state;
	return { ...state, hint: ping.revision };
}

/** Has a ping asked for a database read that has not happened yet? */
export function liveNeedsRead(state: SolidLiveState): boolean {
	return state.hint > Math.max(state.local, state.remote);
}

/**
 * The database answered. `remote` only moves forward, so a read that started
 * before a newer one and finished after it cannot take the answer back. The
 * hint is settled either way: a ping claiming more than the database holds
 * was wrong or early, and the next ping or poll will say so again if not.
 */
export function liveHead(state: SolidLiveState, revision: number): SolidLiveState {
	if (!whole(revision)) return state;
	const remote = Math.max(state.remote, revision);
	return { ...state, remote, hint: Math.max(state.local, remote) };
}

/** This session's own save was accepted at `revision`. */
export function liveSaved(state: SolidLiveState, revision: number): SolidLiveState {
	if (!whole(revision)) return state;
	const local = Math.max(state.local, revision);
	return { ...state, local, remote: Math.max(state.remote, local), hint: Math.max(state.hint, local) };
}

/** The session now holds `revision` from the server (a pull replayed, or the document reopened). */
export function liveLoaded(state: SolidLiveState, revision: number): SolidLiveState {
	if (!whole(revision)) return state;
	return { ...state, local: revision, remote: Math.max(state.remote, revision), hint: Math.max(state.hint, revision) };
}

export interface LiveSession {
	/** Unsaved actions, a failed save, or anything else the server has not acknowledged. */
	pending: boolean;
	/** A save is on the wire right now. */
	writing: boolean;
	/** Nothing is being dragged, drawn, rolled back, time-lapsed or chosen from a menu. */
	idle: boolean;
}
export type LiveAction = 'current' | 'pull' | 'offer' | 'wait';

/**
 * THE DECISION, AND THE ORDER IS THE RULE. `writing` is weighed before
 * `pending` because a write in flight is both, and the newer revision the
 * database reports may be that very write; `pending` before `idle` because a
 * session with unsaved work is told at once, busy or not.
 */
export function liveDecide(state: SolidLiveState, session: LiveSession): LiveAction {
	if (state.remote <= state.local) return 'current';
	if (session.writing) return 'wait';
	if (session.pending) return 'offer';
	if (!session.idle) return 'wait';
	return 'pull';
}

/* -------------------------------------------------------------------------
 * 3. THE HISTORY ARITHMETIC
 * ---------------------------------------------------------------------- */

/**
 * The seq of the last row this session knows the server holds. The history
 * array also carries this session's own UNSAVED rows (`record()` appends them
 * before the save lands), so the answer is the last row of the last operation
 * at or below the committed revision, never `history.length - 1`.
 */
export function committedSeq(history: readonly DirectRow[], revision: number): number {
	let last = 0;
	for (const group of groupHistory([...history])) if (group.revision <= revision) last = group.lastSeq;
	return last;
}

/**
 * The rows after `afterSeq`, read page by page and pinned to the first page's
 * head -- `readPinnedHistory`'s rules, started part way. The history RPC
 * repeats the origin row on every page (`seq = 0` is always in its answer), so
 * anything at or below `afterSeq` is dropped rather than trusted.
 */
export async function readHistoryAfter(fetchPage: (after: number, limit: number) => Promise<HistoryPage>, afterSeq: number, limit = 2000) {
	if (!Number.isSafeInteger(afterSeq) || afterSeq < 0) throw Error('Invalid history position.');
	const bySeq = new Map<number, DirectRow>();
	let cursor = afterSeq, head: number | undefined;
	do {
		const page = await fetchPage(cursor, Math.max(2, limit));
		head ??= page.newestSeq;
		if (!Number.isSafeInteger(head) || head < 0) throw Error('Invalid history head.');
		let next = cursor;
		for (const row of page.rows) {
			if (row.seq <= afterSeq || row.seq > head) continue;
			if (row.seq > next) next = row.seq;
			const prior = bySeq.get(row.seq);
			if (prior && canonical(prior) !== canonical(row)) throw Error('A stored history row changed.');
			bySeq.set(row.seq, row);
		}
		if (next === cursor && cursor < head) throw Error('History pagination made no progress.');
		cursor = next;
	} while (cursor < head!);
	const rows = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
	if (rows.some((r, i) => r.seq !== afterSeq + 1 + i)) throw Error('History has a missing row.');
	return { rows, head: head! };
}

/**
 * Append pulled rows to a CLEAN session's history and say where that lands.
 * Null when there is nothing to add. It refuses rather than guesses: the rows
 * must continue this history exactly, and the combined log must still group
 * into valid operations (`groupHistory` is the one validator), so a pull that
 * raced a reopen, or a history that is not this one, never reaches the model.
 * Whole operations are the READ's guarantee rather than this function's: a
 * save commits all of an operation's rows in one transaction and
 * `readHistoryAfter` pins to a committed head, so a pull never ends inside one.
 */
export interface PulledModel<T> { history: DirectRow[]; revision: number; manifest: T; lastSeq: number }
export function appendPulled<T>(history: readonly DirectRow[], rows: readonly DirectRow[]): PulledModel<T> | null {
	if (!rows.length) return null;
	if (rows[0].seq !== history.length) throw Error('The newer version does not continue this model.');
	const combined = [...history, ...rows];
	const groups = groupHistory(combined);
	const lastSeq = combined[combined.length - 1].seq;
	return { history: combined, revision: groups.at(-1)?.revision ?? 1, manifest: stateAt<T>(combined, lastSeq), lastSeq };
}

/** Every BREP artifact hash named anywhere in these values: the manifest's bodies and every history row's before and after. */
export function artifactHashes(...values: unknown[]): Set<string> {
	const hashes = new Set<string>();
	const collect = (v: unknown) => {
		if (!v || typeof v !== 'object') return;
		for (const [key, value] of Object.entries(v)) {
			if (key === 'artifact' && typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) hashes.add(value);
			else collect(value);
		}
	};
	for (const v of values) collect(v);
	return hashes;
}

/* -------------------------------------------------------------------------
 * 4. THE WORDS
 * ---------------------------------------------------------------------- */

export const LIVE_WORDS = {
	live: 'Live',
	connecting: 'Connecting',
	unavailable: 'Live unavailable',
	liveDetail: 'Changes other editors save appear here as they happen.',
	unavailableDetail: `Live updates are unavailable. This model still checks for saved changes every ${SOLID_LIVE_POLL_MS / 1000} seconds.`,
	waiting: 'A newer version is waiting. It loads when you finish what you are doing.',
	newerHeading: 'A newer version exists',
	kept: 'Your unsaved changes are still here and have not been sent.',
	load: 'Load newer version',
	loadConfirm: 'Discard your unsaved changes and load the newer version? Save a backup first to keep them.',
	loadConfirmed: 'Discard mine and load'
} as const;

/** The word for the channel. "Cannot tell" (no status yet) reads as connecting, never as live. */
export function liveStatusWord(status: IdeacadLiveStatus | undefined): string {
	return status === 'live' ? LIVE_WORDS.live : status === 'refused' ? LIVE_WORDS.unavailable : LIVE_WORDS.connecting;
}
export function liveStatusDetail(status: IdeacadLiveStatus | undefined): string {
	return status === 'live' ? LIVE_WORDS.liveDetail : LIVE_WORDS.unavailableDetail;
}

/**
 * Who made these rows, in the order the log names them. `timelineActors` is
 * the one rule for turning a stored address into a label (it makes the
 * reader's own rows "You", refuses to name `system` as a person, and falls
 * back to the full address where two people share a local part), so this
 * asks it rather than splitting an address a second time.
 */
export function changedBy(rows: readonly DirectRow[], viewerEmail: string | null | undefined): string[] {
	const entries = rows.map((r) => ({ actor: r.actor ?? null })) as unknown as TimelineEntry[];
	const actors = timelineActors(entries, viewerEmail);
	const out: string[] = [];
	for (const r of rows) {
		const who = r.actor ? actors.get(r.actor.trim()) : undefined;
		if (!who || who.isSystem || out.includes(who.label)) continue;
		out.push(who.label);
	}
	return out;
}

const you = (label: string) => (label === 'You' ? 'you' : label);
function names(labels: readonly string[]): string {
	if (labels.length === 1) return you(labels[0]);
	if (labels.length === 2) return `${you(labels[0])} and ${you(labels[1])}`;
	return `${you(labels[0])} and ${labels.length - 1} others`;
}

/** The note a clean session shows after a pull replayed. */
export function updatedSentence(labels: readonly string[]): string {
	if (!labels.length) return 'Updated from another session';
	if (labels.length === 1 && labels[0] === 'You') return 'Updated by you in another window';
	return `Updated by ${names(labels)}`;
}

/** The line a dirty session reads about the newer version it has not loaded. */
export function newerSentence(labels: readonly string[]): string {
	if (!labels.length) return 'Someone saved a newer version of this model.';
	if (labels.length === 1 && labels[0] === 'You') return 'You saved a newer version of this model in another window.';
	const who = names(labels);
	return `${who[0].toUpperCase()}${who.slice(1)} saved a newer version of this model.`;
}
