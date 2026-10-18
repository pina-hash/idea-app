/**
 * AFTER A DELETE COMMITS: the files it orphaned, removed exactly as the site's
 * own delete route removes them. Rows first, then files, and a failed sweep is
 * not a failed delete (CLAUDE.md, "ROWS FIRST, THEN OBJECTS"): every step here
 * is best effort and swallows its own failure, because the rows are already
 * gone and reporting a completed delete as an error is how somebody presses it
 * again.
 *
 * The three kinds mirror three routes, by name in the overlay's `cleanup:`:
 *   drive_orphans                     /api/classroom/delete-content and the deck DELETE:
 *                                     every id in `orphaned_drive_file_ids` leaves Drive
 *   classroom_attachment              /api/classroom/attachment/[id] DELETE
 *   classroom_instructor_attachment   /api/classroom/instructor-attachment/[id] DELETE
 *
 * Drive is reached through the one module that holds the Drive credential
 * (`$lib/server/notebook-drive`); storage through the user's own client, as
 * the routes do, so a storage policy that would refuse him refuses here too.
 */
import { deleteDriveFile, driveConfigured } from '$lib/server/notebook-drive';
import { CLASSROOM_ATTACHMENTS_BUCKET, INSTRUCTOR_ATTACHMENTS_BUCKET } from '$lib/server/classroom-attachments';
import type { ConnectorBackend, UserSession } from './types';

type StorageClient = { storage?: { from(bucket: string): { remove(paths: string[]): Promise<unknown> } } };

function asRecord(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function cleanupFor(backend: ConnectorBackend, session: UserSession) {
	return async (kind: string, result: unknown): Promise<void> => {
		const r = asRecord(result);
		if (kind === 'drive_orphans') {
			const ids = Array.isArray(r.orphaned_drive_file_ids) ? r.orphaned_drive_file_ids : [];
			if (!driveConfigured()) return;
			for (const id of ids) if (typeof id === 'string' && id) await deleteDriveFile(id).catch(() => undefined);
			return;
		}
		if (kind === 'classroom_attachment' || kind === 'classroom_instructor_attachment') {
			if (r.orphaned !== true) return;
			const bucket = kind === 'classroom_attachment' ? CLASSROOM_ATTACHMENTS_BUCKET : INSTRUCTOR_ATTACHMENTS_BUCKET;
			if (typeof r.storage_key === 'string' && r.storage_key) {
				const client = backend.routeClient(session) as StorageClient;
				await client.storage?.from(bucket).remove([r.storage_key]).catch(() => undefined);
			} else if (typeof r.drive_file_id === 'string' && r.drive_file_id && driveConfigured()) {
				await deleteDriveFile(r.drive_file_id).catch(() => undefined);
			}
		}
	};
}
