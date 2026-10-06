/**
 * AWS SIGNATURE VERSION 4 QUERY-STRING PRESIGNING, ported from
 * pina-hash/idea-armory `src/Armory.Storage/SigV4Presigner.cs` (b18791d).
 *
 * It is a port and not a library because the agent's own presigner is the
 * thing the two sides have to agree with, and it is pinned against the same
 * published AWS test vector (the S3 query-auth example: GET
 * examplebucket/test.txt at 2013-05-24, one day, signature `aeeed9bb...`) in
 * tests/armory-sigv4.test.ts. Cloudflare R2 speaks the same algorithm with
 * region `auto`.
 *
 * ONE DIFFERENCE FROM THE C#, and it changes nothing for an Armory key: the
 * C# encodes `Uri.AbsolutePath`, which is already percent-encoded, so a `%` in
 * a path would be encoded twice. Here each segment is decoded first. Armory
 * object keys are `blobs/sha256/<hex>/<hex>/<hex>`, which carry nothing either
 * form would encode.
 *
 * Server-only (node:crypto), and it never sees a request body: the payload is
 * UNSIGNED-PAYLOAD, exactly as the agent's presigner signs it.
 */
import { createHash, createHmac } from 'node:crypto';

export interface PresignInput {
	accessKey: string;
	secretKey: string;
	region: string;
	service?: string;
	url: string;
	method: 'GET' | 'PUT' | 'HEAD';
	now: Date;
	lifetimeSeconds: number;
	/** Extra headers to sign, e.g. `content-length` on a PUT. Host is always signed. */
	signedHeaders?: Record<string, string>;
}

/** RFC 3986 unreserved characters only, which is `Uri.EscapeDataString`. */
export function sigv4Encode(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
	);
}

function hmac(key: Buffer | string, value: string): Buffer {
	return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hex(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stamps(now: Date): { date: string; stamp: string } {
	const iso = now.toISOString(); // 2013-05-24T00:00:00.000Z
	const date = iso.slice(0, 10).replace(/-/g, '');
	const stamp = `${date}T${iso.slice(11, 19).replace(/:/g, '')}Z`;
	return { date, stamp };
}

export function presignUrl(input: PresignInput): string {
	const service = input.service ?? 's3';
	if (!(input.lifetimeSeconds > 0) || input.lifetimeSeconds > 7 * 24 * 3600) {
		throw new RangeError('A presigned URL lives more than zero seconds and at most seven days.');
	}
	const url = new URL(input.url);
	const headers = new Map<string, string>();
	headers.set('host', url.host); // URL.host already omits a default port
	for (const [name, value] of Object.entries(input.signedHeaders ?? {})) {
		headers.set(name.toLowerCase(), value.trim());
	}
	const headerNames = [...headers.keys()].sort();
	const signedHeaderList = headerNames.join(';');
	const { date, stamp } = stamps(input.now);
	const scope = `${date}/${input.region}/${service}/aws4_request`;

	const params: Array<[string, string]> = [];
	for (const [k, v] of url.searchParams) params.push([k, v]);
	params.push(['X-Amz-Algorithm', 'AWS4-HMAC-SHA256']);
	params.push(['X-Amz-Credential', `${input.accessKey}/${scope}`]);
	params.push(['X-Amz-Date', stamp]);
	params.push(['X-Amz-Expires', String(Math.floor(input.lifetimeSeconds))]);
	params.push(['X-Amz-SignedHeaders', signedHeaderList]);
	const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
	params.sort((a, b) => ordinal(a[0], b[0]) || ordinal(a[1], b[1]));
	const query = params.map(([k, v]) => `${sigv4Encode(k)}=${sigv4Encode(v)}`).join('&');

	const canonicalHeaders = headerNames
		.map((name) => `${name}:${(headers.get(name) ?? '').split(/\s+/).filter(Boolean).join(' ')}\n`)
		.join('');
	const canonicalPath = url.pathname
		.split('/')
		.map((segment) => sigv4Encode(decodeURIComponent(segment)))
		.join('/');
	const canonical = [
		input.method,
		canonicalPath,
		query,
		canonicalHeaders,
		signedHeaderList,
		'UNSIGNED-PAYLOAD'
	].join('\n');
	const toSign = ['AWS4-HMAC-SHA256', stamp, scope, hex(canonical)].join('\n');
	const signingKey = hmac(
		hmac(hmac(hmac('AWS4' + input.secretKey, date), input.region), service),
		'aws4_request'
	);
	const signature = hmac(signingKey, toSign).toString('hex');
	return `${url.origin}${canonicalPath}?${query}&X-Amz-Signature=${signature}`;
}
