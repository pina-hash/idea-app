import { json } from '@sveltejs/kit';
import { callLedger, fetchRoster, ledgerConfigured, matchRoster } from '$lib/server/coin-ledger';
import type { RequestHandler } from './$types';

/**
 * Role applications: the one write the public coin leaderboard performs, and
 * the one this route exists to put an identity on.
 *
 * WHAT WAS WRONG. The page let anyone — no account at all — pick any student's
 * name out of a dropdown and submit an application in that name, which by the
 * tool's own description holds one of that student's coins. Repeating it was a
 * denial-of-funds against a classmate, performed by a stranger (audit F3).
 *
 * WHAT IS DIFFERENT. The applying student is resolved HERE, from the caller's
 * own authenticated session, and the client is not consulted about it. The
 * request body carries a role and answers and nothing else: there is no
 * `student` parameter to send, so a forged one has nowhere to land. The name
 * forwarded to Code.gs is the roster row this server matched, never a string
 * that arrived from a browser.
 *
 * RESOLUTION. `profiles.full_name` is the Google-provided name captured at
 * signup (`handle_new_user`, 0001), NOT the user-editable `display_name`. It is
 * matched against the ledger's own roster, fetched server-side, by comparing
 * name TOKEN SETS so "Last, First" and "First Last" agree without reformatting
 * either side. Zero matches or more than one is a refusal, never a fallback:
 * being unable to prove who is applying is the exact condition worth failing on.
 */

/** Answers are short free-text or a multiple-choice option; this is a ceiling, not a rule. */
const MAX_ANSWER_LEN = 400;
const MAX_ANSWERS = 25;
const MAX_BODY_BYTES = 64_000;

type Applicant =
	| { ok: true; student: string; section: string }
	| { ok: false; status: number; error: string };

/**
 * The single resolution path, shared by the GET probe (which tells the page
 * whether to show the form) and the POST submit (which is authoritative). They
 * must not be able to disagree about who the applicant is, so there is one
 * function and both call it.
 */
async function resolveApplicant(supabase: App.Locals['supabase'], userId: string): Promise<Applicant> {
	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, email, role')
		.eq('id', userId)
		.single();

	if (profile?.role !== 'student') {
		return {
			ok: false,
			status: 403,
			error:
				'Role applications are for students. Sign in with your @boscotech.net school account to apply.'
		};
	}

	const fullName = (profile.full_name ?? '').trim();
	if (!fullName) {
		return {
			ok: false,
			status: 409,
			error: 'Your account has no name on it yet, so we cannot match you to the coin roster. Ask your teacher.'
		};
	}

	if (!ledgerConfigured()) {
		return { ok: false, status: 503, error: 'The coin ledger is not configured on this server.' };
	}

	const roster = await fetchRoster();
	if (!roster.length) {
		return { ok: false, status: 502, error: 'The coin roster could not be read right now. Try again shortly.' };
	}

	const match = matchRoster(fullName, roster);
	if (!match.ok) {
		return {
			ok: false,
			status: 409,
			error:
				match.reason === 'ambiguous'
					? `More than one roster entry matches "${fullName}". Ask your teacher to sort out the duplicate before applying.`
					: `We could not find "${fullName}" on the coin roster. Ask your teacher to check how your name is spelled there.`
		};
	}

	return { ok: true, student: match.name, section: match.section };
}

/**
 * GET: who is applying, according to the server.
 *
 * The page renders "Applying as <name>" from this and has no name picker at
 * all. It is a convenience for the UI — the POST resolves the applicant again
 * for itself and does not trust anything this response was turned into.
 */
export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ signedIn: false });
	}

	const applicant = await resolveApplicant(supabase, claims.sub);
	if (!applicant.ok) {
		return json({ signedIn: true, eligible: false, error: applicant.error });
	}

	return json({
		signedIn: true,
		eligible: true,
		student: applicant.student,
		section: applicant.section
	});
};

/** POST: submit an application for the signed-in student. Body: `{ role, answers }`. */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ success: false, error: 'Sign in with your school account to apply.' }, { status: 401 });
	}

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) {
		return json({ success: false, error: 'That application is too long.' }, { status: 413 });
	}

	let body: { role?: unknown; answers?: unknown };
	try {
		body = JSON.parse(text);
	} catch {
		return json({ success: false, error: 'Malformed request.' }, { status: 400 });
	}

	const role = typeof body?.role === 'string' ? body.role.trim() : '';
	if (!role) {
		return json({ success: false, error: 'Pick a role first.' }, { status: 400 });
	}

	if (!Array.isArray(body?.answers) || body.answers.length > MAX_ANSWERS) {
		return json({ success: false, error: 'Answer the questions first.' }, { status: 400 });
	}
	const answers = body.answers.map((a) => {
		const raw = (a as { answer?: unknown })?.answer;
		return { answer: (typeof raw === 'string' ? raw : '').slice(0, MAX_ANSWER_LEN) };
	});

	const applicant = await resolveApplicant(supabase, claims.sub);
	if (!applicant.ok) {
		return json({ success: false, error: applicant.error }, { status: applicant.status });
	}

	// `student` is the roster name THIS SERVER matched from the session. It is
	// the whole point of the route, and it is the only value here a client
	// cannot influence.
	const res = await callLedger('submitRoleApplication', {
		student: applicant.student,
		role,
		answers: JSON.stringify(answers)
	});

	if (!res.ok) {
		return json({ success: false, error: res.error }, { status: res.status });
	}

	// Pass the ledger's own answer through: the page already understands its
	// `{ success, error }` shape, including refusals like an insufficient
	// balance or a role that closed while the form was open.
	return new Response(res.body, {
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
	});
};
