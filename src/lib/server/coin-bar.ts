import { render } from 'svelte/server';
import CoinBar from '$lib/coin-bar/CoinBar.svelte';
import COIN_BAR_CSS from '$lib/coin-bar/coin-bar.css?raw';
import COLORS_CSS from '$lib/design-system/colors.css?raw';
import SPACE_WHITE_CSS from '$lib/design-system/themes/space-white.css?raw';
import TYPE_CSS from '$lib/design-system/typography.css?raw';
import { coinStaff } from '$lib/server/coin-scope';

/**
 * THE IDEA COIN BAR, SERVER SIDE (ledger 0422).
 *
 * `coinBarDesk` is the one answer to "does this viewer get the Coin Desk tab":
 * the desk's own gate (`coinStaff`), so the tab is offered exactly to the
 * people the desk opens for. Signed out is false without a call, and any
 * error is false (it fails closed, and a tab that is missing costs nothing).
 *
 * `injectCoinBar` puts the REAL component, server-rendered, under the frozen
 * Ledger's header, the way `injectLedgerLogo` puts the real lockup in it. A
 * raw HTML response loads no component stylesheet, so the bar's own file is
 * added beside it, plus the site tokens it reads, re-declared INSIDE `.coin-bar`
 * from the design system's own files: the Ledger defines `--green` and
 * `--white` as its old neon set, and a `var(--green)` in the bar would resolve
 * to that. Every value is read out of the stylesheet that owns it, never typed
 * here, so a palette change reaches the Ledger's bar on the next build.
 */

/** The tokens the bar reads. */
export const COIN_BAR_TOKENS = ['--bg0', '--bg1', '--bg2', '--green', '--gold', '--cyan', '--white', '--dim', '--line'] as const;

/** `name: value;` out of the first block that opens with `selector {`. */
export function tokenFrom(css: string, selector: string, name: string): string | null {
	const start = css.indexOf(`${selector} {`);
	if (start === -1) return null;
	const end = css.indexOf('\n}', start);
	const block = css.slice(start, end === -1 ? undefined : end);
	const m = block.match(new RegExp(`(?:^|[\\s;{])${name.replace(/[-]/g, '\\-')}:\\s*([^;]+);`));
	return m ? m[1].trim() : null;
}

function tokenBlock(css: string, selector: string, names: readonly string[]): string {
	return names
		.map((n) => [n, tokenFrom(css, selector, n)] as const)
		.filter((p): p is readonly [string, string] => !!p[1])
		.map(([n, v]) => `${n}: ${v};`)
		.join(' ');
}

/** The stylesheets the tokens are read from. Raw imports in the app; a test hands in the files it read. */
export interface CoinBarTokenSources {
	colors: string;
	spaceWhite: string;
	type: string;
}

const SOURCES: CoinBarTokenSources = { colors: COLORS_CSS, spaceWhite: SPACE_WHITE_CSS, type: TYPE_CSS };

/** The site's tokens, scoped to the bar, in both themes. */
export function coinBarTokenCss(src: CoinBarTokenSources = SOURCES): string {
	const dark = tokenBlock(src.colors, ':root', COIN_BAR_TOKENS);
	const light = tokenBlock(src.spaceWhite, ":root[data-theme='space-white']", COIN_BAR_TOKENS);
	const fonts = tokenBlock(src.type, ':root', ['--font-display', '--font-mono']);
	return `.coin-bar { ${dark} ${fonts} }\n:root[data-theme='space-white'] .coin-bar { ${light} }`;
}

/** The marker the Ledger's header ends with; the bar goes straight after it. */
export const LEDGER_HEADER_END = '</header>';

/** The bar's markup for the Ledger, the real component. */
export function ledgerCoinBarHtml(desk: boolean): string {
	return render(CoinBar, { props: { current: 'ledger', desk } }).body;
}

/**
 * The Ledger with the bar under its header and the bar's rules in its head. A
 * page without a header or a head (a future edit of the file) comes back
 * unchanged, so the bar is never half-added.
 */
export function injectCoinBar(html: string, desk: boolean): string {
	const body = html.indexOf('<body');
	const end = html.indexOf(LEDGER_HEADER_END, body === -1 ? 0 : body);
	const head = html.indexOf('</head>');
	if (body === -1 || end === -1 || head === -1 || head > end) return html;
	const at = end + LEDGER_HEADER_END.length;
	const withBar = `${html.slice(0, at)}\n${ledgerCoinBarHtml(desk)}${html.slice(at)}`;
	const styles = `<style id="idea-coin-bar-css">${coinBarTokenCss()}\n${COIN_BAR_CSS}\n.coin-bar { position: relative; z-index: 99; }</style>\n`;
	return `${withBar.slice(0, head)}${styles}${withBar.slice(head)}`;
}

/** Whether this viewer is offered the Coin Desk tab. */
export async function coinBarDesk(locals: Pick<App.Locals, 'supabase' | 'claims'>): Promise<boolean> {
	const sub = typeof locals.claims?.sub === 'string' ? locals.claims.sub : '';
	if (!sub) return false;
	try {
		return !!(await coinStaff(locals.supabase, sub));
	} catch {
		return false;
	}
}
