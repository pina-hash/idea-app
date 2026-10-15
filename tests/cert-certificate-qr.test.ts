// tests/cert-certificate-qr.test.ts
//
// THE CERTIFICATE'S QR CODE (ledger 0391, surface f). `qrSvgDataUrl` is what
// the certificate route and its harness put in the QR `<img src>`; what has
// to be true is checkable without a browser: the result is a
// `data:image/svg+xml` URL, it decodes to an SVG document, the document is
// sized to the verify URL's own module count plus the one-module quiet zone
// at error correction M (read back from the library's own `create`, never a
// number typed here), two serials give two different codes (the control that
// the text is in the code at all), and no raw `#` or `<` survives in the URL.

import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { QR_DATA_URL_PREFIX, QR_ERROR_CORRECTION, QR_MARGIN, qrSvg, qrSvgDataUrl, svgDataUrl, svgFromDataUrl } from '../src/lib/certifications/certificate/qr';
import { verifyUrl } from '../src/lib/certifications/nav';

const SERIAL = 'IDEA-7K3Q-M9XD-2HTR-W4PB';
const OTHER = 'IDEA-9ZYX-WVTS-RQPN-MKJH';

describe('qrSvgDataUrl', () => {
	it('returns a data:image/svg+xml URL that decodes to an SVG document', async () => {
		const url = verifyUrl(SERIAL);
		const data = await qrSvgDataUrl(url);
		expect(data.startsWith('data:image/svg+xml')).toBe(true);
		expect(data.startsWith(QR_DATA_URL_PREFIX)).toBe(true);
		const svg = svgFromDataUrl(data);
		expect(svg).not.toBeNull();
		expect(svg).toContain('<svg');
		expect(svg).toContain('</svg>');
		expect(svg).toContain('<path');
		// Nothing a URL cannot carry is left raw: a `#` would start a fragment.
		const payload = data.slice(QR_DATA_URL_PREFIX.length);
		expect(payload).not.toContain('#');
		expect(payload).not.toContain('<');
		expect(payload).not.toContain('"');
	});

	it('is sized to the URL\'s own modules at level M with a one-module quiet zone', async () => {
		const url = verifyUrl(SERIAL);
		const svg = await qrSvg(url);
		const symbol = QRCode.create(url, { errorCorrectionLevel: QR_ERROR_CORRECTION });
		const side = symbol.modules.size + QR_MARGIN * 2;
		expect(svg).toContain(`viewBox="0 0 ${side} ${side}"`);
		// A serial's verify URL is 61 characters; version 4 or 5 holds it at M.
		expect(symbol.modules.size).toBeGreaterThanOrEqual(33);
		expect(symbol.modules.size).toBeLessThanOrEqual(41);
	});

	it('two serials give two different codes (the text is in the code)', async () => {
		const a = await qrSvgDataUrl(verifyUrl(SERIAL));
		const b = await qrSvgDataUrl(verifyUrl(OTHER));
		const same = await qrSvgDataUrl(verifyUrl(SERIAL));
		expect(a).not.toBe(b);
		expect(a).toBe(same);
	});

	it('svgDataUrl and svgFromDataUrl round-trip, and a foreign URL reads null', () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path fill="#000" d="M0 0h1v1H0z"/></svg>';
		const data = svgDataUrl(svg);
		expect(svgFromDataUrl(data)).toBe(svg);
		expect(svgFromDataUrl('data:image/png;base64,AAAA')).toBeNull();
		expect(svgFromDataUrl('https://ideabosco.com/x.svg')).toBeNull();
	});
});
