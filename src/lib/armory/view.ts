/**
 * IDEA ARMORY ON THE WEBSITE: the shapes the pages read and the pure decisions
 * about them (which state a file is in, what that is called, where it sits in
 * the folder tree). Client-safe plain data, so the pages, the /dev/armory
 * harness and the tests all ask the same functions.
 *
 * THE WORDS ARE FOR STUDENTS WHO HAVE NEVER USED A VAULT. "Someone is editing
 * this", never "lock held"; "Saved to Armory", never "committed"; "Side
 * version", with a sentence saying what it is.
 */

export type ArmoryRole = 'student' | 'cad_lead' | 'mentor' | 'instructor';

export interface ArmoryProject {
	id: string;
	name: string;
	season: number;
	role: ArmoryRole;
	pinned_release?: number;
	release_gate?: string;
}

export interface ArmoryLock {
	holder_email: string;
	holder_device_id: string;
	holder_device_name: string | null;
	acquired_at: string;
	broken_at: string | null;
	broken_by: string | null;
}

export interface ArmoryCurrentVersion {
	id: string;
	hash: string;
	bytes: number;
	author: string;
	created_at: string;
}

export interface ArmoryFile {
	id: string;
	folder: string;
	name: string;
	deleted: boolean;
	created_at: string;
	current: ArmoryCurrentVersion | null;
	lock: ArmoryLock | null;
}

export interface ArmoryMember {
	email: string;
	role: ArmoryRole;
}

export interface ArmoryHistoryEntry {
	id: string;
	kind: 'version' | 'side_version' | 'tombstone';
	author: string;
	created_at: string;
	bytes: number;
	hash: string | null;
	reason: string | null;
}

export const ROLE_WORDS: Record<ArmoryRole, string> = {
	student: 'Student',
	cad_lead: 'CAD lead',
	mentor: 'Mentor',
	instructor: 'Instructor'
};

/** Who may do what on the members list. The RPCs decide; this only decides what is OFFERED. */
export function memberPowers(role: ArmoryRole | null): { add: boolean; addLeads: boolean; remove: boolean } {
	return {
		add: role === 'mentor' || role === 'cad_lead',
		addLeads: role === 'mentor',
		remove: role === 'mentor'
	};
}

/**
 * A computer that has written nothing to the change feed for this long while
 * it holds a file is shown as possibly offline. The schema has no heartbeat
 * (the agent polls, which writes nothing), so this is the most a website can
 * honestly say: when the computer was last HEARD from, not whether it is on.
 */
export const DEVICE_QUIET_MS = 2 * 60 * 60 * 1000;

export type FileState = 'editing' | 'editing-quiet' | 'synced' | 'waiting' | 'removed';

export function fileState(file: ArmoryFile, now: number, deviceLastSeen: ReadonlyMap<string, number>): FileState {
	if (file.deleted) return 'removed';
	if (file.lock && !file.lock.broken_at) {
		const heard = Math.max(
			Date.parse(file.lock.acquired_at),
			deviceLastSeen.get(file.lock.holder_device_id) ?? Number.NEGATIVE_INFINITY
		);
		return now - heard > DEVICE_QUIET_MS ? 'editing-quiet' : 'editing';
	}
	return file.current ? 'synced' : 'waiting';
}

export const STATE_WORDS: Record<FileState, { label: string; glyph: string; tone: string }> = {
	editing: { label: 'Someone is editing this', glyph: '✎', tone: 'editing' },
	'editing-quiet': { label: 'Being edited on a computer that has gone quiet', glyph: '⏸', tone: 'quiet' },
	synced: { label: 'Saved to Armory', glyph: '✓', tone: 'synced' },
	waiting: { label: 'Waiting for its first upload', glyph: '…', tone: 'waiting' },
	removed: { label: 'Removed', glyph: '−', tone: 'removed' }
};

/** The first part of a school address, which is how people know each other here. */
export function personName(email: string | null | undefined): string {
	if (!email) return 'Someone';
	const local = email.split('@')[0] ?? email;
	return local || email;
}

const TIME = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/Los_Angeles',
	hour: 'numeric',
	minute: '2-digit'
});
const DAY = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/Los_Angeles',
	month: 'short',
	day: 'numeric'
});
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' });

/** "3:47 PM" today, "Oct 2, 3:47 PM" otherwise, in the school's own time zone. */
export function whenWords(iso: string, now: number): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return '';
	const sameDay = DAY_KEY.format(t) === DAY_KEY.format(now);
	return sameDay ? TIME.format(t) : `${DAY.format(t)}, ${TIME.format(t)}`;
}

export function sizeWords(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** The sentence under a file's state, naming who and when. */
export function stateDetail(file: ArmoryFile, state: FileState, now: number): string {
	const lock = file.lock;
	const device = lock?.holder_device_name ?? 'a computer';
	switch (state) {
		case 'editing':
			return `${personName(lock?.holder_email)} on ${device}, since ${whenWords(lock!.acquired_at, now)}`;
		case 'editing-quiet':
			return `${personName(lock?.holder_email)} on ${device}, since ${whenWords(lock!.acquired_at, now)}. That computer may be off; ask them to open Armory or close the file.`;
		case 'synced':
			return `Last saved by ${personName(file.current!.author)}, ${whenWords(file.current!.created_at, now)}`;
		case 'waiting':
			return 'Created, but nobody has saved it yet';
		case 'removed':
			return 'Removed from the project. Its history is kept.';
	}
}

/** Why a side version exists, in words. The reasons are 002/004's own strings. */
export function sideReasonWords(reason: string | null): string {
	switch (reason) {
		case 'stale parent':
			return 'Saved from an older copy, after someone else had already saved a newer one. Nothing was lost: both are kept.';
		case 'caller does not hold lock':
			return 'Saved while someone else was editing the file. Kept beside the main version so nothing is lost.';
		case 'file deleted':
			return 'Saved after the file was removed. Kept so nothing is lost.';
		default:
			return reason ? `Kept beside the main version: ${reason}.` : 'Kept beside the main version.';
	}
}

export interface FolderNode {
	name: string;
	path: string;
	folders: FolderNode[];
	files: ArmoryFile[];
}

/** The folder tree, folders before files, each sorted without regard to case. */
export function folderTree(files: readonly ArmoryFile[]): FolderNode {
	const root: FolderNode = { name: '', path: '', folders: [], files: [] };
	for (const file of files) {
		let node = root;
		const parts = file.folder ? file.folder.split('/').filter(Boolean) : [];
		for (const part of parts) {
			let next = node.folders.find((f) => f.name === part);
			if (!next) {
				next = { name: part, path: node.path ? `${node.path}/${part}` : part, folders: [], files: [] };
				node.folders.push(next);
			}
			node = next;
		}
		node.files.push(file);
	}
	const sort = (node: FolderNode) => {
		node.folders.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
		node.files.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
		node.folders.forEach(sort);
	};
	sort(root);
	return root;
}

/** The latest moment each computer wrote anything to the project's change feed. */
export function deviceLastSeen(changes: ReadonlyArray<{ payload: unknown; created_at: string }>): Map<string, number> {
	const seen = new Map<string, number>();
	for (const c of changes) {
		const device = (c.payload as { device_id?: unknown } | null)?.device_id;
		if (typeof device !== 'string') continue;
		const at = Date.parse(c.created_at);
		if (!(seen.get(device)! >= at)) seen.set(device, at);
	}
	return seen;
}

/** A read that failed because the Armory schema is not in this database yet. */
export function armoryNotReady(error: { code?: string; message?: string } | null | undefined): boolean {
	const code = error?.code ?? '';
	return code === 'PGRST202' || code === '42883' || code === '42P01' || code === 'PGRST205';
}

/** Plain words for the member RPCs' refusals. */
export function memberErrorWords(message: string): string {
	if (/at least one mentor/i.test(message)) return 'A project always keeps at least one mentor.';
	if (/valid email/i.test(message)) return 'Type a full school email address.';
	if (/only a mentor may (grant|change)/i.test(message)) return 'Only a mentor can make someone a mentor or CAD lead.';
	if (/only a mentor may remove/i.test(message)) return 'Only a mentor can remove people.';
	if (/only a mentor or CAD lead/i.test(message)) return 'Only a mentor or CAD lead can add people.';
	return 'That did not work. Try again in a minute.';
}
