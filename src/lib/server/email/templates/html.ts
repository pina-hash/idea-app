/**
 * THE EMAIL LAYOUT (ledger 0391, surface f): one table-based, inline-styled
 * HTML shell every certification email is poured into, written for Gmail on
 * a desktop and on a phone.
 *
 * WHY IT LOOKS THE WAY IT DOES. Gmail strips `<style>` in several of its
 * clients and ignores most of what it keeps, so every colour, font and length
 * is INLINE on the element that paints it; the only `<style>` block is a
 * handful of dark-mode and narrow-width hints nothing depends on. Layout is
 * tables (`role="presentation"`), one column, at most 600px wide, so it reads
 * on a phone without pinching. The call to action is a "bulletproof" button:
 * a table cell carrying the colour, with a 44px-tall link inside it, and the
 * plain URL printed under it for a client that drops the cell's colour.
 *
 * THE IDENTITY. The full IDEA mark with the gear
 * (`EMAIL_MARK_URL`, the composed 600px emblem drawn at 170px, above 2x), the
 * green band at the top in the IDEA green (#3b6c36, Space White's --green,
 * the light-ground twin), paper #f7f9f9 behind a white card, ink #0d1311,
 * muted #56625e, hairline #d7ddda, and the two fonts named first with the
 * system fallbacks that will actually render in a mail client: Rajdhani
 * (then Arial, Helvetica) for display, Share Tech Mono (then Consolas) for
 * the mono bits. Measured: ink on white 18.8:1, muted 6.4:1, green 6.2:1,
 * white on the green button 6.2:1, the warn ink 7.6:1, the bad ink 6.3:1.
 *
 * TONE IS A WORD AND A GLYPH BESIDE A COLOUR, NEVER THE COLOUR ALONE: green
 * is the house colour; a warning or a refusal moves only the eyebrow line,
 * and that line carries its glyph and its word.
 *
 * EVERY VALUE IS ESCAPED HERE, at the one place it meets HTML. Callers hand
 * in plain strings and never markup.
 */
import { EMAIL_MARK_HEIGHT, EMAIL_MARK_URL, EMAIL_MARK_WIDTH } from '$lib/certifications/certificate/assets';

export const EMAIL_GREEN = '#3b6c36';
export const EMAIL_PAPER = '#f7f9f9';
export const EMAIL_CARD = '#ffffff';
export const EMAIL_INK = '#0d1311';
export const EMAIL_MUTED = '#56625e';
export const EMAIL_HAIRLINE = '#d7ddda';
export const EMAIL_WARN = '#77491b';
export const EMAIL_BAD = '#b42b2b';
export const EMAIL_WIDTH = 600;
export const EMAIL_BUTTON_HEIGHT = 44;

export const EMAIL_FONT_DISPLAY = "'Rajdhani', Arial, Helvetica, sans-serif";
export const EMAIL_FONT_MONO = "'Share Tech Mono', Consolas, 'Lucida Console', monospace";

export type EmailTone = 'green' | 'warn' | 'bad';

export interface EmailFact {
	label: string;
	value: string;
	/** When set, the value is also a link to this URL. */
	href?: string;
}

export interface EmailQuote {
	/** The word over the quoted block: Feedback, Note, Reason. */
	label: string;
	text: string;
}

export interface EmailLayoutParts {
	/** The first line a client previews beside the subject; hidden in the body. */
	preheader: string;
	/** The mono word over the title: Awarded, Review returned, Expiring soon. */
	eyebrow: string;
	title: string;
	/** Paragraphs, in order; the greeting is the first. */
	intro: string[];
	quote?: EmailQuote | null;
	factRows: EmailFact[];
	cta: { word: string; href: string } | null;
	footer: { line: string; portalHref: string };
}

const TONE_INK: Record<EmailTone, string> = { green: EMAIL_GREEN, warn: EMAIL_WARN, bad: EMAIL_BAD };
const TONE_GLYPH: Record<EmailTone, string> = { green: '', warn: '! ', bad: '✕ ' };

export function escapeHtml(value: unknown): string {
	return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Only an http(s) URL is ever put in an `href`; anything else becomes a dead link. */
export function safeEmailHref(href: string): string {
	return /^https?:\/\//i.test(href) ? href : '#';
}

const mono = (size: number, extra = '') =>
	`font-family:${EMAIL_FONT_MONO};font-size:${size}px;letter-spacing:2px;text-transform:uppercase;${extra}`;
const display = (size: number, line: number, extra = '') => `font-family:${EMAIL_FONT_DISPLAY};font-size:${size}px;line-height:${line}px;${extra}`;

function factRow(fact: EmailFact): string {
	const value = fact.href
		? `<a href="${escapeHtml(safeEmailHref(fact.href))}" style="color:${EMAIL_GREEN};text-decoration:underline;word-break:break-all;">${escapeHtml(fact.value)}</a>`
		: escapeHtml(fact.value);
	return (
		`<tr>` +
		`<td valign="top" style="${mono(11)}color:${EMAIL_MUTED};padding:10px 12px 10px 0;border-bottom:1px solid ${EMAIL_HAIRLINE};width:34%;">${escapeHtml(fact.label)}</td>` +
		`<td valign="top" class="cert-ink" style="${display(16, 22)}color:${EMAIL_INK};padding:10px 0;border-bottom:1px solid ${EMAIL_HAIRLINE};">${value}</td>` +
		`</tr>`
	);
}

export function renderEmailLayout(tone: EmailTone, parts: EmailLayoutParts): string {
	const toneInk = TONE_INK[tone] ?? EMAIL_GREEN;
	const glyph = TONE_GLYPH[tone] ?? '';
	const cta = parts.cta ? { word: parts.cta.word, href: safeEmailHref(parts.cta.href) } : null;

	const intro = parts.intro
		.filter((p) => p && p.trim())
		.map((p) => `<tr><td class="cert-ink" style="${display(17, 26)}color:${EMAIL_INK};padding:0 0 12px;">${escapeHtml(p)}</td></tr>`)
		.join('');

	const quote = parts.quote
		? `<tr><td style="padding:4px 0 16px;">` +
			`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
			`<td style="border-left:4px solid ${EMAIL_GREEN};background-color:${EMAIL_PAPER};padding:12px 16px;${display(16, 24)}color:${EMAIL_INK};">` +
			`<span style="display:block;${mono(11)}color:${EMAIL_MUTED};padding-bottom:4px;">${escapeHtml(parts.quote.label)}</span>` +
			`${escapeHtml(parts.quote.text)}</td></tr></table></td></tr>`
		: '';

	const facts = parts.factRows.length
		? `<tr><td style="padding:4px 0 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${EMAIL_HAIRLINE};">${parts.factRows.map(factRow).join('')}</table></td></tr>`
		: '';

	const button = cta
		? `<tr><td style="padding:4px 0 8px;">` +
			`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
			`<td align="center" bgcolor="${EMAIL_GREEN}" style="background-color:${EMAIL_GREEN};border-radius:4px;">` +
			`<a href="${escapeHtml(cta.href)}" style="display:inline-block;min-width:160px;height:${EMAIL_BUTTON_HEIGHT}px;line-height:${EMAIL_BUTTON_HEIGHT}px;padding:0 28px;${display(16, EMAIL_BUTTON_HEIGHT)}font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${EMAIL_CARD};text-decoration:none;border-radius:4px;">${escapeHtml(cta.word)}</a>` +
			`</td></tr></table></td></tr>` +
			`<tr><td style="font-family:${EMAIL_FONT_MONO};font-size:12px;line-height:18px;color:${EMAIL_MUTED};padding:4px 0 0;word-break:break-all;">${escapeHtml(cta.href)}</td></tr>`
		: '';

	return (
		`<!doctype html>` +
		`<html lang="en" xmlns="http://www.w3.org/1999/xhtml">` +
		`<head>` +
		`<meta charset="utf-8">` +
		`<meta name="viewport" content="width=device-width, initial-scale=1">` +
		`<meta name="color-scheme" content="light">` +
		`<meta name="supported-color-schemes" content="light">` +
		`<title>${escapeHtml(parts.title)}</title>` +
		`<style>` +
		`@media (prefers-color-scheme: dark) { .cert-card { background-color: ${EMAIL_CARD} !important; } .cert-ink { color: ${EMAIL_INK} !important; } }` +
		`@media only screen and (max-width: 620px) { .cert-pad { padding-left: 18px !important; padding-right: 18px !important; } }` +
		`</style>` +
		`</head>` +
		`<body style="margin:0;padding:0;background-color:${EMAIL_PAPER};">` +
		`<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(parts.preheader)}</div>` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${EMAIL_PAPER};">` +
		`<tr><td align="center" style="padding:24px 12px;">` +
		`<table role="presentation" width="${EMAIL_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${EMAIL_WIDTH}px;">` +
		`<tr><td style="background-color:${EMAIL_GREEN};height:8px;line-height:8px;font-size:8px;border-radius:4px 4px 0 0;">&nbsp;</td></tr>` +
		`<tr><td class="cert-card cert-pad" style="background-color:${EMAIL_CARD};border:1px solid ${EMAIL_HAIRLINE};border-top:0;padding:28px 36px 32px;">` +
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
		`<tr><td align="center" style="padding:0 0 10px;"><img src="${escapeHtml(EMAIL_MARK_URL)}" width="${EMAIL_MARK_WIDTH}" height="${EMAIL_MARK_HEIGHT}" alt="IDEA" style="display:block;width:${EMAIL_MARK_WIDTH}px;height:${EMAIL_MARK_HEIGHT}px;border:0;outline:none;text-decoration:none;"></td></tr>` +
		`<tr><td align="center" style="${mono(11, 'letter-spacing:3px;')}color:${EMAIL_GREEN};padding:0 0 18px;">IDEA · Certifications</td></tr>` +
		`<tr><td style="border-top:1px solid ${EMAIL_HAIRLINE};font-size:0;line-height:0;">&nbsp;</td></tr>` +
		`<tr><td style="${mono(12)}color:${toneInk};padding:20px 0 6px;">${escapeHtml(glyph + parts.eyebrow)}</td></tr>` +
		`<tr><td class="cert-ink" style="${display(26, 32)}font-weight:700;color:${EMAIL_INK};padding:0 0 12px;">${escapeHtml(parts.title)}</td></tr>` +
		intro +
		quote +
		facts +
		button +
		`</table>` +
		`</td></tr>` +
		`<tr><td style="padding:16px 8px 0;font-family:${EMAIL_FONT_MONO};font-size:11px;line-height:17px;letter-spacing:1px;color:${EMAIL_MUTED};text-align:center;">${escapeHtml(parts.footer.line)}<br>` +
		`<a href="${escapeHtml(safeEmailHref(parts.footer.portalHref))}" style="color:${EMAIL_GREEN};text-decoration:underline;">${escapeHtml(parts.footer.portalHref)}</a></td></tr>` +
		`</table>` +
		`</td></tr></table>` +
		`</body></html>`
	);
}
