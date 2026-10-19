// tools/armory-drive-mirror-plan.mjs
//
// THE NIGHTLY READABLE MIRROR OF IDEA ARMORY, MINUS THE NETWORK (ledger 0404,
// decision 41 item 2: "finish the Google Shared Drive backup").
//
// Everything here is pure or runs over INJECTED adapters, so the whole run --
// what to copy, what to skip, what to move to _removed, the manifest, the
// summary -- is exercised by `tests/armory-drive-mirror.test.ts` over a fake
// store and a fake Drive, and by `--fixture` from the command line. The real
// adapters (Supabase over HTTPS, R2 by a signed GET, Google Drive) live in
// `tools/armory-drive-mirror.mjs` and do nothing but move bytes and requests.
//
// THE PROMISE THIS KEEPS: if R2, Supabase or Armory itself disappears, a
// person opens the Shared Drive and finds every project's CURRENT files as
// ordinary SolidWorks files in their folders, and a manifest that says, per
// file, its project, path, version, author, saved release, hash and date --
// readable with nothing but a spreadsheet.
//
// THE RULES, each one a property the tests hold:
//   * INCREMENTAL. A file whose Drive copy already carries the same hash is
//     skipped. A changed one is updated IN PLACE, so Drive's own revision
//     history keeps the older copy too.
//   * NEVER DELETES. A file Armory no longer has (removed, or its project
//     deleted forever) is MOVED to `_removed/<the path it had>`. There is no
//     delete call in either adapter, and the fake Drive has none to call.
//   * NEVER WRITES TO R2 OR THE DATABASE. The source adapter has no write
//     method; the real one is a GET-only HTTP client with a read-only R2 key.
//   * SAFE TO RUN TWICE AND SAFE TO STOP HALFWAY. Nothing is remembered between
//     runs except what is in Drive: every run lists Drive, plans against it and
//     acts. A copy appears in Drive only when its upload completes, so a run
//     cut off mid-file leaves the old copy (or none) and the next run redoes it.
//   * A DOWNLOAD IS CHECKED AGAINST ITS HASH BEFORE IT IS UPLOADED. Storage is
//     content-addressed, so bytes that do not hash to their name are not that
//     file, and are reported rather than copied.

import { createHash } from 'node:crypto';

/** Every repository secret the job reads. Names are its own (one reader per credential). */
export const MIRROR_SECRETS = [
	'ARMORY_MIRROR_SUPABASE_URL',
	'ARMORY_MIRROR_SUPABASE_SERVICE_ROLE_KEY',
	'ARMORY_MIRROR_R2_ACCOUNT_ID',
	'ARMORY_MIRROR_R2_ACCESS_KEY_ID',
	'ARMORY_MIRROR_R2_SECRET_ACCESS_KEY',
	'ARMORY_MIRROR_R2_BUCKET',
	'ARMORY_MIRROR_GOOGLE_CLIENT_ID',
	'ARMORY_MIRROR_GOOGLE_CLIENT_SECRET',
	'ARMORY_MIRROR_GOOGLE_REFRESH_TOKEN',
	'ARMORY_MIRROR_DRIVE_FOLDER_ID'
];

/** The folder under the mirror root that removed files move into. */
export const REMOVED_FOLDER = '_removed';

/** The three files the job keeps at the mirror root, rewritten every run. */
export const MANIFEST_FILES = { csv: 'ARMORY-MANIFEST.csv', json: 'ARMORY-MANIFEST.json', readme: 'README.txt' };

/** The names of the secrets that are unset or blank. */
export function missingSecrets(env) {
	return MIRROR_SECRETS.filter((name) => !String(env[name] ?? '').trim());
}

/**
 * THE SNAPSHOT: what Armory says is current, one entry per live file with a
 * first version, in a fixed order. Every input is a plain row list, the shape
 * the narrow selects in the real adapter return.
 *
 * @param {{projects: any[], files: any[], versions: any[], releases: any[]}} rows
 */
export function buildSnapshot({ projects, files, versions, releases }) {
	const projectById = new Map(projects.map((p) => [p.id, p]));
	const versionById = new Map(versions.map((v) => [v.id, v]));
	const releaseByVersion = new Map(releases.map((r) => [r.version_id, r.saved_release ?? null]));
	// A version's number is its place among its file's versions, oldest first.
	const byFile = new Map();
	for (const v of versions) {
		if (!byFile.has(v.file_id)) byFile.set(v.file_id, []);
		byFile.get(v.file_id).push(v);
	}
	for (const list of byFile.values()) list.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));

	const entries = [];
	let noVersion = 0;
	let noProject = 0;
	for (const f of files) {
		if (f.deleted_at) continue;
		const project = projectById.get(f.project_id);
		if (!project) {
			noProject++;
			continue;
		}
		const v = f.current_version_id ? versionById.get(f.current_version_id) : null;
		if (!v) {
			noVersion++;
			continue;
		}
		const list = byFile.get(f.id) ?? [v];
		const folder = String(f.folder ?? '').replace(/^\/+|\/+$/g, '');
		entries.push({
			fileId: f.id,
			projectId: project.id,
			projectName: project.name,
			archived: project.archived_at != null,
			pinnedRelease: project.pinned_release ?? null,
			folder,
			name: f.name,
			path: [project.name, ...(folder ? folder.split('/') : []), f.name].join('/'),
			sha256: v.content_sha256,
			bytes: Number(v.byte_length),
			version: list.findIndex((x) => x.id === v.id) + 1 || list.length,
			author: v.author_email,
			savedRelease: releaseByVersion.get(v.id) ?? null,
			savedAt: v.created_at
		});
	}
	entries.sort((a, b) => (a.path.toLowerCase() < b.path.toLowerCase() ? -1 : a.path.toLowerCase() > b.path.toLowerCase() ? 1 : 0));
	return { entries, noVersion, noProject, projects: projects.length };
}

/**
 * THE PLAN: every action the run would take against Drive as it stands.
 *
 * `drive` is `{ rootId, folders: [{id, name, parentId, projectId}], files:
 * [{id, name, parentId, fileId, sha256}] }`: every folder and every mirrored
 * file (a file tagged with an Armory file id) the root holds. A folder or file
 * that is not under the root is not this job's and is left alone; so is any
 * file without an Armory tag, which is a person's own.
 *
 * Folders that do not exist yet are named by a virtual ref (`new:<path>`),
 * listed in `folders` parents-first, and created before any file action.
 */
export function planMirror(snapshot, drive) {
	const folderById = new Map(drive.folders.map((f) => [f.id, f]));
	const children = new Map();
	for (const f of drive.folders) {
		if (!children.has(f.parentId)) children.set(f.parentId, []);
		children.get(f.parentId).push(f);
	}
	const newFolders = [];
	const renames = [];
	const virtual = new Map();

	/** A child folder of `parentRef` by name, existing or planned. */
	function child(parentRef, name, path) {
		const existing = (children.get(parentRef) ?? []).find((f) => f.name === name && !f.projectId);
		if (existing) return existing.id;
		const ref = `new:${path}`;
		if (!virtual.has(ref)) {
			virtual.set(ref, true);
			newFolders.push({ ref, name, parentRef, projectId: null });
		}
		return ref;
	}
	const projectFolders = new Map();
	function projectFolder(projectId, name) {
		if (projectFolders.has(projectId)) return projectFolders.get(projectId);
		const tagged = (children.get(drive.rootId) ?? []).find((f) => f.projectId === projectId);
		let ref;
		if (tagged) {
			ref = tagged.id;
			if (tagged.name !== name) renames.push({ id: tagged.id, from: tagged.name, name });
		} else {
			ref = `new:project:${projectId}`;
			newFolders.push({ ref, name, parentRef: drive.rootId, projectId });
		}
		projectFolders.set(projectId, ref);
		return ref;
	}
	function folderFor(entry) {
		let ref = projectFolder(entry.projectId, entry.projectName);
		let path = `project:${entry.projectId}`;
		for (const seg of entry.folder ? entry.folder.split('/') : []) {
			path += `/${seg}`;
			ref = child(ref, seg, path);
		}
		return ref;
	}
	/** The names from the root down to a folder, or null when it is not under the root. */
	function pathOf(folderId) {
		const names = [];
		let id = folderId;
		for (let guard = 0; guard < 200; guard++) {
			if (id === drive.rootId) return names.reverse();
			const f = folderById.get(id);
			if (!f) return null;
			names.push(f.name);
			id = f.parentId;
		}
		return null;
	}

	const byFileId = new Map();
	const duplicates = [];
	for (const node of drive.files) {
		if (!node.fileId) continue;
		if (pathOf(node.parentId) === null) continue;
		if (byFileId.has(node.fileId)) duplicates.push(node);
		else byFileId.set(node.fileId, node);
	}

	const actions = [];
	const wanted = new Set();
	for (const entry of snapshot.entries) {
		wanted.add(entry.fileId);
		const target = folderFor(entry);
		const node = byFileId.get(entry.fileId);
		if (!node) {
			actions.push({ kind: 'copy', entry, parentRef: target });
			continue;
		}
		const placed = node.parentId === target && node.name === entry.name;
		if (node.sha256 === entry.sha256) {
			actions.push(placed ? { kind: 'skip', entry, id: node.id } : { kind: 'move', entry, id: node.id, fromParentId: node.parentId, parentRef: target });
		} else {
			actions.push({ kind: 'update', entry, id: node.id, fromParentId: node.parentId, parentRef: target, moves: !placed });
		}
	}
	for (const [fileId, node] of byFileId) {
		if (wanted.has(fileId)) continue;
		const path = pathOf(node.parentId);
		if (path[0] === REMOVED_FOLDER) {
			actions.push({ kind: 'kept-removed', id: node.id, name: node.name, path: [...path, node.name].join('/') });
			continue;
		}
		let ref = child(drive.rootId, REMOVED_FOLDER, REMOVED_FOLDER);
		let vpath = REMOVED_FOLDER;
		for (const seg of path) {
			vpath += `/${seg}`;
			ref = child(ref, seg, vpath);
		}
		actions.push({ kind: 'remove', id: node.id, name: node.name, fromParentId: node.parentId, parentRef: ref, path: [...path, node.name].join('/'), to: [vpath, node.name].join('/') });
	}
	return { folders: newFolders, renames, actions, duplicates };
}

// ---------------------------------------------------------------------------
// The manifest and the summary.
// ---------------------------------------------------------------------------

export const MANIFEST_COLUMNS = ['project', 'path', 'version', 'author', 'saved_release', 'sha256', 'saved_at', 'bytes', 'archived', 'in_drive'];

function csvCell(v) {
	const s = v === null || v === undefined ? '' : String(v);
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per current file. `inDrive` is the set of file ids whose Drive copy carries the current hash after the run. */
export function manifestRows(snapshot, inDrive) {
	return snapshot.entries.map((e) => ({
		project: e.projectName,
		path: e.path,
		version: e.version,
		author: e.author,
		saved_release: e.savedRelease,
		sha256: e.sha256,
		saved_at: e.savedAt,
		bytes: e.bytes,
		archived: e.archived ? 'yes' : 'no',
		in_drive: inDrive.has(e.fileId) ? 'yes' : 'not yet'
	}));
}

export function manifestCsv(rows) {
	return [MANIFEST_COLUMNS.join(','), ...rows.map((r) => MANIFEST_COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

export function manifestJson(rows, ranAt) {
	return JSON.stringify({ generated_at: ranAt, columns: MANIFEST_COLUMNS, files: rows }, null, 2) + '\n';
}

export function readmeText(ranAt, counts) {
	return [
		'IDEA ARMORY BACKUP',
		'',
		`Written by the nightly Armory mirror. Last run: ${ranAt}.`,
		'',
		'Every IDEA Armory project is a folder here, holding the CURRENT version of every file in it,',
		'as an ordinary SolidWorks file. Open it in SolidWorks like any other file. Older versions of a',
		'file are in Google Drive\'s own version history (right-click the file, then File information,',
		'then Manage versions).',
		'',
		'ARMORY-MANIFEST.csv opens in any spreadsheet. One row per file: the project, its path, which',
		'version it is, who saved it, which SolidWorks release saved it, its SHA-256 hash and when.',
		'ARMORY-MANIFEST.json holds the same rows.',
		'',
		'_removed holds files Armory no longer has, moved here instead of deleted. Nothing in this',
		'folder is ever deleted by the mirror.',
		'',
		'This is a copy. Edits made here do not go back into Armory.',
		'',
		`${counts.projects} projects, ${counts.files} files.`,
		''
	].join('\n');
}

// ---------------------------------------------------------------------------
// The run, over injected adapters.
// ---------------------------------------------------------------------------

/**
 * Runs the mirror once.
 *
 * @param {object} o
 * @param {object} o.source  `{ projects(), files(), versions(), releases(), fetchObject(sha256, bytes) }`
 * @param {object} o.drive   `{ list(), createFolder(), renameFolder(), upload(), updateContent(), move(), writeText() }`
 * @param {boolean} [o.dryRun] plan and report; write nothing anywhere
 * @param {number} [o.budgetMs] stop starting new copies after this long; the next run continues
 * @param {() => number} [o.clock]
 * @param {(line: string) => void} [o.log]
 */
export async function runMirror({ source, drive, dryRun = false, budgetMs = Infinity, clock = Date.now, log = () => {} }) {
	const started = clock();
	const ranAt = new Date(started).toISOString();
	const [projects, files, versions, releases] = await Promise.all([source.projects(), source.files(), source.versions(), source.releases()]);
	const snapshot = buildSnapshot({ projects, files, versions, releases });
	const state = await drive.list();
	const plan = planMirror(snapshot, state);

	const result = {
		dryRun,
		ranAt,
		projects: snapshot.projects,
		files: snapshot.entries.length,
		noVersion: snapshot.noVersion,
		copied: 0,
		updated: 0,
		moved: 0,
		skipped: 0,
		removed: 0,
		keptRemoved: 0,
		failed: 0,
		left: 0,
		bytesCopied: 0,
		foldersCreated: 0,
		foldersRenamed: 0,
		duplicates: plan.duplicates.length,
		problems: [],
		plan
	};
	const inDrive = new Set();

	if (dryRun) {
		for (const a of plan.actions) {
			if (a.kind === 'skip') {
				result.skipped++;
				inDrive.add(a.entry.fileId);
			} else if (a.kind === 'copy') result.copied++;
			else if (a.kind === 'update') result.updated++;
			else if (a.kind === 'move') {
				result.moved++;
				inDrive.add(a.entry.fileId);
			} else if (a.kind === 'remove') result.removed++;
			else if (a.kind === 'kept-removed') result.keptRemoved++;
		}
		for (const a of plan.actions) if (a.kind === 'copy' || a.kind === 'update') result.bytesCopied += a.entry.bytes;
		result.foldersCreated = plan.folders.length;
		result.foldersRenamed = plan.renames.length;
		result.manifest = manifestRows(snapshot, inDrive);
		return result;
	}

	const ids = new Map();
	const resolve = (ref) => ids.get(ref) ?? ref;
	for (const f of plan.folders) {
		const id = await drive.createFolder({ name: f.name, parentId: resolve(f.parentRef), projectId: f.projectId });
		ids.set(f.ref, id);
		result.foldersCreated++;
	}
	for (const r of plan.renames) {
		await drive.renameFolder({ id: r.id, name: r.name });
		result.foldersRenamed++;
	}

	const props = (e) => ({ armory_file_id: e.fileId, armory_project_id: e.projectId, armory_sha256: e.sha256 });
	for (const a of plan.actions) {
		try {
			if (a.kind === 'skip') {
				result.skipped++;
				inDrive.add(a.entry.fileId);
			} else if (a.kind === 'kept-removed') {
				result.keptRemoved++;
			} else if (a.kind === 'move') {
				await drive.move({ id: a.id, fromParentId: a.fromParentId, toParentId: resolve(a.parentRef), name: a.entry.name, props: props(a.entry) });
				result.moved++;
				inDrive.add(a.entry.fileId);
			} else if (a.kind === 'remove') {
				await drive.move({ id: a.id, fromParentId: a.fromParentId, toParentId: resolve(a.parentRef), name: a.name, props: { armory_removed_at: ranAt } });
				result.removed++;
				log(`moved to ${a.to}`);
			} else if (a.kind === 'copy' || a.kind === 'update') {
				if (clock() - started > budgetMs) {
					result.left++;
					continue;
				}
				const blob = await source.fetchObject(a.entry.sha256, a.entry.bytes);
				try {
					if (blob.sha256 !== a.entry.sha256) {
						throw new Error(`the stored bytes hash to ${blob.sha256.slice(0, 12)}, not ${a.entry.sha256.slice(0, 12)}; not copied`);
					}
					if (a.kind === 'copy') {
						await drive.upload({ name: a.entry.name, parentId: resolve(a.parentRef), props: props(a.entry), blob });
						result.copied++;
					} else {
						await drive.updateContent({ id: a.id, props: props(a.entry), blob });
						if (a.moves) {
							await drive.move({ id: a.id, fromParentId: a.fromParentId, toParentId: resolve(a.parentRef), name: a.entry.name, props: props(a.entry) });
						}
						result.updated++;
					}
					result.bytesCopied += blob.bytes;
					inDrive.add(a.entry.fileId);
					log(`${a.kind === 'copy' ? 'copied' : 'updated'} ${a.entry.path}`);
				} finally {
					await blob.cleanup?.();
				}
			}
		} catch (e) {
			result.failed++;
			const where = a.entry ? a.entry.path : a.path;
			result.problems.push(`${where}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	const rows = manifestRows(snapshot, inDrive);
	result.manifest = rows;
	const texts = state.texts ?? [];
	const existingText = (name) => texts.find((t) => t.name === name)?.id ?? null;
	await drive.writeText({ name: MANIFEST_FILES.csv, mime: 'text/csv', text: manifestCsv(rows), existingId: existingText(MANIFEST_FILES.csv) });
	await drive.writeText({ name: MANIFEST_FILES.json, mime: 'application/json', text: manifestJson(rows, ranAt), existingId: existingText(MANIFEST_FILES.json) });
	await drive.writeText({
		name: MANIFEST_FILES.readme,
		mime: 'text/plain',
		text: readmeText(ranAt, { projects: snapshot.projects, files: snapshot.entries.length }),
		existingId: existingText(MANIFEST_FILES.readme)
	});
	return result;
}

function size(bytes) {
	if (bytes < 1024) return `${bytes} bytes`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** The job summary, in markdown, for a run. */
export function summaryMarkdown(r) {
	const lines = [
		`## Armory Shared Drive mirror${r.dryRun ? ' (dry run: nothing was written)' : ''}`,
		'',
		`Ran ${r.ranAt}. ${r.projects} projects, ${r.files} current files.`,
		'',
		'| | |',
		'|---|---|',
		`| Copied${r.dryRun ? ' (would)' : ''} | ${r.copied} |`,
		`| Updated${r.dryRun ? ' (would)' : ''} | ${r.updated} |`,
		`| Moved or renamed | ${r.moved} |`,
		`| Already current, skipped | ${r.skipped} |`,
		`| Moved to ${REMOVED_FOLDER} | ${r.removed} |`,
		`| Already in ${REMOVED_FOLDER} | ${r.keptRemoved} |`,
		`| Folders made | ${r.foldersCreated} |`,
		`| Bytes ${r.dryRun ? 'it would copy' : 'copied'} | ${size(r.bytesCopied)} |`,
		`| Failed | ${r.failed} |`,
		`| Left for the next run | ${r.left} |`
	];
	if (r.noVersion) lines.push('', `${r.noVersion} file(s) have no first version yet and are not copied.`);
	if (r.duplicates) lines.push('', `${r.duplicates} Drive file(s) carry the same Armory file id as another; the first is kept current and the rest are left alone.`);
	if (r.left) lines.push('', `The run reached its time limit; tonight's run continues with the ${r.left} left.`);
	if (r.problems.length) {
		lines.push('', '### Problems', '');
		for (const p of r.problems.slice(0, 50)) lines.push(`- ${p}`);
		if (r.problems.length > 50) lines.push(`- and ${r.problems.length - 50} more`);
	}
	return lines.join('\n') + '\n';
}

/** The summary when the job is not set up: which secrets are missing, and a green exit. */
export function notSetUpMarkdown(missing) {
	return [
		'## Armory Shared Drive mirror: not set up',
		'',
		'Nothing was read or written. These repository secrets are not set:',
		'',
		...missing.map((m) => `- \`${m}\``),
		'',
		'Where each value comes from: `docs/history/armory-sw-version-and-drive-backup.md`, "What Mr. Pina does, once".',
		''
	].join('\n');
}

// ---------------------------------------------------------------------------
// In-memory adapters: the tests' fake store and fake Drive, and `--fixture`.
// ---------------------------------------------------------------------------

export function sha256Of(buf) {
	return createHash('sha256').update(buf).digest('hex');
}

/**
 * A store in memory. `objects` maps a hash to its bytes. It has no write
 * method, the way the real one has none.
 */
export function fakeSource({ projects, files, versions, releases = [], objects = {} }) {
	const reads = { objects: 0 };
	return {
		reads,
		projects: async () => projects,
		files: async () => files,
		versions: async () => versions,
		releases: async () => releases,
		fetchObject: async (sha256) => {
			reads.objects++;
			const bytes = objects[sha256];
			if (bytes === undefined) throw new Error('the stored file is missing from file storage');
			const buf = Buffer.from(bytes);
			return { sha256: sha256Of(buf), bytes: buf.length, buffer: buf, cleanup: async () => {} };
		}
	};
}

/**
 * Drive in memory. Records every write; has NO delete or trash method, so a
 * run that tried to delete would throw. `failUploadsAfter` cuts the run off
 * after that many uploads (stop halfway).
 */
export function fakeDrive({ rootId = 'root', folders = [], files = [], texts = [], failUploadsAfter = Infinity } = {}) {
	let n = 0;
	// Drive ids are unique for ever, so a Drive handed an earlier run's state never reuses one.
	const taken = () => new Set([...state.folders, ...state.files, ...state.texts].map((x) => x.id));
	const next = (p) => {
		const used = taken();
		let id;
		do id = `${p}${++n}`;
		while (used.has(id));
		return id;
	};
	const state = {
		folders: folders.map((f) => ({ ...f })),
		files: files.map((f) => ({ ...f })),
		texts: texts.map((t) => ({ ...t })),
		writes: { createFolder: 0, renameFolder: 0, upload: 0, updateContent: 0, move: 0, writeText: 0 },
		contents: new Map()
	};
	let uploads = 0;
	return {
		state,
		list: async () => ({
			rootId,
			folders: state.folders.map((f) => ({ ...f })),
			files: state.files.map((f) => ({ ...f })),
			texts: state.texts.map((t) => ({ ...t }))
		}),
		createFolder: async ({ name, parentId, projectId }) => {
			state.writes.createFolder++;
			const id = next('folder-');
			state.folders.push({ id, name, parentId, projectId: projectId ?? null });
			return id;
		},
		renameFolder: async ({ id, name }) => {
			state.writes.renameFolder++;
			const f = state.folders.find((x) => x.id === id);
			if (!f) throw new Error('no such folder');
			f.name = name;
		},
		upload: async ({ name, parentId, props, blob }) => {
			if (uploads >= failUploadsAfter) throw new Error('the connection dropped');
			uploads++;
			state.writes.upload++;
			const id = next('file-');
			state.files.push({ id, name, parentId, fileId: props.armory_file_id, sha256: props.armory_sha256 });
			state.contents.set(id, blob.buffer);
			return id;
		},
		updateContent: async ({ id, props, blob }) => {
			if (uploads >= failUploadsAfter) throw new Error('the connection dropped');
			uploads++;
			state.writes.updateContent++;
			const f = state.files.find((x) => x.id === id);
			if (!f) throw new Error('no such file');
			f.sha256 = props.armory_sha256;
			state.contents.set(id, blob.buffer);
		},
		move: async ({ id, toParentId, name }) => {
			state.writes.move++;
			const f = state.files.find((x) => x.id === id);
			if (!f) throw new Error('no such file');
			f.parentId = toParentId;
			f.name = name;
		},
		writeText: async ({ name, text, existingId }) => {
			state.writes.writeText++;
			const t = existingId ? state.texts.find((x) => x.id === existingId) : null;
			if (t) t.text = text;
			else state.texts.push({ id: next('text-'), name, text });
		}
	};
}
