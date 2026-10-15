/**
 * The bridge between the player's session (surface e, `YouTubePlayer.svelte`'s
 * `onsession`) and `cert_watch_report`'s parameters (ledger 0391). The player's
 * session object is read by field NAME in either spelling, so the two
 * surfaces, built against one contract in parallel, cannot disagree about a
 * key without this answering `null` for it, which the report then refuses in
 * words rather than sending a zero.
 */
import type { CertRpc, RpcAnswer } from './actions';

export interface WatchSessionLike {
	duration?: number;
	durationSeconds?: number;
	duration_seconds?: number;
	ranges?: [number, number][];
	played?: [number, number][];
	maxRate?: number;
	max_rate?: number;
	checkinsMissed?: number;
	checkins_missed?: number;
	playedSeconds?: number;
	played_seconds?: number;
}

export interface WatchReportArgs {
	p_cert: string;
	p_item_key: string;
	p_duration: number;
	p_ranges: [number, number][];
	p_max_rate: number;
	p_checkins_missed: number;
	p_played_seconds: number;
}

const num = (...values: unknown[]): number | null => {
	for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) return v;
	return null;
};

/** The RPC's arguments, or null when the session names no duration. */
export function watchReportArgs(certId: string, itemKey: string, session: WatchSessionLike): WatchReportArgs | null {
	const duration = num(session.duration, session.durationSeconds, session.duration_seconds);
	if (duration === null || duration <= 0) return null;
	const ranges = (Array.isArray(session.ranges) ? session.ranges : Array.isArray(session.played) ? session.played : []).filter(
		(r): r is [number, number] => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === 'number' && Number.isFinite(x))
	);
	return {
		p_cert: certId,
		p_item_key: itemKey,
		p_duration: duration,
		p_ranges: ranges,
		p_max_rate: num(session.maxRate, session.max_rate) ?? 1,
		p_checkins_missed: Math.max(0, Math.floor(num(session.checkinsMissed, session.checkins_missed) ?? 0)),
		p_played_seconds: Math.max(0, num(session.playedSeconds, session.played_seconds) ?? 0)
	};
}

export interface WatchReportResult {
	ok: boolean;
	covered_seconds: number;
	coverage: number;
	complete: boolean;
	training_done: boolean;
	message?: string;
}

/** What `cert_watch_report` answered, read tolerantly. */
export function readWatchReport(answer: RpcAnswer): WatchReportResult | { ok: false; message: string } {
	if (answer.error) return { ok: false, message: answer.error.message };
	const d = answer.data as Record<string, unknown> | null;
	if (!d || typeof d !== 'object') return { ok: false, message: 'The watch report was not recorded.' };
	if (d.ok === false) return { ok: false, message: typeof d.message === 'string' ? d.message : 'The watch report was refused.' };
	return {
		ok: true,
		covered_seconds: num(d.covered_seconds) ?? 0,
		coverage: num(d.coverage) ?? 0,
		complete: d.complete === true,
		training_done: d.training_done === true
	};
}

/** The production `onsession`: report, then hand the result back. */
export function sessionReporter(
	rpc: CertRpc,
	certId: string,
	itemKey: string,
	onreported: (result: ReturnType<typeof readWatchReport>) => void
): (session: WatchSessionLike) => Promise<void> {
	return async (session) => {
		const args = watchReportArgs(certId, itemKey, session);
		if (!args) {
			onreported({ ok: false, message: 'The player reported no duration, so nothing was counted yet.' });
			return;
		}
		onreported(readWatchReport(await rpc('cert_watch_report', args as unknown as Record<string, unknown>)));
	};
}
