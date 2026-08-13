import { error, json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { callLedger, ledgerConfigured } from '$lib/server/coin-ledger';
import {
	buildRawSnapshot,
	parseContractsPayload,
	parseSummaryCsv,
	parseTransactionsCsv
} from '$lib/coin-desk/migrate';
import type { RequestHandler } from './$types';

/**
 * The migrate wizard's PULL step: fetches the two published legacy CSVs and
 * the ledger's contracts server-side, parses the lot, and stores it as an
 * import batch (coin_admin_create_import_batch, 0084). Returns the batch so
 * the wizard proceeds without a reload.
 *
 * The CSV URLs are the SAME published-sheet endpoints static/coins/index.html
 * has always read (carried here as server-side constants; that file is frozen
 * and stays untouched). They are public data -- the whole leaderboard page
 * renders from them with no auth -- so fetching them here adds no exposure.
 * The contracts come through src/lib/server/coin-ledger.ts, the one
 * coin-ledger egress point, which attaches the server-only key; if that is
 * not configured the pull degrades to zero contracts with a warning instead
 * of blocking the whole migration.
 *
 * The admin check is IN THIS HANDLER, not inherited: +server.ts endpoints
 * inside a route group do not run the group's +layout.server.ts load, so the
 * /coin-desk gate never covers them. Same 404-not-redirect rule as the
 * layout; the RPC's own is_admin() gate is the boundary underneath either
 * way.
 */

const SUMMARY_CSV_URL =
	'https://docs.google.com/spreadsheets/d/e/2PACX-1vTHVkr4mLhBYvO6tDjQxC-nFoc5rKG0CRySci77ac2a1bM4oDSGJef5McBYlhI6nXE2dlfgCy7UuRbn/pub?gid=631308186&single=true&output=csv';
const TRANSACTIONS_CSV_URL =
	'https://docs.google.com/spreadsheets/d/e/2PACX-1vTHVkr4mLhBYvO6tDjQxC-nFoc5rKG0CRySci77ac2a1bM4oDSGJef5McBYlhI6nXE2dlfgCy7UuRbn/pub?gid=1105564658&single=true&output=csv';

export const POST: RequestHandler = async ({ locals: { supabase, claims }, fetch }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	let summaryText: string;
	let transactionsText: string;
	try {
		const [sRes, tRes] = await Promise.all([fetch(SUMMARY_CSV_URL), fetch(TRANSACTIONS_CSV_URL)]);
		if (!sRes.ok || !tRes.ok) {
			return json(
				{ ok: false, error: `The published CSVs could not be fetched (${sRes.status} / ${tRes.status}).` },
				{ status: 502 }
			);
		}
		[summaryText, transactionsText] = await Promise.all([sRes.text(), tRes.text()]);
	} catch {
		return json({ ok: false, error: 'The published CSVs could not be reached.' }, { status: 502 });
	}

	let summary;
	let transactions;
	try {
		summary = parseSummaryCsv(summaryText);
		transactions = parseTransactionsCsv(transactionsText);
	} catch (e) {
		return json(
			{ ok: false, error: `The pulled CSVs did not parse: ${(e as Error).message}` },
			{ status: 422 }
		);
	}

	const warnings: string[] = [];
	let contracts: ReturnType<typeof parseContractsPayload> = [];
	let contractHistory: unknown[] = [];
	let contractsAvailable = false;
	if (!ledgerConfigured()) {
		warnings.push(
			'Contracts skipped: COIN_API_KEY is not configured on this server, so the ledger cannot be reached. This pull imports zero contracts.'
		);
	} else {
		const cRes = await callLedger('contracts');
		if (cRes.ok) {
			try {
				contracts = parseContractsPayload(JSON.parse(cRes.body));
				contractsAvailable = true;
			} catch {
				warnings.push('The contracts action answered with something unparseable; contracts were skipped.');
			}
		} else {
			warnings.push(`Contracts skipped: ${cRes.error}`);
		}
		const hRes = await callLedger('contractHistory');
		if (hRes.ok) {
			try {
				const parsed = JSON.parse(hRes.body);
				if (Array.isArray(parsed)) contractHistory = parsed;
			} catch {
				// Archival only; nothing imports from it.
			}
		}
	}

	const raw = buildRawSnapshot({
		summary,
		transactions,
		contracts,
		contractHistory,
		contractsAvailable,
		source: {
			summary_csv: SUMMARY_CSV_URL,
			transactions_csv: TRANSACTIONS_CSV_URL,
			contracts: contractsAvailable ? 'coin-ledger actions contracts + contractHistory' : 'unavailable'
		}
	});

	// Under the caller's own cookie session: the RPC re-checks is_admin()
	// inside, so the handler gate above is convenience on top of the boundary.
	const { data, error: rpcError } = await supabase.rpc('coin_admin_create_import_batch', {
		p_raw: raw
	});
	if (rpcError) {
		return json({ ok: false, error: rpcError.message }, { status: 500 });
	}
	const r = data as { ok: boolean; batch_id: string };
	return json({
		ok: true,
		batch: {
			id: r.batch_id,
			raw,
			pulled_at: new Date().toISOString(),
			committed_at: null,
			committed_by: null,
			report: null
		},
		warnings
	});
};
