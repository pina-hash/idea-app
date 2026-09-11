/**
 * THE PORTED-DOCUMENT READ, ONCE, FOR EVERY LOAD THAT NEEDS ONE.
 *
 * WHY THIS IS A MODULE AND NOT THE BLOCK IT WAS. It began inside the student
 * item page's `+page.server.ts` as the only reader of `classroom_html_assignments`,
 * which was correct while the item page was the only surface that framed a
 * document. The GRADING CONSOLE is the second, and it is the reason this exists:
 * a manager opening `/classroom/<s>/item/<i>/grade` on a schema-3 assignment got
 * a roster reading "In progress", a rubric, and an EMPTY WORK PANE, because that
 * load never asked whether the item was a ported document and therefore had
 * nothing to hand the console. Measured in production at `89b8154` on
 * 2026-09-10; Mr. Pina could not grade at all.
 *
 * A SECOND COPY OF THE LADDER WOULD HAVE BEEN THE CHEAPER-LOOKING FIX AND IS
 * THE ONE THING THIS PREVENTS. The ladder is not one select -- it is a PROBE
 * and then a document read, each of which may fail on a deployment sitting
 * short of 0195, with a `ready` flag that must start false. Two spellings of
 * "can this deployment tell me whether this is a ported document" is two
 * answers, and the surface that got the stale one renders the wrong engine over
 * nothing at all.
 *
 * IT TAKES A WHOLE `SupabaseClient`, which is `loadItemDeck`'s convention in
 * `transports.ts` and every other loader helper's. A narrow structural
 * interface naming only `from().select().eq().maybeSingle()` was the first
 * shape and TypeScript refuses it: comparing the real generated client against
 * it is "Type instantiation is excessively deep and possibly infinite", because
 * the query builder is generic over the whole database schema. A test hands in
 * a stub with a cast, which is what the existing loader tests already do.
 *
 * IT TAKES THE CALLER'S OWN CLIENT AND HOLDS NO CREDENTIAL. RLS is the boundary
 * here exactly as it is for every other classroom read: the item row is reached
 * through the caller's session, and a student who may not read the assignment
 * gets nothing back from the same call a manager uses. The service-role read of
 * a ported document is a different thing entirely and lives where it belongs,
 * in `$lib/server/html-assignment-document.ts`, because the DOCUMENT HOST holds
 * no session for a policy to be satisfied against.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	isHtmlAssignment,
	withHtmlAssignmentVersion,
	type HtmlAssignmentData
} from '$lib/classroom/html-assignment/mount';

export interface HtmlAssignmentLoad {
	/** The document row, or null when there is none to frame. */
	htmlAssignment: HtmlAssignmentData | null;
	/**
	 * Whether this deployment could ANSWER the question, which is not the same
	 * as the answer being yes. False is what `htmlAssignmentMount` renders as
	 * its own stated absence rather than as either engine.
	 */
	htmlAssignmentReady: boolean;
	/**
	 * The item with `assignment_schema_version` attached when the probe could
	 * read it, and untouched when it could not. Returned rather than mutated in
	 * place so a caller cannot forget to use the result -- `withHtmlAssignmentVersion`
	 * is an `Object.assign`, so this IS the same object, and returning it is
	 * what makes that visible at the call site.
	 */
	item: Record<string, unknown>;
}

/**
 * RUNG 1 IS THE NARROWEST POSSIBLE PROBE -- one scalar column, no embed -- so
 * "this deployment has 0195" is the only thing its answer can mean. RUNG 2 is
 * the document row, and it is a SEPARATE capability rather than a widening of
 * the first: an item that is not schema 3 must never pay for a table read, and
 * the version alone is what every other surface branches on.
 *
 * `htmlAssignmentReady` STARTS FALSE AND IS TURNED ON ONLY BY A RUNG THAT
 * ACTUALLY ANSWERED, because "cannot tell" must never render as "this is a
 * ported assignment". It is true when the probe said this is NOT one, and when
 * it said it is AND the document came back; it stays false when either read
 * could not answer.
 *
 * THE DOCUMENT COLUMN IS NOT SELECTED, and that is a rule rather than a saving.
 * `/hx/<document_id>` serves the bytes under the sandbox CSP, on the sandbox
 * origin; putting them in a page payload would carry an uploaded document into
 * the portal origin's own HTML, which is the one thing the split exists to
 * prevent, and double the transfer on the way.
 *
 * A NON-ASSIGNMENT IS ANSWERED WITHOUT A SINGLE QUERY, and `ready` is TRUE for
 * it: a reference or a material is not a ported document and knowing that
 * required nothing to be read.
 */
export async function loadHtmlAssignment<T extends object>(
	supabase: SupabaseClient,
	item: T,
	kind: string
): Promise<{ htmlAssignment: HtmlAssignmentData | null; htmlAssignmentReady: boolean; item: T }> {
	if (kind !== 'assignment') return { htmlAssignment: null, htmlAssignmentReady: true, item };

	const versionRes = await supabase
		.from('classroom_items')
		.select('assignment_schema_version')
		.eq('id', (item as Record<string, unknown>).id as string)
		.maybeSingle();
	if (versionRes.error) return { htmlAssignment: null, htmlAssignmentReady: false, item };

	const next = withHtmlAssignmentVersion(
		item,
		(versionRes.data as { assignment_schema_version?: unknown } | null)?.assignment_schema_version
	);
	if (!isHtmlAssignment(next)) {
		// The probe answered, and the answer is that this is a v1 spec
		// assignment. Knowing that IS the capability.
		return { htmlAssignment: null, htmlAssignmentReady: true, item: next };
	}

	const docRes = await supabase
		.from('classroom_html_assignments')
		.select('document_id, manifest, filename, updated_at')
		.eq('item_id', (next as Record<string, unknown>).id as string)
		.maybeSingle();
	const row = docRes.data as {
		document_id?: unknown;
		manifest?: unknown;
		filename?: unknown;
		updated_at?: unknown;
	} | null;
	if (docRes.error || !row || typeof row.document_id !== 'string') {
		return { htmlAssignment: null, htmlAssignmentReady: false, item: next };
	}
	return {
		htmlAssignment: {
			documentId: row.document_id,
			manifest: row.manifest ?? null,
			filename: typeof row.filename === 'string' ? row.filename : '',
			updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null
		},
		htmlAssignmentReady: true,
		item: next
	};
}
