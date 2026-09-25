/**
 * THE ONE ASCII FOLD FOR A NAME A FILE IS SAVED UNDER, AND IT IS CLIENT-SAFE.
 *
 * `downloadFilename` lived in `$lib/server/classroom-attachments.ts`, which is
 * right for the three proxy routes that hand it to `createSignedUrl` and wrong
 * for anything the BROWSER names: `$lib/server` never reaches the client, so the
 * grading console's zip of every student file (ledger 0298, A6) could not call
 * it and would have had to write a second fold. It moved here, byte-for-byte in
 * behaviour, and the server module RE-EXPORTS it so its three callers and its
 * test are unchanged.
 *
 * `asciiSafeName` is the core with no length cap and no fallback, because a
 * caller building a name out of several parts (the bulk download's
 * `Last_First - <title> - <block> - <n>.<ext>`) needs to know when a part folded
 * to NOTHING, which the `'download'` fallback would hide.
 */

/**
 * Fold diacritics to their base letters, then turn every character a browser or
 * a header would have to escape into ONE underscore, and trim underscores off
 * both ends. May return the empty string.
 */
export function asciiSafeName(value: string | null | undefined): string {
	return (
		(value ?? '')
			// Fold diacritics: decompose, then drop the combining marks.
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			// Everything a browser or a header would have to escape becomes one
			// underscore. Spaces, parentheses, quotes, both path separators and every
			// control character are all in here by construction rather than by name.
			.replace(/[^A-Za-z0-9._-]+/g, '_')
			.replace(/_{2,}/g, '_')
			.replace(/^_+|_+$/g, '')
	);
}

/**
 * The `download` value handed to `createSignedUrl`, which is what turns the
 * response into `Content-Disposition: attachment`.
 *
 * IT IS ASCII-ONLY, AND THAT IS A MEASUREMENT RATHER THAN A PREFERENCE.
 * The first version passed the name through almost untouched -- spaces,
 * parentheses and accents included -- on the reasoning that the name somebody
 * typed is the name they should get back. Measured against a real Supabase
 * project, `Estudio (final) café.SLDPRT` came back as
 *
 *   content-disposition: attachment; filename=Estudio%20%2528final%2529%20caf%25C3%25A9.SLDPRT
 *
 * `%2528` is a percent-encoded `%28`: the value is encoded on its way into the
 * signed URL's query string and encoded AGAIN on its way into the header, so a
 * browser saves the file with literal percent escapes in its name. Every
 * fixture whose name was `[A-Za-z0-9.-]` came back clean; every one that was
 * not came back mangled. The two encoding layers are not ours to fix, so what
 * is ours is to hand over a value that survives both.
 *
 * WHAT IS LOST IS ONLY THE SAVED FILENAME, and only its punctuation. The name
 * the person typed is stored verbatim in `filename` and is what every surface
 * in the app shows them -- which is the half that matters and the half the
 * opaque storage key exists to protect. Diacritics are folded to their base
 * letters rather than dropped (`café` -> `cafe`, not `caf_`), because a
 * transliteration is still readable and a hole is not.
 */
export function downloadFilename(filename: string | null | undefined): string {
	const cleaned = asciiSafeName(filename).slice(0, 200);
	return cleaned || 'download';
}
