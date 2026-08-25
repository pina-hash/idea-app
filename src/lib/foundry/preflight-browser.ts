/**
 * THE BROWSER-SIDE PREFLIGHT. Runs before the upload starts, so a zip that is
 * going to be refused is refused in about two seconds rather than after 25 MB
 * has crossed the network and a function has run.
 *
 * IT IS UX ONLY. The server repeats every check in here and adds the ones only
 * it can make, and it is the server's answer that decides anything. Nothing
 * about this file is a boundary.
 *
 * IT IS ALSO NOT A SECOND IMPLEMENTATION. Every rule, cap, extension and
 * sentence comes from `./preflight.ts`, which the ingest function imports too;
 * this module is the browser's plumbing around it -- read a File, walk the
 * central directory, inflate the text files, hand them to the same scanners.
 * If a rule needs changing it changes in one place and both sides move.
 *
 * What it does NOT do is the incremental uncompressed cap. That is the server's
 * job because it is the server's bucket being protected, and doing it here as
 * well would mean inflating every image and font in the browser to no purpose.
 * The declared totals are checked, which is enough to catch an honest mistake
 * early; a dishonest archive is the server's problem and the server handles it.
 */

import {
	FOUNDRY_LIMITS,
	extensionOf,
	isTextExtension,
	largeAssetWarning,
	planStructure,
	scanCss,
	scanHtml,
	scanJs,
	unreadableZipMessage,
	type FoundryIssue
} from './preflight.ts';
import { makeDomHtmlReader } from './html-dom.ts';
import { inflateEntry, readCentralDirectory, type ZipRecord } from './zip.ts';

export interface BrowserPreflightResult {
	ok: boolean;
	failures: FoundryIssue[];
	warnings: FoundryIssue[];
	/** Things that were repaired or dropped, reported rather than hidden. */
	notes: string[];
	/** Bundle-relative paths, after any wrapper directory was removed. */
	files: string[];
	strippedWrapper: string | null;
	}

/** Text above this is not scanned in the browser; the server still scans it. */
const BROWSER_SCAN_MAX = 2 * 1024 * 1024;

/**
 * The whole preflight, over a File straight off an <input type="file">.
 *
 * Never throws for a bad archive: an unreadable zip is a RESULT with a sentence
 * in it, because "the file you picked is not a zip" is something the student
 * needs to read, not an exception for a caller to translate.
 */
export async function preflightZipInBrowser(file: Blob): Promise<BrowserPreflightResult> {
	const empty: BrowserPreflightResult = {
		ok: false,
		failures: [],
		warnings: [],
		notes: [],
		files: [],
		strippedWrapper: null,
	};

	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await file.arrayBuffer());
	} catch {
		return { ...empty, failures: [{ file: null, line: null, message: unreadableZipMessage() }] };
	}

	const records = readCentralDirectory(bytes);
	if (records === null) {
		return { ...empty, failures: [{ file: null, line: null, message: unreadableZipMessage() }] };
	}

	const plan = planStructure(
		records.map((r) => ({
			name: r.name,
			directory: r.directory,
			irregular: r.irregular,
			declaredSize: r.uncompressedSize
		})),
		bytes.byteLength
	);

	const failures = [...plan.failures];
	const warnings: FoundryIssue[] = [];

	// The declared total. Advisory here on purpose -- see the header.
	const declaredTotal = plan.files.reduce((sum, f) => sum + f.declaredSize, 0);
	if (declaredTotal > FOUNDRY_LIMITS.maxTotalBytes) {
		failures.push({
			file: null,
			line: null,
			message: `The files in this zip add up to more than ${(FOUNDRY_LIMITS.maxTotalBytes / (1024 * 1024)).toFixed(0)} MB once unpacked. That is over the limit, so it would be refused. Take out or compress the largest files and try again.`
		});
	}

	for (const f of plan.files) {
		if (f.declaredSize > FOUNDRY_LIMITS.warnAssetBytes) {
			warnings.push(largeAssetWarning(f.path, f.declaredSize));
		}
	}

	// Content scanning. Only worth doing when the structure held up: a zip with
	// no index.html at the root is going to be re-made anyway, and listing its
	// CDN links underneath that is noise.
	if (failures.length === 0) {
		const readHtml = makeDomHtmlReader(new DOMParser());
		const decoder = new TextDecoder('utf-8');
		for (const f of plan.files) {
			const ext = extensionOf(f.path);
			if (!isTextExtension(ext)) continue;
			if (ext === 'json' || ext === 'txt') continue;
			if (f.declaredSize > BROWSER_SCAN_MAX) continue;

			const record: ZipRecord | undefined = records[f.index];
			if (!record) continue;
			let text: string;
			try {
				text = decoder.decode(await inflateEntry(bytes, record, f.path));
			} catch {
				// The server will reach the same file and say so properly.
				continue;
			}

			if (ext === 'html') {
				const r = scanHtml(f.path, text, readHtml);
				failures.push(...r.failures);
				warnings.push(...r.warnings);
			} else if (ext === 'css') {
				failures.push(...scanCss(f.path, text).failures);
			} else if (ext === 'js') {
				const r = scanJs(f.path, text);
				failures.push(...r.failures);
				warnings.push(...r.warnings);
			}
		}
	}

	return {
		ok: failures.length === 0,
		failures,
		warnings,
		notes: plan.notes,
		files: plan.files.map((f) => f.path),
		strippedWrapper: plan.strippedWrapper
	};
}
