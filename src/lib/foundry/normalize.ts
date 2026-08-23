/**
 * THREE INPUT SHAPES IN, ONE ZIP OUT.
 *
 * A student arrives with a zip, a folder, or a single HTML file.
 * `foundry-ingest` takes a zip and only a zip -- and that is worth keeping,
 * because every structural assertion, every path check and every cap already
 * proven against that one input stays proven. So the other two are turned into
 * a zip HERE, in the browser, before anything is uploaded or preflighted.
 *
 * NOTHING HERE JUDGES THE APP. This module decides what the student handed
 * over and packs it; whether it is a legal bundle is `./preflight.ts`'s
 * question, asked afterwards on the zip this produces. Keeping the two apart
 * is what stops "normalize" quietly becoming a second, softer copy of the
 * rules -- the one place that would be tempted to accept something the server
 * will not.
 *
 * EVERY REPAIR IS REPORTED. A dropped `node_modules`, a renamed entry file, a
 * folder that was flattened: each comes back as a note the surface shows. A
 * silent repair is indistinguishable from a bug when the result is not what
 * the student expected, and they cannot ask about what they were not told.
 */

import { FOUNDRY_ENTRY_FILE, folderNoiseLabel, formatBytes } from './preflight.ts';
import { buildZip, type ZipEntry } from './zip-write.ts';

/** Which of the three shapes the student handed over. */
export type FoundryInputShape = 'zip' | 'folder' | 'single-html';

export interface NormalizeResult {
	ok: boolean;
	shape: FoundryInputShape | null;
	/** The zip to preflight and upload. Null when `ok` is false. */
	zip: Blob | null;
	/** Suggested filename, used only for display. */
	name: string;
	/** Repairs and omissions, shown as information. */
	notes: string[];
	/** Why nothing could be produced. Shown as a failure, in this module's words. */
	problem: string | null;
	/** Bundle-relative paths that went in, for the folder and single-file cases. */
	packed: string[];
}

/** A file plus the path it should carry inside the bundle. */
interface Picked {
	file: File;
	path: string;
}

const HTML_EXTENSIONS = ['html', 'htm'];

function lower(name: string): string {
	return name.toLowerCase();
}

function extension(name: string): string {
	const base = name.slice(name.lastIndexOf('/') + 1);
	const dot = base.lastIndexOf('.');
	return dot <= 0 ? '' : lower(base.slice(dot + 1));
}

/**
 * The path a picked file should carry inside the bundle.
 *
 * `webkitRelativePath` is what a directory picker sets and what the drag-drop
 * walker below imitates, so both paths through this module produce the same
 * strings. A file with neither is a loose file and keeps its own name.
 *
 * Backslashes are normalized because a Windows drag can produce them, and a
 * bundle path with a backslash in it is refused later by `bundlePathOk` for a
 * reason that would read to the student as nonsense.
 */
function pathOf(file: File): string {
	const raw = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
	return raw.split('\\').join('/').replace(/^\/+/, '');
}

/**
 * Walk a drag-and-drop DataTransfer into a flat file list.
 *
 * `webkitGetAsEntry` is the only way to see INSIDE a dropped folder --
 * `DataTransfer.files` contains the folder itself as a zero-byte entry and
 * nothing under it, so a drop handler that reads `.files` gets an empty app and
 * no indication anything is missing. It is prefixed and non-standard and it is
 * also what every browser implements.
 *
 * The directory reader is called REPEATEDLY until it returns nothing: Chrome
 * hands back at most 100 entries per call, so a single call silently truncates
 * a folder of 120 files to 100 and the app is missing whatever sorted last.
 */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
	const items = Array.from(dt.items ?? []);
	const entries = items
		.map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null))
		.filter((e): e is FileSystemEntry => e !== null);

	if (entries.length === 0) return Array.from(dt.files ?? []);

	const out: File[] = [];

	const readFile = (entry: FileSystemFileEntry, prefix: string) =>
		new Promise<void>((resolve) => {
			entry.file(
				(f) => {
					// Re-stamp the relative path so the picker and the drop agree.
					Object.defineProperty(f, 'webkitRelativePath', {
						value: prefix + f.name,
						configurable: true
					});
					out.push(f);
					resolve();
				},
				() => resolve()
			);
		});

	const readDir = async (entry: FileSystemDirectoryEntry, prefix: string) => {
		const reader = entry.createReader();
		for (;;) {
			const batch = await new Promise<FileSystemEntry[]>((resolve) => {
				reader.readEntries(
					(e) => resolve(e),
					() => resolve([])
				);
			});
			if (batch.length === 0) break;
			for (const child of batch) await walk(child, prefix + entry.name + '/');
		}
	};

	async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
		if (entry.isFile) return readFile(entry as FileSystemFileEntry, prefix);
		if (entry.isDirectory) return readDir(entry as FileSystemDirectoryEntry, prefix);
	}

	for (const entry of entries) {
		if (entry.isFile) await readFile(entry as FileSystemFileEntry, '');
		else if (entry.isDirectory) await readDir(entry as FileSystemDirectoryEntry, '');
	}
	return out;
}

async function bytesOf(file: File): Promise<Uint8Array> {
	return new Uint8Array(await file.arrayBuffer());
}

/**
 * THE SHAPE DECISION, and it is made on what is there rather than on what the
 * student said they were doing.
 *
 * One .zip and nothing else is a zip. One HTML file and nothing else is a
 * single file. Anything else is a folder, including a folder that happens to
 * hold exactly one HTML file, because that has an entry name to honour and
 * possibly siblings to carry.
 */
function decideShape(files: Picked[]): FoundryInputShape | null {
	if (files.length === 0) return null;
	if (files.length === 1) {
		const only = files[0]!;
		const ext = extension(only.file.name);
		// A lone file with no directory component above it.
		const loose = !only.path.includes('/');
		if (ext === 'zip' && loose) return 'zip';
		if (HTML_EXTENSIONS.includes(ext) && loose) return 'single-html';
	}
	return 'folder';
}

/**
 * Normalize whatever was picked or dropped into a single zip.
 *
 * NEVER THROWS. A student who picks the wrong thing gets a sentence, in the
 * same place every other refusal appears, because "you selected a .pdf" is
 * something to read rather than an exception for a caller to translate.
 */
export async function normalizeFoundryInput(input: File[]): Promise<NormalizeResult> {
	const empty: NormalizeResult = {
		ok: false,
		shape: null,
		zip: null,
		name: '',
		notes: [],
		problem: null,
		packed: []
	};

	const picked: Picked[] = input
		.map((file) => ({ file, path: pathOf(file) }))
		.filter((p) => p.path !== '');

	if (picked.length === 0) {
		return {
			...empty,
			problem: 'Nothing was selected. Choose a zip, a folder, or a single HTML file.'
		};
	}

	const shape = decideShape(picked);

	if (shape === 'zip') {
		const only = picked[0]!;
		return {
			ok: true,
			shape,
			zip: only.file,
			name: only.file.name,
			notes: [],
			problem: null,
			packed: []
		};
	}

	if (shape === 'single-html') {
		const only = picked[0]!;
		const notes: string[] = [];
		if (lower(only.file.name) !== FOUNDRY_ENTRY_FILE) {
			notes.push(
				`Your file was named ${only.file.name}. It has been packed as ${FOUNDRY_ENTRY_FILE}, which is the name an app has to start from.`
			);
		}
		const zipBytes = await buildZip([
			{ path: FOUNDRY_ENTRY_FILE, bytes: await bytesOf(only.file) }
		]);
		return {
			ok: true,
			shape,
			zip: new Blob([zipBytes as BlobPart], { type: 'application/zip' }),
			name: `${only.file.name.replace(/\.[^.]+$/, '')}.zip`,
			notes,
			problem: null,
			packed: [FOUNDRY_ENTRY_FILE]
		};
	}

	// ------------------------------------------------------------- folder
	//
	// The noise comes out FIRST, before anything is counted or zipped: a
	// node_modules is usually most of the files and all of the bytes, and
	// counting it would produce a size refusal about work the student never
	// meant to send.
	const droppedCounts = new Map<string, number>();
	const kept: Picked[] = [];
	for (const p of picked) {
		const label = folderNoiseLabel(p.path);
		if (label) {
			droppedCounts.set(label, (droppedCounts.get(label) ?? 0) + 1);
			continue;
		}
		kept.push(p);
	}

	const notes: string[] = [];
	for (const [label, count] of droppedCounts) {
		notes.push(
			`${count} ${count === 1 ? 'file' : 'files'} from ${label} were left out. They are not part of your app.`
		);
	}

	if (kept.length === 0) {
		return {
			...empty,
			notes,
			problem:
				'That folder had nothing in it but operating system and tooling files. Pick the folder that holds your index.html.'
		};
	}

	/**
	 * THE WRAPPER IS NOT STRIPPED HERE, deliberately.
	 *
	 * A directory picker returns every path prefixed with the chosen folder's
	 * own name, which is exactly the shape `stripWrapperDirectory` exists to
	 * repair -- and it runs on the zip, on both sides, inside `planStructure`.
	 * Doing it again here would mean two implementations of one repair and two
	 * chances to disagree about when it applies. The zip carries the wrapper and
	 * the preflight reports stripping it, the same as for an uploaded zip made
	 * by right-clicking a folder.
	 */
	const entries: ZipEntry[] = [];
	let total = 0;
	for (const p of kept) {
		const bytes = await bytesOf(p.file);
		total += bytes.byteLength;
		entries.push({ path: p.path, bytes });
	}

	const zipBytes = await buildZip(entries);
	const root = kept[0]!.path.split('/')[0] ?? 'app';

	return {
		ok: true,
		shape: 'folder',
		zip: new Blob([zipBytes as BlobPart], { type: 'application/zip' }),
		name: `${root}.zip`,
		notes: [
			...notes,
			`Packed ${entries.length} ${entries.length === 1 ? 'file' : 'files'} (${formatBytes(total)}) from your folder.`
		],
		problem: null,
		packed: entries.map((e) => e.path)
	};
}
