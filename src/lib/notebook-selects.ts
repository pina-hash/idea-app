/**
 * The PostgREST select strings the student notebook (`/notebook`) reads its
 * entries with, and the one place they are written down.
 *
 * WHY THEY LIVE HERE RATHER THAN INSIDE THE LOAD. A select string names
 * EMBEDDED RESOURCES (`notebook_entry_photos ( ... )`), and PostgREST resolves
 * an embed against the FOREIGN KEYS it finds in the schema cache. So a select
 * string is not just a column list -- it is an assertion about the shape of the
 * schema, and a migration that repoints a key can silently invalidate one with
 * no type error and no compile-time signal anywhere.
 *
 * That is not hypothetical: `0098` repointed `notebook_entries`' composite key
 * from `notebook_sessions (id, section_id)` to
 * `notebook_session_postings (session_id, section_id)`, which left NO foreign
 * key at all between `notebook_entries` and `notebook_sessions`. The load's
 * base select still embedded `notebook_sessions ( ... )`, so PostgREST answered
 * PGRST200 for every rung of the widen-then-degrade chain below, and the page
 * reported the notebook tables as missing on a database where they plainly
 * were not. The check-in label is read separately now (a plain select on
 * `notebook_sessions`, which any signed-in user may read), and no select here
 * embeds a table `notebook_entries` has no key to.
 *
 * Exported so `tests/notebook-page-load.test.ts` can hold every embed named
 * here against the real catalog, which is the check that was missing.
 */

/**
 * 0069's own columns and nothing else -- no embedded resource of any kind.
 *
 * This is the rung `configured` is decided on, deliberately: it is the
 * narrowest probe that can answer the only question the "not available yet"
 * card actually claims to be answering, which is whether `notebook_entries`
 * exists and is readable. Anything richer conflates "the notebook is not here"
 * with "one thing on top of it is not here", and hides a working page.
 */
export const NOTEBOOK_SCALAR_SELECT = `id, session_id, section_id, custom_label,
	 upload_timestamp, status, flag_reason, instructor_comment`;

/** + the photos (0069). One rung of its own so a broken embed costs photos, not the page. */
export const NOTEBOOK_PHOTOS_SELECT = `${NOTEBOOK_SCALAR_SELECT},
	 notebook_entry_photos ( id, drive_file_id, variant, sequence_order, original_filename )`;

/**
 * + written notes (0078). On a project where 0069 is applied but 0078 is not,
 * PostgREST rejects the whole select for an unknown relationship, which would
 * blank a notebook full of perfectly readable photos.
 */
export const NOTEBOOK_NOTES_SELECT = `${NOTEBOOK_PHOTOS_SELECT},
	 notebook_entry_notes ( id, entry_id, note_id, revision, content, created_at )`;

/**
 * + the folder link (0088). Degrades the SAME way and for the same reason: an
 * unknown COLUMN also fails the whole select.
 */
export const NOTEBOOK_FOLDER_SELECT = `${NOTEBOOK_NOTES_SELECT}, folder_id`;

/**
 * + the pin stamp (0091). Its OWN rung rather than riding on the folder one: a
 * project with 0088 applied and 0091 not is a real state, and folding the two
 * together would drop folders to add a pin column that is not there yet.
 */
export const NOTEBOOK_FULL_SELECT = `${NOTEBOOK_FOLDER_SELECT}, pinned_at`;

/**
 * Widest first; each entry names the capability its rung adds, so the load can
 * report exactly what it lost rather than one boolean for all of it.
 *
 * `capability: null` on the last rung means "this one carries no capability of
 * its own" -- failing it is what `configured: false` means.
 */
export const NOTEBOOK_ENTRY_SELECTS = [
	{ select: NOTEBOOK_FULL_SELECT, capability: 'pins' },
	{ select: NOTEBOOK_FOLDER_SELECT, capability: 'folders' },
	{ select: NOTEBOOK_NOTES_SELECT, capability: 'notes' },
	{ select: NOTEBOOK_PHOTOS_SELECT, capability: 'photos' },
	{ select: NOTEBOOK_SCALAR_SELECT, capability: null }
] as const;

/**
 * The check-in labels for entries that are linked to one, read on their own
 * rather than embedded. `notebook_sessions` is readable by any signed-in user
 * (0069, `using (true)`), so this needs no filter for privacy -- only the id
 * list, to keep the payload to what the page is showing.
 */
export const NOTEBOOK_SESSION_SELECT = 'id, session_label, unit_number, session_date';

/**
 * The student's own classes' scheduled check-ins. Since 0098 a check-in is a
 * canonical record plus one posting per section, so this reads the POSTING --
 * which is also what carries the section an entry filed against it belongs to.
 */
export const NOTEBOOK_POSTING_SELECT =
	'section_id, notebook_sessions!inner ( id, unit_number, session_date, session_label )';
