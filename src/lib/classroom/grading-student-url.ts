/**
 * THE STUDENT BEING GRADED, KEPT IN THE ADDRESS WITHOUT THE ADDRESS (ledger 0380,
 * report b31afb76: "when I refresh the page I should stay on the student I was
 * grading").
 *
 * A student's school email must not reach a URL's query string: CLAUDE.md keeps
 * it out of request logs, history and referrers (the Armory's holder filter is
 * component state for the same reason). So the address carries an OPAQUE token,
 * the first sixteen hex characters of SHA-256 over the item id and the address,
 * and the console resolves it by hashing the roster it already holds. Nothing
 * on the server learns who it names, and a token for somebody not on this
 * assignment's roster resolves to nobody and is ignored.
 *
 * `studentParam` is the query key. The two grading routes read it off
 * `page.url` and write it with `replaceState`, never `goto`, which would rerun
 * every load.
 */

export const STUDENT_PARAM = 'student';

const TOKEN = /^[0-9a-f]{16}$/;

export function isStudentToken(value: string | null | undefined): value is string {
	return typeof value === 'string' && TOKEN.test(value);
}

export async function studentToken(itemId: string, email: string): Promise<string> {
	const bytes = new TextEncoder().encode(`${itemId}:${email.trim().toLowerCase()}`);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)]
		.slice(0, 8)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** The roster address a token names, or null (not a token, or nobody on this roster). */
export async function findStudentByToken(
	rows: readonly { email: string }[],
	itemId: string,
	token: string | null | undefined
): Promise<string | null> {
	if (!isStudentToken(token)) return null;
	for (const row of rows) {
		if ((await studentToken(itemId, row.email)) === token) return row.email;
	}
	return null;
}
