/**
 * THE ONE WRITE PATH INTO `profiles.preferences`, AND WHY IT READS FIRST.
 *
 * `profiles.preferences` is one free-form jsonb column shared by several
 * independent namespaces (`homepage`, `classroomFeed`, `classroomUnits`,
 * `coinDesk`, `dashboard`, `ideacad`, `classroom`). Every writer replaces the
 * WHOLE column, because that is the only write the own-row update policy and
 * PostgREST give a browser client, so the value a writer spreads its one
 * namespace over decides whether the others survive.
 *
 * THE MEASURED CLOBBER THIS ENDS. Every writer used to spread the PAGE-LOAD
 * SNAPSHOT (`page.data.userProfile.preferences`, which the root layout loads
 * once and client navigation never refreshes). Folding a class card on the
 * home page wrote `{classroomFeed}` over that snapshot; pinning an app a moment
 * later wrote `{homepage}` over the SAME snapshot, which did not contain the
 * fold, so the fold was gone (ledger 0297 Phase 0, measured on /dev/tour). The
 * same shape erased a unit fold made in a class the next time the launcher
 * recorded an app open.
 *
 * SO EVERY WRITE READS THE ROW FIRST AND MERGES INTO WHAT IS THERE NOW. That is
 * the whole-blob spread-merge CLAUDE.md already describes, with the base taken
 * from the database a moment before the write instead of from a snapshot of
 * unknown age. It needs no migration and no new grant: the read is the same
 * own-row select the root layout makes, the write the same own-row update.
 *
 * AND THE WRITES IN ONE TAB ARE SERIALIZED, per user, through one promise
 * chain. Read-then-write is two round trips; two of them in flight at once
 * (a pin while a fold is still saving) would each read the row before the
 * other wrote it, and the second write would drop the first. Queued, the
 * second read sees the first write. Two DEVICES can still race each other,
 * exactly as they always could: this narrows the window to one round trip and
 * never widens it, which is what the brief asked (OVERHAUL_0297 F5, "keep to
 * that write path and do not widen the race").
 *
 * FAILS SOFT. A read that fails SKIPS the write rather than writing over a row
 * it could not see; the caller keeps its choice on screen for the session and
 * gets `{ ok: false }` to report or ignore. Nothing here throws: a preference
 * is never worth interrupting the work.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyGroupChanges, type ProfileNamespaceWriter } from './store';

/** How a store reaches the row: read the whole `preferences` column, write it back whole. */
export interface ProfilePreferenceIo {
	/** A stable key for the row (the user id), so writes to one row share one queue. */
	readonly key: string;
	read(): Promise<unknown>;
	write(preferences: Record<string, unknown>): Promise<void>;
}

export type PreferenceWriteResult = { ok: true } | { ok: false; message: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The whole blob with ONE top-level namespace replaced and every sibling kept
 * exactly as it was. `value === undefined` removes the key, which is what a
 * store writes when a namespace is back to all defaults (sparse storage).
 */
export function mergeNamespace(
	blob: unknown,
	namespace: string,
	value: unknown
): Record<string, unknown> {
	const base = isObject(blob) ? { ...blob } : {};
	if (value === undefined) delete base[namespace];
	else base[namespace] = value;
	return base;
}

/** The namespace's own value as it stands in a blob, or undefined. */
export function namespaceOf(blob: unknown, namespace: string): unknown {
	return isObject(blob) ? blob[namespace] : undefined;
}

/**
 * The profile row through a Supabase client. The read is the caller's own row
 * under the own-row select policy; the write the own-row update policy
 * (0001). No identity parameter reaches anything but the `eq('id', ...)` the
 * policy re-checks, so a wrong id writes nothing.
 */
export function supabaseProfileIo(supabase: SupabaseClient, userId: string): ProfilePreferenceIo {
	return {
		key: userId,
		async read() {
			const { data, error } = await supabase
				.from('profiles')
				.select('preferences')
				.eq('id', userId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) throw new Error('Your profile could not be read.');
			return (data as { preferences?: unknown }).preferences ?? {};
		},
		async write(preferences) {
			const { error } = await supabase.from('profiles').update({ preferences }).eq('id', userId);
			if (error) throw new Error(error.message);
		}
	};
}

/** One promise chain per row, module-level so every writer in this tab shares it. */
const chains = new Map<string, Promise<unknown>>();

/**
 * READ THE ROW, APPLY `next` TO WHAT IS THERE, WRITE IT BACK, in this tab's
 * queue for that row. `next` receives the blob as it stands NOW and returns the
 * whole blob to write; `mergeNamespace` is the usual body. A subsystem that
 * already owns a merge function (the dashboard's `mergeConsolePrefs`) passes
 * it here unchanged, so its one spelling of the merge stays the only one.
 */
export function updateProfilePreferences(
	io: ProfilePreferenceIo,
	next: (current: unknown) => Record<string, unknown>
): Promise<PreferenceWriteResult> {
	const previous = chains.get(io.key) ?? Promise.resolve();
	const run = previous.then(async (): Promise<PreferenceWriteResult> => {
		let current: unknown;
		try {
			current = await io.read();
		} catch (e) {
			return { ok: false, message: e instanceof Error ? e.message : 'Your settings could not be read.' };
		}
		try {
			await io.write(next(current));
			return { ok: true };
		} catch (e) {
			return { ok: false, message: e instanceof Error ? e.message : 'Your settings could not be saved.' };
		}
	});
	// The chain carries completion only, never a rejection: one failed write
	// must not wedge every write queued behind it.
	chains.set(
		io.key,
		run.then(
			() => undefined,
			() => undefined
		)
	);
	return run;
}

/** The common case: replace one namespace in the row as it stands now. */
export function writeProfileNamespace(
	io: ProfilePreferenceIo,
	namespace: string,
	value: unknown
): Promise<PreferenceWriteResult> {
	return updateProfilePreferences(io, (current) => mergeNamespace(current, namespace, value));
}

/**
 * A GROUPED NAMESPACE's writer, for `ProfilePreferenceStore`: merge only the
 * groups that changed into the namespace as it stands in the row now, keep
 * every other group (including one this build has never heard of), and remove
 * the namespace entirely when nothing in it differs from a default.
 */
export function profileNamespaceWriter(
	io: ProfilePreferenceIo,
	namespace: string
): ProfileNamespaceWriter {
	return {
		write: (changes) =>
			updateProfilePreferences(io, (current) => {
				const merged = applyGroupChanges(namespaceOf(current, namespace), changes);
				return mergeNamespace(current, namespace, Object.keys(merged).length ? merged : undefined);
			})
	};
}
