/**
 * THE STORAGE SWEEP (Armory v0.3 item 3): after a purge commits, remove from
 * R2 the stored files that no version and no side version in ANY project
 * names any more. Run by `POST /api/armory/purge` straight after the RPC, and
 * by `POST /api/armory/sweep` from /armory's Storage cleanup panel for
 * whatever a purge left (a closed tab, a budget overrun, the Windows app's own
 * folder purge, which the website never sees).
 *
 * ROWS FIRST, THEN THE QUEUE, THEN OBJECTS, AND A FAILED SWEEP IS NOT A FAILED
 * DELETE (CLAUDE.md, Foundry's rule, applied here). There is no transaction
 * between Postgres and R2, so the acceptable failure is an orphaned object:
 * bytes no row names, which nothing serves (a GET URL is signed only for a
 * hash in one of the caller's projects) and which the next sweep removes.
 *
 * STORAGE IS CONTENT-ADDRESSED ACROSS PROJECTS, so this module never decides
 * what is unreferenced. `armory_orphans_pending` (0233, admin only) re-checks
 * every queued hash against every project's versions as it hands it over and
 * marks one that has been saved again as kept; this module deletes exactly
 * what it was handed. A residual race remains and is recorded rather than
 * hidden: between that re-check and the DELETE, an app whose HEAD said the
 * object exists could skip its upload and commit a version naming it. The
 * window is the length of one request.
 *
 * A REMOVAL IS CONFIRMED ONLY BY A HEAD ANSWERING 404, and only a confirmed
 * removal is marked swept (`armory_orphans_swept`). The sweep re-reads rather
 * than trusting the DELETE's answer, which is 204 for a key that never
 * existed. Anything else stays queued, is named in a server log line (the only
 * record of a survivor) and costs a sentence beside the confirmation.
 *
 * THE ROUTE IS NOT THE AUTHORIZATION BOUNDARY. Every RPC here runs on the
 * CALLER's own client, so `is_admin()` is the real thing; the R2 credentials
 * only ever remove hashes the database itself just handed back. No
 * service-role key is read here or anywhere on this path.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { armoryNotReady } from '$lib/armory/view';
import { blobStatus, deleteBlob, type ArmoryStorageConfig } from './storage';

export interface ArmorySweepDeps {
	storage(): ArmoryStorageConfig | null;
	fetch: typeof fetch;
	now(): number;
	/** A server log line; the only record of a stored file that would not go. */
	log(message: string): void;
}

export interface SweepBudget {
	/** Stop starting new removals after this long. */
	ms: number;
	/** Ask the queue for at most this many. */
	max: number;
	/** Removals in flight at once. */
	concurrency: number;
}

/** About 8 seconds, inside a serverless function's limit, and 400 objects (two requests each, six at a time). */
export const ARMORY_SWEEP_BUDGET: SweepBudget = { ms: 8000, max: 400, concurrency: 6 };

export interface SweepOutcome {
	/** How many the queue handed over. */
	pending: number;
	/** Confirmed gone and marked. */
	swept: number;
	/** Still queued afterwards, when the count could be read. */
	left: number | null;
	/** A sentence for the person, or null when everything handed over went. */
	problem: string | null;
}

/** The queue refused the caller: not a site admin. The route answers 404. */
export class ArmorySweepRefused extends Error {}

const HASH = /^[0-9a-f]{64}$/;

function files(n: number): string {
	return `${n} stored ${n === 1 ? 'file' : 'files'}`;
}

async function pendingCount(supabase: SupabaseClient): Promise<number | null> {
	const { data, error } = await supabase.rpc('armory_orphans_count');
	if (error) return null;
	const n = Number(data);
	return Number.isFinite(n) ? n : null;
}

export async function sweepArmoryOrphans(
	supabase: SupabaseClient,
	deps: ArmorySweepDeps,
	budget: SweepBudget = ARMORY_SWEEP_BUDGET
): Promise<SweepOutcome> {
	const started = deps.now();
	const { data, error } = await supabase.rpc('armory_orphans_pending', { p_limit: budget.max });
	if (error) {
		if (error.code === '42501') throw new ArmorySweepRefused(error.message);
		return {
			pending: 0,
			swept: 0,
			left: null,
			problem: armoryNotReady(error)
				? 'Storage cleanup is not switched on yet, so stored files wait to be removed.'
				: 'The list of stored files to remove could not be read, so they wait for the next cleanup.'
		};
	}
	const hashes = (Array.isArray(data) ? data : []).filter((h): h is string => typeof h === 'string' && HASH.test(h));
	if (hashes.length === 0) return { pending: 0, swept: 0, left: await pendingCount(supabase), problem: null };

	const storage = deps.storage();
	if (!storage) {
		return {
			pending: hashes.length,
			swept: 0,
			left: await pendingCount(supabase),
			problem: `File storage is not switched on, so ${files(hashes.length)} wait to be removed.`
		};
	}

	const gone: string[] = [];
	const stayed: string[] = [];
	let notTried = 0;
	let next = 0;
	const worker = async () => {
		while (next < hashes.length) {
			if (deps.now() - started > budget.ms) {
				notTried = hashes.length - next;
				next = hashes.length;
				return;
			}
			const hash = hashes[next++];
			await deleteBlob(storage, hash, new Date(deps.now()), deps.fetch);
			const status = await blobStatus(storage, hash, new Date(deps.now()), deps.fetch);
			(status === 'absent' ? gone : stayed).push(hash);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(budget.concurrency, hashes.length)) }, worker));

	let marked = 0;
	let markFailed = false;
	if (gone.length > 0) {
		const done = await supabase.rpc('armory_orphans_swept', { p_hashes: gone });
		if (done.error) markFailed = true;
		else marked = Number(done.data) || 0;
	}
	if (stayed.length > 0) {
		deps.log(`armory sweep: ${stayed.length} stored file(s) not confirmed removed, left queued: ${stayed.join(', ')}`);
	}

	const problems: string[] = [];
	if (stayed.length > 0) problems.push(`${files(stayed.length)} could not be confirmed removed and wait for the next cleanup.`);
	if (notTried > 0) problems.push(`Cleanup stopped for time; ${files(notTried)} wait for the next cleanup.`);
	if (markFailed) problems.push('Removed files could not be marked done; the next cleanup checks them again.');

	return {
		pending: hashes.length,
		swept: marked,
		left: await pendingCount(supabase),
		problem: problems.length ? problems.join(' ') : null
	};
}
