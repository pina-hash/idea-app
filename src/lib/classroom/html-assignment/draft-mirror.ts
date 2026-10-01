/**
 * A PORTED WORKSHEET'S ANSWERS, MIRRORED INTO THIS BROWSER (ledger 0360,
 * report d983e776), so a refresh during a database stall takes nothing with it.
 *
 * WHAT IT EXISTS FOR, AS IT HAPPENED. On 2026-09-29 the database stalled for
 * most of a period; every save timed out, the progress rail above the
 * worksheet read 100% over answers the server never received, the student
 * refreshed the page, and the refresh threw the typing away -- they wrote the
 * concept sketches again. The document itself cannot keep anything (it runs in
 * an opaque origin, where `localStorage` throws), and the parent kept the
 * answers in memory only. This is the copy that survives a reload.
 *
 * A CALLER OF `$lib/classroom/assignment-draft-mirror`, NOT A FOURTH MIRROR.
 * The payload is the SAME as the spec engine's -- a `ResponseValue` per block
 * id, written against what the server last acknowledged -- so CLAUDE.md's rule
 * applies: "a second surface with the same payload is a caller, not a mirror".
 * The key shape (`assignment_draft_mirror:<viewer>:<item>`), the 24-hour cap,
 * the debounce, the sweep-and-retry on quota, the drop-an-unknown-shape rule,
 * the never-throw rule and the three-cornered restore are all that module's,
 * imported rather than restated. An item is a spec assignment XOR a ported
 * worksheet (`htmlAssignmentMount` decides), so the two surfaces never share a
 * slot. What is added here is only the translation a worksheet needs: the
 * document speaks in FIELDS and the column in BLOCK IDS.
 *
 * WHAT IT CANNOT HOLD, SAID OUT LOUD: photographs. A picture goes up the moment
 * it is taken and its bytes live in the document's own memory; nothing here
 * can keep them, and the restore notice says so.
 *
 * Pure and client-safe: no Svelte, no Supabase. The timer it owns is a plain
 * `setTimeout`, so the store above it runs no effect.
 */

import {
	ASSIGNMENT_MIRROR_DEBOUNCE_MS,
	assignmentMirrorKey,
	baselineOf,
	clearAssignmentMirror,
	planAssignmentRestore,
	readAssignmentMirror,
	sweepAssignmentMirrors,
	writeAssignmentMirror,
	type AssignmentMirror,
	type MirrorWrite
} from '$lib/classroom/assignment-draft-mirror';
import type { ResponseValue } from '$lib/classroom/assignment-spec';
import {
	hxBlockFieldMap,
	hxBridgeValue,
	hxStoredValue,
	type HxRestoreNotice
} from './answers';
import {
	fieldBlockMap,
	hxBlockPrompt,
	manifestBlocks,
	type HtmlAssignmentManifest,
	type HtmlBlock
} from './manifest';

/** The slot for one viewer's one worksheet: the spec engine's key, unchanged. */
export function hxMirrorKey(viewerId: string | null | undefined, itemId: string): string {
	return assignmentMirrorKey(viewerId, itemId);
}

/**
 * The blocks a mirror may carry: every declared block that holds a VALUE.
 * An image block is a photograph, which a mirror cannot hold.
 */
function valueBlocks(manifest: HtmlAssignmentManifest): Map<string, HtmlBlock> {
	const out = new Map<string, HtmlBlock>();
	for (const block of manifestBlocks(manifest)) {
		if (block.type !== 'image' && !out.has(block.id)) out.set(block.id, block);
	}
	return out;
}

/**
 * ONE SLOT'S CONTENTS FROM WHAT THE CONTROLLER HOLDS: every value on screen,
 * keyed by block id, against what the server last acknowledged per block.
 * `planAssignmentRestore` decides from the pair; a block whose value equals
 * its acknowledged one restores nothing, so carrying every value is safe.
 */
export function hxMirrorFrom(
	manifest: HtmlAssignmentManifest,
	itemId: string,
	values: Readonly<Record<string, string | boolean>>,
	acknowledged: Readonly<Record<string, ResponseValue>>,
	now: number
): AssignmentMirror {
	const blocks = valueBlocks(manifest);
	const toBlock = fieldBlockMap(manifest);
	const byBlock: Record<string, ResponseValue> = {};
	for (const [field, value] of Object.entries(values)) {
		const blockId = toBlock.get(field);
		if (!blockId || !blocks.has(blockId)) continue;
		byBlock[blockId] = hxStoredValue(value);
	}
	const acked: Record<string, ResponseValue | undefined> = {};
	for (const [blockId, value] of Object.entries(acknowledged)) {
		if (blocks.has(blockId)) acked[blockId] = value;
	}
	return { v: 1, at: now, itemId, values: byBlock, baseline: baselineOf(acked) };
}

/** What a found slot means for this worksheet, or null when it restores nothing. */
export interface HxRestorePlan {
	/** Put back into the fields, keyed by FIELD, ready for `HxAnswers.restore`. */
	values: Record<string, string | boolean>;
	notice: HxRestoreNotice;
}

/**
 * THE THREE-CORNERED DECISION, translated. `serverValues` is what this load
 * came back holding, keyed by field (the controller's seed). A block the
 * stored manifest no longer declares is DROPPED, never guessed at: that is an
 * id that used to exist, and there is no field to put it in.
 */
export function hxPlanRestore(
	manifest: HtmlAssignmentManifest,
	mirror: AssignmentMirror,
	serverValues: Readonly<Record<string, string | boolean>>
): HxRestorePlan | null {
	const blocks = valueBlocks(manifest);
	const fieldOf = hxBlockFieldMap(manifest);
	const toBlock = fieldBlockMap(manifest);
	const declared: AssignmentMirror = {
		...mirror,
		values: Object.fromEntries(Object.entries(mirror.values).filter(([id]) => blocks.has(id)))
	};
	const server: Record<string, ResponseValue | undefined> = {};
	for (const [field, value] of Object.entries(serverValues)) {
		const blockId = toBlock.get(field);
		if (blockId && blocks.has(blockId)) server[blockId] = hxStoredValue(value);
	}
	const plan = planAssignmentRestore(declared, server);
	if (plan.action === 'drop') return null;
	const values: Record<string, string | boolean> = {};
	const restored: string[] = [];
	for (const blockId of plan.restoredIds) {
		const field = fieldOf.get(blockId);
		const value = hxBridgeValue(plan.restore[blockId]);
		if (field === undefined || value === null) continue;
		values[field] = value;
		restored.push(hxMirrorBlockLabel(manifest, blockId));
	}
	const conflicts = plan.conflicts.map((c) => ({
		blockId: c.blockId,
		label: hxMirrorBlockLabel(manifest, c.blockId),
		lines: hxMirrorValueLines(c.local)
	}));
	if (!restored.length && !conflicts.length) return null;
	return { values, notice: { restored, conflicts } };
}

/**
 * WHERE A BLOCK IS, IN THE STUDENT'S TERMS: the module's title and the block's
 * grader-facing question when the manifest declares one (`hxBlockPrompt`),
 * otherwise the document's own field name, which is the only label a manifest
 * is guaranteed to carry. Cut at 60 characters, the spec mirror's cut.
 */
export function hxMirrorBlockLabel(manifest: HtmlAssignmentManifest, blockId: string): string {
	const cut = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}...` : text);
	for (const block of manifest.header ?? []) {
		if (block.id === blockId) return `Top of the page: ${cut(hxBlockPrompt(block) ?? block.field)}`;
	}
	for (const mod of manifest.modules ?? []) {
		for (const block of mod.blocks ?? []) {
			if (block.id !== blockId) continue;
			const prompt = hxBlockPrompt(block);
			return `${mod.title}: ${prompt ? `"${cut(prompt)}"` : cut(block.field)}`;
		}
	}
	return blockId;
}

/** The browser's copy of one conflicted answer as lines a person can read. */
export function hxMirrorValueLines(value: ResponseValue | undefined): string[] {
	const bridged = hxBridgeValue(value);
	if (typeof bridged === 'boolean') return [bridged ? 'Checked' : 'Not checked'];
	if (typeof bridged === 'string' && bridged.trim()) return bridged.split('\n');
	return [];
}

/**
 * THE SENTENCE A STUDENT READS AFTER A RESTORE. Two outcomes, two sentences,
 * and the photograph limit stated every time, because a student who restored
 * their typing will reasonably assume their photos came back too.
 */
export function hxRestoreMessage(notice: HxRestoreNotice): string {
	const parts: string[] = [];
	const n = notice.restored.length;
	if (n) {
		parts.push(
			`${n === 1 ? 'An answer was' : `${n} answers were`} put back from this computer, where ${n === 1 ? 'it was' : 'they were'} kept while you typed, and ${n === 1 ? 'is' : 'are'} being saved now.`
		);
	}
	const c = notice.conflicts.length;
	if (c) {
		parts.push(
			`${c === 1 ? 'One answer was' : `${c} answers were`} not put back, because a newer saved answer came back with this page. Your copy is below, so you can put it back yourself.`
		);
	}
	parts.push('Photos are not kept this way: if one did not upload, add it again.');
	return parts.join(' ');
}

/**
 * WHAT THE RAIL SAYS WHEN THIS BROWSER WILL NOT KEEP THE COPY. A safety net
 * nobody knows is missing is worse than none: the student goes on typing under
 * an assumption that stopped being true. Not an error, because nothing failed.
 */
export const HX_MIRROR_UNAVAILABLE =
	'This browser is not keeping a backup copy of your answers, because its storage is full or turned off. Your answers still save as usual; wait for Saved before you leave this page.';

/**
 * THE MIRROR FOR ONE MOUNTED WORKSHEET: a key, a debounced write and a clear.
 *
 * `snapshot` is asked at write time, so the newest values always go out, and
 * answers null when nothing is owed -- which CLEARS the slot. That is the
 * mirror being the save state's shadow: it exists precisely while the server
 * has not acknowledged the work, and goes the moment it has, never on dispatch.
 */
export class HxDraftMirror {
	readonly key: string;
	readonly #snapshot: () => AssignmentMirror | null;
	readonly #onhealth: (health: MirrorWrite) => void;
	readonly #debounceMs: number;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#destroyed = false;

	constructor(options: {
		viewerId: string;
		itemId: string;
		snapshot: () => AssignmentMirror | null;
		onhealth?: (health: MirrorWrite) => void;
		debounceMs?: number;
	}) {
		this.key = hxMirrorKey(options.viewerId, options.itemId);
		this.#snapshot = options.snapshot;
		this.#onhealth = options.onhealth ?? (() => {});
		this.#debounceMs = options.debounceMs ?? ASSIGNMENT_MIRROR_DEBOUNCE_MS;
	}

	/** The slot found on load, or null; expired slots and other items' expired slots go. */
	read(now: number = Date.now()): AssignmentMirror | null {
		sweepAssignmentMirrors(this.key, now);
		return readAssignmentMirror(this.key, now);
	}

	/** Write (or clear) after the debounce. Safe on every keystroke. */
	schedule(): void {
		if (this.#destroyed) return;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.writeNow();
		}, this.#debounceMs);
	}

	/** Write (or clear) now. Never throws. */
	writeNow(): void {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
		let mirror: AssignmentMirror | null;
		try {
			mirror = this.#snapshot();
		} catch {
			return;
		}
		if (!mirror) {
			clearAssignmentMirror(this.key);
			return;
		}
		this.#onhealth(writeAssignmentMirror(this.key, mirror));
	}

	/** Write anything still pending, then stop. */
	destroy(): void {
		if (this.#destroyed) return;
		if (this.#timer) this.writeNow();
		this.#destroyed = true;
	}
}
