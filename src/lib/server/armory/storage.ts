/**
 * ARMORY FILE STORAGE (Cloudflare R2), contract section 2.
 *
 * THE ONE READER OF THE FOUR `ARMORY_R2_*` VARIABLES. They are read at call
 * time through `$env/dynamic/private`, so a missing one never breaks the build:
 * `armoryStorageConfig()` answers null and the blob-url route answers 503
 * `{"error":"armory_storage_not_configured"}`, the contract's only fallback.
 * Nothing here is reachable from the client bundle (`$lib/server`), and
 * `tests/armory-bundle-secrets.test.ts` greps the built client for the names.
 *
 * The website never touches file bytes. It signs one URL, for one method, one
 * object and (for a PUT) one byte count, that lives fifteen minutes; the agent
 * talks to R2 directly.
 */
import { env } from '$env/dynamic/private';
import { presignUrl } from './sigv4';

export const ARMORY_R2_VARIABLES = [
	'ARMORY_R2_ACCOUNT_ID',
	'ARMORY_R2_ACCESS_KEY_ID',
	'ARMORY_R2_SECRET_ACCESS_KEY',
	'ARMORY_R2_BUCKET'
] as const;

/** Contract section 2: URLs live fifteen minutes. */
export const BLOB_URL_LIFETIME_SECONDS = 15 * 60;
/** Contract section 2: a PUT is allowed only for at most 2 GiB. */
export const MAX_PUT_BYTES = 2 * 1024 * 1024 * 1024;

export interface ArmoryStorageConfig {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	/** `https://<account>.r2.cloudflarestorage.com`, or a test endpoint. */
	endpoint: string;
}

/** Null when ANY of the four variables is unset or blank. */
export function armoryStorageConfig(source: Record<string, string | undefined> = env): ArmoryStorageConfig | null {
	const values = ARMORY_R2_VARIABLES.map((name) => (source[name] ?? '').trim());
	if (values.some((v) => v === '')) return null;
	const [accountId, accessKeyId, secretAccessKey, bucket] = values;
	return {
		accountId,
		accessKeyId,
		secretAccessKey,
		bucket,
		endpoint: `https://${accountId}.r2.cloudflarestorage.com`
	};
}

/** `blobs/sha256/<2 hex>/<2 hex>/<full hash>`, the agent's ContentObjectKey. */
export function contentObjectKey(hash: string): string {
	if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('A SHA-256 hash must be 64 lowercase hex characters.');
	return `blobs/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

export function objectUrl(config: ArmoryStorageConfig, key: string): string {
	return `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key}`;
}

export interface SignedBlob {
	url: string;
	headers: Record<string, string>;
	expiresAt: string;
}

/**
 * One URL. A PUT signs `content-length`, so the bytes stored are exactly the
 * bytes the agent declared; the agent sets that header itself, which is why it
 * is signed but not returned (the agent's fake site does the same).
 */
export function signBlob(
	config: ArmoryStorageConfig,
	hash: string,
	method: 'GET' | 'PUT',
	bytes: number,
	now: Date
): SignedBlob {
	const issued = new Date(Math.floor(now.getTime() / 1000) * 1000);
	const url = presignUrl({
		accessKey: config.accessKeyId,
		secretKey: config.secretAccessKey,
		region: 'auto',
		url: objectUrl(config, contentObjectKey(hash)),
		method,
		now: issued,
		lifetimeSeconds: BLOB_URL_LIFETIME_SECONDS,
		signedHeaders: method === 'PUT' ? { 'content-length': String(bytes) } : undefined
	});
	return {
		url,
		headers: {},
		expiresAt: new Date(issued.getTime() + BLOB_URL_LIFETIME_SECONDS * 1000).toISOString()
	};
}

/**
 * Whether the object is already stored, by a presigned HEAD. Anything but a
 * 200 reads as "not stored": a false negative costs one redundant PUT of
 * content-addressed bytes, which is harmless; a false positive would make the
 * agent skip an upload that never happened.
 */
export async function blobExists(
	config: ArmoryStorageConfig,
	hash: string,
	now: Date,
	fetcher: typeof fetch = fetch
): Promise<boolean> {
	const url = presignUrl({
		accessKey: config.accessKeyId,
		secretKey: config.secretAccessKey,
		region: 'auto',
		url: objectUrl(config, contentObjectKey(hash)),
		method: 'HEAD',
		now,
		lifetimeSeconds: 60
	});
	try {
		const response = await fetcher(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
		return response.status === 200;
	} catch {
		return false;
	}
}
