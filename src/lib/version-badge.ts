/**
 * Serve-time version badge injection for legacy HTML served by endpoints
 * (assignments, VANGUARD, coin entry). Follows the established serve-time
 * injection convention (`rewriteLegacyLinks`, the VANGUARD bootstrap): the
 * served HTML string is modified, never the source files on disk. The badge is
 * a tiny fixed, pointer-events-none chip so it can never block page content.
 */
import { apps, deploy } from 'virtual:site-versions';
import { stampText } from '$lib/site-versions';

/**
 * THE SAME LINE THE SVELTE BADGE RENDERS, ASSEMBLED IN THE SAME PLACE. These
 * two surfaces used to build the string independently, so one build could
 * describe itself two ways depending on which page you were looking at.
 * `stampText` is now the only assembler; this exists to name it for the
 * injector below.
 */
export function versionLine(appId: string): string {
	return stampText(appId, apps, deploy);
}

const BADGE_STYLE = [
	'position:fixed',
	'right:8px',
	'bottom:6px',
	'z-index:2147483000',
	'pointer-events:none',
	"font:10px 'Share Tech Mono',monospace",
	'letter-spacing:.08em',
	'text-transform:uppercase',
	'color:rgba(122,166,134,.8)',
	'background:rgba(2,10,4,.6)',
	'border:1px solid rgba(0,255,65,.16)',
	'border-radius:3px',
	'padding:2px 7px'
].join(';');

/** Insert the version chip just before `</body>` (appended if none found). */
export function injectVersionBadge(html: string, appId: string): string {
	const badge = `<div style="${BADGE_STYLE}" aria-hidden="true">${versionLine(appId)}</div>`;
	const i = html.toLowerCase().lastIndexOf('</body>');
	if (i === -1) return html + badge;
	return html.slice(0, i) + badge + html.slice(i);
}
