/**
 * TEST STUDENT ACCOUNTS (ledger 0422). Shared by the admin page
 * (`/admin/test-accounts`) and the connector's routes
 * (`/api/admin/test-accounts`, `/api/admin/test-accounts/act`), so the site
 * and Claude make and use them the same way.
 *
 * A test account is a real auth user at test.ideabosco.com, made a student
 * and listed in `test_accounts` (0288), which hides it from every list of
 * people anybody else reads (0289).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientFor, createTestUser, mintSessionFor, revokeSession, ViewAsUnavailable } from './service';

export interface TestAccount {
	email: string;
	user_id: string | null;
	label: string;
	created_by: string;
	created_at: string;
	retired_at: string | null;
	classes: { section_id: string; label: string; active: boolean }[];
	last_session: string | null;
}

export class TestAccountRefused extends Error {}

const message = (e: { message?: string } | null | undefined, fallback: string) => {
	const m = e?.message?.trim();
	return m && m.length < 300 ? m : fallback;
};

export async function listTestAccounts(supabase: SupabaseClient): Promise<TestAccount[] | null> {
	const { data, error } = await supabase.rpc('test_accounts_list');
	if (error) return null;
	return (data ?? []) as TestAccount[];
}

/** As the admin: make the account, register it, and put it in a class if one is named. */
export async function createTestAccount(
	supabase: SupabaseClient,
	label: string,
	sectionId: string | null
): Promise<{ email: string; user_id: string; label: string }> {
	const name = label.trim();
	if (!name || name.length > 80) throw new TestAccountRefused('Give the test account a name of 1 to 80 characters.');
	// The admin check comes first, on the admin's own session, before any auth user exists.
	const probe = await supabase.rpc('test_accounts_list');
	if (probe.error) throw new TestAccountRefused('Not found.');
	let made;
	try {
		made = await createTestUser(name);
	} catch (e) {
		throw new TestAccountRefused(e instanceof ViewAsUnavailable ? e.message : 'The test account could not be created right now.');
	}
	const reg = await supabase.rpc('test_account_register', { p_user: made.id, p_label: name });
	if (reg.error) throw new TestAccountRefused(message(reg.error, 'The test account could not be registered.'));
	if (sectionId) await enrollTestAccount(supabase, made.email, sectionId, name);
	return { email: made.email, user_id: made.id, label: name };
}

export async function enrollTestAccount(supabase: SupabaseClient, email: string, sectionId: string, name?: string) {
	const { error } = await supabase.rpc('classroom_set_enrollment', {
		p_section_id: sectionId,
		p_student_email: email,
		p_display_name: name ?? null,
		p_active: true
	});
	if (error) throw new TestAccountRefused(message(error, 'The test account could not be added to that class.'));
}

/**
 * The things a student does, by the words he uses, for the connector. Anything
 * else is a site function named exactly, with its own arguments.
 */
export const STUDENT_ACTIONS: Record<string, { fn: string; args: (a: { post?: string; question?: string; answer?: unknown }) => Record<string, unknown> }> = {
	'hand in': { fn: 'classroom_submit_assignment', args: (a) => ({ p_item_id: a.post }) },
	'take back': { fn: 'classroom_unsubmit_assignment', args: (a) => ({ p_item_id: a.post }) },
	answer: { fn: 'classroom_save_response', args: (a) => ({ p_item_id: a.post, p_block_id: a.question, p_value: a.answer ?? null }) }
};

export function studentAction(
	action: string,
	given: { post?: string; question?: string; answer?: unknown; args?: Record<string, unknown> }
): { fn: string; args: Record<string, unknown> } {
	const key = action.trim().toLowerCase().replace(/[-_]+/g, ' ');
	const known = STUDENT_ACTIONS[key] ?? (key === 'submit' || key === 'hand it in' ? STUDENT_ACTIONS['hand in'] : undefined);
	if (known) {
		if (!given.post) throw new TestAccountRefused('Name the post (its id, from get post).');
		if (known === STUDENT_ACTIONS.answer && !given.question) throw new TestAccountRefused('Name the question to answer.');
		return { fn: known.fn, args: known.args(given) };
	}
	return { fn: action.trim(), args: given.args ?? {} };
}

/**
 * As the admin: run one site function AS a test student, in an act session
 * that logs every write under the admin, then end it. Only a test account can
 * be used this way from here; a real student is acted as on the site, where
 * the panel shows it.
 */
export async function actAsTestAccount(
	supabase: SupabaseClient,
	who: string,
	fn: string,
	args: Record<string, unknown>
): Promise<{ result: unknown; changes: number; student: string }> {
	if (!/^[a-z_][a-z0-9_]{1,62}$/.test(fn) || fn.startsWith('_') || fn.startsWith('view_as_')) {
		throw new TestAccountRefused('Name one of the site\'s functions, exactly.');
	}
	const accounts = await listTestAccounts(supabase);
	if (!accounts) throw new TestAccountRefused('Not found.');
	const key = who.trim().toLowerCase();
	const live = accounts.filter((a) => !a.retired_at && a.user_id);
	const matches = live.filter((a) => a.email === key || a.label.toLowerCase() === key);
	const found = matches.length === 1 ? matches : live.filter((a) => a.label.toLowerCase().includes(key));
	if (found.length !== 1 || !found[0].user_id) {
		throw new TestAccountRefused(
			found.length === 0 ? `No test account is called "${who}".` : `More than one test account matches "${who}": ${found.map((a) => a.label).join(', ')}.`
		);
	}
	const account = found[0];
	const grant = await supabase.rpc('view_as_grant', { p_user: account.user_id, p_mode: 'act' });
	if (grant.error || !grant.data) throw new TestAccountRefused(message(grant.error, 'That test account cannot be used right now.'));
	let minted;
	try {
		minted = await mintSessionFor(account.user_id!, account.email);
	} catch (e) {
		throw new TestAccountRefused(e instanceof ViewAsUnavailable ? e.message : 'That test account could not be opened.');
	}
	const as = clientFor(minted.access_token);
	try {
		const claimed = await as.rpc('view_as_claim', { p_grant: (grant.data as { grant: string }).grant });
		if (claimed.error) throw new TestAccountRefused(message(claimed.error, 'That test account could not be opened.'));
		const ran = await as.rpc(fn, args);
		const ended = await as.rpc('view_as_end');
		const changes = Number((ended.data as { changes?: number } | null)?.changes ?? 0);
		if (ran.error) throw new TestAccountRefused(message(ran.error, 'The site refused that.'));
		return { result: ran.data, changes, student: account.label };
	} finally {
		await revokeSession(minted.access_token);
	}
}
