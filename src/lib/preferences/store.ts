/**
 * ONE STORE SHAPE FOR EVERYTHING A PERSON CUSTOMIZES, AND THE SEAM A SERVER
 * STORE TAKES OVER AT.
 *
 * The shape is IdeaCAD's (`$lib/ideacad/solid/preferences.ts`, ledger 0296),
 * copied and generalized rather than imported: that module pulls the sketch
 * engine in at runtime, and a classroom page must not pay for a CAD kernel to
 * read a density. Everything here is generic over a SCHEMA, so the classroom's
 * groups (`./classroom.ts`) are one caller and the next surface is another.
 *
 * THE INTERFACE IS THE SEAM. Every caller holds a `PreferenceStore<P>` and
 * nothing else: `current`, `set(group, value)`, `reset(group)`, `subscribe`,
 * `flush`. Where a value LIVES is the store's business, so a server-backed
 * store (a table with its own policy, when one is ever wanted) replaces the
 * profile store below without a caller changing a line.
 *
 * THREE BACKINGS AND ONE ROUTER.
 *   - `MemoryPreferenceStore`  -- tests; `stored()` is exactly what a backend
 *                                 would have been handed.
 *   - `LocalPreferenceStore`   -- this browser's `localStorage`, per viewer;
 *                                 every access in a try.
 *   - `ProfilePreferenceStore` -- one namespace of `profiles.preferences`,
 *                                 read-then-merge, debounced, fail-soft.
 *   - `RoutedPreferenceStore`  -- one schema whose groups each declare a HOME
 *                                 (`device` or `account`), each group persisted
 *                                 to the store for its home. What follows the
 *                                 screen stays on the screen; what follows the
 *                                 person follows them.
 *
 * VALIDATED ON READ, STORED SPARSE. A schema's `read` checks every field
 * against what the interface can render and drops anything unknown or invalid
 * back to its default, so a stored value can never put a surface in a state no
 * branch renders (CLAUDE.md, preferences). Only fields that differ from the
 * defaults are written, so a better default later reaches everybody who never
 * chose. A value is a DEFAULT, never an entry: nothing here remembers a
 * student, an item or an amount.
 *
 * GROUP-LEVEL MERGE ON WRITE, AND IT IS WHAT LEAVES ROOM FOR LATER GROUPS. A
 * store writes only the groups that CHANGED, merged into the namespace as it
 * stands (read first), so a group this build does not know -- a comment bank
 * a later build adds -- survives this build's write untouched. An older client
 * writing its density cannot erase a newer client's comment bank.
 */

export type PreferenceHome = 'device' | 'account';

/** What a store needs to know about one namespace's groups. */
export interface PreferenceSchema<P extends object> {
	/** Every group, in the order a settings panel lists them. */
	readonly groups: readonly (keyof P & string)[];
	defaults(): P;
	/**
	 * A stored blob to values the interface can render. Unknown keys are
	 * ignored and an invalid field takes its default, field by field, so one
	 * bad value costs that value and nothing beside it.
	 */
	read(raw: unknown): P;
}

export interface PreferenceStore<P extends object> {
	/** The validated preferences as they stand. A new object after every change. */
	readonly current: P;
	/** Replace one group. Validated like a stored value, so an invalid field takes its default. */
	set<G extends keyof P & string>(group: G, value: P[G]): void;
	/** Put one group back to its defaults. */
	reset(group: keyof P & string): void;
	/** Called with the new preferences after every change. Returns the unsubscribe. */
	subscribe(listener: (p: P) => void): () => void;
	/** Finish any pending write. */
	flush(): Promise<void>;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One group's sparse form: only the fields that differ from the default, or
 * undefined when nothing does (the group is then absent from storage).
 */
export function compactGroup<P extends object>(
	schema: PreferenceSchema<P>,
	group: keyof P & string,
	value: P[keyof P & string]
): Record<string, unknown> | undefined {
	const base = schema.defaults()[group] as unknown;
	if (!isObject(value) || !isObject(base)) return same(value, base) ? undefined : { value };
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(value)) if (!same(value[key], base[key])) out[key] = value[key];
	return Object.keys(out).length ? out : undefined;
}

/** The whole sparse form: per group, only the changed fields; an unchanged group is absent. */
export function compactPreferences<P extends object>(
	schema: PreferenceSchema<P>,
	p: P
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const group of schema.groups) {
		const sparse = compactGroup(schema, group, p[group]);
		if (sparse) out[group] = sparse;
	}
	return out;
}

/** Apply a set of group changes to a stored namespace object, keeping every group not named. */
export function applyGroupChanges(
	stored: unknown,
	changes: Record<string, Record<string, unknown> | undefined>
): Record<string, unknown> {
	const out = isObject(stored) ? { ...stored } : {};
	for (const [group, value] of Object.entries(changes)) {
		if (value === undefined) delete out[group];
		else out[group] = value;
	}
	return out;
}

abstract class BaseStore<P extends object> implements PreferenceStore<P> {
	private value: P;
	private listeners = new Set<(p: P) => void>();
	constructor(
		protected readonly schema: PreferenceSchema<P>,
		initial: unknown
	) {
		this.value = schema.read(initial);
	}
	get current() {
		return this.value;
	}
	set<G extends keyof P & string>(group: G, value: P[G]) {
		const next = this.schema.read({ ...compactPreferences(this.schema, this.value), [group]: value });
		if (same(next, this.value)) return;
		this.value = next;
		this.persist({ [group]: compactGroup(this.schema, group, next[group]) });
		for (const l of [...this.listeners]) l(next);
	}
	reset(group: keyof P & string) {
		this.set(group, this.schema.defaults()[group]);
	}
	subscribe(listener: (p: P) => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	flush(): Promise<void> {
		return Promise.resolve();
	}
	/** The groups that changed, each as its sparse form (undefined = back to all defaults). */
	protected abstract persist(changes: Record<string, Record<string, unknown> | undefined>): void;
}

/** In memory only, for tests: `stored()` is exactly what a backend would hold. */
export class MemoryPreferenceStore<P extends object> extends BaseStore<P> {
	private last: Record<string, unknown>;
	constructor(schema: PreferenceSchema<P>, initial?: unknown) {
		super(schema, initial);
		this.last = isObject(initial) ? { ...initial } : {};
	}
	stored() {
		return this.last;
	}
	protected persist(changes: Record<string, Record<string, unknown> | undefined>) {
		this.last = applyGroupChanges(this.last, changes);
	}
}

/** The part of `Storage` this store touches, so a test can hand in one that throws. */
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): PreferenceStorage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

/**
 * Per viewer, in this browser's `localStorage`. EVERY ACCESS IS IN A TRY:
 * storage throws in a private window, with site data blocked, and when full,
 * and a preference is never worth an exception. A read that fails is the
 * defaults; a write that fails keeps the choice for this session.
 *
 * The write re-reads the slot and merges the changed groups into it, so two
 * tabs of one browser each changing a different group both keep theirs.
 */
export class LocalPreferenceStore<P extends object> extends BaseStore<P> {
	private readonly storage: () => PreferenceStorage | null;
	constructor(
		schema: PreferenceSchema<P>,
		private readonly key: string,
		storage?: PreferenceStorage | null
	) {
		const get = () => (storage !== undefined ? storage : defaultStorage());
		super(schema, LocalPreferenceStore.load(get, key));
		this.storage = get;
	}
	private static load(get: () => PreferenceStorage | null, key: string): unknown {
		try {
			const text = get()?.getItem(key);
			return text ? JSON.parse(text) : undefined;
		} catch {
			return undefined;
		}
	}
	protected persist(changes: Record<string, Record<string, unknown> | undefined>) {
		try {
			const store = this.storage();
			if (!store) return;
			const next = applyGroupChanges(LocalPreferenceStore.load(this.storage, this.key), changes);
			if (Object.keys(next).length) store.setItem(this.key, JSON.stringify(next));
			else store.removeItem(this.key);
		} catch {
			/* a full or blocked storage keeps the choice for this session */
		}
	}
}

/** The profile row, as `./profile-io.ts` reaches it. Re-declared structurally so a test needs no Supabase. */
export interface ProfileNamespaceWriter {
	/** Merge these group changes into the namespace as it stands in the row now. */
	write(changes: Record<string, Record<string, unknown> | undefined>): Promise<{ ok: boolean }>;
}

/**
 * One namespace of the person's own profile row, so it follows them to any
 * computer. Writes are DEBOUNCED (a run of changes is one write) and each one
 * goes through a writer that READS THE ROW FIRST and merges only the groups
 * that changed, so another namespace, and a group this build does not know,
 * are kept. A write that does not land keeps the choice on screen for the
 * session and is retried with the next change (`failed` says so meanwhile).
 */
export class ProfilePreferenceStore<P extends object> extends BaseStore<P> {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private pending: Record<string, Record<string, unknown> | undefined> = {};
	private writing: Promise<void> = Promise.resolve();
	/** True after a write that did not land, until one does. */
	failed = false;
	constructor(
		schema: PreferenceSchema<P>,
		initial: unknown,
		private readonly writer: ProfileNamespaceWriter,
		private readonly debounceMs = 400
	) {
		super(schema, initial);
	}
	protected persist(changes: Record<string, Record<string, unknown> | undefined>) {
		this.pending = { ...this.pending, ...changes };
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.write();
		}, this.debounceMs);
	}
	private write(): Promise<void> {
		const changes = this.pending;
		if (!Object.keys(changes).length) return this.writing;
		this.pending = {};
		this.writing = this.writing.then(async () => {
			let ok = false;
			try {
				ok = (await this.writer.write(changes)).ok;
			} catch {
				ok = false;
			}
			this.failed = !ok;
			// Put back what did not land, under anything changed since.
			if (!ok) this.pending = { ...changes, ...this.pending };
		});
		return this.writing;
	}
	async flush() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		await this.write();
	}
}

/**
 * ONE SCHEMA, TWO HOMES. Each group names where it lives; `set` hands it to
 * that home's store and `current` reads each group back from its own home.
 * A caller never learns which is which, which is the point.
 */
export class RoutedPreferenceStore<P extends object> implements PreferenceStore<P> {
	private value: P;
	private listeners = new Set<(p: P) => void>();
	constructor(
		private readonly schema: PreferenceSchema<P>,
		private readonly homes: Readonly<Record<keyof P & string, PreferenceHome>>,
		private readonly stores: Readonly<Record<PreferenceHome, PreferenceStore<P>>>
	) {
		this.value = this.combine();
		const notify = () => {
			const next = this.combine();
			if (same(next, this.value)) return;
			this.value = next;
			for (const l of [...this.listeners]) l(next);
		};
		stores.device.subscribe(notify);
		if (stores.account !== stores.device) stores.account.subscribe(notify);
	}
	private combine(): P {
		const out = { ...this.schema.defaults() };
		for (const group of this.schema.groups) {
			(out as Record<string, unknown>)[group] = this.stores[this.homes[group]].current[group];
		}
		return out;
	}
	get current() {
		return this.value;
	}
	set<G extends keyof P & string>(group: G, value: P[G]) {
		this.stores[this.homes[group]].set(group, value);
	}
	reset(group: keyof P & string) {
		this.stores[this.homes[group]].reset(group);
	}
	subscribe(listener: (p: P) => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	async flush() {
		await Promise.all([this.stores.device.flush(), this.stores.account.flush()]);
	}
}
