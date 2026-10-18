/**
 * WHERE A FILE'S BYTES LIVE IN THE ARMORY BUCKET: `blobs/sha256/<2 hex>/<2
 * hex>/<full hash>`, the agent's ContentObjectKey (contract section 2). Its
 * own module with no imports so the nightly Shared Drive mirror
 * (`tools/armory-drive-mirror.mjs`, ledger 0404), which runs under plain Node
 * and cannot load `$env`, reads the SAME rule the website signs URLs with
 * rather than a second spelling of it. `storage.ts` re-exports it.
 */
export function contentObjectKey(hash: string): string {
	if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('A SHA-256 hash must be 64 lowercase hex characters.');
	return `blobs/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}
