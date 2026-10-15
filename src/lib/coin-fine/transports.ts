/**
 * THE COIN V2 CALLS THE FINE SCREEN, THE LIVE CLASS AND THE HALL PASS MAKE,
 * on the caller's own browser client (ledger 0383).
 *
 * NOTHING HERE IS A BOUNDARY. Every function named below re-checks the caller
 * inside the database: the fine screen's four are `is_admin()` only (0240),
 * `coin_no_shop_today` is a section manager's, and `classroom_hall_pass_events`
 * answers a manager every row and a student their own (0243). A refusal in
 * words comes back as a result; a database the migration has not reached
 * (PGRST202, or 42883 from inside a function) comes back `missing`, so the
 * surface can say the update has not landed instead of offering a retry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	FineCategory,
	FineLogOutcome,
	FineResult,
	FineRoster,
	FineSection,
	FineTransports
} from './fine';
import type { HallPassEvents, HallPassEventsTransport } from '$lib/classroom/hall-pass';

type RpcError = { code?: string | null; message?: string | null } | null;

/** Is this failure "the function is not there yet". */
export function rpcMissing(error: RpcError): boolean {
	const code = (error?.code ?? '').trim();
	return code === 'PGRST202' || code === '42883';
}

function fail<T>(error: RpcError, fallback: string): FineResult<T> {
	if (rpcMissing(error)) {
		return { ok: false, missing: true, message: 'The coin database update has not landed yet.' };
	}
	return { ok: false, missing: false, message: fallback };
}

const asObject = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function createFineTransports(supabase: SupabaseClient): FineTransports {
	return {
		async sections() {
			const { data, error } = await supabase.rpc('coin_fine_sections');
			if (error) return fail(error, 'Could not load the classes. Try again.');
			return { ok: true, data: (Array.isArray(data) ? data : []) as FineSection[] };
		},
		async roster(sectionId) {
			const { data, error } = await supabase.rpc('coin_fine_roster', { p_section_id: sectionId });
			if (error) return fail(error, 'Could not load the class list. Try again.');
			const row = asObject(data);
			return {
				ok: true,
				data: {
					section_id: String(row.section_id ?? sectionId),
					label: String(row.label ?? ''),
					students: (Array.isArray(row.students) ? row.students : []) as FineRoster['students']
				}
			};
		},
		async settings() {
			const { data, error } = await supabase.rpc('coin_settings_get');
			if (error) return fail(error, 'Could not load the fine buttons. Try again.');
			const row = asObject(data);
			const settings = asObject(row.settings);
			const buttons = Array.isArray(settings.fine_buttons)
				? settings.fine_buttons.filter((b): b is string => typeof b === 'string')
				: [];
			return {
				ok: true,
				data: {
					fineButtons: buttons,
					categories: (Array.isArray(row.categories) ? row.categories : []) as FineCategory[]
				}
			};
		},
		async log(emails, categoryId, options = {}) {
			const { data, error } = await supabase.rpc('coin_fine_log', {
				p_emails: emails,
				p_category_id: categoryId,
				p_amount: options.amount ?? null,
				p_careless_cost: options.carelessCost ?? null
			});
			if (error) return fail(error, error.message ? `Not posted: ${error.message}` : 'Not posted. Try again.');
			const row = asObject(data);
			if (row.ok === false) {
				return {
					ok: true,
					data: {
						total: emails.length,
						succeeded: 0,
						refused: emails.length,
						results: emails.map((email) => ({ email, ok: false, reason: String(row.reason ?? '') }))
					}
				};
			}
			return {
				ok: true,
				data: {
					total: Number(row.total ?? 0),
					succeeded: Number(row.succeeded ?? 0),
					refused: Number(row.refused ?? 0),
					results: (Array.isArray(row.results) ? row.results : []) as FineLogOutcome['results']
				}
			};
		},
		async reverse(transactionId) {
			const { data, error } = await supabase.rpc('coin_reverse_transaction', {
				p_transaction_id: transactionId,
				p_note: 'Undone on the fine screen.'
			});
			if (error) return fail(error, 'Could not undo. Try again.');
			const row = asObject(data);
			return { ok: true, data: { ok: row.ok === true, reason: (row.reason as string | null) ?? null } };
		}
	};
}

/** One row of today's no-shop list for a class. */
export interface NoShopRow {
	email: string;
	name: string | null;
	reason: string | null;
}

/**
 * TODAY'S NO-SHOP LIST FOR ONE CLASS, a section manager's read. Answers null
 * for any failure, and `'missing'` where the database is older than 0240, so
 * the panel can leave itself out rather than claim nobody is barred.
 */
export type NoShopTransport = (sectionId: string) => Promise<NoShopRow[] | null | 'missing'>;

export function createNoShopTransport(supabase: SupabaseClient): NoShopTransport {
	return async (sectionId) => {
		const { data, error } = await supabase.rpc('coin_no_shop_today', { p_section_id: sectionId });
		if (error) return rpcMissing(error) ? 'missing' : null;
		return (Array.isArray(data) ? data : []) as NoShopRow[];
	};
}

/**
 * THE HALL PASS'S WARNINGS AND FINES (0243): every row for a manager, a
 * student's own for a student, decided by the database. Lives here rather than
 * in `$lib/classroom/hall-pass`, which is the pure half and holds no client.
 */
export function createHallPassEventsTransport(supabase: SupabaseClient): HallPassEventsTransport {
	return async (sectionId) => {
		const { data, error } = await supabase.rpc('classroom_hall_pass_events', {
			p_section_id: sectionId,
			p_limit: 50
		});
		if (error) return rpcMissing(error) ? 'missing' : null;
		if (!data || typeof data !== 'object') return null;
		const row = data as Record<string, unknown>;
		return {
			scope: row.scope === 'manager' ? 'manager' : 'student',
			warn_minutes: (row.warn_minutes as number | string) ?? 0,
			fine_minutes: (row.fine_minutes as number | string) ?? 0,
			events: (Array.isArray(row.events) ? row.events : []) as HallPassEvents['events']
		};
	};
}
