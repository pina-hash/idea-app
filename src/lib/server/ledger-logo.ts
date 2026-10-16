import { render } from 'svelte/server';
import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';

/**
 * THE LEDGER'S MARK IS THE SITE'S MARK (ledger 0392, report cead7265: "idea top
 * left logo is outdated on the coin ledger page").
 *
 * The Ledger is carried-over HTML whose header still says "IDEA." in neon
 * Orbitron, while every other header on the site carries the emblem lockup,
 * `AnimatedLogo` (the gear behind the plate, with its Space White light pair).
 * The file is frozen, so the swap is made on the SERVED STRING, as everything
 * added to legacy HTML is: the anchor `<a class="logo" href="/">IDEA.</a>` is
 * replaced with the real component, server-rendered through `svelte/server`, so
 * the markup (both pairs, the srcsets, the light pair lazy) is the component's
 * own and cannot drift from it.
 *
 * WHAT `render` DOES NOT CARRY IS THE COMPONENT'S STYLESHEET: SvelteKit extracts
 * component CSS into its own files, and a raw HTML response loads none of them.
 * So the few layout rules the lockup needs are restated below, keyed on the
 * component's own class names inside `.idea-ledger-logo`. They are the
 * component's rules, not a design of their own, and
 * `tests/ledger-logo.test.ts` reads AnimatedLogo.svelte and reddens if a
 * geometry number here stops matching it.
 */

/** The anchor the frozen Ledger header carries, verbatim. */
export const LEDGER_LOGO_ANCHOR = '<a class="logo" href="/">IDEA.</a>';

/** The lockup's geometry, read by the parity test against the component. */
export const LEDGER_LOGO_CSS = `
.idea-ledger-logo { display: inline-flex; align-items: center; line-height: 0; text-decoration: none; }
.idea-ledger-logo .idea-logo { position: relative; aspect-ratio: 2560 / 1204; line-height: 0; }
.idea-ledger-logo .gear, .idea-ledger-logo .gear-light { position: absolute; left: 0; top: -1.2%; width: 46.95%; height: auto; transform-origin: 50% 50%; }
.idea-ledger-logo .plate, .idea-ledger-logo .plate-light { position: absolute; inset: 0; width: 100%; height: 100%; }
.idea-ledger-logo .gear-light, .idea-ledger-logo .plate-light { display: none; }
:root[data-theme='space-white'] .idea-ledger-logo .gear-light, :root[data-theme='space-white'] .idea-ledger-logo .plate-light { display: block; }
:root[data-theme='space-white'] .idea-ledger-logo .has-light .gear, :root[data-theme='space-white'] .idea-ledger-logo .has-light .plate { display: none; }
@keyframes idea-ledger-gear-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .idea-ledger-logo .gear.spin, .idea-ledger-logo .gear-light.spin { animation-name: idea-ledger-gear-spin; animation-timing-function: linear; animation-iteration-count: infinite; }
}
@media print { .idea-ledger-logo .gear-light, .idea-ledger-logo .plate-light { display: none !important; } .idea-ledger-logo .gear, .idea-ledger-logo .plate { display: block !important; } }
`;

/** The width the lockup is drawn at in the Ledger's 64px header: the site header's own. */
export const LEDGER_LOGO_WIDTH = 104;

let cached: string | null = null;

/** The anchor's replacement: the real component's markup inside a home link. */
export function ledgerLogoHtml(): string {
	if (cached === null) {
		const { body } = render(AnimatedLogo, { props: { width: LEDGER_LOGO_WIDTH } });
		cached = `<a class="idea-ledger-logo" href="/" aria-label="IDEA home">${body}</a>`;
	}
	return cached;
}

/**
 * Swap the Ledger's text mark for the lockup and add its rules before
 * `</head>`. A page without the anchor (a future edit of the file) is returned
 * unchanged, and so is one without a head.
 */
export function injectLedgerLogo(html: string): string {
	if (!html.includes(LEDGER_LOGO_ANCHOR)) return html;
	const swapped = html.replace(LEDGER_LOGO_ANCHOR, ledgerLogoHtml());
	const i = swapped.indexOf('</head>');
	if (i === -1) return swapped;
	return `${swapped.slice(0, i)}<style id="idea-ledger-logo-css">${LEDGER_LOGO_CSS}</style>\n${swapped.slice(i)}`;
}
