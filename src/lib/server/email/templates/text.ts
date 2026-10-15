/**
 * THE PLAIN-TEXT PART (ledger 0391, surface f): the same sentences as the
 * HTML, the facts as `Label: value` lines, and the call to action as a word
 * and its URL, so a client that shows no HTML (and a screen reader that
 * prefers not to) loses nothing. Nothing is escaped here: it is text.
 */
import type { EmailFact, EmailQuote } from './html';

export interface EmailTextParts {
	eyebrow: string;
	title: string;
	intro: string[];
	quote?: EmailQuote | null;
	factRows: EmailFact[];
	cta: { word: string; href: string } | null;
	footer: { line: string; portalHref: string };
}

export function renderEmailText(parts: EmailTextParts): string {
	const lines: string[] = [];
	lines.push(parts.footer.line);
	lines.push(parts.eyebrow.toUpperCase());
	lines.push('');
	lines.push(parts.title);
	lines.push('');
	for (const p of parts.intro) {
		if (!p || !p.trim()) continue;
		lines.push(p);
		lines.push('');
	}
	if (parts.quote) {
		lines.push(`${parts.quote.label}:`);
		lines.push(`> ${parts.quote.text}`);
		lines.push('');
	}
	if (parts.factRows.length) {
		for (const f of parts.factRows) lines.push(`${f.label}: ${f.value}${f.href && f.href !== f.value ? ` (${f.href})` : ''}`);
		lines.push('');
	}
	if (parts.cta) {
		lines.push(`${parts.cta.word}: ${parts.cta.href}`);
		lines.push('');
	}
	lines.push(parts.footer.line);
	lines.push(parts.footer.portalHref);
	return lines.join('\n');
}
