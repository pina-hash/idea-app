/**
 * THE QR CODE ON A CERTIFICATE (ledger 0391, surface f): the verify URL for
 * one serial, drawn as an SVG by the `qrcode` package and handed to the
 * `Certificate` component as an `<img src>` data URL.
 *
 * SERVER-SIDE, AS A STRING, NEVER `{@html}`. The page's server load (and the
 * harness's) calls `qrSvgDataUrl` and the component puts the string in an
 * `img`'s `src`, so the markup an SVG library produces never reaches the
 * document as HTML. An `<img>` decodes an image or fails; script does not run
 * in it.
 *
 * ERROR CORRECTION M (15%), A ONE-MODULE QUIET ZONE. The code is printed at
 * about 1.1in and scanned from a phone; M is the level the design standards'
 * QR exemption assumes ("a QR renders bare on a light plate at full
 * contrast"), and the sheet's own margin around the image is the rest of the
 * quiet zone. `encodeURIComponent` is the whole encoding: a `#` (every fill
 * colour) would otherwise start a fragment, and a `<` is not a URL-safe byte.
 */
import QRCode from 'qrcode';

export const QR_ERROR_CORRECTION = 'M' as const;
export const QR_MARGIN = 1;
export const QR_DATA_URL_PREFIX = 'data:image/svg+xml;utf8,';

/** The bare SVG document for `text`. */
export async function qrSvg(text: string): Promise<string> {
	return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: QR_ERROR_CORRECTION, margin: QR_MARGIN });
}

/** An SVG document as a data URL an `<img src>` takes. */
export function svgDataUrl(svg: string): string {
	return `${QR_DATA_URL_PREFIX}${encodeURIComponent(svg)}`;
}

/** The QR code for `text`, as a `data:image/svg+xml;utf8,...` URL. */
export async function qrSvgDataUrl(text: string): Promise<string> {
	return svgDataUrl(await qrSvg(text));
}

/** The SVG back out of a data URL this module made; null for anything else. */
export function svgFromDataUrl(url: string): string | null {
	if (!url.startsWith(QR_DATA_URL_PREFIX)) return null;
	try {
		return decodeURIComponent(url.slice(QR_DATA_URL_PREFIX.length));
	} catch {
		return null;
	}
}
