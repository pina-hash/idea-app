// tests/cert-certificate-render.test.ts
//
// THE PRINTED CERTIFICATE RENDERS EVERY REAL FIELD AND NOTHING ELSE (ledger
// 0391, surface f). A server render of the REAL `Certificate` (and the
// `CertificatePage` the route mounts) over the harness fixtures: the holder's
// name, the serial, the certifier, the award date in words, the QR `<img>`
// with its data URL and the full mark are on the sheet; a revoked record
// carries its watermark and the word REVOKED, and a valid one carries no
// watermark and no status word, both COUNTED; no address, no em dash and no
// filler word reaches the markup. The browser pass measures the geometry and
// the paper's contrast; this is the cheaper guard that the sheet says what
// the record says.

import { beforeAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Certificate from '$lib/certifications/certificate/Certificate.svelte';
import CertificatePage from '$lib/certifications/certificate/CertificatePage.svelte';
import { CERT_MARK_SRC, CERT_MARK_SRCSET } from '$lib/certifications/certificate/assets';
import { nameSizeIn, SHEET_ASPECT, sheetScale } from '$lib/certifications/certificate/layout';
import { qrSvgDataUrl } from '$lib/certifications/certificate/qr';
import { verifyUrl } from '$lib/certifications/nav';
import { CERTIFICATE_RECORDS, CERTIFICATE_STATES, SERIAL_VALID } from '../src/routes/dev/cert-certificate/fixtures';

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

const qrFor = new Map<string, string>();
beforeAll(async () => {
	for (const state of CERTIFICATE_STATES) {
		const serial = CERTIFICATE_RECORDS[state].serial;
		if (!qrFor.has(serial)) qrFor.set(serial, await qrSvgDataUrl(verifyUrl(serial)));
	}
});

const sheet = (state: (typeof CERTIFICATE_STATES)[number]) => {
	const record = CERTIFICATE_RECORDS[state];
	const verify = verifyUrl(record.serial);
	return strip(render(Certificate, { props: { record, qrSrc: qrFor.get(record.serial)!, verifyUrl: verify, markSrc: CERT_MARK_SRC, markSrcset: CERT_MARK_SRCSET } }).body);
};

describe('the certificate sheet', () => {
	it('a valid record: every field real, the QR and the mark present, no watermark', () => {
		const html = sheet('valid');
		expect(html).toContain('Ana Reyes');
		expect(html).toContain(SERIAL_VALID);
		expect(html).toContain('Mr. Pina');
		expect(html).toContain('Certifier');
		expect(html).toContain('Awarded November 5, 2026');
		expect(html).toContain('Manual Mill Level 1');
		expect(html).toContain('MILL-1');
		expect(html).toContain('Level 1');
		expect(html).toContain('Machining');
		expect(html).toContain('This certifies that');
		expect(html).toContain('alone and with zero outside help');
		expect(html).toContain('Scan to verify');
		expect(html).toContain(`https://ideabosco.com/certifications/verify?serial=${SERIAL_VALID}`);
		expect(count(html, /data-testid="cert-qr"[^>]*src="data:image\/svg\+xml|src="data:image\/svg\+xml[^>]*data-testid="cert-qr"/g)).toBe(1);
		expect(html).toMatch(/<img[^>]*class="certificate-qr-img"[^>]*src="data:image\/svg\+xml;utf8,/);
		expect(html).toMatch(/<img[^>]*class="certificate-mark"[^>]*src="\/IDEA\/idea-logo-600\.png"/);
		expect(html).toContain('idea-logo-1200.png 1200w');
		expect(count(html, /data-testid="cert-watermark"/g)).toBe(0);
		expect(count(html, /data-testid="cert-status-line"/g)).toBe(0);
		for (const word of ['REVOKED', 'SUSPENDED', 'EXPIRED', 'Valid through', 'Lorem', 'placeholder', 'Sample']) expect(html).not.toContain(word);
		expect(html).toContain('data-status="valid"');
	});

	it('a revoked record: the watermark and the word REVOKED, once each, on the same real fields', () => {
		const html = sheet('revoked');
		expect(count(html, /data-testid="cert-watermark"/g)).toBe(1);
		expect(count(html, /data-testid="cert-status-line"/g)).toBe(1);
		expect(html).toContain('REVOKED');
		expect(html).toContain('>Revoked<');
		expect(html).toContain('data-status="revoked"');
		expect(html).toContain('Ana Reyes');
		expect(html).toContain(SERIAL_VALID);
		expect(html).not.toContain('SUSPENDED');
		expect(html).not.toContain('EXPIRED');
	});

	it('suspended and expired records carry their own words; an expiry prints as valid through', () => {
		const suspended = sheet('suspended');
		expect(count(suspended, /data-testid="cert-watermark"/g)).toBe(1);
		expect(suspended).toContain('SUSPENDED');
		expect(suspended).not.toContain('REVOKED');
		const expired = sheet('expired');
		expect(count(expired, /data-testid="cert-watermark"/g)).toBe(1);
		expect(expired).toContain('EXPIRED');
		expect(expired).toContain('Valid through August 17, 2026');
		expect(expired).toContain('Shop Safety Level 1');
		const dated = sheet('valid-dated');
		expect(count(dated, /data-testid="cert-watermark"/g)).toBe(0);
		expect(dated).toContain('Valid through August 16, 2027');
		expect(dated).toContain('Awarded August 20, 2026');
	});

	it('a 32-character name is set smaller than a short one and still on the sheet whole', () => {
		const html = sheet('long-name');
		expect(html).toContain('Maximiliano Fernandez de la Cruz');
		expect(html).toContain(`font-size: ${nameSizeIn('Maximiliano Fernandez de la Cruz')}in`);
		expect(sheet('valid')).toContain(`font-size: ${nameSizeIn('Ana Reyes')}in`);
	});

	it('no address, no em dash and no weekday on any sheet', () => {
		for (const state of CERTIFICATE_STATES) {
			const html = sheet(state);
			expect(html, state).not.toContain('@boscotech');
			expect(html, state).not.toContain('—');
			for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) expect(html, state).not.toContain(day);
		}
	});
});

describe('the certificate page around the sheet', () => {
	it('renders Print, Back and Verify, the sheet and the pointer sentence', () => {
		const record = CERTIFICATE_RECORDS.valid;
		const html = strip(render(CertificatePage, { props: { record, qrSrc: qrFor.get(record.serial)!, verifyUrl: verifyUrl(record.serial), markSrc: CERT_MARK_SRC, markSrcset: CERT_MARK_SRCSET } }).body);
		expect(count(html, /data-testid="cert-print"/g)).toBe(1);
		expect(count(html, /data-testid="cert-back"/g)).toBe(1);
		expect(count(html, /data-testid="cert-verify-link"/g)).toBe(1);
		expect(html).toContain(`href="/certifications/verify?serial=${SERIAL_VALID}"`);
		expect(html).toContain('href="/certifications/me"');
		expect(count(html, /data-testid="cert-sheet"/g)).toBe(1);
		expect(count(html, /data-testid="cert-certificate-note"/g)).toBe(1);
		expect(html).toContain('pointer to the live record');
		expect(html).toContain('class="certificate-page"');
		// The keys carry words, never a glyph alone.
		expect(html).toMatch(/data-testid="cert-print">Print</);
		expect(html).toMatch(/data-testid="cert-back">Back</);
		expect(html).toMatch(/data-testid="cert-verify-link">Verify</);
	});
});

describe('the sheet arithmetic', () => {
	it('nameSizeIn: short names take the cap, 32 characters fit one line, nothing under the floor', () => {
		expect(nameSizeIn('Ana Reyes')).toBe(0.7);
		const long = nameSizeIn('Maximiliano Fernandez de la Cruz');
		expect(long).toBeLessThan(0.7);
		expect(long).toBeGreaterThanOrEqual(0.5);
		// 32 characters at the measured advance fit inside the 9.2in run.
		expect(32 * 0.52 * long).toBeLessThanOrEqual(9.2);
		expect(nameSizeIn('A'.repeat(80))).toBe(0.3);
	});
	it('sheetScale: never above 1, the frame width over 11in otherwise', () => {
		expect(sheetScale(1440)).toBe(1);
		expect(sheetScale(1056)).toBe(1);
		expect(sheetScale(343)).toBeCloseTo(343 / 1056, 6);
		expect(sheetScale(0)).toBe(1);
		expect(sheetScale(Number.NaN)).toBe(1);
		expect(SHEET_ASPECT).toBeCloseTo(11 / 8.5, 9);
	});
});
