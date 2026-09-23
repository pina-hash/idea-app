// tests/feedback-archive.test.ts
//
// THE ARCHIVE IS THE ARTIFACT A CODING SESSION IS HANDED, and the one thing it
// exists to fix is that a screenshot does not travel with the report it belongs
// to. So what is asserted here is the TREE THAT COMES OUT OF THE ZIP, read back
// with the repo's own reader, rather than the builder's intentions: every image
// present, every path in index.json resolving to a real file, no orphan images,
// and no report pointing at one that is not there.
//
// A SILENTLY MISMATCHED SCREENSHOT IS WORSE THAN NO SCREENSHOT AT ALL -- it is
// a session reading one student's picture under another student's words -- so
// the mapping is pinned by CONTENT and not only by shape: each fixture image
// carries distinct bytes, and the test asserts that the bytes under a report's
// folder are that report's own. The mutation run that proves this bites (eight
// mutants, eight killed) is recorded in this bundle's `docs/history/` entry.
//
// THE OTHER HALF IS THE TWO NEW FACETS, `kind` and has-screenshot, which are on
// `FeedbackFilter` beside the six that were there. Both fields were already on
// the row, so neither needed a migration -- which the prompt asked to be
// checked, and it holds: `app_feedback.kind` is 0053's column and
// `screenshot_path` is 0170's.

import { describe, expect, it } from 'vitest';
import {
	archiveImageName,
	buildFeedbackArchive,
	archiveReportFolder,
	feedbackArchiveName,
	feedbackArchiveRoot,
	feedbackBuildAge,
	sameCommit,
	FEEDBACK_ARCHIVE_IMAGE_BUDGET,
	type ArchiveCommit,
	type FeedbackScreenshotSource
} from '../src/lib/feedback/archive';
import {
	EMPTY_FEEDBACK_FILTER,
	facetValues,
	filterFeedback,
	feedbackMarkdown,
	FEEDBACK_SCREENSHOT_NOTE,
	type FeedbackFilter
} from '../src/lib/feedback/console';
import { inflateEntry, readCentralDirectory } from '../src/lib/foundry/zip';
import type { FeedbackRow } from '../src/lib/feedback/feedback';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function row(over: Partial<FeedbackRow>): FeedbackRow {
	return {
		id: 'r1',
		app: 'portal',
		context: '/notebook',
		kind: 'bug',
		message: 'the grid header covers the first student name when I scroll sideways',
		meta: { route: '/notebook', path: '/notebook', viewport: '375x812' },
		status: 'new',
		created_at: '2026-09-01T09:02:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'Ana Reyes',
		submitter_email: 'ana@boscotech.net',
		anonymous: false,
		contact: null,
		tried: null,
		screenshot_path: null,
		...over
	} as FeedbackRow;
}

const OWNER = '00000000-0000-4000-8000-000000000000';
const key = (n: string) => `${OWNER}/${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111.png`;

/**
 * DISTINCT BYTES PER IMAGE, and that is the whole point of this helper rather
 * than one shared buffer. A mapping bug that hands report B the bytes of report
 * A is invisible against identical fixtures -- every assertion passes and the
 * archive is wrong in exactly the way that matters most.
 */
function imageBytes(marker: number, size = 32): Uint8Array {
	const bytes = new Uint8Array(size);
	bytes.fill(marker);
	// A recognisable head, so a mis-stored entry is diagnosable by eye.
	bytes[0] = 0x89;
	bytes[1] = 0x50;
	bytes[2] = marker;
	return bytes;
}

/**
 * ONE REPORT WITH A SCREENSHOT, ONE WITHOUT, ONE ANONYMOUS, AND ONE WHOSE BUILD
 * IS A LONG WAY BEHIND -- the four the prompt names, in one set, because they
 * interact: the anonymous one is what the submitter toggle acts on and the
 * stale one is what the build-age sentence acts on.
 */
const ROWS: FeedbackRow[] = [
	row({
		id: 'has-shot',
		screenshot_path: key('a'),
		meta: {
			route: '/notebook',
			path: '/notebook',
			build: { value: 'ffffff1', source: 'git-commit', means: 'the commit' }
		}
	}),
	row({
		id: 'no-shot',
		kind: 'idea',
		message: 'it would help if the payout list remembered which section I was on',
		screenshot_path: null,
		meta: {
			route: '/coin-desk',
			build: { value: 'ffffff2', source: 'git-commit', means: 'the commit' }
		}
	}),
	row({
		id: 'anon',
		kind: 'other',
		message: 'the QR code on the handout goes nowhere',
		anonymous: true,
		contact: 'ask me in 4th period',
		submitter_name: null,
		submitter_email: null,
		screenshot_path: null,
		meta: { route: '/209h' }
	}),
	row({
		id: 'stale',
		kind: 'bug',
		message: 'sign in bounces me back to the home page',
		screenshot_path: key('b'),
		meta: {
			route: '/',
			build: { value: 'aaaaaa9', source: 'git-commit', means: 'the commit' }
		}
	})
];

/** Newest first, exactly as `virtual:site-changelog` carries it. */
const LOG: ArchiveCommit[] = [
	{ sha: 'ffffff1', date: 'Sep 22, 2026' },
	{ sha: 'ffffff2', date: 'Sep 20, 2026' },
	...Array.from({ length: 200 }, (_, i) => ({
		sha: `c${String(i).padStart(6, '0')}`,
		date: 'Jul 1, 2026'
	})),
	{ sha: 'aaaaaa9', date: 'Mar 3, 2026' }
];
const HEAD = { sha: 'ffffff1', date: 'Sep 22, 2026', complete: true };

const SHOTS: Record<string, Uint8Array> = {
	[key('a')]: imageBytes(0xa1, 40),
	[key('b')]: imageBytes(0xb2, 64)
};

const source: FeedbackScreenshotSource = async (k) =>
	SHOTS[k] ? { bytes: SHOTS[k]!, contentType: 'image/png' } : null;

const STAMP = '2026-09-22T14:05:31.000Z';

// ---------------------------------------------------------------------------
// Reading the archive back
// ---------------------------------------------------------------------------

/** The zip, unpacked with the repo's own reader. Nothing is taken on trust. */
async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
	const records = readCentralDirectory(bytes);
	expect(records, 'the archive is not a readable zip').not.toBeNull();
	const out = new Map<string, Uint8Array>();
	for (const record of records!) {
		if (record.directory) continue;
		out.set(record.name, await inflateEntry(bytes, record, record.name));
	}
	return out;
}

const text = (files: Map<string, Uint8Array>, path: string) =>
	new TextDecoder().decode(files.get(path)!);

async function buildAndUnzip(over: Parameters<typeof buildFeedbackArchive>[2] = {}) {
	const archive = await buildFeedbackArchive(ROWS, source, {
		generatedAt: STAMP,
		commitLog: LOG,
		head: HEAD,
		...over
	});
	return { archive, files: await unzip(archive.bytes) };
}

// ---------------------------------------------------------------------------

describe('the archive tree, read back out of the zip', () => {
	it('carries a README, an index and one folder per report, all under one root', async () => {
		const { archive, files } = await buildAndUnzip();
		const root = feedbackArchiveRoot(STAMP.slice(0, 19));

		expect(root).toBe('feedback-2026-09-22T14-05-31');
		expect(archive.name).toBe(feedbackArchiveName(STAMP.slice(0, 19)));
		expect(archive.name.endsWith('.zip')).toBe(true);

		// EVERY PATH IS UNDER ONE FOLDER, so unzipping cannot scatter files into
		// whatever directory somebody happened to be in.
		const paths = [...files.keys()];
		expect(paths.length).toBeGreaterThan(0);
		expect(paths.filter((p) => !p.startsWith(`${root}/`))).toEqual([]);

		expect(files.has(`${root}/README.md`)).toBe(true);
		expect(files.has(`${root}/index.json`)).toBe(true);
		for (const r of ROWS) expect(files.has(`${root}/reports/${r.id}/report.md`)).toBe(true);
		expect(archive.reports).toBe(ROWS.length);
	});

	it('resolves every path in index.json to a real file, both directions', async () => {
		const { archive, files } = await buildAndUnzip();
		const root = archive.root;
		const index = JSON.parse(text(files, `${root}/index.json`));

		// ---- index.json -> the tree -------------------------------------------
		const claimed = new Set<string>();
		for (const r of ROWS) {
			const entry = index.files[r.id];
			expect(entry, `index.json has no entry for ${r.id}`).toBeTruthy();
			expect(files.has(`${root}/${entry.report}`)).toBe(true);
			claimed.add(entry.report);
			if (entry.screenshot) {
				expect(
					files.has(`${root}/${entry.screenshot}`),
					`index.json points ${r.id} at ${entry.screenshot}, which is not in the archive`
				).toBe(true);
				claimed.add(entry.screenshot);
			}
		}

		// ---- the tree -> index.json (no orphan) --------------------------------
		const loose = [...files.keys()]
			.map((p) => p.slice(root.length + 1))
			.filter((p) => p !== 'README.md' && p !== 'index.json')
			.filter((p) => !claimed.has(p));
		expect(loose, 'files in the archive that index.json names nowhere').toEqual([]);

		// The positive control: the sweep above is only worth anything if the set
		// it swept was not empty.
		expect(claimed.size).toBe(ROWS.length + 2);
	});

	it('puts each image in its OWN report folder, checked by its bytes', async () => {
		const { archive, files } = await buildAndUnzip();
		const root = archive.root;

		expect(archive.images).toBe(2);
		expect(archive.missing).toEqual([]);

		// THE MAPPING, PINNED BY CONTENT. Distinct fixture bytes are what make a
		// swap visible: with one shared buffer every assertion here passes while
		// the archive hands a session the wrong student's picture.
		const a = files.get(`${root}/reports/has-shot/screenshot.png`);
		const b = files.get(`${root}/reports/stale/screenshot.png`);
		expect(a).toBeTruthy();
		expect(b).toBeTruthy();
		expect([...a!]).toEqual([...SHOTS[key('a')]!]);
		expect([...b!]).toEqual([...SHOTS[key('b')]!]);
		expect(a!.byteLength).toBe(40);
		expect(b!.byteLength).toBe(64);
		expect(archive.imageBytes).toBe(104);

		// AND THE REPORT BESIDE IT LINKS IT RELATIVELY, so the markdown renders
		// the image wherever the folder is unzipped to.
		const md = text(files, `${root}/reports/has-shot/report.md`);
		expect(md).toContain('![Screenshot filed with this report](./screenshot.png)');
		// The console's own sentence is REPLACED, not printed beside it: a reader
		// with the image in front of them must not be sent to a console.
		expect(md).not.toContain(FEEDBACK_SCREENSHOT_NOTE);

		// A report with no screenshot has no image and says nothing about one.
		const none = text(files, `${root}/reports/no-shot/report.md`);
		expect(none).not.toContain('screenshot');
		expect(files.has(`${root}/reports/no-shot/screenshot.png`)).toBe(false);
	});

	it('names an image that could not be read, in the report and in the index', async () => {
		// The object is gone: an ordinary state (deleted, or a deployment with no
		// bucket), and the failure this must never take is a silent absence.
		const halfSource: FeedbackScreenshotSource = async (k) =>
			k === key('a') ? { bytes: SHOTS[k]!, contentType: 'image/png' } : null;
		const archive = await buildFeedbackArchive(ROWS, halfSource, {
			generatedAt: STAMP,
			commitLog: LOG,
			head: HEAD
		});
		const files = await unzip(archive.bytes);
		const root = archive.root;

		expect(archive.images).toBe(1);
		expect(archive.missing).toEqual([{ id: 'stale', reason: 'not-retrieved' }]);

		const index = JSON.parse(text(files, `${root}/index.json`));
		expect(index.files.stale.screenshot).toBeNull();
		expect(index.files.stale.screenshotMissing).toBe('not-retrieved');
		expect(files.has(`${root}/reports/stale/screenshot.png`)).toBe(false);

		const md = text(files, `${root}/reports/stale/report.md`);
		expect(md).toContain('NOT in this archive');
		expect(md).toContain('could not be read back from storage');

		const readme = text(files, `${root}/README.md`);
		expect(readme).toContain('Screenshots that are not here');
		expect(readme).toContain('could not be read back from storage');
	});

	it('survives a source that THROWS, because one bad object is not the batch', async () => {
		const angry: FeedbackScreenshotSource = async (k) => {
			if (k === key('b')) throw new Error('network went away');
			return { bytes: SHOTS[k]!, contentType: 'image/png' };
		};
		const archive = await buildFeedbackArchive(ROWS, angry, { generatedAt: STAMP });
		const files = await unzip(archive.bytes);
		expect(archive.reports).toBe(4);
		expect(archive.images).toBe(1);
		expect(archive.missing).toEqual([{ id: 'stale', reason: 'not-retrieved' }]);
		// The other three reports are all still there.
		for (const r of ROWS) expect(files.has(`${archive.root}/reports/${r.id}/report.md`)).toBe(true);
	});
});

describe('the image budget', () => {
	it('leaves images out rather than building something a tab cannot hold, and NAMES them', async () => {
		// A budget that admits the first image and not the second, which is the
		// only shape that distinguishes "stops adding" from "adds nothing".
		const archive = await buildFeedbackArchive(ROWS, source, {
			generatedAt: STAMP,
			imageBudget: 50
		});
		const files = await unzip(archive.bytes);
		const root = archive.root;

		expect(archive.images).toBe(1);
		expect(archive.imageBytes).toBe(40);
		expect(archive.missing).toEqual([{ id: 'stale', reason: 'over-budget' }]);

		// THE MAPPING IS STILL EXACT: nothing points at a file that is not there.
		const index = JSON.parse(text(files, `${root}/index.json`));
		expect(index.files['has-shot'].screenshot).toBe('reports/has-shot/screenshot.png');
		expect(index.files.stale.screenshot).toBeNull();
		expect(index.files.stale.screenshotMissing).toBe('over-budget');
		expect(files.has(`${root}/reports/stale/screenshot.png`)).toBe(false);

		expect(text(files, `${root}/reports/stale/report.md`)).toContain('over the archive size cap');
		expect(text(files, `${root}/README.md`)).toContain('did not fit');
		// Every report is still in the archive; only the bytes were dropped.
		expect(archive.reports).toBe(4);
	});

	it('states the cap in bytes in index.json, so the number is readable rather than inferred', async () => {
		const { archive, files } = await buildAndUnzip();
		const index = JSON.parse(text(files, `${archive.root}/index.json`));
		expect(index.archive.imageBudgetBytes).toBe(FEEDBACK_ARCHIVE_IMAGE_BUDGET);
		expect(FEEDBACK_ARCHIVE_IMAGE_BUDGET).toBe(64 * 1024 * 1024);
	});
});

describe('the submitter toggle', () => {
	it('carries names in both the index and every report when it is on, and says so', async () => {
		const { archive, files } = await buildAndUnzip({ includeSubmitter: true });
		const root = archive.root;
		const index = JSON.parse(text(files, `${root}/index.json`));

		expect(index.submitterIdentity).toBe('included');
		expect(index.reports.find((r: FeedbackRow) => r.id === 'has-shot').submitter_name).toBe(
			'Ana Reyes'
		);
		expect(index.reports.find((r: FeedbackRow) => r.id === 'anon').contact).toBe(
			'ask me in 4th period'
		);
		expect(text(files, `${root}/reports/has-shot/report.md`)).toContain('Ana Reyes');
		expect(text(files, `${root}/reports/anon/report.md`)).toContain('ask me in 4th period');

		// THE ARCHIVE SAYS ON ITS FACE WHICH WAY THIS WAS SET.
		expect(text(files, `${root}/README.md`)).toContain('Submitter identity: INCLUDED');
	});

	it('withholds every name, address and contact when it is off, and says so', async () => {
		const { archive, files } = await buildAndUnzip({ includeSubmitter: false });
		const root = archive.root;
		const index = JSON.parse(text(files, `${root}/index.json`));

		expect(index.submitterIdentity).toBe('withheld');
		for (const r of index.reports) {
			expect(r.submitter_name).toBeNull();
			expect(r.submitter_email).toBeNull();
			expect(r.contact).toBeNull();
		}

		// SWEPT OVER THE WHOLE ARCHIVE, not only over index.json: the per-report
		// markdown is a second place a name can reach, and a toggle that cleaned
		// one file and not the other is the failure worth catching.
		const whole = [...files.entries()]
			.map(([path, bytes]) => `${path}\n${new TextDecoder().decode(bytes)}`)
			.join('\n');
		expect(whole).not.toContain('Ana Reyes');
		expect(whole).not.toContain('ana@boscotech.net');
		expect(whole).not.toContain('ask me in 4th period');

		// THE POSITIVE CONTROL, in the same reading: the sweep above finds all
		// three of those strings when the toggle is ON, so a clean result here is
		// the toggle working rather than the sweep looking at nothing.
		const on = await buildAndUnzip({ includeSubmitter: true });
		const wholeOn = [...on.files.entries()]
			.map(([path, bytes]) => `${path}\n${new TextDecoder().decode(bytes)}`)
			.join('\n');
		expect(wholeOn).toContain('Ana Reyes');
		expect(wholeOn).toContain('ana@boscotech.net');
		expect(wholeOn).toContain('ask me in 4th period');

		expect(text(files, `${root}/README.md`)).toContain('Submitter identity: WITHHELD');
	});

	it('keeps the screenshot when identity is withheld -- the toggle withholds a name, not a report', async () => {
		const { archive, files } = await buildAndUnzip({ includeSubmitter: false });
		expect(archive.images).toBe(2);
		expect(files.has(`${archive.root}/reports/has-shot/screenshot.png`)).toBe(true);
	});
});

describe('how old the build a report was filed against is', () => {
	it('counts the commits since, and names what it counted to', () => {
		const sentence = feedbackBuildAge(ROWS[3]!, LOG, HEAD);
		// 'aaaaaa9' is the last record of a 203-entry log, so 202 landed after it.
		expect(sentence).toContain('filed against commit aaaaaa9 (Mar 3, 2026)');
		expect(sentence).toContain('202 commits landed since');
		// THE REFERENCE POINT IS ITS OWN SENTENCE, and this pins that: written as
		// an apposition it produced a clause a reader has to unpick ("its distance
		// from <sha> (<date>), the build this archive was exported from cannot be
		// counted"), which a real export showed before this assertion existed.
		expect(sentence).toContain(
			'This archive was exported from commit ffffff1 (Sep 22, 2026).'
		);
	});

	it('says so when the report is on the newest commit, rather than saying "0 commits"', () => {
		expect(feedbackBuildAge(ROWS[0]!, LOG, HEAD)).toContain('nothing has landed since');
	});

	it('pluralises one commit', () => {
		expect(feedbackBuildAge(ROWS[1]!, LOG, HEAD)).toContain('1 commit landed since');
	});

	// EVERY BRANCH IS A SENTENCE. An instrument's silence is never a fact about
	// what it measures: three different reasons a distance cannot be counted are
	// three different things for a session to know, and a blank line would read
	// as a fourth.
	it('says a build id is a timestamp and cannot be counted', () => {
		const r = row({
			meta: { build: { value: '1755735000000', source: 'build-id', means: 'a timestamp' } }
		});
		const s = feedbackBuildAge(r, LOG, HEAD);
		expect(s).toContain('build id 1755735000000');
		expect(s).toContain('build timestamp rather than a commit');
		expect(s).toContain('cannot be counted');
	});

	it('says when no identifier was captured at all', () => {
		const s = feedbackBuildAge(row({ meta: { route: '/' } }), LOG, HEAD);
		expect(s).toContain('no build identifier was captured');
	});

	it('says when the commit is not in the log, and gives BOTH reasons it might not be', () => {
		const r = row({ meta: { build: { value: '9999999', source: 'git-commit', means: 'c' } } });
		const s = feedbackBuildAge(r, LOG, HEAD);
		expect(s).toContain('not in this build\'s own commit log');
		// Merge commits AND a shallow clone: a reader told only one of them draws
		// the wrong conclusion about half the time.
		expect(s).toContain('omits merge commits');
		expect(s).toContain('truncated on a shallow clone');
	});

	it('answers with no head at all rather than claiming one', () => {
		const s = feedbackBuildAge(ROWS[3]!, LOG, null);
		expect(s).toContain('recorded no commit of its own');
		// And it never invents a sha to stand in for the one it does not have.
		expect(s).not.toContain('undefined');
		expect(s).not.toContain('null');
	});

	it('matches two short shas of different lengths, which is what git actually emits', () => {
		// `%h` picks its own length and it grows with the repository, so an
		// equality test would read every older report as an unknown commit -- a
		// failure that produces a plausible sentence on every row.
		expect(sameCommit('a1b2c3d', 'a1b2c3d4')).toBe(true);
		expect(sameCommit('a1b2c3d4', 'a1b2c3d')).toBe(true);
		expect(sameCommit('a1b2c3d', 'a1b2c3e')).toBe(false);
		// A floor, or a short prefix matches most of the history.
		expect(sameCommit('a1b2c3', 'a1b2c3d')).toBe(false);
		expect(sameCommit('', 'a1b2c3d')).toBe(false);
	});

	it('reaches every report in the archive, including the ones with nothing to say', async () => {
		const { archive, files } = await buildAndUnzip();
		for (const r of ROWS) {
			expect(text(files, `${archive.root}/reports/${r.id}/report.md`)).toContain('build age:');
		}
	});
});

describe('the paths the archive writes cannot escape their own folder', () => {
	it('keeps a uuid id exactly as it is, which is every real row', () => {
		expect(archiveReportFolder('0f8b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d')).toBe(
			'0f8b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d'
		);
	});

	it('cannot produce a separator, a climb, or an empty name', () => {
		// Not a value `app_feedback.id` can hold -- it is a uuid column. This is
		// here because the artifact's whole purpose is that somebody UNZIPS it,
		// and a path assembled from a row is the shape that becomes a zip-slip
		// the day the id stops being a uuid.
		expect(archiveReportFolder('../../etc/passwd')).not.toContain('/');
		expect(archiveReportFolder('../../etc/passwd')).not.toContain('..');
		expect(archiveReportFolder('a/b')).toBe('a-b');
		expect(archiveReportFolder('../../etc/passwd')).toBe('etc-passwd');
		expect(archiveReportFolder('..')).toBe('report');
		expect(archiveReportFolder('.')).toBe('report');
		expect(archiveReportFolder('....')).toBe('report');
		expect(archiveReportFolder('')).toBe('report');
	});

	it('writes every entry under one root, even with no clock to name it', async () => {
		const archive = await buildFeedbackArchive(ROWS, source, {});
		const files = await unzip(archive.bytes);
		// A caller with no stamp gets a named folder, not a bare trailing dash.
		expect(archive.root).toBe('feedback-archive');
		expect([...files.keys()].filter((p) => !p.startsWith('feedback-archive/'))).toEqual([]);
	});
});

describe('the image filename', () => {
	it('comes from the stored type, then the key, then png', () => {
		expect(archiveImageName('image/png', 'x/y.png')).toBe('screenshot.png');
		expect(archiveImageName('image/jpeg', 'x/y.jpg')).toBe('screenshot.jpg');
		expect(archiveImageName('image/webp', 'x/y.webp')).toBe('screenshot.webp');
		// The type wins over the key, because the store knows what the bytes are.
		expect(archiveImageName('image/webp', 'x/y.png')).toBe('screenshot.webp');
		// A charset parameter is ordinary and must not defeat the lookup.
		expect(archiveImageName('image/jpeg; charset=binary', 'x/y.png')).toBe('screenshot.jpg');
		// No type, or a generic one: the key's own extension.
		expect(archiveImageName(null, 'x/y.webp')).toBe('screenshot.webp');
		expect(archiveImageName('application/octet-stream', 'x/y.jpg')).toBe('screenshot.jpg');
		// Neither: a file with a wrong extension opens, a file with no name does not.
		expect(archiveImageName(null, 'x/y')).toBe('screenshot.png');
	});

	it('uses the name index.json gives, whatever the type is', async () => {
		const webp: FeedbackScreenshotSource = async (k) =>
			SHOTS[k] ? { bytes: SHOTS[k]!, contentType: 'image/webp' } : null;
		const archive = await buildFeedbackArchive(ROWS, webp, { generatedAt: STAMP });
		const files = await unzip(archive.bytes);
		const index = JSON.parse(text(files, `${archive.root}/index.json`));
		expect(index.files['has-shot'].screenshot).toBe('reports/has-shot/screenshot.webp');
		expect(files.has(`${archive.root}/reports/has-shot/screenshot.webp`)).toBe(true);
		expect(text(files, `${archive.root}/reports/has-shot/report.md`)).toContain(
			'](./screenshot.webp)'
		);
	});
});

describe('README.md says what the archive is and nothing about process', () => {
	it('names what is in it and what the fields mean', async () => {
		const { archive, files } = await buildAndUnzip();
		const readme = text(files, `${archive.root}/README.md`);
		expect(readme).toContain('index.json');
		expect(readme).toContain('reports/<report id>/report.md');
		expect(readme).toContain('build age');
		expect(readme).toContain('4 reports');
		expect(readme).toContain('2 screenshots');
	});

	it('does not restate CLAUDE.md, the standards, or how to work', async () => {
		// The rule this pins: anything about PROCESS here goes stale and then
		// contradicts a document that is kept current. The session already has
		// all of it.
		const { archive, files } = await buildAndUnzip();
		const readme = text(files, `${archive.root}/README.md`).toLowerCase();
		for (const forbidden of [
			'claude.md',
			'branch',
			'commit your',
			'npm test',
			'svelte-check',
			'pull request',
			'migration',
			'ledger',
			'you should',
			'your task'
		]) {
			expect(readme, `README.md mentions "${forbidden}", which is process`).not.toContain(
				forbidden
			);
		}
	});
});

// ---------------------------------------------------------------------------
// The two new facets
// ---------------------------------------------------------------------------

describe('the kind and screenshot facets', () => {
	const f = (over: Partial<FeedbackFilter>): FeedbackFilter => ({
		...EMPTY_FEEDBACK_FILTER,
		...over
	});

	it('are on the empty filter, so nothing has to remember to initialise them', () => {
		expect(EMPTY_FEEDBACK_FILTER.kind).toBe('');
		expect(EMPTY_FEEDBACK_FILTER.shot).toBe('');
		// And the empty filter admits everything, which is what '' means here.
		expect(filterFeedback(ROWS, EMPTY_FEEDBACK_FILTER)).toHaveLength(ROWS.length);
	});

	it('filters by kind, with a positive control beside the exclusion', () => {
		expect(filterFeedback(ROWS, f({ kind: 'bug' })).map((r) => r.id)).toEqual([
			'has-shot',
			'stale'
		]);
		expect(filterFeedback(ROWS, f({ kind: 'idea' })).map((r) => r.id)).toEqual(['no-shot']);
		expect(filterFeedback(ROWS, f({ kind: 'other' })).map((r) => r.id)).toEqual(['anon']);
		// A kind nothing carries finds nothing, rather than everything.
		expect(filterFeedback(ROWS, f({ kind: 'praise' }))).toEqual([]);
	});

	it('filters both ways on having a screenshot, and the two partition the set', () => {
		const withShot = filterFeedback(ROWS, f({ shot: 'with' }));
		const without = filterFeedback(ROWS, f({ shot: 'without' }));
		expect(withShot.map((r) => r.id)).toEqual(['has-shot', 'stale']);
		expect(without.map((r) => r.id)).toEqual(['no-shot', 'anon']);
		expect(withShot.length + without.length).toBe(ROWS.length);
	});

	it('reads an empty-string key as no screenshot, the way rowScreenshotPath does', () => {
		// The one predicate, so "has a screenshot" cannot mean one thing in the
		// filter and another in the export.
		const blank = [row({ id: 'blank', screenshot_path: '   ' })];
		expect(filterFeedback(blank, f({ shot: 'with' }))).toEqual([]);
		expect(filterFeedback(blank, f({ shot: 'without' }))).toHaveLength(1);
	});

	it('composes with the six that were already there', () => {
		const both = filterFeedback(ROWS, f({ kind: 'bug', shot: 'with', route: 'notebook' }));
		expect(both.map((r) => r.id)).toEqual(['has-shot']);
	});

	it('appears in facetValues, which is what builds the picker', () => {
		// The kinds come off the ROWS, never off a list typed out in the console:
		// `app_feedback.kind` is text, this queue reads every app, and a kind a
		// producer invents reaches it before anything is recompiled.
		expect(facetValues(ROWS, (r) => (r.kind ?? '').trim() || null)).toEqual([
			'bug',
			'idea',
			'other'
		]);
	});

	it('is named in the exported markdown header, so a bundle says what it is a bundle of', () => {
		const withKind = feedbackMarkdown(ROWS, { filter: f({ kind: 'bug' }) });
		expect(withKind.text).toContain('kind: bug');
		expect(feedbackMarkdown(ROWS, { filter: f({ shot: 'with' }) }).text).toContain(
			'with a screenshot'
		);
		expect(feedbackMarkdown(ROWS, { filter: f({ shot: 'without' }) }).text).toContain(
			'without a screenshot'
		);
		// And an unset facet is absent rather than printed as empty.
		expect(feedbackMarkdown(ROWS, { filter: EMPTY_FEEDBACK_FILTER }).text).not.toContain('kind:');
	});
});

// ---------------------------------------------------------------------------
// The two existing exports are untouched
// ---------------------------------------------------------------------------

describe('the markdown and JSON downloads are exactly what they were', () => {
	it('prints the console sentence for a screenshot when no override is handed in', () => {
		const md = feedbackMarkdown([ROWS[0]!]).text;
		expect(md).toContain(FEEDBACK_SCREENSHOT_NOTE);
		expect(md).not.toContain('](./screenshot');
	});

	it('prints no build-age line when no resolver is handed in', () => {
		expect(feedbackMarkdown(ROWS).text).not.toContain('build age:');
		// The positive control: the line DOES appear when one is.
		expect(feedbackMarkdown(ROWS, { buildAge: () => 'a sentence' }).text).toContain(
			'build age: a sentence'
		);
	});
});
