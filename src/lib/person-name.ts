/**
 * THE ONE SPELLING OF A PERSON'S NAME ON SCREEN (report 715c8421). A roster or
 * a legacy ledger can hold "Delgadillo, Seth" while the profile holds
 * "Seth Delgadillo", and which one a surface showed depended on which table it
 * read: the leaderboard listed everyone as "First Last" except one person. Every
 * surface that prints a name that came from the database passes it through
 * here, so the order is the same wherever it appears.
 *
 * ONLY THE UNAMBIGUOUS SHAPE IS FLIPPED: exactly one comma, a name on each side
 * and nothing that reads as a suffix ("Smith, Jr." stays), an address or a
 * number. Anything else is returned as it came, trimmed.
 */
const SUFFIX = /^(jr|sr|ii|iii|iv|v|phd|md)\.?$/i;

export function personName(raw: string | null | undefined): string {
	const text = (raw ?? '').replace(/\s+/g, ' ').trim();
	if (!text) return '';
	const parts = text.split(',');
	if (parts.length !== 2) return text;
	const last = parts[0].trim();
	const first = parts[1].trim();
	if (!last || !first) return text;
	if (SUFFIX.test(first) || /[@\d]/.test(text)) return text;
	return `${first} ${last}`;
}
