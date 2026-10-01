/**
 * WHAT THE PROJECTOR MAY SHOW, AND HOW IT HEARS ABOUT IT (ledger 0297, package
 * LIVE).
 *
 * The teacher runs the class from a CONTROL VIEW that is private: it holds the
 * roster, presence, hand-in states and the hall pass as a manager sees it. The
 * PROJECTOR VIEW is a second window on the same machine, dragged onto the wall
 * or shown mirrored, and it may show only what the whole class may see. That is
 * Pear Deck's split between the teacher dashboard and the projected screen,
 * and the whole of its safety lives in this file:
 *
 *   1. THE PROJECTOR READS NOTHING PRIVATE. Its page load selects a class's
 *      name and asks whether the caller manages it; no roster, no email, no
 *      presence, no grade. `tests/classroom-live-projector.test.ts` drives the
 *      real load and asserts it.
 *   2. EVERYTHING IT SHOWS ARRIVES AS ONE `ProjectorFrame`, built by ONE
 *      function (`buildProjectorFrame`) from inputs that are already the
 *      class-safe projection: agenda strings, a timer, the hall pass reduced to
 *      the STUDENT-SCOPE word ("Taken" or "Free", `hallPassToolChip`'s own
 *      vocabulary for a student), and a picked name ONLY when the teacher
 *      pressed Show. The hall pass is reduced HERE, from whatever state the
 *      caller holds, so a manager payload naming who is out cannot reach the
 *      frame by being passed in.
 *   3. THE PROJECTOR RE-VALIDATES EVERY FRAME (`parseProjectorFrame`), keeping
 *      exactly the keys below and dropping anything else, so a frame that was
 *      somehow wider than this type still paints only these fields.
 *   4. WHO IS WORKING REACHES THE WALL ONLY AS COUNTS, AND ONLY WHEN THE
 *      TEACHER TURNS IT ON (reports R12, R13): the wall faces the room, so
 *      student activity is OFF until the control view's "Student activity" is
 *      pressed, and then it is five counts in the class's own words. NAMES are
 *      a SECOND, separate press ("Names too"), never adopted from a stored
 *      frame after a reload, never given for the students who are working (the
 *      bulk of a class, and nothing the room needs to read), and shortened to
 *      "First L.". Presence's detail -- times, "other tab", Missing -- never
 *      crosses at all: `buildProjectorFrame` is handed a state and a name per
 *      student and nothing else, and the parse refuses any name it should not
 *      hold.
 *
 * NO SERVER IS INVOLVED, AND THAT IS A DECISION. The two windows talk over a
 * `BroadcastChannel` named for the viewer and the class, with `localStorage` as
 * the fallback (a `storage` event reaches every other window of the origin) and
 * as the memory a freshly opened projector reads first. `live.ts`'s broadcast
 * is payload-free by rule because anybody holding the anon key can listen to
 * it; a same-browser channel is not on the network at all, which is why it may
 * carry a frame. A PHONE AS A REMOTE would need a server channel carrying these
 * frames, which is a disclosure decision for Mr. Pina, and is not built.
 *
 * A TIMER TICKS IN EACH WINDOW ON ITS OWN. The frame carries `startedAt` and
 * `bankedMs` (see `timer.ts`), so a message is sent when the teacher presses
 * something, never once a second.
 */

import { parseLiveTimer, type LiveTimer } from './timer';
import type { LiveCellState } from './grid';
import { hallPassToolChip, type HallPassState, type HallPassStudentState } from '$lib/classroom/hall-pass';

export const PROJECTOR_FRAME_VERSION = 1;

/** The hall pass as the wall says it: student scope, one word, never a name or a time. */
export type WallHallPass = { tone: 'taken' | 'free'; word: string };

/**
 * The glyph beside the word, the same pair the hall pass's own chip draws
 * (`HallPass.svelte`: a half-filled circle for taken, a hollow one for free),
 * so the wall and the card read alike. Aria-hidden wherever it is drawn: the
 * word is always beside it.
 */
export const WALL_HALL_GLYPH: Record<WallHallPass['tone'], string> = { taken: '◐', free: '○' };

/** A picked student, shown because the teacher pressed Show. The seed is what makes the pick checkable. */
export interface WallPick {
	name: string;
	seed: string;
}

/**
 * STUDENT ACTIVITY, AS THE WALL MAY SAY IT (reports R12, R13). Five groups in
 * the class's own words, built from the live grid's states. `unknown` and
 * `no-signal` are not here on purpose: they are about the instrument, and a
 * frame holding either one carries no activity at all (an instrument's silence
 * is never a count). `names` says whether a group may EVER carry names on the
 * wall: never for the students who are working.
 */
export type WallActivityKey = 'working' | 'idle' | 'away' | 'not-opened' | 'done';
export const WALL_ACTIVITY_GROUPS: readonly {
	key: WallActivityKey;
	word: string;
	from: readonly LiveCellState[];
	names: boolean;
}[] = [
	{ key: 'working', word: 'Working', from: ['working'], names: false },
	{ key: 'idle', word: 'Not typing', from: ['idle'], names: true },
	{ key: 'away', word: 'Away', from: ['away'], names: true },
	{ key: 'not-opened', word: 'Not opened yet', from: ['not-opened'], names: true },
	{ key: 'done', word: 'Done', from: ['needs-grading', 'submitted'], names: true }
];
const ACTIVITY_KEYS = WALL_ACTIVITY_GROUPS.map((g) => g.key);
const NAMED_KEYS = new Set(WALL_ACTIVITY_GROUPS.filter((g) => g.names).map((g) => g.key));

/** Activity on the wall: counts always, names only when the second toggle is on. */
export interface WallActivity {
	/** The item the counts are about, as its title. */
	item: string;
	/** When the control view last read presence (ms): the wall hides counts older than `WALL_ACTIVITY_STALE_MS`. */
	at: number;
	total: number;
	counts: Record<WallActivityKey, number>;
	/** Null unless the teacher pressed "Names too"; never a `working` entry. */
	names: Partial<Record<WallActivityKey, string[]>> | null;
}

/** What the control view hands over: a state and a name per student, and the two choices. */
export interface WallActivityInput {
	item: string;
	at: number;
	cells: readonly { state: LiveCellState; name: string }[];
	/** The second toggle. Anything but `true` is counts only. */
	names: boolean;
}

/** EVERYTHING THE WALL CAN PAINT. A field added here is a disclosure decision. */
export interface ProjectorFrame {
	v: typeof PROJECTOR_FRAME_VERSION;
	/** The school day the frame belongs to; a frame from another day is ignored. */
	day: string;
	/** When it was written (ms). The newer of two frames wins. */
	at: number;
	agenda: string[];
	timer: LiveTimer | null;
	hallPass: WallHallPass | null;
	pick: WallPick | null;
	/** "Coming up": the next assignments due after today, as the class page words them. */
	next: string[];
	/** Student activity, or null: off, not answered, or not an item that sends any. */
	activity: WallActivity | null;
}

/** The frame's keys, exactly. The privacy test holds the type to this list. */
export const PROJECTOR_FRAME_KEYS = ['v', 'day', 'at', 'agenda', 'timer', 'hallPass', 'pick', 'next', 'activity'] as const;

/** The most agenda lines, and the longest, a frame may carry: what a wall can hold. */
export const WALL_AGENDA_MAX = 12;
export const WALL_LINE_MAX = 160;
export const WALL_NAME_MAX = 80;
/** The most "Coming up" lines a frame may carry. */
export const WALL_NEXT_LINES_MAX = 3;
/** The most names one activity group may carry: a whole class, and no more. */
export const WALL_NAMES_PER_GROUP = 40;
/** The largest count a frame may say: far past any class, so a hostile number is refused. */
export const WALL_COUNT_MAX = 500;
/**
 * HOW OLD ACTIVITY MAY BE AND STILL BE ON THE WALL. The control view reads
 * presence every 30 s while it is open and in front; a control view that is
 * hidden or covered stops reading (it pauses its polls), and the wall must not
 * go on showing counts nobody is refreshing. Three minutes is six missed reads.
 */
export const WALL_ACTIVITY_STALE_MS = 3 * 60_000;

/**
 * A NAME AS THE WALL PRINTS IT: "First L.". The roster's own spellings are
 * "Last, First" and "First Last"; a single word stays as it is. Shortened
 * because the wall is read by the whole room, and a family name is more than
 * the room needs to see who is stuck. Pure; `wallNames` decides when a
 * shortened name would be ambiguous.
 */
export function wallName(name: string): string {
	const clean = String(name ?? '').replace(/\s+/g, ' ').trim();
	if (!clean) return '';
	const comma = clean.indexOf(',');
	let first: string;
	let last: string;
	if (comma > 0) {
		last = clean.slice(0, comma).trim();
		first = clean.slice(comma + 1).trim().split(' ')[0] ?? '';
	} else {
		const parts = clean.split(' ');
		if (parts.length < 2) return clean;
		first = parts[0];
		last = parts[parts.length - 1];
	}
	if (!first) return last;
	const initial = last.replace(/^[^A-Za-z\u00C0-\u024F]+/, '').charAt(0).toUpperCase();
	return initial ? `${first} ${initial}.` : first;
}

/**
 * EVERY CELL'S WALL NAME, with two students who would shorten to the same
 * "First L." given their full names instead, so the wall never shows one
 * string meaning two people. Judged over the WHOLE class, not one group, so a
 * name does not change spelling when a student moves from Away to Done.
 */
function wallNames(cells: readonly { name: string }[]): string[] {
	const short = cells.map((c) => wallName(c.name));
	const seen = new Map<string, number>();
	for (const s of short) seen.set(s, (seen.get(s) ?? 0) + 1);
	return cells.map((c, i) => {
		const full = String(c.name ?? '').replace(/\s+/g, ' ').trim();
		return (seen.get(short[i]) ?? 0) > 1 ? full : short[i];
	});
}

/**
 * THE CELLS THE WALL MAY COUNT, FROM THE LIVE GRID'S: a state and a name each,
 * nothing else (no address, no time, no "other tab", no Missing), and the
 * student who is OUT ON THE HALL PASS counted but never named. The wall says
 * the pass is "Taken" and never who took it (`hallPassWall`); an "Away" list
 * naming that student would say it for it. A blank name is counted and never
 * printed (`buildActivity` drops it).
 */
export function wallActivityCells(
	cells: readonly { email: string; state: LiveCellState; name: string }[],
	outEmail: string | null
): { state: LiveCellState; name: string }[] {
	const out = outEmail ? outEmail.trim().toLowerCase() : null;
	return cells.map((c) => ({ state: c.state, name: out && c.email.trim().toLowerCase() === out ? '' : c.name }));
}

const zeroCounts = (): Record<WallActivityKey, number> =>
	Object.fromEntries(ACTIVITY_KEYS.map((k) => [k, 0])) as Record<WallActivityKey, number>;

/**
 * THE ACTIVITY PROJECTION, inside the one function that builds the frame.
 * Null when there is no input, and null when ANY student's state is about the
 * instrument (`unknown`, `no-signal`): counts that leave somebody out are a
 * count of nothing in particular. Names only on `input.names === true`, only
 * for the groups that may ever carry them, never one with an address in it.
 */
function buildActivity(input: WallActivityInput | null | undefined): WallActivity | null {
	if (!input) return null;
	const counts = zeroCounts();
	const groupOf = new Map<LiveCellState, WallActivityKey>();
	for (const g of WALL_ACTIVITY_GROUPS) for (const s of g.from) groupOf.set(s, g.key);
	const keys: WallActivityKey[] = [];
	for (const c of input.cells) {
		const key = groupOf.get(c.state);
		if (!key) return null;
		keys.push(key);
		counts[key] += 1;
	}
	let names: WallActivity['names'] = null;
	if (input.names === true) {
		const spelled = wallNames(input.cells);
		names = {};
		for (const g of WALL_ACTIVITY_GROUPS) {
			if (!g.names) continue;
			const list = spelled
				.filter((n, i) => keys[i] === g.key && n !== '' && !n.includes('@'))
				.map((n) => n.slice(0, WALL_NAME_MAX))
				.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
				.slice(0, WALL_NAMES_PER_GROUP);
			if (list.length > 0) names[g.key] = list;
		}
	}
	return {
		item: String(input.item ?? '').slice(0, WALL_LINE_MAX),
		at: input.at,
		total: input.cells.length,
		counts,
		names
	};
}

/**
 * THE HALL PASS ON THE WALL, IN STUDENT-SCOPE WORDS, FROM ANY STATE.
 *
 * A manager's state names who is out ("1 out · Ana Reyes"), and the control
 * view holds exactly that state. So the reduction happens by BUILDING a student
 * state -- one bit, not mine, no timestamp -- and asking the hall pass's own
 * chip function for its word, which is the vocabulary a student reads on their
 * own class page. The wall and a student's phone therefore say the same word
 * for the same fact, and there is no expression here that could carry a name.
 */
export function hallPassWall(state: HallPassState | null): WallHallPass | null {
	if (!state) return null;
	const studentScope: HallPassStudentState = {
		scope: 'student',
		section_id: state.section_id,
		taken: state.taken === true,
		mine: false,
		opened_at: null
	};
	const chip = hallPassToolChip(studentScope, 0);
	return { tone: chip.tone === 'taken' ? 'taken' : 'free', word: chip.word };
}

/**
 * THE ONLY TWO SENTENCES THE WALL MAY SAY ABOUT THE PASS, read off the same
 * reduction rather than typed, so the projector's check and the chip cannot
 * come to disagree about the spelling.
 */
const WALL_HALL_WORDS: Record<WallHallPass['tone'], string> = {
	taken: hallPassWall({ scope: 'student', section_id: '', taken: true, mine: false, opened_at: null })!.word,
	free: hallPassWall({ scope: 'student', section_id: '', taken: false, mine: false, opened_at: null })!.word
};

/** The input the control view hands over. Each field is already class-safe or is reduced here. */
export interface ProjectorFrameInput {
	day: string;
	at: number;
	agenda: readonly string[];
	timer: LiveTimer | null;
	hallPass: HallPassState | null;
	pick: WallPick | null;
	/** "Coming up" lines (`wallComingUp`), when the teacher has them on the wall. */
	next?: readonly string[];
	/** Student activity, only when the teacher turned it on and presence has answered. */
	activity?: WallActivityInput | null;
}

const cleanLines = (lines: readonly unknown[], max: number) =>
	lines
		.map((l) => String(l).slice(0, WALL_LINE_MAX))
		.filter((l) => l.trim() !== '')
		.slice(0, max);

/** THE ONE PROJECTION onto the wall. */
export function buildProjectorFrame(input: ProjectorFrameInput): ProjectorFrame {
	return {
		v: PROJECTOR_FRAME_VERSION,
		day: input.day,
		at: input.at,
		agenda: cleanLines(input.agenda, WALL_AGENDA_MAX),
		timer: input.timer ? { ...input.timer } : null,
		hallPass: hallPassWall(input.hallPass),
		pick: input.pick
			? { name: String(input.pick.name).slice(0, WALL_NAME_MAX), seed: String(input.pick.seed).slice(0, 16) }
			: null,
		next: cleanLines(input.next ?? [], WALL_NEXT_LINES_MAX),
		activity: buildActivity(input.activity)
	};
}

/**
 * THE PROJECTOR'S READ OF ACTIVITY: rebuilt from the five keys only, or null.
 * Every count an integer in range, the total exactly their sum, names kept
 * only for the groups that may carry them, never more names than the group's
 * count, never one with an address in it. Anything else is no activity rather
 * than a partly trusted one.
 */
function parseActivity(value: unknown): WallActivity | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (typeof v.item !== 'string') return null;
	if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
	const c = v.counts as Record<string, unknown> | null | undefined;
	if (!c || typeof c !== 'object') return null;
	const counts = zeroCounts();
	let sum = 0;
	for (const key of ACTIVITY_KEYS) {
		const n = c[key];
		if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > WALL_COUNT_MAX) return null;
		counts[key] = n;
		sum += n;
	}
	if (Object.keys(c).some((k) => !(ACTIVITY_KEYS as string[]).includes(k))) return null;
	if (typeof v.total !== 'number' || v.total !== sum) return null;
	let names: WallActivity['names'] = null;
	if (v.names !== null && v.names !== undefined) {
		if (typeof v.names !== 'object' || Array.isArray(v.names)) return null;
		const raw = v.names as Record<string, unknown>;
		names = {};
		for (const [key, list] of Object.entries(raw)) {
			if (!NAMED_KEYS.has(key as WallActivityKey)) return null;
			if (!Array.isArray(list)) return null;
			const k = key as WallActivityKey;
			const kept = list.filter(
				(n): n is string => typeof n === 'string' && n.trim() !== '' && !n.includes('@') && n.length <= WALL_NAME_MAX
			);
			if (kept.length !== list.length || kept.length > WALL_NAMES_PER_GROUP || kept.length > counts[k]) return null;
			if (kept.length > 0) names[k] = kept;
		}
	}
	return { item: v.item.slice(0, WALL_LINE_MAX), at: v.at, total: sum, counts, names };
}

/**
 * THE PROJECTOR'S SIDE OF THE CONTRACT: a frame this build can paint, rebuilt
 * from the allowed keys only, or null. The hall-pass word must be one of the
 * two student-scope words, so a frame carrying anything else there paints no
 * hall pass rather than a sentence nobody vetted.
 */
export function parseProjectorFrame(value: unknown): ProjectorFrame | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (v.v !== PROJECTOR_FRAME_VERSION) return null;
	if (typeof v.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)) return null;
	if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
	const agenda = Array.isArray(v.agenda)
		? v.agenda
				.filter((l): l is string => typeof l === 'string' && l.trim() !== '')
				.map((l) => l.slice(0, WALL_LINE_MAX))
				.slice(0, WALL_AGENDA_MAX)
		: [];
	const timer = v.timer === null || v.timer === undefined ? null : parseLiveTimer(v.timer);
	let hallPass: WallHallPass | null = null;
	const hp = v.hallPass as Record<string, unknown> | null | undefined;
	if (hp && (hp.tone === 'taken' || hp.tone === 'free') && hp.word === WALL_HALL_WORDS[hp.tone]) {
		hallPass = { tone: hp.tone, word: hp.word };
	}
	let pick: WallPick | null = null;
	const p = v.pick as Record<string, unknown> | null | undefined;
	if (p && typeof p.name === 'string' && p.name.trim() && typeof p.seed === 'string') {
		pick = { name: p.name.slice(0, WALL_NAME_MAX), seed: p.seed.slice(0, 16) };
	}
	/*
	 * A FRAME FROM A CONTROL VIEW BUILT BEFORE THESE TWO KEYS still paints:
	 * no `next` is no lines and no `activity` is none. The version stays 1 on
	 * purpose: a projector window is never reloaded by a deploy
	 * (PROJECTOR_ROUTES), so a bumped version would freeze an open wall, where
	 * an old projector simply rebuilds the frame from the keys it knows.
	 */
	const next = Array.isArray(v.next)
		? v.next.filter((l): l is string => typeof l === 'string' && l.trim() !== '').map((l) => l.slice(0, WALL_LINE_MAX)).slice(0, WALL_NEXT_LINES_MAX)
		: [];
	const activity = parseActivity(v.activity);
	return { v: PROJECTOR_FRAME_VERSION, day: v.day, at: v.at, agenda, timer, hallPass, pick, next, activity };
}

/** Of two frames, the one to paint: the newer, and never one from another day. */
export function newerFrame(held: ProjectorFrame | null, incoming: ProjectorFrame | null, today: string): ProjectorFrame | null {
	const ok = (f: ProjectorFrame | null) => (f && f.day === today ? f : null);
	const a = ok(held);
	const b = ok(incoming);
	if (!a) return b;
	if (!b) return a;
	return b.at >= a.at ? b : a;
}

// ---------------------------------------------------------------------------
// The channel between the two windows
// ---------------------------------------------------------------------------

/**
 * WHAT CROSSES THE CHANNEL. `frame` carries the wall; `hello` is a projector
 * that just opened asking for the current frame; `here` is a projector saying
 * it is still showing, so the control view can say "On the projector" and mean
 * it; `timer` is the projector's own keyboard (Space, R) asking the control
 * view to change the timer, for a mirrored display where the teacher cannot
 * reach the control view without the class watching.
 */
export type ProjectorMessage =
	| { type: 'frame'; frame: ProjectorFrame }
	| { type: 'hello' }
	| { type: 'here' }
	| { type: 'timer'; action: 'toggle' | 'reset' };

/** A message this build understands, or null. Written by another window, so it is data. */
export function parseProjectorMessage(value: unknown): ProjectorMessage | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (v.type === 'hello' || v.type === 'here') return { type: v.type };
	if (v.type === 'timer' && (v.action === 'toggle' || v.action === 'reset')) {
		return { type: 'timer', action: v.action };
	}
	if (v.type === 'frame') {
		const frame = parseProjectorFrame(v.frame);
		return frame ? { type: 'frame', frame } : null;
	}
	return null;
}

/** One channel and one storage slot per viewer and class, namespaced like every other slot here. */
export function projectorChannelName(viewer: string, sectionId: string): string {
	return `idea-live:${viewer}:${sectionId}`;
}
export function projectorStorageKey(viewer: string, sectionId: string): string {
	return `idea_live_projector:${viewer}:${sectionId}`;
}

/** How often an open projector says it is still there, and how long the control view believes it. */
export const PROJECTOR_HERE_MS = 5_000;
export const PROJECTOR_GONE_MS = 12_000;

export interface ProjectorChannel {
	send(message: ProjectorMessage): void;
	/** The last frame this device stored, for a window that just opened. */
	stored(): ProjectorFrame | null;
	close(): void;
}

/** What the channel needs from the page, injected so a test can hand it fakes. */
export interface ProjectorChannelHost {
	BroadcastChannel?: typeof BroadcastChannel;
	storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
	addStorageListener?: (fn: (e: { key: string | null; newValue: string | null }) => void) => () => void;
}

function browserHost(): ProjectorChannelHost {
	if (typeof window === 'undefined') return {};
	let storage: Storage | null = null;
	try {
		storage = window.localStorage;
	} catch {
		storage = null;
	}
	return {
		BroadcastChannel: typeof BroadcastChannel === 'function' ? BroadcastChannel : undefined,
		storage,
		addStorageListener(fn) {
			const handler = (e: StorageEvent) => fn({ key: e.key, newValue: e.newValue });
			window.addEventListener('storage', handler);
			return () => window.removeEventListener('storage', handler);
		}
	};
}

/**
 * OPEN THE CHANNEL. Every message goes over the `BroadcastChannel` when there is
 * one; a frame is ALSO written to storage, which is what a projector opened
 * later reads first and what the `storage` event carries where there is no
 * `BroadcastChannel`. Non-frame messages fall back to their own storage key
 * (with a stamp, so two identical messages still fire an event). Every storage
 * call is wrapped: a blocked or full storage costs the fallback, never a throw
 * into the page.
 */
export function openProjectorChannel(
	viewer: string,
	sectionId: string,
	onMessage: (message: ProjectorMessage) => void,
	host: ProjectorChannelHost = browserHost()
): ProjectorChannel {
	const key = projectorStorageKey(viewer, sectionId);
	const signalKey = `${key}:signal`;
	let bc: BroadcastChannel | null = null;
	try {
		bc = host.BroadcastChannel ? new host.BroadcastChannel(projectorChannelName(viewer, sectionId)) : null;
	} catch {
		bc = null;
	}
	if (bc) {
		bc.onmessage = (e: MessageEvent) => {
			const m = parseProjectorMessage(e.data);
			if (m) onMessage(m);
		};
	}
	const stopStorage = host.addStorageListener?.((e) => {
		if (!e.newValue) return;
		try {
			if (e.key === key) {
				const frame = parseProjectorFrame(JSON.parse(e.newValue));
				if (frame) onMessage({ type: 'frame', frame });
			} else if (e.key === signalKey && !bc) {
				const m = parseProjectorMessage(JSON.parse(e.newValue));
				if (m && m.type !== 'frame') onMessage(m);
			}
		} catch {
			/* Another window's bytes; unreadable is simply ignored. */
		}
	});
	let closed = false;
	return {
		send(message) {
			if (closed) return;
			try {
				bc?.postMessage(message);
			} catch {
				/* A closed channel on the other side is not this window's problem. */
			}
			try {
				if (message.type === 'frame') host.storage?.setItem(key, JSON.stringify(message.frame));
				else if (!bc) host.storage?.setItem(signalKey, JSON.stringify({ ...message, t: Date.now() }));
			} catch {
				/* Storage refused: the channel still carried it where there is one. */
			}
		},
		stored() {
			try {
				const raw = host.storage?.getItem(key);
				return raw ? parseProjectorFrame(JSON.parse(raw)) : null;
			} catch {
				return null;
			}
		},
		close() {
			closed = true;
			stopStorage?.();
			try {
				bc?.close();
			} catch {
				/* Already closed. */
			}
		}
	};
}
