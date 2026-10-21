/**
 * HTML COVERS (ledger 0422, feedback 1cc58a6e): an admin can give any game an
 * animated or interactive cover written in HTML. Plain data and string
 * builders, no Svelte, so the card, the editor and the serving route read one
 * statement of each rule.
 *
 * WHERE IT RUNS. Only on the apps origin, at `/c/<app id>`, which holds no
 * session (the origin split, docs/subsystems/origin-split.md), and only under
 * `sandbox allow-scripts`: an opaque origin, so no cookie, no storage, no
 * reach into the page that frames it. And with NO NETWORK: every fetch
 * directive is `'none'` except inline script and style and `data:`/`blob:`
 * pictures, so a cover cannot load a tracker, call our API or send anything
 * anywhere. The frame on the card carries the same sandbox as an attribute.
 */
import { foundryPortalOrigin } from './bundle-headers.ts';

/** The route prefix, on the apps origin. */
export const FOUNDRY_COVER_HTML_PREFIX = '/c/';

/** The most characters an HTML cover holds (0291 enforces the same number). */
export const FOUNDRY_COVER_HTML_MAX = 200_000;

/** The iframe `sandbox` attribute for a cover: scripts run, nothing else. */
export const FOUNDRY_COVER_SANDBOX = 'allow-scripts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The cover's frame address, or NULL. Null when there is no apps origin (no
 * second origin, no HTML cover: the card falls back to its picture, the same
 * strict direction a bundle frame takes), when the id is not a uuid, or when
 * the app has no HTML cover (`rev` null). The revision is in the address so a
 * replaced cover is never served from a cache.
 */
export function foundryCoverHtmlUrl(
	appsOrigin: string | null | undefined,
	appId: string | null | undefined,
	rev: number | null | undefined
): string | null {
	const origin = (appsOrigin ?? '').trim().replace(/\/+$/, '');
	const id = (appId ?? '').trim();
	if (!origin || !UUID_RE.test(id) || typeof rev !== 'number' || !Number.isFinite(rev) || rev < 1) return null;
	return `${origin}${FOUNDRY_COVER_HTML_PREFIX}${id}?v=${Math.floor(rev)}`;
}

/** The content security policy the route serves a cover under. */
export function foundryCoverCsp(appsOrigin: string | null | undefined, portalVariable: string | null | undefined): string {
	const portal = foundryPortalOrigin(appsOrigin, portalVariable);
	const directives = [
		`sandbox ${FOUNDRY_COVER_SANDBOX}`,
		`default-src 'none'`,
		`script-src 'unsafe-inline'`,
		`style-src 'unsafe-inline'`,
		`img-src data: blob:`,
		`media-src data: blob:`,
		`font-src data:`,
		`connect-src 'none'`,
		`frame-src 'none'`,
		`worker-src 'none'`,
		`form-action 'none'`,
		`base-uri 'none'`
	];
	if (portal) directives.push(`frame-ancestors ${portal}`);
	return directives.join('; ');
}

/** Whether a file the editor or the connector was handed reads as HTML. */
export function looksLikeHtmlCover(filename: string, text: string): boolean {
	if (/\.html?$/i.test(filename)) return true;
	return /^\s*(<!doctype html|<html|<svg|<canvas|<style|<div|<body)/i.test(text);
}
