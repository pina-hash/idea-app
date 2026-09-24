// tests/preferences-store.test.ts
//
// THE PREFERENCE STORE, AND THE CLOBBER IT ENDS (ledger 0297, F5).
//
// Every writer into `profiles.preferences` used to spread the PAGE-LOAD
// SNAPSHOT: folding a class card on the home page wrote `{classroomFeed}` over
// that snapshot, pinning an app a moment later wrote `{homepage}` over the SAME
// snapshot, and the fold was gone. Nothing reports it -- the second write
// succeeds, the page looks right until the next load -- which is why this is a
// test and not a harness.
//
// Three layers, each with its positive control:
//   1. `$lib/preferences/profile-io` -- read-then-merge, per-row serialization,
//      fail-soft. The clobber scenario is driven against an in-memory row with
//      the OLD writer shape beside it as the control that proves the scenario
//      can see a clobber at all.
//   2. `$lib/preferences/store` -- validate on read, sparse on write, group
//      merge that keeps a group this build does not know, the three backings and
//      the router.
//   3. `$lib/preferences/classroom` -- the namespace, the homes, and the role
//      mapping of the view a class opens on.
// Plus a source sweep: no `.update({ preferences ... })` anywhere in `src/`
// except the one write path and the two IdeaCAD writers that already read
// first (and are another package's to move).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	mergeNamespace,
	namespaceOf,
	profileNamespaceWriter,
	updateProfilePreferences,
	writeProfileNamespace,
	type ProfilePreferenceIo
} from '$lib/preferences/profile-io';
import {
	LocalPreferenceStore,
	MemoryPreferenceStore,
	ProfilePreferenceStore,
	compactPreferences,
	type PreferenceStorage,
	type ProfileNamespaceWriter
} from '$lib/preferences/store';
import {
	CLASSROOM_PREFERENCE_HOMES,
	CLASSROOM_PREFERENCE_SCHEMA,
	CLASSROOM_SETTINGS,
	RECENT_MAX,
	classOpensOnFor,
	classroomLocalKey,
	createClassroomPreferences,
	defaultClassroomPreferences,
	groupIsDefault,
	readClassroomPreferences,
	recordRecentPick,
	type ClassroomPreferences
} from '$lib/preferences/classroom';

/**
 * ONE GROUP WITH SOME FIELDS CHANGED, the rest at their defaults. The groups
 * grew fields (ledger 0297, LEARN: the list width, the to-do default, the
 * Grades order, the tours), and a caller hands `set` a whole group -- every
 * shipping caller spreads the group as it stands. What each test below asserts
 * about the SPARSE form is unchanged: a default field is never stored.
 */
function part<G extends keyof ClassroomPreferences>(
	group: G,
	value: Partial<ClassroomPreferences[G]>
): ClassroomPreferences[G] {
	return { ...defaultClassroomPreferences()[group], ...value } as ClassroomPreferences[G];
}

/* -------------------------------------------------------------------------
 * AN IN-MEMORY PROFILE ROW, with latency on both halves so two writers can
 * genuinely interleave when nothing serializes them.
 * ---------------------------------------------------------------------- */

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FakeRow {
	io: ProfilePreferenceIo;
	row: { preferences: Record<string, unknown> };
	reads: number;
	writes: number;
	failNextRead: boolean;
	failNextWrite: boolean;
}

let rowSeq = 0;
function fakeRow(initial: Record<string, unknown>, latency = 5): FakeRow {
	const state: FakeRow = {
		row: { preferences: structuredClone(initial) },
		reads: 0,
		writes: 0,
		failNextRead: false,
		failNextWrite: false,
		io: undefined as unknown as ProfilePreferenceIo
	};
	state.io = {
		// A fresh key per row so the module-level queue never links two tests.
		key: `row-${++rowSeq}`,
		async read() {
			state.reads++;
			await tick(latency);
			if (state.failNextRead) {
				state.failNextRead = false;
				throw new Error('read refused');
			}
			return structuredClone(state.row.preferences);
		},
		async write(preferences) {
			await tick(latency);
			if (state.failNextWrite) {
				state.failNextWrite = false;
				throw new Error('write refused');
			}
			state.writes++;
			state.row.preferences = structuredClone(preferences);
		}
	};
	return state;
}

/** What the four page writers did before this bundle: spread the page-load snapshot. */
async function oldSnapshotWrite(r: FakeRow, snapshot: Record<string, unknown>, ns: string, value: unknown) {
	await r.io.write({ ...snapshot, [ns]: value });
}

const PAGE_LOAD = {
	homepage: { pinned: ['gauntlet'], usage: { gauntlet: 3 } },
	coinDesk: { lastCategory: 'extra_credit' },
	ideacad: { panes: { tree: 240 }, solid: { grid: true } }
};

describe('profile-io: every write reads the row first', () => {
	it('POSITIVE CONTROL: the old snapshot writers clobber a fold made a moment earlier', async () => {
		const r = fakeRow(PAGE_LOAD);
		const snapshot = structuredClone(PAGE_LOAD); // page.data.userProfile.preferences
		await oldSnapshotWrite(r, snapshot, 'classroomFeed', { collapsed: ['s-1'] });
		await oldSnapshotWrite(r, snapshot, 'homepage', { pinned: ['gauntlet', 'foundry'] });
		// The fold is gone: this is the defect, reproduced by the instrument below.
		expect(r.row.preferences.classroomFeed).toBeUndefined();
		expect(r.row.preferences.homepage).toEqual({ pinned: ['gauntlet', 'foundry'] });
	});

	it('the same two writes through writeProfileNamespace keep both, and every sibling', async () => {
		const r = fakeRow(PAGE_LOAD);
		await writeProfileNamespace(r.io, 'classroomFeed', { collapsed: ['s-1'] });
		await writeProfileNamespace(r.io, 'homepage', { pinned: ['gauntlet', 'foundry'] });
		expect(r.row.preferences).toEqual({
			homepage: { pinned: ['gauntlet', 'foundry'] },
			coinDesk: { lastCategory: 'extra_credit' },
			ideacad: { panes: { tree: 240 }, solid: { grid: true } },
			classroomFeed: { collapsed: ['s-1'] }
		});
		expect(r.reads).toBe(2);
		expect(r.writes).toBe(2);
	});

	it('two writes in flight at once are serialized: the second read sees the first write', async () => {
		const r = fakeRow(PAGE_LOAD, 15);
		// Neither awaited before the other starts: a pin while a fold is saving.
		const a = writeProfileNamespace(r.io, 'classroomFeed', { collapsed: ['s-1'] });
		const b = writeProfileNamespace(r.io, 'classroomUnits', { 's-1': ['u-2'] });
		const c = writeProfileNamespace(r.io, 'homepage', { pinned: [] });
		expect(await Promise.all([a, b, c])).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
		expect(r.row.preferences.classroomFeed).toEqual({ collapsed: ['s-1'] });
		expect(r.row.preferences.classroomUnits).toEqual({ 's-1': ['u-2'] });
		expect(r.row.preferences.homepage).toEqual({ pinned: [] });
		expect(r.row.preferences.ideacad).toEqual(PAGE_LOAD.ideacad);
	});

	it('a read that fails skips the write, and does not wedge the queue behind it', async () => {
		const r = fakeRow(PAGE_LOAD);
		r.failNextRead = true;
		const first = writeProfileNamespace(r.io, 'homepage', { pinned: [] });
		const second = writeProfileNamespace(r.io, 'classroomFeed', { collapsed: ['s-9'] });
		expect(await first).toEqual({ ok: false, message: 'read refused' });
		expect(await second).toEqual({ ok: true });
		// The first wrote nothing over a row it could not see.
		expect(r.writes).toBe(1);
		expect(r.row.preferences.homepage).toEqual(PAGE_LOAD.homepage);
		expect(r.row.preferences.classroomFeed).toEqual({ collapsed: ['s-9'] });
	});

	it('a write that fails reports it and the next queued write still lands', async () => {
		const r = fakeRow(PAGE_LOAD);
		r.failNextWrite = true;
		const first = writeProfileNamespace(r.io, 'homepage', { pinned: [] });
		const second = writeProfileNamespace(r.io, 'coinDesk', { lastCategory: 'fine' });
		expect(await first).toEqual({ ok: false, message: 'write refused' });
		expect(await second).toEqual({ ok: true });
		expect(r.row.preferences.homepage).toEqual(PAGE_LOAD.homepage);
		expect(r.row.preferences.coinDesk).toEqual({ lastCategory: 'fine' });
	});

	it('updateProfilePreferences hands `next` the row as it stands NOW, not a snapshot', async () => {
		const r = fakeRow({ dashboard: { order: ['a'] } });
		r.row.preferences.classroom = { classView: { opensOn: 'todo' } }; // written elsewhere after load
		const seen: unknown[] = [];
		await updateProfilePreferences(r.io, (current) => {
			seen.push(current);
			return mergeNamespace(current, 'dashboard', { order: ['b'] });
		});
		expect(seen).toEqual([{ dashboard: { order: ['a'] }, classroom: { classView: { opensOn: 'todo' } } }]);
		expect(r.row.preferences).toEqual({ dashboard: { order: ['b'] }, classroom: { classView: { opensOn: 'todo' } } });
	});

	it('mergeNamespace keeps siblings, removes on undefined, and survives a non-object blob', () => {
		expect(mergeNamespace({ a: 1, b: 2 }, 'b', 3)).toEqual({ a: 1, b: 3 });
		expect(mergeNamespace({ a: 1, b: 2 }, 'b', undefined)).toEqual({ a: 1 });
		expect(mergeNamespace(null, 'x', { y: 1 })).toEqual({ x: { y: 1 } });
		expect(mergeNamespace([1, 2], 'x', 1)).toEqual({ x: 1 });
		expect(namespaceOf({ classroom: { a: 1 } }, 'classroom')).toEqual({ a: 1 });
		expect(namespaceOf('junk', 'classroom')).toBeUndefined();
	});

	it('profileNamespaceWriter merges GROUPS: a group this build does not know survives, an emptied namespace is removed', async () => {
		const r = fakeRow({
			homepage: { pinned: ['x'] },
			classroom: { classView: { opensOn: 'todo' }, commentBank: { entries: ['Nice work'] } }
		});
		const writer = profileNamespaceWriter(r.io, 'classroom');
		await writer.write({ grading: { advanceAfterReturn: true } });
		expect(r.row.preferences.classroom).toEqual({
			classView: { opensOn: 'todo' },
			commentBank: { entries: ['Nice work'] },
			grading: { advanceAfterReturn: true }
		});
		await writer.write({ classView: undefined, grading: undefined, commentBank: undefined });
		expect('classroom' in r.row.preferences).toBe(false);
		expect(r.row.preferences.homepage).toEqual({ pinned: ['x'] });
	});
});

/* -------------------------------------------------------------------------
 * THE STORE
 * ---------------------------------------------------------------------- */

describe('the classroom schema validates on read', () => {
	it('defaults for nothing, junk and a blob from before this namespace existed', () => {
		const d = defaultClassroomPreferences();
		expect(readClassroomPreferences(undefined)).toEqual(d);
		expect(readClassroomPreferences('junk')).toEqual(d);
		expect(readClassroomPreferences([1, 2])).toEqual(d);
		expect(readClassroomPreferences({})).toEqual(d);
	});

	it('an invalid field costs that field only; valid ones beside it survive', () => {
		const p = readClassroomPreferences({
			display: { density: 'enormous' },
			classView: { opensOn: 'missing' },
			grading: { advanceAfterReturn: 'yes' },
			// `tour` is the single state F3F5 reserved and no build ever wrote; it is
			// ignored (the per-tour states replaced it, ledger 0297 LEARN), and an
			// unknown tour id and an unknown state beside a valid one are dropped.
			guidance: {
				retiredHints: ['open-palette', 'Bad Id', 7, 'open-palette'],
				tour: 'finished',
				tours: { teacher: 'finished', student: 'enormous', janitor: 'offered' }
			},
			search: { recent: ['cmd:go.home', 'student:ana@boscotech.net', 'item:abc-1', 42] },
			commentBank: { entries: ['kept by the store, not by the reader'] }
		});
		expect(p).toEqual({
			display: { density: 'comfortable', navWidth: null },
			classView: { opensOn: 'missing', todoOpensOn: 'assigned' },
			grading: { advanceAfterReturn: false, gradesOrder: 'due' },
			guidance: { retiredHints: ['open-palette'], tours: { teacher: 'finished', student: 'unseen' } },
			search: { recent: ['cmd:go.home', 'item:abc-1'] },
			// Absent from the stored value, so the group reads as its default
			// (ledger 0297, F4b): the seeded next-step chips, no last look.
			notebookReview: {
				lastLooked: {},
				comments: [
					'Date every entry.',
					'Show why this iteration failed.',
					'State the next test you will run.',
					'Label the parts of your sketch.'
				]
			}
		});
	});

	it('a student is never remembered as a recent pick, and the list is capped', () => {
		expect(recordRecentPick([], 'student:ana@boscotech.net')).toEqual([]);
		expect(recordRecentPick(['item:a'], 'student:ana@boscotech.net')).toEqual(['item:a']);
		expect(recordRecentPick(['item:a', 'item:b'], 'item:b')).toEqual(['item:b', 'item:a']);
		let recent: string[] = [];
		for (let i = 0; i < RECENT_MAX + 5; i++) recent = recordRecentPick(recent, `item:i${i}`);
		expect(recent).toHaveLength(RECENT_MAX);
		expect(recent[0]).toBe(`item:i${RECENT_MAX + 4}`);
		const stored = Array.from({ length: RECENT_MAX + 10 }, (_, i) => `unit:u${i}`);
		expect(readClassroomPreferences({ search: { recent: stored } }).search.recent).toHaveLength(RECENT_MAX);
	});

	it('the view a class opens on maps to something the viewer can change, both directions', () => {
		// Student: to do and missing are theirs; drafts is not.
		expect(classOpensOnFor('todo', false)).toBe('todo');
		expect(classOpensOnFor('missing', false)).toBe('missing');
		expect(classOpensOnFor('drafts', false)).toBe('all');
		expect(classOpensOnFor('all', false)).toBe('all');
		// Manager: drafts is theirs; a student's filters are not.
		expect(classOpensOnFor('drafts', true)).toBe('drafts');
		expect(classOpensOnFor('todo', true)).toBe('all');
		expect(classOpensOnFor('missing', true)).toBe('all');
		// And every value the panel offers resolves to itself for that role.
		const setting = CLASSROOM_SETTINGS.find((s) => s.group === 'classView' && 'field' in s && s.field === 'opensOn')!;
		if (!('options' in setting)) throw new Error('the class-view setting is a choice');
		for (const role of ['student', 'manager'] as const) {
			for (const o of setting.options(role)) {
				expect(classOpensOnFor(o.value as never, role === 'manager')).toBe(o.value);
			}
		}
	});

	it('stores sparse: all-default preferences are nothing, one change is one field', () => {
		expect(compactPreferences(CLASSROOM_PREFERENCE_SCHEMA, defaultClassroomPreferences())).toEqual({});
		const p = defaultClassroomPreferences();
		p.display.density = 'compact';
		expect(compactPreferences(CLASSROOM_PREFERENCE_SCHEMA, p)).toEqual({ display: { density: 'compact' } });
	});

	it('every group has a home, and the panel offers only live settings', () => {
		expect(Object.keys(CLASSROOM_PREFERENCE_HOMES).sort()).toEqual([...CLASSROOM_PREFERENCE_SCHEMA.groups].sort());
		// Every group a surface reads is offered (ledger 0297, LEARN moved the
		// list width, the to-do default, the Grades order, the tours and the
		// notebook review's defaults in), and the ONE field nothing reads --
		// `grading.advanceAfterReturn` -- is offered by no setting at all.
		expect([...new Set(CLASSROOM_SETTINGS.map((s) => s.group))].sort()).toEqual(
			['classView', 'display', 'grading', 'guidance', 'notebookReview', 'search']
		);
		const fields = CLASSROOM_SETTINGS.flatMap((s) => ('field' in s ? [`${s.group}.${s.field}`] : []));
		expect(fields).not.toContain('grading.advanceAfterReturn');
		expect(fields).toEqual(
			expect.arrayContaining(['display.density', 'display.navWidth', 'classView.opensOn', 'classView.todoOpensOn', 'grading.gradesOrder'])
		);
	});
});

describe('MemoryPreferenceStore', () => {
	it('set validates, persists sparse, notifies once, and a no-op notifies nothing', () => {
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		const seen: unknown[] = [];
		store.subscribe((p) => seen.push(p.display.density));
		store.set('display', part('display', { density: 'compact' }));
		store.set('display', part('display', { density: 'compact' }));
		expect(seen).toEqual(['compact']);
		expect(store.stored()).toEqual({ display: { density: 'compact' } });
		// An invalid value takes its default, like a stored one would.
		store.set('display', part('display', { density: 'enormous' as never }));
		expect(store.current.display.density).toBe('comfortable');
		expect(store.stored()).toEqual({});
	});

	it('reset puts one group back and leaves the others', () => {
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		store.set('display', part('display', { density: 'compact' }));
		store.set('classView', part('classView', { opensOn: 'todo' }));
		store.reset('display');
		expect(store.current.display.density).toBe('comfortable');
		expect(store.current.classView.opensOn).toBe('todo');
		expect(store.stored()).toEqual({ classView: { opensOn: 'todo' } });
		expect(groupIsDefault(store.current, 'display')).toBe(true);
		expect(groupIsDefault(store.current, 'classView')).toBe(false);
	});

	it('a group this build does not know survives a write to one it does', () => {
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, {
			commentBank: { entries: ['Nice work'] },
			display: { density: 'compact' }
		});
		expect(store.current.display.density).toBe('compact');
		store.set('grading', part('grading', { advanceAfterReturn: true }));
		expect(store.stored()).toEqual({
			commentBank: { entries: ['Nice work'] },
			display: { density: 'compact' },
			grading: { advanceAfterReturn: true }
		});
	});
});

function mapStorage(): PreferenceStorage & { map: Map<string, string> } {
	const map = new Map<string, string>();
	return {
		map,
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => void map.set(k, v),
		removeItem: (k) => void map.delete(k)
	};
}

describe('LocalPreferenceStore', () => {
	it('writes the sparse form under its key and removes the key when back to defaults', () => {
		const storage = mapStorage();
		const key = classroomLocalKey('u-1');
		const store = new LocalPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, key, storage);
		store.set('display', part('display', { density: 'compact' }));
		expect(JSON.parse(storage.map.get(key)!)).toEqual({ display: { density: 'compact' } });
		store.reset('display');
		expect(storage.map.has(key)).toBe(false);
		// A second store on the same key reads it back.
		store.set('search', { recent: ['cmd:go.home'] });
		const again = new LocalPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, key, storage);
		expect(again.current.search.recent).toEqual(['cmd:go.home']);
	});

	it('is per viewer: another viewer on the same browser starts from defaults', () => {
		const storage = mapStorage();
		new LocalPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, classroomLocalKey('u-1'), storage).set(
			'display',
			part('display', { density: 'compact' })
		);
		const other = new LocalPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, classroomLocalKey('u-2'), storage);
		expect(other.current.display.density).toBe('comfortable');
		expect(classroomLocalKey(null)).toMatch(/anon$/);
	});

	it('two tabs changing different groups both keep theirs (the write re-reads the slot)', () => {
		const storage = mapStorage();
		const key = classroomLocalKey('u-1');
		const tabA = new LocalPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, key, storage);
		const tabB = new LocalPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, key, storage);
		tabA.set('display', part('display', { density: 'compact' }));
		tabB.set('search', { recent: ['item:x'] });
		expect(JSON.parse(storage.map.get(key)!)).toEqual({
			display: { density: 'compact' },
			search: { recent: ['item:x'] }
		});
	});

	it('storage that throws on every access costs nothing but persistence', () => {
		const throwing: PreferenceStorage = {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			},
			removeItem: () => {
				throw new Error('SecurityError');
			}
		};
		const store = new LocalPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, 'k', throwing);
		expect(store.current).toEqual(defaultClassroomPreferences());
		expect(() => store.set('display', part('display', { density: 'compact' }))).not.toThrow();
		expect(store.current.display.density).toBe('compact');
		expect(() => store.reset('display')).not.toThrow();
		// No storage at all is the same answer.
		const none = new LocalPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, 'k', null);
		expect(() => none.set('display', part('display', { density: 'compact' }))).not.toThrow();
	});

	it('a corrupt slot reads as the defaults', () => {
		const storage = mapStorage();
		storage.map.set('k', '{not json');
		expect(new LocalPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, 'k', storage).current).toEqual(
			defaultClassroomPreferences()
		);
	});
});

describe('ProfilePreferenceStore: debounced, fail-soft', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	function recordingWriter(results: boolean[] = []) {
		const calls: Record<string, unknown>[] = [];
		const writer: ProfileNamespaceWriter = {
			async write(changes) {
				calls.push(changes);
				return { ok: results.length ? results.shift()! : true };
			}
		};
		return { writer, calls };
	}

	it('a run of changes inside the debounce is ONE write carrying every changed group', async () => {
		const { writer, calls } = recordingWriter();
		const store = new ProfilePreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, undefined, writer, 400);
		store.set('classView', part('classView', { opensOn: 'todo' }));
		store.set('grading', part('grading', { advanceAfterReturn: true }));
		store.set('classView', part('classView', { opensOn: 'missing' }));
		expect(calls).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(399);
		expect(calls).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(calls).toEqual([{ classView: { opensOn: 'missing' }, grading: { advanceAfterReturn: true } }]);
		expect(store.failed).toBe(false);
	});

	it('a reset writes the group as absent, so the row goes back to sparse', async () => {
		const { writer, calls } = recordingWriter();
		const store = new ProfilePreferenceStore(
			CLASSROOM_PREFERENCE_SCHEMA,
			{ classView: { opensOn: 'todo' } },
			writer
		);
		expect(store.current.classView.opensOn).toBe('todo');
		store.reset('classView');
		await store.flush();
		expect(calls).toEqual([{ classView: undefined }]);
	});

	it('a write that does not land keeps the choice, says so, and is retried with the next change', async () => {
		const { writer, calls } = recordingWriter([false, true]);
		const store = new ProfilePreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, undefined, writer, 400);
		store.set('classView', part('classView', { opensOn: 'todo' }));
		await store.flush();
		expect(store.failed).toBe(true);
		expect(store.current.classView.opensOn).toBe('todo');
		store.set('grading', part('grading', { advanceAfterReturn: true }));
		await store.flush();
		expect(store.failed).toBe(false);
		// The retry carries the group that failed as well as the new one.
		expect(calls[1]).toEqual({ classView: { opensOn: 'todo' }, grading: { advanceAfterReturn: true } });
	});

	it('a writer that throws is a failed write, never an exception', async () => {
		const writer: ProfileNamespaceWriter = {
			write: async () => {
				throw new Error('network');
			}
		};
		const store = new ProfilePreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, undefined, writer);
		store.set('classView', part('classView', { opensOn: 'todo' }));
		await expect(store.flush()).resolves.toBeUndefined();
		expect(store.failed).toBe(true);
	});
});

describe('createClassroomPreferences: each group goes to its home', () => {
	it('device groups to this browser, account groups to the profile row, and nothing crosses', async () => {
		const storage = mapStorage();
		const r = fakeRow({ homepage: { pinned: ['x'] } }, 0);
		const store = createClassroomPreferences({
			viewer: 'u-1',
			account: { initial: undefined, writer: profileNamespaceWriter(r.io, 'classroom') },
			storage
		});
		store.set('display', part('display', { density: 'compact' }));
		store.set('search', { recent: ['cmd:go.home'] });
		store.set('classView', part('classView', { opensOn: 'todo' }));
		await store.flush();
		expect(JSON.parse(storage.map.get(classroomLocalKey('u-1'))!)).toEqual({
			display: { density: 'compact' },
			search: { recent: ['cmd:go.home'] }
		});
		// The row got the account group only, beside the namespace it already had.
		expect(r.row.preferences).toEqual({
			homepage: { pinned: ['x'] },
			classroom: { classView: { opensOn: 'todo' } }
		});
		expect(store.current.display.density).toBe('compact');
		expect(store.current.classView.opensOn).toBe('todo');
	});

	it('reads the account namespace as the page loaded it, and a routed change notifies once', () => {
		const store = createClassroomPreferences({
			viewer: null,
			account: { initial: { classView: { opensOn: 'missing' } }, writer: { write: async () => ({ ok: true }) } },
			storage: mapStorage()
		});
		expect(store.current.classView.opensOn).toBe('missing');
		const seen: string[] = [];
		store.subscribe((p) => seen.push(p.display.density));
		store.set('display', part('display', { density: 'compact' }));
		expect(seen).toEqual(['compact']);
	});

	it('with no account backend the account groups live for the session and never throw', () => {
		const store = createClassroomPreferences({ viewer: null, account: null, storage: null });
		store.set('classView', part('classView', { opensOn: 'drafts' }));
		expect(store.current.classView.opensOn).toBe('drafts');
	});
});

/* -------------------------------------------------------------------------
 * THE WRITE-PATH SWEEP
 * ---------------------------------------------------------------------- */

const ROOT = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(svelte|ts)$/.test(name)) out.push(full);
	}
	return out;
}

/** A direct write of the preferences column: `.update({ preferences ... })`. */
const DIRECT_WRITE = /\.update\(\s*\{[^)]*?\bpreferences\b/g;

/** The one write path, and IdeaCAD's two writers, which already read the row first and belong to another package. */
const ALLOWED_DIRECT = new Set([
	'src/lib/preferences/profile-io.ts',
	'src/lib/ideacad/app/IdeaCadApp.svelte',
	'src/routes/ideacad/+page.svelte'
]);

describe('every preferences writer goes through the one write path', () => {
	const files = walk(join(ROOT, 'src'));
	const hits = files
		.map((f) => ({ file: relative(ROOT, f).split('\\').join('/'), n: (readFileSync(f, 'utf8').match(DIRECT_WRITE) ?? []).length }))
		.filter((h) => h.n > 0);

	it('POSITIVE CONTROL: the sweep finds the write path itself', () => {
		expect(files.length).toBeGreaterThan(300);
		expect(hits.find((h) => h.file === 'src/lib/preferences/profile-io.ts')?.n).toBe(1);
		expect(hits.length).toBeGreaterThanOrEqual(2);
	});

	it('nothing else in src/ writes the column directly', () => {
		expect(hits.filter((h) => !ALLOWED_DIRECT.has(h.file))).toEqual([]);
	});

	it('the five page writers that used to spread the snapshot each call the write path', () => {
		const writers: Record<string, RegExp> = {
			'src/lib/AppLauncher.svelte': /writeProfileNamespace\([\s\S]{0,160}?'homepage'/,
			'src/routes/+page.svelte': /writeProfileNamespace\([\s\S]{0,160}?'classroomFeed'/,
			'src/routes/classroom/[sectionId]/+layout.svelte': /writeProfileNamespace\([\s\S]{0,160}?'classroomUnits'/,
			'src/routes/coin-desk/+page.svelte': /writeProfileNamespace\([\s\S]{0,160}?'coinDesk'/,
			'src/routes/dashboard/+page.svelte': /updateProfilePreferences\(/
		};
		for (const [file, call] of Object.entries(writers)) {
			const src = readFileSync(join(ROOT, file), 'utf8');
			expect(src, file).toMatch(call);
			expect(src, file).toMatch(/from '\$lib\/preferences\/profile-io'/);
		}
	});
});
