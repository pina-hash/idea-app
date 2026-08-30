/**
 * Fixture and in-memory transports for the shelf-entry harness.
 *
 * IT COMPOSES THE EDITOR HARNESS'S FIXTURE rather than restating one: the
 * nodes, item types, items and stock are `mapsEditFixture()`'s own, so the
 * shelf is driven over the same map the editor is and a fixture change cannot
 * make the two surfaces disagree about what is in the building. What is added
 * here is the half the editor has no need of -- PHOTO transports, and an
 * upload that can be made to fail on demand, because "the row saved and the
 * photo did not" is a state no happy path reaches and the surface has a whole
 * branch for it.
 *
 * Lives beside the dev route because it is fixture, not shipping code; the
 * mount tests import it from here, so what they assert is what the harness
 * drives.
 */

import type { MapsPhotoOwner } from '$lib/maps/media';
import type { MapsPhotoTransports, MapsResult } from '$lib/maps/transports';
import type { MapsEditorData } from '$lib/maps/maps';
import { mapsEditFixture, memoryMapsTransports } from '../maps-edit/fixture';

export { FIX, memoryMapsTransports } from '../maps-edit/fixture';

export function mapsShelfFixture(): MapsEditorData {
	return mapsEditFixture();
}

export interface MemoryPhotoLog {
	owner: MapsPhotoOwner;
	ownerId: string;
	storageKey: string;
	mimeType: string;
	size: number;
}

/**
 * In-memory photo transports over the same `MapsEditorData`. Every call is
 * LOGGED, because the questions worth asking about an upload -- what content
 * type did it send, what key did it write, did it happen at all -- are about
 * the REQUEST and not about anything that renders. `failNext` is how the
 * photo-failed branch is reached deliberately rather than by breaking
 * something.
 */
export function memoryPhotoTransports(state: MapsEditorData) {
	const log: MemoryPhotoLog[] = [];
	let failNext: string | null = null;
	let counter = 0;

	const transports: MapsPhotoTransports = {
		async attachPhoto({ owner, ownerId, file, storageKey, mimeType }): Promise<
			MapsResult<{ id: string; storage_key: string }>
		> {
			log.push({ owner, ownerId, storageKey, mimeType, size: file.size });
			if (failNext) {
				const message = failNext;
				failNext = null;
				return { ok: false, retryable: true, message };
			}
			const id = `photo-${++counter}`;
			const now = new Date().toISOString();
			state.photos.push({
				id,
				node_id: owner === 'node' ? ownerId : null,
				item_type_id: owner === 'item_type' ? ownerId : null,
				item_id: owner === 'item' ? ownerId : null,
				storage_key: storageKey,
				caption: null,
				sort_order: 0,
				created_at: now,
				updated_at: now
			});
			return { ok: true, data: { id, storage_key: storageKey } };
		}
	};

	return {
		transports,
		log,
		failOnce(message = 'The photo did not upload: the connection dropped.') {
			failNext = message;
		}
	};
}

/** Both halves at once, over one living fixture, the way the harness mounts them. */
export function shelfHarness() {
	const data = mapsShelfFixture();
	const photos = memoryPhotoTransports(data);
	return { data, transports: memoryMapsTransports(data), photos };
}
