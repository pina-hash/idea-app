// src/lib/ideacad/solid/launch/fixture.ts
//
// THE ROWS THE DEV HARNESS AND THE MOUNT TEST SHARE: own documents in two
// folders, one shared by a classmate, one linked to an assignment, one
// archived, one in the trash. Hand-written data, not derived from any rule
// under test, so a test's expected value never comes from the thing it tests.
import type { LaunchDocument, LaunchFolder, TrashedDocument } from './library';

export const FIXTURE_NOW = new Date('2026-09-21T17:30:00.000Z');
const ago = (hours: number) => new Date(FIXTURE_NOW.getTime() - hours * 3_600_000).toISOString();
const own = (over: Partial<LaunchDocument>): LaunchDocument => ({
	id: 'doc', title: 'Untitled model', itemId: null, ownerEmail: 'you@boscotech.net', isOwn: true, updatedAt: ago(1), createdAt: ago(48), archivedAt: null,
	canWrite: true, canArchive: true, canTrash: true, bodyCount: 1, featureCount: 3, role: 'owner', folderId: null, tags: [], thumbnail: null, format: 'ideacad-solid-v2', ...over
});
/** A 4x3 PNG so a card with a thumbnail is on the harness. */
export const FIXTURE_THUMBNAIL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGNk+M/AwMDAxMDAwMAAAAcSAQOvR0DtAAAAAElFTkSuQmCC';

export const FIXTURE_FOLDERS: LaunchFolder[] = [
	{ id: 'folder-gears', name: 'Gears', createdAt: ago(200), documentCount: 2 },
	{ id: 'folder-brackets', name: 'Brackets', createdAt: ago(150), documentCount: 1 }
];
export const FIXTURE_DOCUMENTS: LaunchDocument[] = [
	own({ id: 'doc-spur', title: 'Spur gear 24T', updatedAt: ago(1), createdAt: ago(72), folderId: 'folder-gears', tags: ['gear', 'v2'], featureCount: 9, bodyCount: 1, thumbnail: FIXTURE_THUMBNAIL }),
	own({ id: 'doc-bevel', title: 'Bevel gear pair', updatedAt: ago(30), createdAt: ago(90), folderId: 'folder-gears', tags: ['gear'], featureCount: 14, bodyCount: 2 }),
	own({ id: 'doc-bracket', title: 'Motor bracket', updatedAt: ago(5), createdAt: ago(20), folderId: 'folder-brackets', tags: ['bracket', 'frc'], featureCount: 6, bodyCount: 1 }),
	own({ id: 'doc-blank', title: 'Untitled model', updatedAt: ago(0.1), createdAt: ago(0.1), featureCount: 0, bodyCount: 0 }),
	own({ id: 'doc-linked', title: 'Blade CAD 01', itemId: 'item-blade-01', updatedAt: ago(26), createdAt: ago(100), canTrash: false, tags: ['idea100'], featureCount: 11, bodyCount: 1 }),
	own({ id: 'doc-archived', title: 'Old chassis idea', updatedAt: ago(400), createdAt: ago(900), archivedAt: ago(300), canWrite: false, featureCount: 4, bodyCount: 1 }),
	{ id: 'doc-shared', title: 'Intake roller', itemId: null, ownerEmail: 'ana.reyes@boscotech.net', isOwn: false, updatedAt: ago(3), createdAt: ago(40), archivedAt: null, canWrite: true, canArchive: false, canTrash: false, bodyCount: 2, featureCount: 7, role: 'editor', folderId: 'folder-of-ana', tags: ['intake'], thumbnail: null, format: 'ideacad-solid-v2' },
	{ id: 'doc-managed', title: 'Blade CAD 01', itemId: 'item-blade-01', ownerEmail: 'daniel.okonkwo@boscotech.net', isOwn: false, updatedAt: ago(50), createdAt: ago(99), archivedAt: null, canWrite: true, canArchive: true, canTrash: false, bodyCount: 1, featureCount: 8, role: 'manager', folderId: null, tags: [], thumbnail: null, format: 'ideacad-solid-v2' }
];
export const FIXTURE_TRASH: TrashedDocument[] = [
	{ id: 'doc-trashed', title: 'Wrong scale test', deletedAt: ago(48), purgeAt: new Date(FIXTURE_NOW.getTime() + 28 * 86_400_000).toISOString(), updatedAt: ago(48), folderId: null, tags: [], thumbnail: null, bodyCount: 1, featureCount: 2 }
];
