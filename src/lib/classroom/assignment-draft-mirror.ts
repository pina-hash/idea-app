/**
 * A STUDENT'S ANSWERS, MIRRORED INTO THIS BROWSER, so a tab that dies takes
 * nothing with it.
 *
 * WHAT THIS EXISTS FOR, MEASURED RATHER THAN REASONED. `AssignmentEngine`
 * autosaves on an 800ms debounce, and every keystroke CANCELS and re-arms that
 * timer -- so the window is not 800ms, it is the whole of the typing plus
 * 800ms. Driven against the real component in `tests/dom/`: sixty characters
 * typed at a hundred and ten milliseconds a character produced **zero**
 * dispatches over 6694ms and **zero** bytes in `localStorage`. The sentence
 * existed in one `$state` record and nowhere else. A tab the browser reclaims
 * inside that window loses it with nothing dispatched, so nothing fails,
 * nothing is reported, and the student simply finds their answer gone.
 *
 * `SaveState`'s durability net DOES fire here (`save.attach()`), and it is not
 * the answer. It dispatches an ordinary `supabase.rpc` -- a plain `fetch`, no
 * `keepalive` and no beacon -- one round trip per dirty block, awaited in turn.
 * A page being frozen or unloaded is free to abandon every one of them, and
 * the more blocks are dirty the more certainly it does. The net is the write
 * that reaches the server; this is the copy that survives when it cannot
 * (IDEA_INTERFACE_STANDARDS 2.11).
 *
 * IT IS A MIRROR, NEVER A SOURCE OF TRUTH. Nothing reads it except a fresh
 * mount that finds one, and the only thing it can do is put unsaved answers
 * back into the fields for the ordinary save path to send. It carries no
 * authorization, decides nothing about who may write, and a browser that
 * refuses storage entirely costs the recovery and nothing else.
 *
 * THE NOTEBOOK'S CONTRACT, FOLLOWED RATHER THAN REDESIGNED. Key shape, age
 * cap, debounce, sweep-and-retry on quota, the drop-an-unknown-shape rule and
 * the never-throw rule are all `src/lib/notebook/draft-mirror.ts`'s, which is
 * the pattern this copies. What differs is only what a slot HOLDS -- a
 * notebook entry is one document, an assignment is many blocks with their own
 * value shapes -- and what a restore has to decide, because an assignment's
 * server rows can have moved under the mirror one block at a time.
 *
 * Pure and client-safe: no Svelte, no Supabase, no transports.
 */

import { serializeForBaseline } from '$lib/edit-baseline.svelte';
import {
	DECLARATION_BLOCK_ID,
	type AssignmentSpec,
	type InteractiveBlock,
	type ResponseValue
} from '$lib/classroom/assignment-spec';

/**
 * NAMESPACED ALONGSIDE THE CONVENTIONS ALREADY IN THIS BROWSER --
 * `notebook_draft_mirror:`, `notebook_pending_capture` and VANGUARD's
 * `vanguard_*` -- so a sweep of this feature's storage is one prefix match and
 * cannot catch any of them.
 *
 * The full key is `assignment_draft_mirror:<viewer>:<item>`:
 *
 *   viewer  the signed-in caller's own id, so a shared school desktop can hold
 *           two students' mirrors without either restoring the other's work.
 *   item    the assignment. KEYED, rather than one slot, because a student
 *           with two assignments open in two tabs would otherwise overwrite
 *           one with the other and the loser would be an answer nobody can get
 *           back.
 */
export const ASSIGNMENT_MIRROR_PREFIX = 'assignment_draft_mirror:';

/**
 * Past this a mirror is treated as abandoned rather than as lost work.
 *
 * Twenty-four hours, the notebook's figure and for the notebook's reason:
 * these are shared school lab machines, the slot holds unsaved answers in
 * plain, unencrypted `localStorage`, and it is not swept on sign-out -- so the
 * exposure window is the thing this bounds, not how long a student might
 * plausibly want their answer back.
 */
export const ASSIGNMENT_MIRROR_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * How long the engine waits after a keystroke before mirroring.
 *
 * HALF THE SAVE DEBOUNCE, AND THAT RATIO IS THE WHOLE POINT. A mirror written
 * on the same 800ms schedule as the write it is insuring would be empty in
 * exactly the window the write is missing. 400ms is the notebook's figure and
 * needs no second argument.
 */
export const ASSIGNMENT_MIRROR_DEBOUNCE_MS = 400;

/**
 * WHAT ONE SLOT HOLDS.
 *
 * `values` is EVERY block the engine is holding, not only the ones marked
 * dirty. A dirty set is bookkeeping the engine keeps in a plain `Set` for its
 * own write loop; deciding what is worth restoring from a comparison against
 * `baseline` needs no such bookkeeping, cannot drift out of step with it, and
 * is the same question the read side has to ask anyway. The volume is a
 * handful of answers.
 */
export interface AssignmentMirror {
	/** Shape version. An older or unknown one is DROPPED, never guessed at. */
	v: 1;
	/** Client clock, for the age cap only. Nothing authorizes on it. */
	at: number;
	/** The assignment these answers belong to. */
	itemId: string;
	/** Every block's working value, exactly as the renderer reported it. */
	values: Record<string, ResponseValue>;
	/**
	 * WHAT THE SERVER HAD ACKNOWLEDGED FOR EACH BLOCK when this was written,
	 * per block, through `serializeForBaseline` -- the SAME serializer
	 * `EditBaseline` uses, so "the same value" means one thing across the two
	 * sides rather than two.
	 *
	 * This is the half that makes a safe restore possible at all. Without it a
	 * mirror can only say "here is what was on screen", and putting that back
	 * over a server row that has since moved is data loss dressed as a feature.
	 * With it the read side can tell an answer the server never received from
	 * an answer the server has since replaced.
	 */
	baseline: Record<string, string>;
}

export function assignmentMirrorKey(viewerId: string | null | undefined, itemId: string): string {
	return `${ASSIGNMENT_MIRROR_PREFIX}${(viewerId ?? '').trim() || 'anon'}:${itemId}`;
}

/**
 * WHY A WRITE DID NOT LAND, because "it silently did not" is the failure mode
 * this whole module exists to remove and reproducing it one level down would
 * be its own joke.
 *
 * `blocked` is storage refusing outright (Safari private browsing, cookies
 * blocked, an embedded context); `full` is the quota, after a sweep and a
 * retry have already failed.
 */
export type MirrorWrite = 'ok' | 'full' | 'blocked';

function storage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		// Accessing the property itself throws where site data is blocked.
		return null;
	}
}

/**
 * Every assignment mirror key currently in storage. Enumerating throws in the
 * same places `storage()` does, so it answers empty rather than propagating.
 */
function mirrorKeys(store: Storage): string[] {
	const keys: string[] = [];
	try {
		for (let i = 0; i < store.length; i++) {
			const key = store.key(i);
			if (key?.startsWith(ASSIGNMENT_MIRROR_PREFIX)) keys.push(key);
		}
	} catch {
		return keys;
	}
	return keys;
}

function drop(store: Storage, key: string): void {
	try {
		store.removeItem(key);
	} catch {
		// Nothing to do, and nothing depends on it having worked.
	}
}

function readMirrorAt(store: Storage, key: string): AssignmentMirror | null {
	let raw: string | null = null;
	try {
		raw = store.getItem(key);
	} catch {
		return null;
	}
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<AssignmentMirror>;
		// A SHAPE THIS VERSION DOES NOT KNOW IS DROPPED, not coerced: a mirror is
		// only worth restoring if every field means what this code thinks it
		// means, and half-reading one is how an answer lands on the wrong block.
		if (parsed?.v !== 1) return null;
		if (typeof parsed.at !== 'number') return null;
		if (typeof parsed.itemId !== 'string' || !parsed.itemId) return null;
		if (!parsed.values || typeof parsed.values !== 'object') return null;
		if (!parsed.baseline || typeof parsed.baseline !== 'object') return null;
		const values: Record<string, ResponseValue> = {};
		for (const [id, value] of Object.entries(parsed.values)) {
			if (value && typeof value === 'object') values[id] = value as ResponseValue;
		}
		const baseline: Record<string, string> = {};
		for (const [id, serial] of Object.entries(parsed.baseline)) {
			if (typeof serial === 'string') baseline[id] = serial;
		}
		return { v: 1, at: parsed.at, itemId: parsed.itemId, values, baseline };
	} catch {
		return null;
	}
}

/**
 * Drop every mirror that is not `keepKey` and is either expired or, when
 * `all`, any other slot at all. Returns how many went, so a caller can say
 * whether a retry is worth making.
 *
 * IT IS THE QUOTA ANSWER AS WELL AS THE HOUSEKEEPING ONE, and it never removes
 * the slot it was asked to keep: the value competing for the space is the one
 * value that must survive.
 */
export function sweepAssignmentMirrors(keepKey: string, now: number, all = false): number {
	const store = storage();
	if (!store) return 0;
	let removed = 0;
	for (const key of mirrorKeys(store)) {
		if (key === keepKey) continue;
		if (!all) {
			const mirror = readMirrorAt(store, key);
			if (mirror && now - mirror.at <= ASSIGNMENT_MIRROR_MAX_AGE_MS) continue;
		}
		drop(store, key);
		removed++;
	}
	return removed;
}

/**
 * THE SLOT FOR ONE ASSIGNMENT, or null.
 *
 * READ BY KEY, NOT "the newest for this viewer" -- which is where this departs
 * from the notebook and has to. A composer is one surface with one draft, so
 * the newest slot IS the writing that was being typed when the tab died. An
 * assignment page is one of many, and the newest slot is frequently a
 * DIFFERENT assignment's: restoring it here would put one assignment's answers
 * into another's fields, which is worse than losing them.
 */
export function readAssignmentMirror(key: string, now: number): AssignmentMirror | null {
	const store = storage();
	if (!store) return null;
	const mirror = readMirrorAt(store, key);
	if (!mirror) return null;
	if (now - mirror.at > ASSIGNMENT_MIRROR_MAX_AGE_MS) {
		drop(store, key);
		return null;
	}
	return mirror;
}

/**
 * WRITE ONE SLOT, AND NEVER THROW OUT OF IT.
 *
 * A full or blocked `localStorage` is an ordinary state -- Safari private
 * browsing refuses every write, and a shared machine can genuinely be at quota
 * -- and an exception escaping here would land inside the engine's own
 * reactive effect, which is a dead assignment page over a lost answer: the
 * exact outcome this module was written to prevent.
 *
 * ON QUOTA IT SWEEPS AND RETRIES ONCE. The sweep drops other assignments'
 * slots, never this one.
 */
export function writeAssignmentMirror(key: string, mirror: AssignmentMirror): MirrorWrite {
	const store = storage();
	if (!store) return 'blocked';
	const payload = JSON.stringify(mirror);
	try {
		store.setItem(key, payload);
		return 'ok';
	} catch {
		// Fall through to the sweep.
	}
	if (sweepAssignmentMirrors(key, mirror.at, true) > 0) {
		try {
			store.setItem(key, payload);
			return 'ok';
		} catch {
			// Still no room.
		}
	}
	// The stale value under this key is now WORSE than nothing: it claims to be
	// what is on screen and is not. Drop it and report.
	drop(store, key);
	return 'full';
}

export function clearAssignmentMirror(key: string): void {
	const store = storage();
	if (store) drop(store, key);
}

/**
 * THE BASELINE MAP FOR A SET OF SERVER ROWS: what the server holds right now,
 * per block, through the one serializer.
 *
 * A block with no row is `serializeForBaseline(undefined)` -- the same string
 * an explicit null gives -- because "no answer stored" and "an empty answer
 * stored" are the same state to a student looking at a blank field, and
 * treating them apart would report a conflict on every untouched block.
 */
export function baselineOf(values: Record<string, ResponseValue | undefined>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [id, value] of Object.entries(values)) out[id] = serializeForBaseline(value);
	return out;
}

/** The serial of "nothing stored under this block". */
export const NOTHING_STORED = serializeForBaseline(undefined);

/**
 * ONE BLOCK'S CONFLICT: the answer this browser held and never got to save,
 * against a saved answer that has moved on since.
 */
export interface MirrorConflict {
	blockId: string;
	/** The copy this browser kept, verbatim. Rendered so nothing is destroyed unseen. */
	local: ResponseValue;
}

export type AssignmentMirrorPlan =
	| { action: 'drop' }
	| {
			action: 'restore';
			/** Blocks whose value goes back into the fields, by id. */
			restore: Record<string, ResponseValue>;
			/** Those ids, sorted, so a message and a test read the same order. */
			restoredIds: string[];
			/** Blocks NOT put back, because the saved answer is newer. */
			conflicts: MirrorConflict[];
	  };

/**
 * WHAT A FOUND MIRROR MEANS, decided in one pure function so the engine's
 * effect is a call rather than a second copy of the rule.
 *
 * `serverValues` is what this load came back holding, per block.
 *
 * THE COMPARISON IS THREE-CORNERED, AND IT HAS TO BE. Two values cannot tell a
 * lost write from a superseded one: an answer in the mirror that differs from
 * the server is EITHER work the server never received OR work the server has
 * since replaced with something newer, and those two want opposite outcomes.
 * The mirror's own recorded baseline -- what the server had acknowledged at
 * the moment it was written -- is the third corner that separates them.
 *
 *   mirror == its baseline          nothing unacknowledged here. Skip.
 *   server == the mirror's baseline the server never moved, so the mirror is
 *                                   strictly newer. RESTORE.
 *   server == the mirror's value    the write landed after all. Skip.
 *   otherwise                       both moved. CONFLICT: keep the saved
 *                                   answer, and hand the local copy back.
 *
 * THE DECLARATION IS NEVER RESTORED AND NEVER CONFLICTS. Ticking an academic
 * integrity box is an act a student takes deliberately, and putting a tick
 * back on their behalf makes them attest to something they did not touch this
 * time. It costs almost nothing to exclude: `setDeclaration` saves
 * immediately, with no debounce, so the window this module exists for barely
 * applies to it.
 */
export function planAssignmentRestore(
	mirror: AssignmentMirror,
	serverValues: Record<string, ResponseValue | undefined>
): AssignmentMirrorPlan {
	const restore: Record<string, ResponseValue> = {};
	const conflicts: MirrorConflict[] = [];
	for (const blockId of Object.keys(mirror.values).sort()) {
		if (blockId === DECLARATION_BLOCK_ID) continue;
		const local = mirror.values[blockId];
		const localSerial = serializeForBaseline(local);
		const wasAcked = mirror.baseline[blockId] ?? NOTHING_STORED;
		if (localSerial === wasAcked) continue;
		const nowOnServer = serializeForBaseline(serverValues[blockId]);
		if (nowOnServer === wasAcked) {
			restore[blockId] = local;
			continue;
		}
		if (nowOnServer === localSerial) continue;
		conflicts.push({ blockId, local });
	}
	const restoredIds = Object.keys(restore).sort();
	if (!restoredIds.length && !conflicts.length) return { action: 'drop' };
	return { action: 'restore', restore, restoredIds, conflicts };
}

/**
 * HOW A BLOCK IS NAMED IN A RECOVERY MESSAGE.
 *
 * NOT `unmetLabel`, which names a REQUIREMENT ("needs at least two sentences")
 * and would read as an accusation here. This names a PLACE, so a student can
 * find the field the sentence is about. The 60-character cut is the same one
 * `unmetLabel` takes on a prompt, for the same reason, and an unknown block
 * falls back to its own id rather than to nothing.
 */
export function mirrorBlockLabel(spec: AssignmentSpec | null, blockId: string): string {
	for (const mod of spec?.modules ?? []) {
		for (const raw of mod.blocks) {
			if (!('id' in raw)) continue;
			const block = raw as InteractiveBlock;
			if (block.id !== blockId) continue;
			const where = mod.title ? `${mod.title}: ` : '';
			if (block.type === 'textField') {
				const prompt = block.prompt.trim();
				const shown = prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;
				return `${where}"${shown}"`;
			}
			if (block.type === 'table') return `${where}the table`;
			if (block.type === 'checklist') return `${where}the checklist`;
			return `${where}${block.type}`;
		}
	}
	return blockId;
}

/**
 * THE BROWSER'S COPY OF ONE CONFLICTED ANSWER, as lines a person can read.
 *
 * A conflict is the one branch where an answer is NOT put back, so this is the
 * only place the work still exists on screen. Rendering it as raw JSON would
 * be a technically complete disclosure that nobody can act on, which is the
 * same as destroying it quietly.
 *
 * Every shape `ResponseValue` can hold is covered, because a shape that fell
 * through to nothing would be a silent drop of exactly the kind this module is
 * about: text as its own lines, a table row by row against its column labels,
 * a checklist as the items that were ticked.
 */
export function mirrorValueLines(
	value: ResponseValue | undefined,
	block: InteractiveBlock | null
): string[] {
	const lines: string[] = [];
	const text = value?.text?.trim();
	if (text) lines.push(...text.split('\n'));
	const rows = value?.rows;
	if (rows?.length) {
		const columns = block?.type === 'table' ? block.columns : [];
		rows.forEach((row, i) => {
			const cells = columns.length
				? columns
						.map((c) => [c.label, (row[c.key] ?? '').trim()] as const)
						.filter(([, v]) => v)
						.map(([label, v]) => `${label}: ${v}`)
				: Object.entries(row)
						.filter(([, v]) => (v ?? '').trim())
						.map(([k, v]) => `${k}: ${String(v).trim()}`);
			if (cells.length) lines.push(`Row ${i + 1} -- ${cells.join(', ')}`);
		});
	}
	const checked = value?.checked;
	if (checked?.length) {
		const items = block?.type === 'checklist' ? block.items : [];
		const ticked = checked
			.map((on, i) => (on ? (items[i] ?? `item ${i + 1}`) : null))
			.filter((v): v is string => v !== null);
		if (ticked.length) lines.push(`Ticked: ${ticked.join('; ')}`);
	}
	return lines;
}

/** The block one conflict is about, or null when the spec no longer has it. */
export function blockById(spec: AssignmentSpec | null, blockId: string): InteractiveBlock | null {
	for (const mod of spec?.modules ?? []) {
		for (const raw of mod.blocks) {
			if ('id' in raw && (raw as InteractiveBlock).id === blockId) return raw as InteractiveBlock;
		}
	}
	return null;
}

/**
 * THE SENTENCE THE STUDENT READS, and it says what actually happened rather
 * than a reassurance.
 *
 * THE TWO HALVES ARE TWO SENTENCES BECAUSE THEY ARE TWO OUTCOMES. Answers put
 * back are on their way to the server, and the save indicator a few pixels
 * away is what says whether they arrived -- this must never claim that itself.
 * Answers NOT put back are the ones a student has to act on, so that half says
 * plainly that the saved answer won and that their copy is below.
 */
export function assignmentRestoreMessage(
	plan: Extract<AssignmentMirrorPlan, { action: 'restore' }>
): string {
	const parts: string[] = [];
	const n = plan.restoredIds.length;
	if (n) {
		parts.push(
			`${n === 1 ? 'An answer was' : `${n} answers were`} put back from this browser, where ` +
				`${n === 1 ? 'it was' : 'they were'} kept while you typed, and ${n === 1 ? 'is' : 'are'} ` +
				'being saved now. The save note above says when that lands.'
		);
	}
	const c = plan.conflicts.length;
	if (c) {
		parts.push(
			`${c === 1 ? 'One answer was' : `${c} answers were`} NOT put back, because a newer saved ` +
				`${c === 1 ? 'answer' : 'answers'} for ${c === 1 ? 'it' : 'them'} came back with this ` +
				'page. Nothing of yours was thrown away: the copy this browser kept is below, so ' +
				'you can put it back yourself if it was the better one.'
		);
	}
	return parts.join(' ');
}

/**
 * WHAT THE ENGINE SAYS WHEN THE MIRROR CANNOT BE WRITTEN AT ALL.
 *
 * A safety net nobody knows is missing is worse than no safety net, because
 * the student goes on typing a long answer under an assumption that stopped
 * being true. It is deliberately not an error: nothing has failed, the
 * ordinary autosave still works, and the instruction is the one that helps.
 */
export const ASSIGNMENT_MIRROR_UNAVAILABLE =
	'This browser will not keep a backup copy of your answers while you type -- its storage is ' +
	'full or turned off. Your answers still save as usual, but press Save now after each one ' +
	'rather than relying on the automatic save.';
