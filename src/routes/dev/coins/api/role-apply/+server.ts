import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { devState, roleQuestions } from '../../fixture';
import type { RequestHandler } from './$types';

/**
 * The harness's `/api/coin/role-apply`. Mirrors `coin_role_self_apply`'s
 * refusal shapes, and — the useful part — ECHOES the answers it received, so
 * the browser pass can confirm the page really sends `question_id` plus
 * `selected_option_index` / `written_answer` and not the old
 * `{ answer: "..." }` blob.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');
	if (!devState.signedIn) return json({ ok: false, reason: 'not_signed_in' }, { status: 401 });
	if (!devState.isStudent) return json({ ok: false, reason: 'not_a_student' });

	const body = (await request.json()) as { roleId?: string; answers?: unknown[] };
	const roleId = body.roleId ?? '';
	if (!(roleId in roleQuestions)) return json({ ok: false, reason: 'unknown_role' });

	return json({
		ok: true,
		application_id: 'dev-application',
		received: { roleId, answers: body.answers ?? [] }
	});
};
