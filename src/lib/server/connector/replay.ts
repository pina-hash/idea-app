/**
 * THE NIGHTLY REPLAY OF HIS SAVED REQUESTS (ledger 0422). DESIGN.md section 9
 * planned it as a scheduled chat on the practice connector, and that task was
 * never made, so no saved request had ever been replayed. This one needs no
 * chat: it runs on the server, once a night, from the nightly call that
 * already reaches the site (`/api/coin/autopay`, Vercel's cron and the
 * Autopay workflow), and records a run per saved request in
 * `connector_eval_runs`, where `/admin/connector` and the morning check read
 * them.
 *
 * WHAT IT CAN JUDGE WITHOUT A MODEL, AND SAYS SO. For each saved request it
 * checks the path his words are expected to take: every tool on it still
 * exists and is live, and a `site_call:<action>` step is among the five
 * matches `site_find_tool` gives for his own words. A request whose whole
 * expected path is `report_gap` (a gap not built yet) has nothing to replay
 * and is left out, counted in the answer. It is a check of the routes, not of
 * a model's choices, and each run's detail says which.
 */
import { FACADES, findTools, liveEndpoint, liveFunction, directEntries } from './registry';
import type { ConnectorBackend } from './types';

const BUILT_INS = new Set(['site_find_tool', 'site_call', 'report_gap', 'record_eval_result', 'undo_last']);
const MIN_GAP_MS = 20 * 60 * 60_000;

export interface ReplayStep {
	step: string;
	exists: boolean;
	rank?: number | null;
}

/** One saved request, judged. Pure apart from the registry. */
export function judgeSavedRequest(said: string, expected: readonly string[]): { passed: boolean; steps: ReplayStep[] } | null {
	if (expected.length === 0 || expected.every((s) => s === 'report_gap')) return null;
	const direct = new Set(directEntries().map((e) => e.tool ?? e.name));
	const found = findTools(said, 5).map((m) => m.name);
	const steps: ReplayStep[] = expected.map((step) => {
		if (step.startsWith('site_call:')) {
			const name = step.slice('site_call:'.length);
			const exists = !!liveFunction(name) || !!liveEndpoint(name);
			const at = found.indexOf(name);
			return { step, exists, rank: at < 0 ? null : at + 1 };
		}
		return { step, exists: BUILT_INS.has(step) || step in FACADES || direct.has(step) };
	});
	const passed = steps.every((s) => s.exists && (s.rank === undefined || s.rank !== null));
	return { passed, steps };
}

export interface ReplayAnswer {
	ran: boolean;
	reason?: string;
	replayed: number;
	passed: number;
	failed: number;
	gaps_waiting: number;
}

export async function runNightlyReplay(backend: ConnectorBackend, now = Date.now()): Promise<ReplayAnswer> {
	const state = await backend.replayState();
	const answer: ReplayAnswer = { ran: false, replayed: 0, passed: 0, failed: 0, gaps_waiting: 0 };
	if (state.lastReplayAt !== null && now - state.lastReplayAt < MIN_GAP_MS) return { ...answer, reason: 'already ran tonight' };
	if (!state.recordAs) return { ...answer, reason: 'no connection to record the runs under' };
	const rows: Array<{ evalId: string; userId: string; passed: boolean; path: string[]; detail: Record<string, unknown> }> = [];
	for (const e of state.evals) {
		const judged = judgeSavedRequest(e.said, e.expected_path ?? []);
		if (!judged) {
			answer.gaps_waiting++;
			continue;
		}
		rows.push({
			evalId: e.id,
			userId: state.recordAs,
			passed: judged.passed,
			path: e.expected_path,
			detail: { kind: 'route check', steps: judged.steps }
		});
		if (judged.passed) answer.passed++;
		else answer.failed++;
	}
	await backend.recordReplay(rows);
	return { ...answer, ran: true, replayed: rows.length };
}
