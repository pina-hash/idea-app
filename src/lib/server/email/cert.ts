/**
 * The certification email family: one render function for every notification
 * kind (ledger 0391, surface f). The SIGNATURE is the contract with
 * `$lib/server/certifications/notify.ts`, which calls `renderCertEmail` and
 * sends the result through `$lib/server/email`; `CertEmailInput` and
 * `CertEmailKind` are that contract's types and do not move.
 *
 * WHAT ONE EMAIL IS. The HTML part is `renderEmailLayout` (templates/html.ts):
 * table-based, inline-styled, 600px, the IDEA identity with the full gear
 * mark, a green band, a white card on paper, one 44px call to action and a
 * footer naming IDEA Certifications, Bosco Tech with a plain link to the
 * portal and no unsubscribe (these are transactional). The plain-text part
 * (templates/text.ts) carries the same sentences, the facts as `Label: value`
 * lines and the URL. What each kind says (its subject, eyebrow, tone, call to
 * action and fact rows) is `templates/kinds.ts`, one rule per
 * `NotificationKind` and a generic rule for a kind this module does not know,
 * so nothing here throws on an unexpected kind.
 *
 * THE AWARD EMAIL CARRIES THE SERIAL AND THE VERIFY LINK IN BOTH PARTS, by
 * the spec: `cert_award_commit`'s payload hands them over and the awarded
 * rule puts both in the fact rows (the link in words, with its URL), beside
 * the body sentence that already names them.
 *
 * EVERY VALUE IS ESCAPED by the layout at the one place it meets HTML; this
 * module hands over plain strings only.
 */
import type { NotificationKind } from '$lib/certifications/types';
import { CERT_PATHS } from '$lib/certifications/nav';
import { escapeHtml as escapeHtmlValue, renderEmailLayout, type EmailFact, type EmailQuote } from './templates/html';
import { clampSubject, ruleFor, splitBody } from './templates/kinds';
import { renderEmailText } from './templates/text';

export type CertEmailKind = NotificationKind;

export interface CertEmailInput {
	kind: CertEmailKind;
	to: string;
	recipientName: string | null;
	title: string;
	body: string;
	href: string;
	payload: Record<string, unknown>;
	siteOrigin: string;
}

export interface RenderedEmail {
	subject: string;
	html: string;
	text: string;
}

export const EMAIL_FOOTER_LINE = 'IDEA Certifications, Bosco Tech';

/** Re-exported so a caller that needs the same escaping reads the one copy. */
export const escapeHtml = escapeHtmlValue;

/** `href` made absolute against the site origin; an absolute http(s) href is kept. */
export function absoluteHref(siteOrigin: string, href: string): string {
	if (/^https?:\/\//i.test(href)) return href;
	const origin = siteOrigin.replace(/\/+$/, '');
	const path = href.startsWith('/') ? href : `/${href}`;
	return `${origin}${path}`;
}

export function renderCertEmail(input: CertEmailInput): RenderedEmail {
	const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {};
	const title = String(input.title ?? '').trim();
	const body = String(input.body ?? '').trim();
	const rule = ruleFor(input.kind);
	const kindInput = { kind: input.kind, title, body, payload };

	const link = absoluteHref(input.siteOrigin, input.href || CERT_PATHS.me);
	const portalHref = absoluteHref(input.siteOrigin, CERT_PATHS.catalog);
	const greeting = input.recipientName && input.recipientName.trim() ? `Hello ${input.recipientName.trim()},` : 'Hello,';
	const { intro, quote } = splitBody(body, rule.quoteLabels);
	const factRows: EmailFact[] = rule.facts(kindInput);
	const quoteBlock: EmailQuote | null = quote;
	const tone = rule.tone(kindInput);
	const cta = { word: rule.cta, href: link };
	const footer = { line: EMAIL_FOOTER_LINE, portalHref };
	const subject = clampSubject(rule.subject(kindInput) || title || EMAIL_FOOTER_LINE);

	const html = renderEmailLayout(tone, {
		preheader: body.slice(0, 140),
		eyebrow: rule.eyebrow,
		title: title || rule.eyebrow,
		intro: [greeting, intro],
		quote: quoteBlock,
		factRows,
		cta,
		footer
	});
	const text = renderEmailText({
		eyebrow: rule.eyebrow,
		title: title || rule.eyebrow,
		intro: [greeting, intro],
		quote: quoteBlock,
		factRows,
		cta,
		footer
	});
	return { subject, html, text };
}
