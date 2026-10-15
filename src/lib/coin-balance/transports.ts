import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoinBuyResult } from '$lib/coin-balance';
import { readActionAnswer, type CoinActionResult } from './extras';
import { uploadCoinPhoto, type CoinUploadResult } from './uploads';

/** What a split payment can buy (0246's `p_item`). */
export type CoinSplitItem = 'eating_pass' | 'pay_raise' | 'three_d_printing' | 'extra_credit';

/** The item-specific inputs a split passes through to the quote. */
export interface CoinSplitInputs {
	grams?: number | null;
	sectionId?: string | null;
	submissionId?: string | null;
	points?: number | null;
}

/**
 * The four student purchases on `/coin-balance` (0241), as injected
 * transports. The page component never touches Supabase: the route builds
 * these over the caller's own browser client and the dev harness answers in
 * memory, so the harness mounts the identical component.
 *
 * NONE OF THEM SENDS AN EMAIL OR AN AMOUNT, because none of the functions
 * takes one. Who is buying comes from the session; every price comes from the
 * database. What is sent is a choice (which work, how many points) or a
 * measurement (grams off the slicer).
 *
 * An omitted transport removes the control it drives, so a surface that
 * cannot buy (a preview, a database without 0241) passes none.
 */
export interface CoinPageTransports {
	buyEatingPass?: () => Promise<CoinBuyResult>;
	buyPayRaise?: () => Promise<CoinBuyResult>;
	buyPrint?: (grams: number) => Promise<CoinBuyResult>;
	buyExtraCredit?: (sectionId: string, submissionId: string, points: number) => Promise<CoinBuyResult>;

	/*
	 * SESSION TWO (0245 to 0250). Each is optional for the same reason: an
	 * omitted one removes its control. The only amounts a student ever sends
	 * are the two 0246 records as considered exceptions: coins out of their own
	 * balance, and the part of a server-computed price they hand over.
	 */
	/** Pay part of a purchase in physical coins (2.3). */
	buySplit?: (item: CoinSplitItem, physical: number, inputs: CoinSplitInputs) => Promise<CoinBuyResult>;
	/** Coins out, held until payday (2.4). */
	requestPayout?: (coins: number) => Promise<CoinActionResult>;
	cancelPayout?: () => Promise<CoinActionResult>;
	/** One picture into the caller's own folder of `coin-uploads`. */
	uploadPhoto?: (file: Blob & { name?: string }) => Promise<CoinUploadResult>;
	submitBackground?: (path: string, width: number, height: number) => Promise<CoinActionResult>;
	submitDonation?: (itemId: string | null, quantity: number, other: string | null, path: string) => Promise<CoinActionResult>;
	reportOnHand?: (count: number) => Promise<CoinActionResult>;
	disputeFine?: (transactionId: string, reason: string) => Promise<CoinActionResult>;
	cancelRequest?: (requestId: string) => Promise<CoinActionResult>;
	claimContract?: (contractId: string) => Promise<CoinActionResult>;
	markContractDone?: (contractId: string, hours: number | null, note: string | null) => Promise<CoinActionResult>;
	auditorValidate?: (requestId: string, approve: boolean, note: string | null) => Promise<CoinActionResult>;
	/** The caller's own raw rows (`coin_export('student', <own address>)`). */
	exportRows?: () => Promise<{ ok: true; data: unknown } | { ok: false; words: string }>;
}

/** The role portal's three (0247). */
export interface CoinRoleTransports {
	uploadPhoto?: (file: Blob & { name?: string }) => Promise<CoinUploadResult>;
	capture?: (holderId: string, path: string) => Promise<CoinActionResult>;
	requestException?: (holderId: string, day: string, note: string) => Promise<CoinActionResult>;
	/** A live camera. Absent, the portal offers only the camera-only file input. */
	openCamera?: () => Promise<MediaStream>;
}

type RpcAnswer = { data: unknown; error: { code?: string; message?: string } | null };

/** A purchase's answer, read the same way for all four. */
export function readBuyAnswer({ data, error }: RpcAnswer): CoinBuyResult {
	if (error) {
		// A missing function (the migration is not applied yet) is "not for
		// sale", never a crash. Anything else is a failure the person can retry.
		if (error.code === 'PGRST202' || error.code === '42883') return { ok: false, reason: 'not_available' };
		return { ok: false, reason: 'error', message: error.message };
	}
	if (!data || typeof data !== 'object') return { ok: false, reason: 'error' };
	const d = data as Record<string, unknown>;
	if (d.ok === true) {
		return {
			ok: true,
			cost: d.cost === undefined ? undefined : Number(d.cost),
			balance: d.balance === undefined ? undefined : Number(d.balance),
			points: d.points === undefined ? undefined : Number(d.points),
			new_tier: d.new_tier === undefined ? undefined : Number(d.new_tier),
			price: d.price === undefined ? undefined : Number(d.price),
			digital: d.digital === undefined ? undefined : Number(d.digital),
			physical: d.physical === undefined ? undefined : Number(d.physical),
			request_id: typeof d.request_id === 'string' ? d.request_id : undefined
		};
	}
	return {
		ok: false,
		reason: typeof d.reason === 'string' ? d.reason : 'error',
		balance: d.balance === undefined ? undefined : Number(d.balance),
		cost: d.cost === undefined ? undefined : Number(d.cost),
		price: d.price === undefined ? undefined : Number(d.price),
		room: d.room && typeof d.room === 'object' ? (d.room as Record<string, number>) : undefined
	};
}

async function call(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<CoinBuyResult> {
	try {
		const answer = args ? await supabase.rpc(fn, args) : await supabase.rpc(fn);
		return readBuyAnswer(answer as RpcAnswer);
	} catch (e) {
		return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
	}
}

async function act(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<CoinActionResult> {
	try {
		const answer = args ? await supabase.rpc(fn, args) : await supabase.rpc(fn);
		return readActionAnswer(answer as RpcAnswer);
	} catch (e) {
		return { ok: false, reason: 'error', data: {}, message: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * The route's transports. `userId` (the session's own uid) names the upload
 * folder; `email` (the session's own address) is the one `coin_export` is
 * asked about, which the function itself refuses for anybody else.
 */
export function createCoinPageTransports(
	supabase: SupabaseClient,
	who: { userId?: string | null; email?: string | null } = {}
): CoinPageTransports {
	const userId = who.userId ?? '';
	const email = who.email ?? '';
	return {
		buySplit: (item, physical, inputs) =>
			call(supabase, 'coin_buy_split', {
				p_item: item,
				p_physical_part: physical,
				p_grams: inputs.grams ?? null,
				p_section_id: inputs.sectionId ?? null,
				p_submission_id: inputs.submissionId ?? null,
				p_points: inputs.points ?? null
			}),
		requestPayout: (n) => act(supabase, 'coin_request_payout', { p_coins: n }),
		cancelPayout: () => act(supabase, 'coin_cancel_payout'),
		...(userId
			? {
					uploadPhoto: (file: Blob & { name?: string }) => uploadCoinPhoto(supabase, userId, file),
					submitBackground: (path: string, width: number, height: number) =>
						act(supabase, 'coin_submit_background', { p_path: path, p_width: width, p_height: height }),
					submitDonation: (itemId: string | null, quantity: number, other: string | null, path: string) =>
						act(supabase, 'coin_submit_donation', { p_item_id: itemId, p_quantity: quantity, p_other: other, p_path: path })
				}
			: {}),
		reportOnHand: (count) => act(supabase, 'coin_report_physical', { p_count: count }),
		disputeFine: (id, reason) => act(supabase, 'coin_dispute_fine', { p_transaction_id: id, p_reason: reason }),
		cancelRequest: (id) => act(supabase, 'coin_cancel_request', { p_request_id: id }),
		claimContract: (id) => act(supabase, 'coin_contract_self_claim', { p_contract_id: id }),
		markContractDone: (id, hours, note) =>
			act(supabase, 'coin_contract_mark_done', { p_contract_id: id, p_hours: hours, p_note: note }),
		auditorValidate: (id, approve, note) =>
			act(supabase, 'coin_auditor_validate', { p_request_id: id, p_approve: approve, p_note: note }),
		...(email
			? {
					exportRows: async () => {
						try {
							const { data, error } = await supabase.rpc('coin_export', {
								p_scope: 'student',
								p_email: email,
								p_section_id: null
							});
							if (error) return { ok: false as const, words: 'Your rows could not be read. Try again in a minute.' };
							return { ok: true as const, data };
						} catch {
							return { ok: false as const, words: 'Your rows could not be read. Try again in a minute.' };
						}
					}
				}
			: {}),
		buyEatingPass: () => call(supabase, 'coin_buy_eating_pass'),
		buyPayRaise: () => call(supabase, 'coin_buy_pay_raise'),
		buyPrint: (grams) => call(supabase, 'coin_buy_print', { p_grams: grams }),
		buyExtraCredit: (sectionId, submissionId, points) =>
			call(supabase, 'coin_buy_extra_credit', {
				p_section_id: sectionId,
				p_submission_id: submissionId,
				p_points: points
			})
	};
}

/** The role portal's transports over the caller's own browser client. */
export function createRoleTransports(supabase: SupabaseClient, userId: string | null): CoinRoleTransports {
	const camera =
		typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
	return {
		...(userId ? { uploadPhoto: (file: Blob & { name?: string }) => uploadCoinPhoto(supabase, userId, file) } : {}),
		capture: (holderId, path) => act(supabase, 'coin_role_capture', { p_holder_id: holderId, p_path: path }),
		requestException: (holderId, day, note) =>
			act(supabase, 'coin_role_request_exception', { p_holder_id: holderId, p_day: day, p_note: note }),
		...(camera
			? {
					openCamera: () =>
						navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
				}
			: {})
	};
}
