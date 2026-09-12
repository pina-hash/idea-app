/**
 * THE TWO SERVER CALLS, AND THE IN-MEMORY TWIN A HARNESS DRIVES INSTEAD.
 *
 * Transports are INJECTED, per the repo's rule: the real route points these at
 * the RPCs, the dev harness answers in memory, and the component under test is
 * the identical one in both. The twin is a real implementation of the
 * interface, not a stub of it -- it holds rows, applies the same throttle and
 * the same credit rule, and ages exactly as the database would.
 *
 * AN OMITTED TRANSPORT REMOVES THE THING IT DRIVES. A console handed no
 * `loadPresence` renders no presence region at all -- not an empty one, not a
 * placeholder. That is the absence-is-the-mechanism rule, and it is what makes
 * the region structurally impossible on a deployment where `0200` is not
 * applied, rather than conditionally hidden.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	PRESENCE_LIMITS_FALLBACK,
	parsePresencePayload,
	presenceState,
	type PresenceLimits,
	type PresencePayload,
	type PresenceRow
} from './state';
import type { PresenceBeat } from './heartbeat';

export interface PresenceTransports {
	/**
	 * The instructor's read. NULL is a normal answer -- a caller who manages no
	 * section of this item, or a deployment before 0200 -- and renders nothing.
	 */
	loadPresence(itemId: string, sectionId: string | null): Promise<PresencePayload | null>;
}

export interface PresenceBeatTransport {
	/** The student's beat. Fire and forget: nothing awaits it and nothing reports it. */
	ping(beat: PresenceBeat): void;
}

/**
 * DEGRADES PAST A MISSING RPC ON `PGRST202` AND NOTHING ELSE, so a runtime
 * error inside the function fails closed rather than falling through to a
 * weaker path -- the same rung every other client read here is written as.
 * Before `0200` is applied the function does not exist, which is a real
 * deployment state and not an error.
 */
export function createPresenceTransports(
	supabase: SupabaseClient,
	itemId: string
): PresenceTransports {
	return {
		async loadPresence(item, sectionId) {
			const { data, error } = await supabase.rpc('classroom_presence_state', {
				p_item_id: item || itemId,
				p_section_id: sectionId
			});
			if (error) {
				if (error.code === 'PGRST202') return null;
				throw error;
			}
			return parsePresencePayload(data);
		}
	};
}

export function createPresenceBeatTransport(
	supabase: SupabaseClient,
	itemId: string
): PresenceBeatTransport {
	return {
		ping(beat) {
			void supabase
				.rpc('classroom_presence_ping', {
					p_item_id: itemId,
					p_typed: beat.typed,
					p_page_visible: beat.visible
				})
				.then(
					() => undefined,
					() => {
						/* Best effort by contract. A missed beat costs one poll interval. */
					}
				);
		}
	};
}

/**
 * THE IN-MEMORY TWIN, for the dev harness and for `tests/dom/`. It is a REAL
 * implementation of both interfaces rather than a stub of them, so a component
 * driven against it exercises the identical code -- and it reproduces the three
 * rules a harness could otherwise silently drift from:
 *
 *   - THE 20-SECOND THROTTLE. A beat inside the window writes nothing, exactly
 *     as `classroom_presence_ping` refuses it. A harness whose twin wrote every
 *     beat would make a write-rate assertion vacuous.
 *   - THE CREDIT RULE. Seconds accrue only for an interval reported as BOTH
 *     typed and visible, capped at two heartbeats, and never on a first beat.
 *   - THE STATE. Derived by `presenceState`, which is the mirror of the SQL,
 *     so what the harness paints is what the database would have said.
 *
 * `now` IS INJECTED here too, so a harness can drive a whole period through it
 * in milliseconds.
 */
export function createMemoryPresence(options: {
	now: () => number;
	limits?: PresenceLimits;
	/** Who the beats are from. One student per twin, which is one browser. */
	studentEmail: string;
	seed?: PresenceRow[];
}): PresenceTransports &
	PresenceBeatTransport & {
		rows: Map<string, PresenceRow>;
		/** Beats the twin was handed, including the ones it refused to write. */
		readonly beats: { beat: PresenceBeat; at: number; written: boolean }[];
		/** How many beats actually changed a row. The write-rate instrument. */
		writes(): number;
	} {
	const limits = options.limits ?? PRESENCE_LIMITS_FALLBACK;
	const rows = new Map<string, PresenceRow>(
		(options.seed ?? []).map((r) => [r.student_email, { ...r }])
	);
	const beats: { beat: PresenceBeat; at: number; written: boolean }[] = [];

	return {
		rows,
		beats,
		writes() {
			return beats.filter((b) => b.written).length;
		},
		async loadPresence() {
			const at = options.now();
			return {
				item_id: 'memory-item',
				section_id: null,
				at: new Date(at).toISOString(),
				limits,
				students: [...rows.values()].map((r) => ({
					...r,
					state: presenceState(r, at, limits)
				}))
			};
		},
		ping(beat) {
			const at = options.now();
			const iso = new Date(at).toISOString();
			const held = rows.get(options.studentEmail);
			const lastSeen = held ? Date.parse(held.last_seen_at ?? '') : NaN;
			if (Number.isFinite(lastSeen) && at - lastSeen < limits.minGapSeconds * 1000) {
				beats.push({ beat, at, written: false });
				return;
			}
			let credit = 0;
			if (held && Number.isFinite(lastSeen) && beat.typed && beat.visible) {
				credit = Math.max(
					0,
					Math.floor(
						Math.min(at - lastSeen, limits.heartbeatSeconds * 2 * 1000) / 1000
					)
				);
			}
			rows.set(options.studentEmail, {
				student_email: options.studentEmail,
				state: null,
				first_seen_at: held?.first_seen_at ?? iso,
				last_seen_at: iso,
				last_input_at: beat.typed ? iso : (held?.last_input_at ?? null),
				page_visible: beat.visible,
				active_seconds: (held?.active_seconds ?? 0) + credit
			});
			beats.push({ beat, at, written: true });
		}
	};
}
