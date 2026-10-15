/**
 * The IDEA Certification Portal's shared pure modules (ledger 0391): the
 * serial format, the canonical signed payload, the part order, the addresses
 * and the derived statuses. These are the contract every surface imports, so
 * each assertion here is a value the database or another module reproduces:
 * a change that moves one is a change that has to move the other.
 */
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
	CROCKFORD,
	SERIAL_RE,
	SERIAL_SQL_RE,
	encodeSerialBody,
	formatSerial,
	isSerial,
	newSerial,
	normalizeSerial
} from '../src/lib/certifications/serial';
import {
	SIGNED_PAYLOAD_KEYS,
	buildSignedPayload,
	canonicalInstant,
	canonicalPayload,
	emailSha256,
	readSignedPayload
} from '../src/lib/certifications/signing-payload';
import { allPartsDone, nextPart, partUnlocked, partsProgress, requiredParts } from '../src/lib/certifications/parts';
import {
	CERT_PATHS,
	certHref,
	certificateHref,
	deskTabFor,
	examHref,
	studentTabFor,
	verifyHref,
	verifyUrl
} from '../src/lib/certifications/nav';
import { awardShownStatus, cooldownActive, formatCalendarDate, formatCertDate, waitedWords } from '../src/lib/certifications/status';
import { CERT_PARTS, type CertCheckJson } from '../src/lib/certifications/types';

describe('serials: 80 random bits in Crockford base32', () => {
	test('the alphabet drops I, L, O and U and has 32 symbols', () => {
		expect(CROCKFORD).toHaveLength(32);
		for (const c of 'ILOU') expect(CROCKFORD).not.toContain(c);
		expect(new Set(CROCKFORD).size).toBe(32);
	});

	test('ten bytes encode to exactly sixteen symbols, and all-zero bytes to sixteen zeros', () => {
		expect(encodeSerialBody(new Uint8Array(10))).toBe('0000000000000000');
		expect(encodeSerialBody(new Uint8Array(10).fill(255))).toBe('ZZZZZZZZZZZZZZZZ');
		expect(() => encodeSerialBody(new Uint8Array(9))).toThrow();
	});

	test('a formatted serial matches the regular expression, and its SQL spelling is the same text', () => {
		const s = formatSerial(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
		expect(s).toMatch(SERIAL_RE);
		expect(s.startsWith('IDEA-')).toBe(true);
		expect(s).toHaveLength(24);
		expect(SERIAL_RE.source).toBe(SERIAL_SQL_RE);
	});

	test('a fresh serial is well formed and two in a row differ (positive control on randomness)', () => {
		const a = newSerial();
		const b = newSerial();
		expect(isSerial(a)).toBe(true);
		expect(isSerial(b)).toBe(true);
		expect(a).not.toBe(b);
	});

	test('normalizeSerial folds what a person types back to the one spelling', () => {
		expect(normalizeSerial('idea-7k3q-m9xd-2htr-w4pb')).toBe('IDEA-7K3Q-M9XD-2HTR-W4PB');
		expect(normalizeSerial('7K3QM9XD2HTRW4PB')).toBe('IDEA-7K3Q-M9XD-2HTR-W4PB');
		expect(normalizeSerial(' IDEA 7K3Q M9XD 2HTR W4PB ')).toBe('IDEA-7K3Q-M9XD-2HTR-W4PB');
		// I and L read as 1, O as 0: the Crockford folding.
		expect(normalizeSerial('IDEA-7K3Q-M9XD-2HTR-W4PO')).toBe('IDEA-7K3Q-M9XD-2HTR-W4P0');
		expect(normalizeSerial('IDEA-7K3Q-M9XD-2HTR-W4PI')).toBe('IDEA-7K3Q-M9XD-2HTR-W4P1');
		expect(normalizeSerial('IDEA-7K3Q-M9XD-2HTR-W4PL')).toBe('IDEA-7K3Q-M9XD-2HTR-W4P1');
	});

	test('normalizeSerial refuses the wrong length and a symbol outside the alphabet', () => {
		expect(normalizeSerial('IDEA-7K3Q')).toBeNull();
		expect(normalizeSerial('IDEA-7K3Q-M9XD-2HTR-W4PU')).toBeNull();
		expect(normalizeSerial('')).toBeNull();
		expect(normalizeSerial('hello world this is not a serial')).toBeNull();
	});
});

describe('the canonical signed payload', () => {
	test('the key order is fixed and the bytes are a golden string', async () => {
		expect([...SIGNED_PAYLOAD_KEYS]).toEqual([
			'v',
			'serial',
			'code',
			'level',
			'holder_name',
			'email_sha256',
			'awarded_at',
			'certifier_name'
		]);
		const p = await buildSignedPayload({
			serial: 'IDEA-7K3Q-M9XD-2HTR-W4PB',
			code: 'MILL-1',
			level: 1,
			holder_name: 'Jordan Example',
			email: 'Jordan.Example@boscotech.net ',
			awarded_at: '2026-10-15T17:05:00.123Z',
			certifier_name: 'Mr. Pina'
		});
		expect(p.email_sha256).toBe(await emailSha256('jordan.example@boscotech.net'));
		expect(p.awarded_at).toBe('2026-10-15T17:05:00Z');
		const bytes = canonicalPayload(p);
		const text = new TextDecoder().decode(bytes);
		// GOLDEN: a change here is a change every stored signature stops verifying against.
		expect(text).toBe(
			`{"v":1,"serial":"IDEA-7K3Q-M9XD-2HTR-W4PB","code":"MILL-1","level":1,"holder_name":"Jordan Example","email_sha256":"${p.email_sha256}","awarded_at":"2026-10-15T17:05:00Z","certifier_name":"Mr. Pina"}`
		);
		// No whitespace between tokens (a value may carry its own spaces).
		expect(text).not.toMatch(/":\s|,\s"/);
	});

	test('emailSha256 lowercases and trims, so two spellings of one address hash alike', async () => {
		expect(await emailSha256('A@X.COM')).toBe(await emailSha256('  a@x.com'));
		expect(await emailSha256('a@x.com')).toMatch(/^[0-9a-f]{64}$/);
		// Node's own digest is the independent instrument the Web Crypto result is held to.
		expect(await emailSha256('a@x.com')).toBe(createHash('sha256').update('a@x.com').digest('hex'));
	});

	test('canonicalInstant drops fractional seconds and refuses a non-date', () => {
		expect(canonicalInstant('2026-10-15T17:05:00.999Z')).toBe('2026-10-15T17:05:00Z');
		expect(canonicalInstant(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('2026-01-02T03:04:05Z');
		expect(() => canonicalInstant('not a date')).toThrow();
	});

	test('readSignedPayload accepts the stored shape and refuses a malformed one', () => {
		const ok = readSignedPayload({
			v: 1,
			serial: 's',
			code: 'c',
			level: 2,
			holder_name: 'h',
			email_sha256: 'e',
			awarded_at: 'a',
			certifier_name: 'n'
		});
		expect(ok?.level).toBe(2);
		expect(readSignedPayload({ v: 2 })).toBeNull();
		expect(readSignedPayload({ v: 1, serial: 's', level: '2' })).toBeNull();
		expect(readSignedPayload(null)).toBeNull();
	});
});

const checks = (states: Record<string, CertCheckJson['state']>): CertCheckJson[] =>
	CERT_PARTS.map((part) => ({
		part,
		state: states[part] ?? 'pending',
		checked_by_name: null,
		checked_at: null,
		note: null
	}));

describe('parts: one fixed order, waived counts as done', () => {
	test('the order is training, guided, exam, autonomous, checkout', () => {
		expect([...CERT_PARTS]).toEqual(['training', 'guided', 'exam', 'autonomous', 'checkout']);
	});

	test('requiredParts always keeps training and drops a waived part', () => {
		expect(requiredParts({ guided: true, exam: false, autonomous: true, checkout: false })).toEqual([
			'training',
			'guided',
			'autonomous'
		]);
		expect(requiredParts({ guided: false, exam: false, autonomous: false, checkout: false })).toEqual(['training']);
	});

	test('nextPart is the first pending part in order, skipping waived ones', () => {
		expect(nextPart(checks({}))).toBe('training');
		expect(nextPart(checks({ training: 'done' }))).toBe('guided');
		expect(nextPart(checks({ training: 'done', guided: 'waived' }))).toBe('exam');
		expect(nextPart(checks({ training: 'done', guided: 'done', exam: 'done', autonomous: 'done', checkout: 'waived' }))).toBeNull();
	});

	test('partUnlocked needs every earlier part done or waived, both directions', () => {
		const c = checks({ training: 'done', guided: 'waived' });
		expect(partUnlocked(c, 'training')).toBe(true);
		expect(partUnlocked(c, 'exam')).toBe(true);
		expect(partUnlocked(c, 'autonomous')).toBe(false);
		expect(partUnlocked(checks({}), 'guided')).toBe(false);
	});

	test('allPartsDone and partsProgress agree, and an empty list is never done', () => {
		expect(allPartsDone([])).toBe(false);
		const all = checks({ training: 'done', guided: 'done', exam: 'waived', autonomous: 'done', checkout: 'done' });
		expect(allPartsDone(all)).toBe(true);
		expect(partsProgress(all)).toEqual({ done: 5, total: 5 });
		expect(partsProgress(checks({ training: 'done' }))).toEqual({ done: 1, total: 5 });
	});
});

describe('addresses', () => {
	test('every path lives under /certifications and encodes its segment', () => {
		expect(certHref('MILL-1')).toBe('/certifications/MILL-1');
		expect(certHref('A B')).toBe('/certifications/A%20B');
		expect(examHref('MILL-1', 'x')).toBe('/certifications/MILL-1/exam/x');
		expect(certificateHref('IDEA-7K3Q-M9XD-2HTR-W4PB')).toBe('/certifications/certificate/IDEA-7K3Q-M9XD-2HTR-W4PB');
		expect(verifyHref('IDEA-7K3Q-M9XD-2HTR-W4PB')).toBe('/certifications/verify?serial=IDEA-7K3Q-M9XD-2HTR-W4PB');
		expect(verifyHref()).toBe('/certifications/verify');
		expect(verifyUrl('IDEA-7K3Q-M9XD-2HTR-W4PB')).toBe(
			'https://ideabosco.com/certifications/verify?serial=IDEA-7K3Q-M9XD-2HTR-W4PB'
		);
		for (const p of Object.values(CERT_PATHS)) expect(p.startsWith('/certifications')).toBe(true);
	});

	test('the desk tab is the longest matching prefix, and a student path has no desk tab', () => {
		expect(deskTabFor('/certifications/desk')).toBe('desk');
		expect(deskTabFor('/certifications/desk/sittings/live')).toBe('live');
		expect(deskTabFor('/certifications/desk/sittings')).toBe('sittings');
		expect(deskTabFor('/certifications/desk/engine/abc')).toBe('engine');
		expect(deskTabFor('/certifications/desk/students/x')).toBe('desk');
		expect(deskTabFor('/certifications/MILL-1')).toBeNull();
	});

	test('the student tab for every student path, and none for the desk', () => {
		expect(studentTabFor('/certifications')).toBe('catalog');
		expect(studentTabFor('/certifications/MILL-1')).toBe('catalog');
		expect(studentTabFor('/certifications/me')).toBe('me');
		expect(studentTabFor('/certifications/holders')).toBe('holders');
		expect(studentTabFor('/certifications/verify')).toBe('verify');
		expect(studentTabFor('/certifications/verify/public-key')).toBe('verify');
		expect(studentTabFor('/certifications/desk/records')).toBeNull();
	});
});

describe('derived statuses and dates', () => {
	const now = new Date('2026-10-15T12:00:00Z');
	test('awardShownStatus: revoked and suspended win, active past expiry reads expired', () => {
		expect(awardShownStatus('revoked', '2099-01-01T00:00:00Z', now)).toBe('revoked');
		expect(awardShownStatus('suspended', null, now)).toBe('suspended');
		expect(awardShownStatus('active', null, now)).toBe('valid');
		expect(awardShownStatus('active', '2026-10-15T11:59:59Z', now)).toBe('expired');
		expect(awardShownStatus('active', '2026-10-15T12:00:01Z', now)).toBe('valid');
	});

	test('cooldownActive reads the instant against now', () => {
		expect(cooldownActive(null, now)).toBe(false);
		expect(cooldownActive('2026-10-16T12:00:00Z', now)).toBe(true);
		expect(cooldownActive('2026-10-14T12:00:00Z', now)).toBe(false);
	});

	test('dates are the school calendar day in Los Angeles and name no weekday', () => {
		// 8pm Pacific on the 14th is 03:00Z on the 15th: the LA day is the 14th.
		expect(formatCertDate('2026-10-15T03:00:00Z')).toBe('October 14, 2026');
		expect(formatCertDate('2026-10-15T17:05:00Z')).toBe('October 15, 2026');
		expect(formatCertDate(null)).toBe('');
		expect(formatCalendarDate('2027-08-16')).toBe('August 16, 2027');
		expect(formatCalendarDate('nope')).toBe('');
		for (const word of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
			expect(formatCertDate('2026-10-15T17:05:00Z')).not.toContain(word);
	});

	test('waitedWords picks the largest whole unit', () => {
		expect(waitedWords(30)).toBe('just now');
		expect(waitedWords(60)).toBe('1 minute');
		expect(waitedWords(3600 * 5)).toBe('5 hours');
		expect(waitedWords(86400 * 3)).toBe('3 days');
	});
});
