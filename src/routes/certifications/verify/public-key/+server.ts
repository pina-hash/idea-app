import { json } from '@sveltejs/kit';
import { publicKeyPem, rawPublicKey, readSigningKey } from '$lib/server/certifications/signing';
import type { RequestHandler } from './$types';

/**
 * THE PUBLISHED PUBLIC KEY (ledger 0391): the SPKI PEM as text, or with
 * `?format=json` `{ key_id, algorithm, spki_pem, raw_base64 }`, so anyone can
 * confirm an award's signature independently. 404 while the server holds no
 * key (nothing has been signed, so there is nothing to check against). Public
 * and cacheable: a key rotation is a deploy, and five minutes is nothing next
 * to one.
 */
const CACHE = 'public, max-age=300';

export const GET: RequestHandler = ({ url }) => {
	const key = readSigningKey();
	if (!key.ok) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
	const pem = publicKeyPem(key);
	if (url.searchParams.get('format') === 'json') {
		return json(
			{ key_id: key.keyId, algorithm: 'Ed25519', spki_pem: pem, raw_base64: rawPublicKey(key.publicKey).toString('base64') },
			{ headers: { 'cache-control': CACHE } }
		);
	}
	return new Response(pem, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': CACHE } });
};
