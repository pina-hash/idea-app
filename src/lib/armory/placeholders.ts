/**
 * THE TWO PLACEHOLDER TEXTS OF A CLASS FOLDER (ledger 0463, migration 0319).
 *
 * Armory 0.5.1 knows a folder only through a file in it that has a version,
 * so every personal and team folder the website makes carries one small text
 * file, "README - <folder>.txt", whose version names one of these two texts by
 * its SHA-256 (`_armory_placeholder_hash` and `_armory_placeholder_bytes` in
 * 0319 are the database's copy of the two numbers below). The bytes are put in
 * file storage by the website the first time any computer asks for them
 * (`handleBlobUrl`), because no person ever uploads them.
 *
 * Plain ASCII with Windows line endings, so Notepad on a lab computer shows
 * them as written. Changing a single byte changes the hash, which is why
 * `tests/armory-class-placeholders.test.ts` holds the text, the hash and the
 * length to the migration's literals.
 */
export type PlaceholderKind = 'personal' | 'team';

const LINES: Record<PlaceholderKind, string[]> = {
	personal: [
		'This is your own folder in IDEA Armory.',
		'',
		'Save your work in this folder. Only you can add files here or check them in.',
		'Everyone in your class can open your files to look at them.',
		'',
		'Leave this note here. It keeps your folder in place.'
	],
	team: [
		"This is your team's folder in IDEA Armory.",
		'',
		"Save your team's work in this folder. Only your team can add files here or check them in.",
		'Everyone in your class can open these files to look at them.',
		'',
		'Leave this note here. It keeps the folder in place.'
	]
};

export function placeholderText(kind: PlaceholderKind): string {
	return LINES[kind].map((l) => l + '\r\n').join('');
}

export function placeholderBytes(kind: PlaceholderKind): Uint8Array {
	return new TextEncoder().encode(placeholderText(kind));
}

/** What 0319 stores for each kind: the SHA-256 and the length. */
export const PLACEHOLDERS: Record<PlaceholderKind, { hash: string; bytes: number }> = {
	personal: { hash: '20af567f0310d646f19774ba42f935151c06a94a8c77ca51b063ec24d3eeeb90', bytes: 238 },
	team: { hash: '56298a48a5f9cd873d3aa3a5071c5fd8dca4061dbe985b55a14eccbaea09bfe4', bytes: 254 }
};

/** The kind whose bytes have this hash, or null. */
export function placeholderKindForHash(hash: string): PlaceholderKind | null {
	for (const kind of Object.keys(PLACEHOLDERS) as PlaceholderKind[]) if (PLACEHOLDERS[kind].hash === hash) return kind;
	return null;
}
