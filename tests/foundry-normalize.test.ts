import { describe, expect, it } from 'vitest';

import {
	filesFromDataTransfer,
	normalizeFoundryInput
} from '../src/lib/foundry/normalize.ts';
import { FOUNDRY_ENTRY_FILE, folderNoiseLabel, isOsNoise } from '../src/lib/foundry/preflight.ts';
import { inflateEntry, readCentralDirectory } from '../src/lib/foundry/zip.ts';
import { buildZip } from '../src/lib/foundry/zip-write.ts';

/**
 * THE NORMALIZER AND THE ZIP WRITER, WHICH ARE THE ONE PLACE THIS LANE ADDED A
 * NEW RULE RATHER THAN CALLING AN EXISTING ONE.
 *
 * The preflight already has its own coverage and its own module. What is new
 * here is the claim that a folder and a single HTML file can be turned into a
 * zip that the EXISTING reader -- the one `foundry-ingest` runs -- can read
 * back. That is worth a test because its failure is silent in the worst way:
 * a zip the browser preflight is happy with and the server cannot open would
 * pass every check a student sees and fail after upload, with a message about
 * a broken archive they did not make.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A File carrying a bundle-relative path, the way a directory picker does. */
function pickedFile(path: string, body: string): File {
	const name = path.slice(path.lastIndexOf('/') + 1);
	const f = new File([enc.encode(body) as BlobPart], name);
	Object.defineProperty(f, 'webkitRelativePath', { value: path, configurable: true });
	return f;
}

async function readBack(zip: Blob): Promise<Map<string, string>> {
	const bytes = new Uint8Array(await zip.arrayBuffer());
	const records = readCentralDirectory(bytes);
	expect(records).not.toBeNull();
	const out = new Map<string, string>();
	for (const r of records!) {
		if (r.directory) continue;
		out.set(r.name, dec.decode(await inflateEntry(bytes, r, r.name)));
	}
	return out;
}

describe('the zip writer round-trips through the reader the server uses', () => {
	it('reads back every entry, byte for byte', async () => {
		const files = [
			{ path: 'index.html', bytes: enc.encode('<!doctype html><title>a</title>') },
			{ path: 'nested/deep/app.js', bytes: enc.encode('const x = 1;\n'.repeat(200)) },
			{ path: 'data.json', bytes: enc.encode('{"a":1}') }
		];
		const zip = await buildZip(files);
		const back = await readBack(new Blob([zip as BlobPart]));

		expect([...back.keys()].sort()).toEqual(['data.json', 'index.html', 'nested/deep/app.js']);
		for (const f of files) {
			expect(back.get(f.path)).toBe(dec.decode(f.bytes));
		}
	});

	/**
	 * The repeated run is where deflate actually happens: a 200-line file
	 * compresses, a 7-byte one does not, and the writer picks STORED for the
	 * second. Both have to read back, which is the whole point of choosing per
	 * entry rather than globally.
	 */
	it('stores rather than deflates when deflating would grow the entry', async () => {
		const tiny = enc.encode('{"a":1}');
		const repetitive = enc.encode('const x = 1;\n'.repeat(200));
		const zip = await buildZip([
			{ path: 'tiny.json', bytes: tiny },
			{ path: 'big.js', bytes: repetitive }
		]);
		const bytes = new Uint8Array(zip);
		const records = readCentralDirectory(bytes)!;
		const byName = new Map(records.map((r) => [r.name, r]));

		// 0 is STORED, 8 is DEFLATE. The claim is that the writer chose each.
		expect(byName.get('tiny.json')!.method).toBe(0);
		expect(byName.get('big.js')!.method).toBe(8);
		expect(byName.get('big.js')!.compressedSize).toBeLessThan(repetitive.byteLength);

		const back = await readBack(new Blob([zip as BlobPart]));
		expect(back.get('tiny.json')).toBe('{"a":1}');
		expect(back.get('big.js')).toBe('const x = 1;\n'.repeat(200));
	});

	it('produces an archive with no Zip64 markers, which the reader refuses', async () => {
		const zip = await buildZip([{ path: 'a.txt', bytes: enc.encode('hello') }]);
		// The reader returns null for anything it will not touch, so a non-null
		// result IS the assertion that nothing in the archive tripped it.
		expect(readCentralDirectory(new Uint8Array(zip))).not.toBeNull();
	});
});

describe('the three input shapes', () => {
	it('passes a zip through untouched', async () => {
		const inner = await buildZip([{ path: 'index.html', bytes: enc.encode('<h1>hi</h1>') }]);
		const file = new File([inner as BlobPart], 'app.zip', { type: 'application/zip' });
		const result = await normalizeFoundryInput([file]);

		expect(result.ok).toBe(true);
		expect(result.shape).toBe('zip');
		// The SAME object, not a re-zip: re-packing an archive a student made
		// would change bytes the preflight is about to judge.
		expect(result.zip).toBe(file);
		expect(result.notes).toEqual([]);
	});

	it('packs a single HTML file as index.html and says it renamed it', async () => {
		const file = new File([enc.encode('<h1>hi</h1>') as BlobPart], 'my-page.html');
		const result = await normalizeFoundryInput([file]);

		expect(result.ok).toBe(true);
		expect(result.shape).toBe('single-html');
		expect(result.packed).toEqual([FOUNDRY_ENTRY_FILE]);
		expect(result.notes.join(' ')).toContain('my-page.html');
		expect(result.notes.join(' ')).toContain(FOUNDRY_ENTRY_FILE);

		const back = await readBack(result.zip!);
		expect([...back.keys()]).toEqual([FOUNDRY_ENTRY_FILE]);
		expect(back.get(FOUNDRY_ENTRY_FILE)).toBe('<h1>hi</h1>');
	});

	it('does not claim to have renamed a file that was already index.html', async () => {
		const file = new File([enc.encode('<h1>hi</h1>') as BlobPart], 'index.html');
		const result = await normalizeFoundryInput([file]);
		expect(result.shape).toBe('single-html');
		expect(result.notes).toEqual([]);
	});

	it('drops folder noise, reports it by category, and keeps the real files', async () => {
		const result = await normalizeFoundryInput([
			pickedFile('app/index.html', '<h1>hi</h1>'),
			pickedFile('app/style.css', 'body{}'),
			pickedFile('app/.DS_Store', 'x'),
			pickedFile('app/art/.DS_Store', 'x'),
			pickedFile('app/Thumbs.db', 'x'),
			pickedFile('app/__MACOSX/._index.html', 'x'),
			pickedFile('app/.git/config', 'x'),
			pickedFile('app/node_modules/left-pad/index.js', 'x')
		]);

		expect(result.ok).toBe(true);
		expect(result.shape).toBe('folder');
		expect(result.packed).toEqual(['app/index.html', 'app/style.css']);

		// Reported, never silent, and by category rather than as a bare count of
		// anonymous omissions.
		const notes = result.notes.join(' | ');
		expect(notes).toContain('4 files from operating system files');
		expect(notes).toContain('1 file from .git');
		expect(notes).toContain('1 file from node_modules');

		const back = await readBack(result.zip!);
		expect([...back.keys()].sort()).toEqual(['app/index.html', 'app/style.css']);
	});

	/**
	 * THE WRAPPER IS LEFT ON, and that is the assertion rather than an
	 * oversight. `stripWrapperDirectory` inside `planStructure` is the ONE
	 * implementation of that repair and it runs on both sides; normalizing it
	 * away here would be a second copy that could stop agreeing about when it
	 * applies.
	 */
	it('leaves the wrapper directory for the shared preflight to strip', async () => {
		const result = await normalizeFoundryInput([
			pickedFile('tide-clock/index.html', '<h1>hi</h1>'),
			pickedFile('tide-clock/app.js', 'let a;')
		]);
		expect(result.packed.every((p) => p.startsWith('tide-clock/'))).toBe(true);
	});

	it('refuses a folder that held nothing but noise, with a sentence', async () => {
		const result = await normalizeFoundryInput([
			pickedFile('app/.DS_Store', 'x'),
			pickedFile('app/node_modules/a/index.js', 'x')
		]);
		expect(result.ok).toBe(false);
		expect(result.zip).toBeNull();
		expect(result.problem).toContain('index.html');
	});

	it('refuses an empty selection rather than producing an empty zip', async () => {
		const result = await normalizeFoundryInput([]);
		expect(result.ok).toBe(false);
		expect(result.problem).toBeTruthy();
	});

	/**
	 * A lone `.zip` is the zip shape; a `.zip` sitting inside a picked folder is
	 * a file in that folder, and the preflight will refuse it on the extension
	 * allowlist. The discriminator is whether the path has a directory in it.
	 */
	it('treats a zip inside a picked folder as a folder member, not as the archive', async () => {
		const result = await normalizeFoundryInput([
			pickedFile('app/index.html', '<h1>hi</h1>'),
			pickedFile('app/old.zip', 'PK')
		]);
		expect(result.shape).toBe('folder');
		expect(result.packed).toContain('app/old.zip');
	});
});

describe('folder noise is a wider set than zip noise, on purpose', () => {
	it('adds .git and node_modules to what a zipper leaves behind', () => {
		// The shared predicate, unchanged, still owns the operating-system half.
		expect(isOsNoise('a/.DS_Store')).toBe(true);
		expect(isOsNoise('__MACOSX/._x')).toBe(true);
		expect(folderNoiseLabel('a/.DS_Store')).toBe('operating system files');

		// The two the folder path adds, which `isOsNoise` deliberately does NOT
		// claim -- a zip carrying node_modules is a student who zipped the wrong
		// folder, and the honest answer to that is the refusal they already get.
		expect(isOsNoise('a/.git/config')).toBe(false);
		expect(isOsNoise('a/node_modules/x/index.js')).toBe(false);
		expect(folderNoiseLabel('a/.git/config')).toBe('.git');
		expect(folderNoiseLabel('a/node_modules/x/index.js')).toBe('node_modules');

		// Positive control: an ordinary file is not noise on either path, so the
		// negatives above cannot be passing because everything returns a label.
		expect(folderNoiseLabel('app/index.html')).toBeNull();
		expect(folderNoiseLabel('app/git-log.txt')).toBeNull();
		expect(folderNoiseLabel('app/node_modules_notes.md')).toBeNull();
	});
});

describe('drag and drop', () => {
	it('falls back to the plain file list when no entries are exposed', async () => {
		// `webkitGetAsEntry` is non-standard, so the walker has to survive its
		// absence rather than returning an empty app with nothing to say.
		const file = new File([enc.encode('<h1>hi</h1>') as BlobPart], 'index.html');
		const fake = { items: [], files: [file] } as unknown as DataTransfer;
		const out = await filesFromDataTransfer(fake);
		expect(out).toEqual([file]);
	});
});
