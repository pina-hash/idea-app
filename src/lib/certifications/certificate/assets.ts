/**
 * THE IDEA MARK THE CERTIFICATE AND THE EMAILS CARRY (ledger 0391, surface f).
 *
 * The spec (docs/CERTIFICATIONS.md, "The printed certificate") asks for the
 * FULL mark with the gear, never the text-only lockup. `static/IDEA/` holds
 * the composed emblem (gear plus plate) at two widths beside the master:
 * `idea-logo-600.png` (600x282) and `idea-logo-1200.png` (1200x564), both
 * downsampled from `idea-logo.png` (2560x1204), the dark emblem a steel gear
 * and a dark green plate with ivory letters, outlined, so it reads as a badge
 * on paper and on a white email card alike. The light pair Space White uses
 * exists only as two separate layers (`idea-gear-light-*`,
 * `idea-logo-text-light-*`), which an email client cannot stack, so the
 * composed dark emblem is the one asset both surfaces name.
 *
 * ROOT-RELATIVE ON THE SITE, ABSOLUTE IN AN EMAIL. The certificate page is
 * served from the portal's own origin, so a root-relative `src` resolves to
 * `https://ideabosco.com/IDEA/...` in production and to the dev server while
 * developing (the browser harness blocks every non-loopback request, so an
 * absolute production URL would draw nothing there). An email has no origin of
 * its own, so it carries the canonical absolute URL.
 *
 * Pure data: no Svelte, no `$lib/server`.
 */
import { CERT_SITE_ORIGIN } from '$lib/certifications/nav';

/** The composed full mark at 600px wide, the `src` fallback. */
export const CERT_MARK_SRC = '/IDEA/idea-logo-600.png';
/** Both composed widths, so a print at 300dpi takes the 1200px copy. */
export const CERT_MARK_SRCSET = '/IDEA/idea-logo-600.png 600w, /IDEA/idea-logo-1200.png 1200w';
/** The emblem's own proportion (2560 x 1204), for the `width`/`height` attributes. */
export const CERT_MARK_WIDTH = 1200;
export const CERT_MARK_HEIGHT = 564;

/** The same 600px emblem, absolute, for an email `<img>`: at `EMAIL_MARK_WIDTH` it is drawn above 2x. */
export const EMAIL_MARK_URL = `${CERT_SITE_ORIGIN}/IDEA/idea-logo-600.png`;
export const EMAIL_MARK_WIDTH = 170;
export const EMAIL_MARK_HEIGHT = 80;
