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
	/** Null since 0232: a project need not belong to a season. Never shown. */
	season: number | null;
	role: ArmoryRole;
	pinned_release?: number;
	release_gate?: string;
	/** 0232. Absent on a database without it, which reads as not archived. */
	archived?: boolean;
	archived_at?: string | null;
}

/** One element of `armory_project_checkouts` (0232, contract C7). */
export interface ArmoryCheckout {
	file_id: string;
	folder: string;
	name: string;
	holder_email: string;
	holder_name: string | null;
	device_name: string | null;
	since: string;
}

/** A computer the signed-in person has connected (their own `armory_devices` rows). */
export interface ArmoryDevice {
	id: string;
	name: string;
	registered_at: string;
	/** The latest change-feed write from it, or its registration, in ms. */
	last_seen: number;
}

/** One change-feed row, as the activity panel reads it. */
export interface ArmoryChange {
	cursor: number;
	kind: string;
	entity_id: string;
	payload: Record<string, unknown> | null;
	created_at: string;
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

/**
 * THE WORDS ARE THE CONTRACT'S (C8): a file is "Checked out" or "Available".
 * "Check out", "Check in", "Undo check out" and "Take back" are the four verbs
 * the website and the Windows app share.
 */
export const STATE_WORDS: Record<FileState, { label: string; glyph: string; tone: string }> = {
	editing: { label: 'Checked out', glyph: '✎', tone: 'editing' },
	'editing-quiet': { label: 'Checked out', glyph: '⏸', tone: 'quiet' },
	synced: { label: 'Available', glyph: '✓', tone: 'synced' },
	waiting: { label: 'Available', glyph: '…', tone: 'waiting' },
	removed: { label: 'Removed', glyph: '−', tone: 'removed' }
};

export const VERBS = {
	checkOut: 'Check out',
	checkIn: 'Check in',
	undo: 'Undo check out',
	takeBack: 'Take back'
} as const;

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

/** The holder's chosen name from the checkout list, else the first part of their address. */
export function holderName(email: string | null | undefined, names?: ReadonlyMap<string, string | null>): string {
	const chosen = email ? names?.get(email) : null;
	return chosen && chosen.trim() ? chosen.trim() : personName(email);
}

/**
 * What follows the state word, so the label and this read as ONE sentence:
 * "Checked out" + " by Ana Reyes on Lab PC 3, since 10:12 AM", or
 * "Available" + ". Last saved by maria.lopez, 9:55 AM".
 */
export function stateDetail(
	file: ArmoryFile,
	state: FileState,
	now: number,
	names?: ReadonlyMap<string, string | null>
): string {
	const lock = file.lock;
	const device = lock?.holder_device_name ?? 'a computer';
	switch (state) {
		case 'editing':
			return ` by ${holderName(lock?.holder_email, names)} on ${device}, since ${whenWords(lock!.acquired_at, now)}`;
		case 'editing-quiet':
			return ` by ${holderName(lock?.holder_email, names)} on ${device}, since ${whenWords(lock!.acquired_at, now)}. That computer has gone quiet and may be off; ask them to open Armory and check it in.`;
		case 'synced':
			return `. Last saved by ${personName(file.current!.author)}, ${whenWords(file.current!.created_at, now)}`;
		case 'waiting':
			return '. Nothing has been saved to it yet';
		case 'removed':
			return '. Removed from the project; its history is kept';
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

// ---- Armory v2 (ledger 0366): filters, search, activity, people, setup ----

export type FileFilter = 'all' | 'checked-out' | 'mine';

export const FILE_FILTERS: ReadonlyArray<{ id: FileFilter; label: string }> = [
	{ id: 'all', label: 'All files' },
	{ id: 'checked-out', label: 'Checked out' },
	{ id: 'mine', label: 'Mine' }
];

function isCheckedOut(file: ArmoryFile): boolean {
	return !file.deleted && !!file.lock && !file.lock.broken_at;
}

/**
 * The files a filter and a search leave. "Mine" is what the viewer has checked
 * out; the search matches the name or the folder, any case, every word.
 */
export function filterFiles(files: readonly ArmoryFile[], filter: FileFilter, query: string, myEmail: string): ArmoryFile[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const me = myEmail.trim().toLowerCase();
	return files.filter((f) => {
		if (filter === 'checked-out' && !isCheckedOut(f)) return false;
		if (filter === 'mine' && !(isCheckedOut(f) && f.lock!.holder_email === me)) return false;
		if (words.length === 0) return true;
		const hay = `${f.folder}/${f.name}`.toLowerCase();
		return words.every((w) => hay.includes(w));
	});
}

export function checkoutCounts(files: readonly ArmoryFile[], myEmail: string): { all: number; checkedOut: number; mine: number } {
	const me = myEmail.trim().toLowerCase();
	const out = files.filter(isCheckedOut);
	return { all: files.length, checkedOut: out.length, mine: out.filter((f) => f.lock!.holder_email === me).length };
}

/**
 * Checkouts from the file list, for a database without 0232's
 * `armory_project_checkouts`: the same rows, with no chosen names.
 */
export function checkoutsFromFiles(files: readonly ArmoryFile[]): ArmoryCheckout[] {
	return files
		.filter(isCheckedOut)
		.map((f) => ({
			file_id: f.id,
			folder: f.folder,
			name: f.name,
			holder_email: f.lock!.holder_email,
			holder_name: null,
			device_name: f.lock!.holder_device_name,
			since: f.lock!.acquired_at
		}))
		.sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

/** Email to chosen name, from the checkout list. */
export function holderNames(checkouts: readonly ArmoryCheckout[]): Map<string, string | null> {
	return new Map(checkouts.map((c) => [c.holder_email, c.holder_name]));
}

/** "Checked out by Ana Reyes on Lab PC 3, since 10:12 AM", or "Available". */
export function checkoutLine(file: ArmoryFile, now: number, names?: ReadonlyMap<string, string | null>): string {
	if (!isCheckedOut(file)) return 'Available';
	const l = file.lock!;
	return `Checked out by ${holderName(l.holder_email, names)} on ${l.holder_device_name ?? 'a computer'}, since ${whenWords(l.acquired_at, now)}`;
}

/**
 * The emails in a pasted block: any mix of commas, semicolons, spaces and new
 * lines, including "Name <address>" as a mail program copies it. Lowercased,
 * de-duplicated, in the order given; what is not an address is returned apart
 * so the form can say which ones it skipped.
 */
export function parseEmails(text: string): { emails: string[]; rejected: string[] } {
	const emails: string[] = [];
	const rejected: string[] = [];
	for (const raw of text.split(/[\s,;]+/)) {
		const token = raw.replace(/^[<("']+|[>)"']+$/g, '').trim();
		if (!token) continue;
		const email = token.toLowerCase();
		if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			if (!emails.includes(email)) emails.push(email);
		} else if (!/^[A-Za-z.'-]+$/.test(token) || token.includes('@')) {
			// A bare word is the name part of "Ana Reyes <ana@...>"; anything else is reported.
			rejected.push(token);
		}
	}
	return { emails, rejected };
}

/**
 * Storage a project uses: every saved version and side version, each stored
 * file counted once (the storage is keyed by the file's fingerprint, so two
 * versions with the same bytes are one stored file).
 */
export function storageUsed(rows: ReadonlyArray<{ content_sha256: string; byte_length: number | string }>): { bytes: number; files: number } {
	const seen = new Map<string, number>();
	for (const r of rows) if (!seen.has(r.content_sha256)) seen.set(r.content_sha256, Number(r.byte_length) || 0);
	let bytes = 0;
	for (const b of seen.values()) bytes += b;
	return { bytes, files: seen.size };
}

/** The latest moment each computer was heard from: the feed, or its registration. */
export function devicesWithLastSeen(
	devices: ReadonlyArray<{ id: string; name: string; registered_at: string }>,
	seen: ReadonlyMap<string, number>
): ArmoryDevice[] {
	return devices
		.map((d) => ({ ...d, last_seen: Math.max(Date.parse(d.registered_at), seen.get(d.id) ?? Number.NEGATIVE_INFINITY) }))
		.sort((a, b) => b.last_seen - a.last_seen);
}

/** "Seen 10:12 AM", or "Seen Oct 2, 10:12 AM", or "Not seen since it connected". */
export function lastSeenWords(device: ArmoryDevice, now: number): string {
	return `Last heard from ${whenWords(new Date(device.last_seen).toISOString(), now)}`;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);

function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

/**
 * One change-feed row in plain words, or null for a kind the page does not
 * show. `fileName` resolves a file id to its current name.
 */
export function activityWords(change: ArmoryChange, fileName: (id: string) => string | null, checkedIn = false): string | null {
	const p = change.payload ?? {};
	const by = personName(str(p.by) ?? str(p.holder));
	const file = (id: unknown) => (typeof id === 'string' ? fileName(id) : null) ?? 'a file';
	const where = (folder: unknown) => (str(folder) ? ` in ${str(folder)}` : '');
	switch (change.kind) {
		case 'project_created':
			return `${by} created the project`;
		case 'project_renamed':
			return `${by} renamed the project from ${str(p.from) ?? 'its old name'} to ${str(p.to) ?? 'a new name'}`;
		case 'project_archived':
			return `${by} archived the project`;
		case 'project_restored':
			return `${by} restored the project`;
		case 'member_added':
			return `${by} added ${personName(str(p.email))} as ${ROLE_WORDS[p.role as ArmoryRole] ?? 'a member'}`;
		case 'member_role_changed':
			return `${by} made ${personName(str(p.email))} ${ROLE_WORDS[p.role as ArmoryRole] ?? 'a member'}`;
		case 'member_removed':
			return `${by} removed ${personName(str(p.email))}`;
		case 'file_created':
			return `${by} added ${str(p.name) ?? 'a file'}${where(p.folder)}`;
		case 'file_revived':
			return `${by} brought back ${str(p.name) ?? 'a removed file'}${where(p.folder)}, with its history`;
		case 'file_moved':
			return `${by} moved ${str(p.old_name) ?? 'a file'} to ${str(p.folder) ? `${str(p.folder)}/` : ''}${str(p.name) ?? ''}`;
		case 'folder_renamed': {
			const n = num(p.files);
			return `${by} renamed the folder ${str(p.from) ?? ''} to ${str(p.to) ?? ''}${n !== null ? ` (${plural(n, 'file', 'files')})` : ''}`;
		}
		case 'folder_deleted': {
			const n = num(p.files);
			return `${by} removed the folder ${str(p.folder) ?? ''}${n !== null ? ` (${plural(n, 'file', 'files')}, history kept)` : ''}`;
		}
		case 'version':
			return `Someone saved a new version of ${file(p.file_id)}`;
		case 'side_version':
			return `A side version of ${file(p.file_id)} was kept`;
		case 'tombstone':
			return `${file(change.entity_id)} was removed (history kept)`;
		case 'lock_acquired':
			return `${by} checked out ${file(change.entity_id)}`;
		case 'lock_released':
			return `${file(change.entity_id)} was ${checkedIn ? 'checked in' : 'let go (check out undone)'}`;
		case 'lock_broken':
			return `${by} took back ${file(change.entity_id)} from ${personName(str(p.former_holder))}`;
		case 'pinned_release_raised':
			return `${by} moved the project to SolidWorks ${num(p.release) ?? ''}`;
		case 'release_gate_changed':
			return `${by} changed how strictly SolidWorks versions are checked`;
		default:
			return null;
	}
}

/**
 * A release counts as a check in when the same file got a saved version from
 * the same computer after it was checked out. `changes` is newest first.
 */
export function checkedInReleases(changes: readonly ArmoryChange[]): Set<number> {
	const out = new Set<number>();
	changes.forEach((c, i) => {
		if (c.kind !== 'lock_released') return;
		const device = str(c.payload?.device_id);
		for (let j = i + 1; j < changes.length; j++) {
			const older = changes[j];
			if (older.kind === 'lock_acquired' && older.entity_id === c.entity_id) break;
			if (older.kind === 'version' && str(older.payload?.file_id) === c.entity_id && str(older.payload?.device_id) === device) {
				out.add(c.cursor);
				break;
			}
		}
	});
	return out;
}

/** Plain words for the project RPCs' refusals (rename, archive). */
export function projectErrorWords(message: string): string {
	if (/already exists/i.test(message)) return 'Another project already has that name.';
	if (/Windows folder/i.test(message)) return 'That name cannot be a Windows folder name. Leave out \\ / : * ? " < > | and a trailing dot.';
	if (/only a mentor/i.test(message)) return 'Only a mentor can do that.';
	return 'That did not work. Try again in a minute.';
}

/** Where a person is in setting Armory up, from what the site can see. */
export interface SetupState {
	/** A release the site can offer, with its version. */
	release: { tag: string } | null;
	devices: readonly ArmoryDevice[];
	projects: readonly ArmoryProject[];
}

export interface SetupStep {
	id: 'download' | 'install' | 'connect' | 'projects';
	title: string;
	done: boolean;
	/** What the site actually knows, said as a sentence. */
	status: string;
}

/**
 * The four steps. Only two are knowable from here: a connected computer and
 * a project. Downloading and installing are never ticked by guesswork; they
 * are done when the computer that ran them connects.
 */
export function setupSteps(state: SetupState): SetupStep[] {
	const device = state.devices[0] ?? null;
	const live = state.projects.filter((p) => !p.archived);
	return [
		{
			id: 'download',
			title: 'Download the app',
			done: !!device,
			status: device ? 'Done: a computer of yours is connected.' : 'Not done yet.'
		},
		{
			id: 'install',
			title: 'Install it',
			done: !!device,
			status: device ? 'Done.' : 'Not done yet. It takes about a minute.'
		},
		{
			id: 'connect',
			title: 'Connect this computer',
			done: !!device,
			status: device
				? state.devices.length === 1
					? `Connected: ${device.name}.`
					: `Connected: ${device.name} and ${plural(state.devices.length - 1, 'other computer', 'other computers')}.`
				: 'Not connected yet. This page notices on its own once you do.'
		},
		{
			id: 'projects',
			title: 'Your projects',
			done: live.length > 0,
			status:
				live.length > 0
					? `You are in ${plural(live.length, 'project', 'projects')}: ${live.map((p) => p.name).join(', ')}.`
					: 'You are not in a project yet. A mentor adds you by your school email.'
		}
	];
}
