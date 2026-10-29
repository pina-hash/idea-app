// src/lib/ideacad/solid/launch/api.ts
//
// THE TRANSPORTS THE LAUNCH PAGE IS HANDED, as one injected object. The real
// route points them at `createSolidTransports(supabase)` (every member below
// is a method of what that returns, plus `create` lifted off its `transport`);
// the dev harness and the mount test hand in `createMemoryLaunchApi`. NOTHING
// HERE IS AN AUTHORIZATION BOUNDARY: every RPC re-checks its caller inside its
// own body and answers with the sentence the page shows where it was pressed.
//
// The optional management pieces -- sharing, linking to an assignment, sharing an
// archived model with a class -- are OPTIONAL. An omitted transport removes the
// control it drives (CLAUDE.md), so the harness can leave them out and the
// controls are absent rather than present-and-refusing.
import type { LaunchDocument, LaunchFolder, TrashedDocument } from './library';
import type { AccessList, ShareChange, ShareOutcome, SharePerson } from './share';

export interface TrashReceipt { ok: true; id: string; title: string; deletedAt: string; purgeAt: string; swept: number }

export interface LaunchApi {
	list(): Promise<LaunchDocument[]>;
	folders(): Promise<LaunchFolder[]>;
	trashList(): Promise<TrashedDocument[]>;
	create(title: string): Promise<{ id: string }>;
	archive(id: string, archived: boolean): Promise<unknown>;
	trash(id: string): Promise<TrashReceipt>;
	restore(id: string): Promise<unknown>;
	purge(id: string): Promise<unknown>;
	createFolder(name: string): Promise<LaunchFolder>;
	renameFolder(id: string, name: string): Promise<LaunchFolder>;
	deleteFolder(id: string): Promise<{ movedOut: number }>;
	move(id: string, folderId: string | null): Promise<unknown>;
	tag(id: string, tags: string[]): Promise<{ tags: string[] }>;
	rename(id: string, title: string): Promise<unknown>;
	duplicate(id: string, title?: string): Promise<{ id: string }>;
	/* SHARING (0325, ledger 0470): who has a model, the people picker's directory, and many changes in one call.
	   All three or none: the share panel mounts only when every one is handed in. */
	access?(id: string): Promise<AccessList>;
	people?(id: string, query: string): Promise<SharePerson[]>;
	setAccess?(id: string, changes: ShareChange[]): Promise<ShareOutcome>;
	link?(id: string, itemId: string): Promise<unknown>;
	classShare?(id: string, sectionId: string, remove?: boolean): Promise<unknown>;
	sections?(itemId: string): Promise<{ id: string; label: string }[]>;
}
