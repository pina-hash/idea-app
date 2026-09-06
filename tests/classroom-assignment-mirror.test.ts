// tests/classroom-assignment-mirror.test.ts
//
// 0070: the pure half of the assignment draft mirror.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. This file owns the arithmetic --
// the three-cornered restore comparison, the shape gate, the key scoping, the
// readable projection of a conflicted answer, and the three ways
// `localStorage` can refuse. What a MOUNTED `AssignmentEngine` does with all
// of that across a real discard and a real reload is
// `tests/dom/assignment-mirror-mount.test.ts`, because effects only run there.
// Nothing here measures a box or a ratio: this is the node project.
//
// THE STORAGE FAILURES ARE DRIVEN BY A STAND-IN, not by happy-dom, because
// the interesting cases are the ones a real browser will not produce on
// demand: a `setItem` that throws every time (Safari private browsing, site
// data blocked) and one that throws until something is freed (the quota). A
// test that could not make those happen would be asserting the branch it
// wanted rather than the branch that runs.

import { afterEach, describe, expect, it } from 'vitest';
import { serializeForBaseline } from '$lib/edit-baseline.svelte';
import { DECLARATION_BLOCK_ID, type AssignmentSpec } from '$lib/classroom/assignment-spec';
import {
	ASSIGNMENT_MIRROR_MAX_AGE_MS,
	ASSIGNMENT_MIRROR_PREFIX,
	assignmentMirrorKey,
	assignmentRestoreMessage,
	baselineOf,
	blockById,
	clearAssignmentMirror,
	mirrorBlockLabel,
	mirrorValueLines,
	planAssignmentRestore,
	readAssignmentMirror,
	sweepAssignmentMirrors,
	writeAssignmentMirror,
	type AssignmentMirror
} from '$lib/classroom/assignment-draft-mirror';

const NOW = Date.UTC(2026, 8, 5, 17, 0, 0);

function mirror(over: Partial<AssignmentMirror> = {}): AssignmentMirror {
	return { v: 1, at: NOW, itemId: 'item-1', values: {}, baseline: {}, ...over };
}

// ---------------------------------------------------------------------------
// A storage stand-in, so every refusal is reachable.
// ---------------------------------------------------------------------------

type Refusal = 'never' | 'always' | 'until-swept';

function installStorage(refuse: Refusal = 'never') {
	const map = new Map<string, string>();
	const store = {
		get length() {
			return map.size;
		},
		key: (i: number) => [...map.keys()][i] ?? null,
		getItem: (k: string) => map.get(k) ?? null,
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear(),
		setItem(k: string, v: string) {
			if (refuse === 'always') throw new DOMException('quota', 'QuotaExceededError');
			// `until-swept` refuses while anything ELSE is in the way, which is
			// what a real quota does and what makes the sweep-and-retry the
			// branch under test rather than a line that happens to run.
			if (refuse === 'until-swept' && [...map.keys()].some((existing) => existing !== k)) {
				throw new DOMException('quota', 'QuotaExceededError');
			}
			map.set(k, v);
		}
	};
	(globalThis as { localStorage?: unknown }).localStorage = store;
	return { map, uninstall: () => delete (globalThis as { localStorage?: unknown }).localStorage };
}

let uninstall: (() => void) | null = null;
afterEach(() => {
	uninstall?.();
	uninstall = null;
});

// ---------------------------------------------------------------------------

describe('the key', () => {
	it('carries the viewer and the assignment, under the one prefix', () => {
		expect(assignmentMirrorKey('stu-1', 'item-9')).toBe(
			`${ASSIGNMENT_MIRROR_PREFIX}stu-1:item-9`
		);
	});

	it('never lets two viewers or two assignments meet', () => {
		const keys = new Set([
			assignmentMirrorKey('stu-1', 'item-1'),
			assignmentMirrorKey('stu-2', 'item-1'),
			assignmentMirrorKey('stu-1', 'item-2')
		]);
		expect(keys.size).toBe(3);
	});

	it('is namespaced apart from the notebook mirror, which shares this storage', () => {
		// A sweep of either feature is one prefix match, and it must not be able
		// to reach the other's slots.
		expect(ASSIGNMENT_MIRROR_PREFIX.startsWith('notebook_')).toBe(false);
		expect('notebook_draft_mirror:x:y'.startsWith(ASSIGNMENT_MIRROR_PREFIX)).toBe(false);
	});
});

// ---------------------------------------------------------------------------

describe('the three-cornered restore', () => {
	const acked = (text: string) => serializeForBaseline({ text });

	it('RESTORES an answer the server never received', () => {
		const plan = planAssignmentRestore(
			mirror({ values: { a: { text: 'typed' } }, baseline: { a: serializeForBaseline({}) } }),
			{ a: {} }
		);
		expect(plan).toEqual({
			action: 'restore',
			restore: { a: { text: 'typed' } },
			restoredIds: ['a'],
			conflicts: []
		});
	});

	it('RESTORES an answer for a block the server has no row for at all', () => {
		const plan = planAssignmentRestore(mirror({ values: { a: { text: 'typed' } } }), {});
		expect(plan.action).toBe('restore');
		expect(plan.action === 'restore' && plan.restoredIds).toEqual(['a']);
	});

	it('SKIPS a block that never moved off what the server had acknowledged', () => {
		const plan = planAssignmentRestore(
			mirror({ values: { a: { text: 'same' } }, baseline: { a: acked('same') } }),
			{ a: { text: 'same' } }
		);
		expect(plan).toEqual({ action: 'drop' });
	});

	it('SKIPS a block whose write turned out to have landed after all', () => {
		// The mirror is newer than its own baseline -- so this is NOT the case
		// above -- and the server has exactly what the mirror holds.
		const plan = planAssignmentRestore(
			mirror({ values: { a: { text: 'typed' } }, baseline: { a: acked('old') } }),
			{ a: { text: 'typed' } }
		);
		expect(plan).toEqual({ action: 'drop' });
	});

	it('CONFLICTS when both sides moved, and never overwrites the newer one', () => {
		const plan = planAssignmentRestore(
			mirror({ values: { a: { text: 'phone' } }, baseline: { a: acked('old') } }),
			{ a: { text: 'laptop' } }
		);
		expect(plan.action).toBe('restore');
		if (plan.action !== 'restore') return;
		// The saved answer is left alone: nothing is proposed for `a`.
		expect(plan.restore).toEqual({});
		expect(plan.restoredIds).toEqual([]);
		// And the local copy is handed back rather than dropped.
		expect(plan.conflicts).toEqual([{ blockId: 'a', local: { text: 'phone' } }]);
	});

	it('decides each block on its own, so one conflict cannot cost the rest', () => {
		const plan = planAssignmentRestore(
			mirror({
				values: { a: { text: 'phone' }, b: { text: 'kept' }, c: { text: 'same' } },
				baseline: { a: acked('old'), b: acked('was'), c: acked('same') }
			}),
			{ a: { text: 'laptop' }, b: { text: 'was' }, c: { text: 'same' } }
		);
		expect(plan.action).toBe('restore');
		if (plan.action !== 'restore') return;
		expect(plan.restoredIds).toEqual(['b']);
		expect(plan.conflicts.map((c) => c.blockId)).toEqual(['a']);
	});

	it('NEVER puts an academic integrity tick back, in either direction', () => {
		const plan = planAssignmentRestore(
			mirror({
				values: { [DECLARATION_BLOCK_ID]: { checked: [true] } },
				baseline: { [DECLARATION_BLOCK_ID]: serializeForBaseline({}) }
			}),
			{}
		);
		// It would otherwise be the plainest restore case there is, which is the
		// point: it is excluded because attesting is an act, not a value.
		expect(plan).toEqual({ action: 'drop' });
	});

	it('drops a mirror holding nothing unacknowledged at all', () => {
		expect(planAssignmentRestore(mirror(), {})).toEqual({ action: 'drop' });
	});
});

// ---------------------------------------------------------------------------

describe('the stored shape', () => {
	it('reads back what it wrote', () => {
		const s = installStorage();
		uninstall = s.uninstall;
		const key = assignmentMirrorKey('stu-1', 'item-1');
		const m = mirror({ values: { a: { text: 'x' } }, baseline: { a: '"null"' } });
		expect(writeAssignmentMirror(key, m)).toBe('ok');
		expect(readAssignmentMirror(key, NOW)).toEqual(m);
	});

	it.each([
		['a version this code does not know', { ...mirror(), v: 2 }],
		['no clock', { ...mirror(), at: undefined }],
		['no assignment', { ...mirror(), itemId: '' }],
		['no values', { ...mirror(), values: undefined }],
		['no baseline map', { ...mirror(), baseline: undefined }],
		['not JSON at all', 'nonsense{']
	])('DROPS a slot with %s rather than half-reading it', (_label, payload) => {
		const s = installStorage();
		uninstall = s.uninstall;
		const key = assignmentMirrorKey('stu-1', 'item-1');
		s.map.set(key, typeof payload === 'string' ? payload : JSON.stringify(payload));
		expect(readAssignmentMirror(key, NOW)).toBeNull();
	});

	it('expires a slot past the age cap, and removes it on the way past', () => {
		const s = installStorage();
		uninstall = s.uninstall;
		const key = assignmentMirrorKey('stu-1', 'item-1');
		writeAssignmentMirror(key, mirror({ values: { a: { text: 'old' } } }));
		// The positive control: one millisecond inside the cap, it is still there.
		expect(readAssignmentMirror(key, NOW + ASSIGNMENT_MIRROR_MAX_AGE_MS)).not.toBeNull();
		expect(readAssignmentMirror(key, NOW + ASSIGNMENT_MIRROR_MAX_AGE_MS + 1)).toBeNull();
		expect(s.map.has(key)).toBe(false);
	});
});

// ---------------------------------------------------------------------------

describe('the sweep', () => {
	it('drops expired slots and keeps live ones, and never touches the key it was given', () => {
		const s = installStorage();
		uninstall = s.uninstall;
		const keep = assignmentMirrorKey('stu-1', 'item-1');
		const liveOther = assignmentMirrorKey('stu-1', 'item-2');
		const stale = assignmentMirrorKey('stu-1', 'item-3');
		writeAssignmentMirror(keep, mirror({ itemId: 'item-1', at: 0 }));
		writeAssignmentMirror(liveOther, mirror({ itemId: 'item-2', at: NOW }));
		writeAssignmentMirror(stale, mirror({ itemId: 'item-3', at: NOW - ASSIGNMENT_MIRROR_MAX_AGE_MS - 1 }));
		s.map.set('notebook_draft_mirror:stu-1:x', '{}');

		expect(sweepAssignmentMirrors(keep, NOW)).toBe(1);
		expect([...s.map.keys()].sort()).toEqual([keep, liveOther, 'notebook_draft_mirror:stu-1:x'].sort());
	});

	it('under `all`, takes every other slot and still keeps the one named', () => {
		const s = installStorage();
		uninstall = s.uninstall;
		const keep = assignmentMirrorKey('stu-1', 'item-1');
		writeAssignmentMirror(keep, mirror());
		writeAssignmentMirror(assignmentMirrorKey('stu-1', 'item-2'), mirror({ itemId: 'item-2' }));
		expect(sweepAssignmentMirrors(keep, NOW, true)).toBe(1);
		expect([...s.map.keys()]).toEqual([keep]);
	});
});

// ---------------------------------------------------------------------------

describe('storage that will not take it', () => {
	it('reports `blocked` and throws nothing when there is no storage at all', () => {
		delete (globalThis as { localStorage?: unknown }).localStorage;
		const key = assignmentMirrorKey('stu-1', 'item-1');
		expect(writeAssignmentMirror(key, mirror())).toBe('blocked');
		expect(readAssignmentMirror(key, NOW)).toBeNull();
		expect(() => clearAssignmentMirror(key)).not.toThrow();
		expect(sweepAssignmentMirrors(key, NOW)).toBe(0);
	});

	it('reports `full`, not `blocked`, when storage EXISTS and refuses every write', () => {
		const s = installStorage('always');
		uninstall = s.uninstall;
		// The two are different answers to different questions and the engine
		// says the same sentence for both -- but a caller that read `blocked` as
		// "there is no storage here" would be wrong about a machine at quota.
		// `always` refuses `setItem` outright and the sweep frees nothing, so no
		// retry can succeed.
		expect(writeAssignmentMirror(assignmentMirrorKey('stu-1', 'item-1'), mirror())).toBe('full');
	});

	it('SWEEPS AND RETRIES on quota, keeping the value that is competing for the space', () => {
		const s = installStorage('until-swept');
		uninstall = s.uninstall;
		const other = assignmentMirrorKey('stu-1', 'item-2');
		s.map.set(other, JSON.stringify(mirror({ itemId: 'item-2' })));
		const key = assignmentMirrorKey('stu-1', 'item-1');

		expect(writeAssignmentMirror(key, mirror({ values: { a: { text: 'the long one' } } }))).toBe('ok');
		// The one that had to fit is the one that is there.
		expect([...s.map.keys()]).toEqual([key]);
	});

	it('DROPS a stale value under its own key rather than leaving a lie there', () => {
		const s = installStorage('never');
		uninstall = s.uninstall;
		const key = assignmentMirrorKey('stu-1', 'item-1');
		writeAssignmentMirror(key, mirror({ values: { a: { text: 'what was on screen' } } }));
		// Now storage starts refusing. A slot claiming to be the current answers
		// and holding older ones is worse than no slot at all.
		const s2 = installStorage('always');
		uninstall = s2.uninstall;
		s2.map.set(key, s.map.get(key) as string);
		expect(writeAssignmentMirror(key, mirror({ values: { a: { text: 'newer' } } }))).toBe('full');
		expect(s2.map.has(key)).toBe(false);
	});
});

// ---------------------------------------------------------------------------

describe('what a conflicted answer looks like on screen', () => {
	const SPEC = {
		version: '1.1',
		kind: 'assignment',
		meta: { assignmentId: 'a-1', title: 'Bridge lab', totalPoints: 10 },
		modules: [
			{
				id: 'm1',
				title: 'Analysis',
				blocks: [
					{ type: 'textField', id: 'b-text', prompt: 'What failed first, and why?' },
					{
						type: 'table',
						id: 'b-table',
						columns: [
							{ key: 'member', label: 'Member' },
							{ key: 'load', label: 'Load (N)' }
						]
					},
					{ type: 'checklist', id: 'b-check', items: ['Bench cleared', 'Tools returned'] }
				]
			}
		]
	} as unknown as AssignmentSpec;

	it('names a place, not a requirement', () => {
		expect(mirrorBlockLabel(SPEC, 'b-text')).toBe('Analysis: "What failed first, and why?"');
		expect(mirrorBlockLabel(SPEC, 'b-table')).toBe('Analysis: the table');
		expect(mirrorBlockLabel(SPEC, 'b-check')).toBe('Analysis: the checklist');
	});

	it('falls back to the block id rather than to nothing', () => {
		expect(mirrorBlockLabel(SPEC, 'gone')).toBe('gone');
		expect(mirrorBlockLabel(null, 'gone')).toBe('gone');
	});

	it('renders EVERY value shape, because one that fell through would be a silent drop', () => {
		expect(mirrorValueLines({ text: 'one\ntwo' }, blockById(SPEC, 'b-text'))).toEqual([
			'one',
			'two'
		]);
		expect(
			mirrorValueLines(
				{ rows: [{ member: 'lower chord', load: '120' }, { member: '', load: '' }] },
				blockById(SPEC, 'b-table')
			)
		).toEqual(['Row 1 -- Member: lower chord, Load (N): 120']);
		expect(
			mirrorValueLines({ checked: [true, false] }, blockById(SPEC, 'b-check'))
		).toEqual(['Ticked: Bench cleared']);
	});

	it('says something even with no spec to name the columns by', () => {
		expect(mirrorValueLines({ rows: [{ a: '1' }] }, null)).toEqual(['Row 1 -- a: 1']);
		expect(mirrorValueLines({ checked: [true] }, null)).toEqual(['Ticked: item 1']);
	});

	it('is empty for an empty answer, so nothing renders an empty box', () => {
		expect(mirrorValueLines({}, null)).toEqual([]);
		expect(mirrorValueLines({ text: '   ' }, null)).toEqual([]);
		expect(mirrorValueLines(undefined, null)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------

describe('the sentence the student reads', () => {
	const restored = (n: number) =>
		assignmentRestoreMessage({
			action: 'restore',
			restore: {},
			restoredIds: Array.from({ length: n }, (_, i) => `b${i}`),
			conflicts: []
		});

	it('NEVER claims the work is saved, in any branch', () => {
		const all = [
			restored(1),
			restored(3),
			assignmentRestoreMessage({
				action: 'restore',
				restore: {},
				restoredIds: [],
				conflicts: [{ blockId: 'a', local: { text: 'x' } }]
			}),
			assignmentRestoreMessage({
				action: 'restore',
				restore: {},
				restoredIds: ['a'],
				conflicts: [{ blockId: 'b', local: { text: 'y' } }]
			})
		];
		// The save indicator answers "is it saved" a few pixels away. A message
		// that answered it too would be the one that gets it wrong.
		for (const text of all) expect(text).not.toMatch(/\bsaved\.|has been saved|is saved\b/i);
		// And the positive control: every one of them says something.
		for (const text of all) expect(text.length).toBeGreaterThan(40);
	});

	it('counts in words that read correctly at one and at many', () => {
		expect(restored(1)).toContain('An answer was put back');
		expect(restored(3)).toContain('3 answers were put back');
	});

	it('says plainly when an answer was NOT put back, and where the copy is', () => {
		const text = assignmentRestoreMessage({
			action: 'restore',
			restore: {},
			restoredIds: [],
			conflicts: [{ blockId: 'a', local: { text: 'x' } }]
		});
		expect(text).toContain('NOT put back');
		expect(text).toContain('is below');
		expect(text).toContain('Nothing of yours was thrown away');
	});
});

// ---------------------------------------------------------------------------

describe('baselineOf', () => {
	it('goes through the ONE serializer, so both sides mean the same thing by equal', () => {
		expect(baselineOf({ a: { text: 'x' } })).toEqual({ a: serializeForBaseline({ text: 'x' }) });
	});

	it('treats a missing answer and an explicit null as the same nothing', () => {
		// Otherwise every untouched block would report a conflict on every load.
		expect(baselineOf({ a: undefined }).a).toBe(serializeForBaseline(null));
	});
});
