import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_COIN_ACTIONS, readCoinPublic } from '$lib/server/coin-public';
import * as fixture from '../../fixture';
import type { RequestHandler } from './$types';

/**
 * The harness's stand-in for `/api/coin/public`.
 *
 * It runs the REAL `readCoinPublic` against a fake client whose `.rpc()`
 * answers from the fixture, so what the page receives is shaped by the
 * shipping code -- CSV headers, date formatting, the one-balance mapping,
 * the contract field names, the role grouping -- and
 * not by a second implementation that could quietly disagree with it.
 */
const fakeClient = {
	async rpc(name: string, params?: Record<string, unknown>) {
		switch (name) {
			case 'coin_public_leaderboard':
				return { data: fixture.leaderboard, error: null };
			case 'coin_public_transactions':
				return { data: fixture.transactions, error: null };
			case 'coin_public_student':
				return {
					data:
						fixture.studentDetail[String(params?.p_student_id ?? '')] ?? {
							ok: false,
							reason: 'unknown_student'
						},
					error: null
				};
			case 'coin_public_reasons':
				return { data: fixture.reasons, error: null };
			case 'coin_public_contracts':
				return { data: fixture.contracts, error: null };
			case 'coin_public_roles':
				return { data: fixture.roles, error: null };
			case 'coin_public_role_questions':
				return { data: fixture.roleQuestions[String(params?.p_role_id ?? '')] ?? [], error: null };
			case 'coin_public_role_badges':
				return { data: fixture.roleBadges, error: null };
			case 'coin_public_reported_coins':
				return { data: fixture.reportedCoins, error: null };
			case 'coin_public_transfers':
				return { data: fixture.publicTransfers, error: null };
			case 'coin_public_stocks':
				return { data: fixture.publicStocks, error: null };
			default:
				return { data: null, error: { message: `unexpected rpc: ${name}` } };
		}
	}
} as unknown as SupabaseClient;

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	if (!dev) error(404, 'Not found');

	const action = url.searchParams.get('action') ?? '';
	if (!PUBLIC_COIN_ACTIONS.has(action)) return json({ error: 'unsupported action' }, { status: 400 });

	const { body, contentType } = await readCoinPublic(fakeClient, action, url.searchParams);
	setHeaders({ 'cache-control': 'no-store' });
	return new Response(body, { headers: { 'content-type': contentType } });
};
