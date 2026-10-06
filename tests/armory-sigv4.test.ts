// tests/armory-sigv4.test.ts
//
// The TypeScript port of the agent's SigV4 presigner, pinned against the same
// published AWS test vector idea-armory pins its C# with
// (tests/Armory.Storage.Tests/StorageTests.cs, AwsPublishedPresignExampleHasExpectedSignature):
// the S3 query-string authentication example, GET examplebucket/test.txt at
// 2013-05-24T00:00:00Z for one day, signature aeeed9bb...d404. The expected
// value is AWS's published figure, not something this code produced.

import { describe, expect, test } from 'vitest';
import { presignUrl, sigv4Encode } from '../src/lib/server/armory/sigv4';
import { armoryStorageConfig, contentObjectKey, signBlob } from '../src/lib/server/armory/storage';

describe('presignUrl', () => {
	test('matches the AWS published S3 presign example', () => {
		const url = presignUrl({
			accessKey: 'AKIAIOSFODNN7EXAMPLE',
			secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
			region: 'us-east-1',
			url: 'https://examplebucket.s3.amazonaws.com/test.txt',
			method: 'GET',
			now: new Date(Date.UTC(2013, 4, 24, 0, 0, 0)),
			lifetimeSeconds: 86400
		});
		expect(url.split('X-Amz-Signature=')[1]).toBe('aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
		expect(url).toBe(
			'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
				'&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
				'&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
				'&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'
		);
	});
	test('a different secret is a different signature (the vector is not vacuous)', () => {
		const url = presignUrl({
			accessKey: 'AKIAIOSFODNN7EXAMPLE',
			secretKey: 'not-the-example-key',
			region: 'us-east-1',
			url: 'https://examplebucket.s3.amazonaws.com/test.txt',
			method: 'GET',
			now: new Date(Date.UTC(2013, 4, 24)),
			lifetimeSeconds: 86400
		});
		expect(url).not.toContain('aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
	});
	test('the lifetime is bounded to seven days', () => {
		const base = { accessKey: 'a', secretKey: 'b', region: 'auto', url: 'https://x.example/k', method: 'GET' as const, now: new Date() };
		expect(() => presignUrl({ ...base, lifetimeSeconds: 0 })).toThrow();
		expect(() => presignUrl({ ...base, lifetimeSeconds: 7 * 86400 + 1 })).toThrow();
	});
	test('encoding is RFC 3986 unreserved only, which is Uri.EscapeDataString', () => {
		expect(sigv4Encode("a b!'()*~-._/")).toBe('a%20b%21%27%28%29%2A~-._%2F');
	});
});

describe('the storage configuration and the object key', () => {
	const full = {
		ARMORY_R2_ACCOUNT_ID: 'acct',
		ARMORY_R2_ACCESS_KEY_ID: 'key',
		ARMORY_R2_SECRET_ACCESS_KEY: 'secret',
		ARMORY_R2_BUCKET: 'armory'
	};
	test('all four variables make a config pointed at R2', () => {
		expect(armoryStorageConfig(full)?.endpoint).toBe('https://acct.r2.cloudflarestorage.com');
	});
	test.each(Object.keys(full))('missing %s is no config at all', (name) => {
		expect(armoryStorageConfig({ ...full, [name]: undefined })).toBeNull();
		expect(armoryStorageConfig({ ...full, [name]: '   ' })).toBeNull();
	});
	test('the key is the agent ContentObjectKey shape', () => {
		const h = '0123456789abcdef'.repeat(4);
		expect(contentObjectKey(h)).toBe(`blobs/sha256/01/23/${h}`);
		expect(() => contentObjectKey(h.toUpperCase())).toThrow();
	});
	test('a PUT signs its byte count; a GET signs only the host', () => {
		const config = armoryStorageConfig(full)!;
		const h = 'ab'.repeat(32);
		const now = new Date(Date.UTC(2026, 9, 6, 12, 0, 0, 900));
		const put = signBlob(config, h, 'PUT', 10, now);
		expect(put.url).toContain('X-Amz-SignedHeaders=content-length%3Bhost');
		expect(put.url).toContain('X-Amz-Date=20261006T120000Z');
		expect(put.expiresAt).toBe('2026-10-06T12:15:00.000Z');
		expect(signBlob(config, h, 'GET', 10, now).url).toContain('X-Amz-SignedHeaders=host&');
		expect(signBlob(config, h, 'PUT', 11, now).url).not.toBe(put.url);
	});
});
