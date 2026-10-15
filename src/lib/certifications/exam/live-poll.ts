/**
 * THE PROCTOR'S LIVE VIEW POLL (ledger 0391): `cert_exam_live` every five
 * seconds, on `startPoller`, the one database poller every live widget in this
 * repository runs on (CLAUDE.md, "LIVE POLLS"). Five seconds is this surface's
 * own floor, a decision the build made for a certifier-only page with one or
 * two viewers while a sitting runs; it is never the player's tick, which is a
 * `setTimeout` chain reading a local clock and asks the database nothing.
 *
 * The desk surface's live page (`/certifications/desk/sittings/live`) calls
 * `startExamLivePoller` with a `load` over `supabase.rpc('cert_exam_live')`
 * and mounts `ProctorLive` over the rows; `/dev/cert-exam` drives it with an
 * in-memory `load` and a short `pollMs` so a harness can count the calls.
 */
import { startPoller, type Poller, type PollerEnv } from '$lib/classroom/poll';
import type { ExamLiveRow } from '../types';

export const EXAM_LIVE_POLL_MS = 5000;

export interface ExamLivePollOptions {
	/** One read of `cert_exam_live`: the rows, or null for a failed read (which backs off). Throw `PollSignedOut` for a lost session. */
	load: () => Promise<ExamLiveRow[] | null>;
	/** Every answer, failed reads included (rows null), so a page can say "last read failed" rather than show stale rows as fresh. */
	onrows: (rows: ExamLiveRow[] | null) => void;
	pollMs?: number;
	env?: PollerEnv;
	onSignedOut?: (() => void) | null;
}

export function startExamLivePoller(options: ExamLivePollOptions): Poller {
	return startPoller({
		intervalMs: options.pollMs ?? EXAM_LIVE_POLL_MS,
		immediate: true,
		env: options.env,
		onSignedOut: options.onSignedOut ?? null,
		run: async () => {
			const rows = await options.load();
			options.onrows(rows);
			return rows === null ? 'failed' : 'ok';
		}
	});
}

const obj = (v: unknown): Record<string, unknown> | null =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** `cert_exam_live`'s jsonb as rows, dropping anything that is not one; null for a non-array. */
export function readExamLive(value: unknown): ExamLiveRow[] | null {
	if (!Array.isArray(value)) return null;
	const rows: ExamLiveRow[] = [];
	for (const raw of value) {
		const r = obj(raw);
		if (!r || typeof r.exam_id !== 'string' || typeof r.state !== 'string') continue;
		const student = obj(r.student) ?? {};
		const certification = obj(r.certification) ?? {};
		const flags = Array.isArray(r.flags)
			? r.flags
					.map((f) => obj(f))
					.filter((f): f is Record<string, unknown> => !!f && typeof f.at === 'string' && typeof f.kind === 'string')
					.map((f) => ({ at: f.at as string, kind: f.kind as ExamLiveRow['flags'][number]['kind'] }))
			: [];
		rows.push({
			exam_id: r.exam_id,
			student: {
				email: typeof student.email === 'string' ? student.email : '',
				name: typeof student.name === 'string' ? student.name : null
			},
			certification: {
				code: typeof certification.code === 'string' ? certification.code : '',
				name: typeof certification.name === 'string' ? certification.name : ''
			},
			state: r.state as ExamLiveRow['state'],
			current_index: typeof r.current_index === 'number' ? r.current_index : 0,
			total: typeof r.total === 'number' ? r.total : 0,
			released_at: typeof r.released_at === 'string' ? r.released_at : '',
			release_expires_at: typeof r.release_expires_at === 'string' ? r.release_expires_at : '',
			started_at: typeof r.started_at === 'string' ? r.started_at : null,
			deadline: typeof r.deadline === 'string' ? r.deadline : null,
			flags,
			passed: typeof r.passed === 'boolean' ? r.passed : null,
			submitted_at: typeof r.submitted_at === 'string' ? r.submitted_at : null
		});
	}
	return rows;
}
