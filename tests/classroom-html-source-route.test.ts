// Ledger 0380, report daaaaed1: a manager downloads the original uploaded HTML.
// What would be invisible if it broke: a non-manager getting the file, and the
// file being served as a page on the origin that holds the session.

import { describe, expect, it } from 'vitest';
import { GET } from '../src/routes/api/classroom/html-assignment-source/[itemId]/+server';

const ITEM = '323ae8b2-b63a-4fed-be75-4e7bc8df8bf4';
const DOC = '<!doctype html><title>Hook</title><script>alert(1)</script>';

function locals(opts: { claims?: unknown; manages?: boolean; document?: string | null; filename?: string }) {
	const supabase = {
		from(table: string) {
			const b: Record<string, unknown> = {
				select: () => b,
				eq: () => b,
				maybeSingle: () => Promise.resolve({ data: opts.document === undefined ? null : { document: opts.document, filename: opts.filename ?? 'Hook 01 (v2).html' } }),
				then: (r: (v: unknown) => unknown) => Promise.resolve({ data: table === 'classroom_postings' ? [{ section_id: 's1' }] : [] }).then(r)
			};
			return b;
		},
		rpc: () => Promise.resolve({ data: opts.manages === true })
	};
	return { supabase, claims: 'claims' in opts ? opts.claims : { sub: 'u' } } as never;
}

const call = (itemId: string, l: never) => GET({ params: { itemId }, locals: l } as never);
const status = async (p: Response | Promise<Response>) => {
	try {
		return (await p).status;
	} catch (e) {
		return (e as { status?: number }).status;
	}
};

describe('the original file of a ported assignment', () => {
	it('a manager gets the bytes as a download, never a page', async () => {
		const res = await call(ITEM, locals({ manages: true, document: DOC }));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(DOC);
		expect(res.headers.get('content-type')).toBe('application/octet-stream');
		expect(res.headers.get('content-disposition')).toContain('attachment');
		expect(res.headers.get('content-disposition')).toContain('filename="Hook_01_v2.html"');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('content-security-policy')).toBe('sandbox');
	});
	it('every refusal is the same 404: signed out, not a uuid, not a manager, no document', async () => {
		expect(await status(call(ITEM, locals({ claims: null, manages: true, document: DOC })))).toBe(404);
		expect(await status(call('not-a-uuid', locals({ manages: true, document: DOC })))).toBe(404);
		expect(await status(call(ITEM, locals({ manages: false, document: DOC })))).toBe(404);
		expect(await status(call(ITEM, locals({ manages: true, document: null })))).toBe(404);
		expect(await status(call(ITEM, locals({ manages: true, document: '' })))).toBe(404);
	});
});
