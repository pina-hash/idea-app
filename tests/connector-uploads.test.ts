// tests/connector-uploads.test.ts
//
// A FILE FROM A CHAT (ledger 0422, gap d782fd4e), on the local backend: a slot
// is one user's, pieces join in order whatever order they arrive in, a slot
// refuses past its size, and nobody else reads it.

import { describe, expect, it } from 'vitest';
import { localPgBackend } from '../src/lib/server/connector/backend-local';

const backend = localPgBackend({ connect: async () => { throw new Error('no database here'); } } as never);
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe('a chat upload', () => {
	it('joins pieces in number order, for its own user only', async () => {
		const slot = await backend.createUpload({ userId: 'u1', tokenHash: 'h1', filename: 'w.html', contentType: 'text/html', maxBytes: 100, expiresAt: Date.now() + 60_000 });
		expect(slot.uploadUrl).toContain(slot.id);
		expect(await backend.readUpload('u1', slot.id)).toBeNull();
		expect((await backend.storeUploadPart('u1', slot.id, 2, enc('world'))).ok).toBe(true);
		expect((await backend.storeUploadPart('u1', slot.id, 1, enc('hello '))).ok).toBe(true);
		const got = await backend.readUpload('u1', slot.id);
		expect(dec(got!.bytes)).toBe('hello world');
		expect(got!.slot.filename).toBe('w.html');
		expect(await backend.readUpload('u2', slot.id)).toBeNull();
		expect((await backend.storeUploadPart('u2', slot.id, 3, enc('x'))).ok).toBe(false);
	});
	it('refuses a piece past the size, and an expired slot', async () => {
		const small = await backend.createUpload({ userId: 'u1', tokenHash: 'h2', filename: 'a', contentType: null, maxBytes: 4, expiresAt: Date.now() + 60_000 });
		expect((await backend.storeUploadPart('u1', small.id, 1, enc('12345'))).ok).toBe(false);
		const old = await backend.createUpload({ userId: 'u1', tokenHash: 'h3', filename: 'a', contentType: null, maxBytes: 4, expiresAt: Date.now() - 1 });
		expect((await backend.storeUploadPart('u1', old.id, 1, enc('1'))).ok).toBe(false);
	});
});
