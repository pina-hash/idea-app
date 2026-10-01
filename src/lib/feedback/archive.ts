/**
 * THE ARCHIVE: one downloadable file a coding session can be handed whole.
 *
 * WHY THIS EXISTS. Triage today is a markdown bundle pasted into a chat, and
 * then every screenshot pasted separately by hand, because the bundle does not
 * contain them -- `rowScreenshotPath` is a KEY into a private bucket and
 * resolves to nothing outside the console. So the one thing a layout report is
 * mostly made of is the one thing that does not travel with it. This builds a
 * zip in which the image sits in the same folder as the report that names it.
 *
 * FOUR PROPERTIES, AND THEY ARE THE WHOLE POINT:
 *
 *  1. AN IMAGE SITS BESIDE ITS OWN REPORT AND IS NAMED FROM `index.json`. A
 *     folder of loose screenshots somebody has to match up by guessing is the
 *     current problem with more steps. The mapping is a `files` lookup keyed by
 *     report id, so both directions are checkable: no image without a report
 *     pointing at it, no report pointing at an image that is not there.
 *  2. EVERY REPORT SAYS HOW OLD THE BUILD IT WAS FILED AGAINST IS
 *     ({@link feedbackBuildAge}). A useful fraction of any triage batch is
 *     already fixed before anyone looks, and a session that can see "filed
 *     against a commit two hundred behind this one" checks the tree before it
 *     trusts the complaint.
 *  3. `README.md` SAYS WHAT THE ARCHIVE IS AND NOTHING MORE. No process, no
 *     branching advice, no prompt: a session already has all of that from
 *     `CLAUDE.md` and the standards, and a second statement of it here is one
 *     that goes stale and then contradicts them.
 *  4. THE SUBMITTER TOGGLE STILL DECIDES, and the archive says on its face
 *     which way it was set. These are student records.
 *
 * WHAT IT DOES NOT DO: it does not replace the markdown or JSON downloads, and
 * it does not change a byte of either. `index.json` IS `feedbackJson`'s output
 * with one lookup added beside the rows, and each `report.md` IS
 * `feedbackMarkdown` over exactly one row -- so there is one implementation of
 * what a report reads like, not a second one that can drift from the bundle
 * Mr. Pina already knows how to read.
 *
 * IT IS PURE AND TAKES ITS BYTES FROM A TRANSPORT. Nothing here holds a Supabase
 * client, reads a URL or knows what a bucket is: the caller hands in
 * {@link FeedbackScreenshotSource} and the console wires it to the admin's own
 * browser client, so the storage policy stays the boundary exactly as it is for
 * the thumbnail already on screen.
 */
import { buildZip, type ZipEntry } from '$lib/foundry/zip-write';
import { FEEDBACK_SCREENSHOT_TYPES } from './screenshot';
import {
	EMPTY_FEEDBACK_FILTER,
	feedbackJson,
	feedbackMarkdown,
	rowBuild,
	rowScreenshotPath,
	type FeedbackExportOptions
} from './console';
import type { FeedbackRow } from './feedback';

/**
 * ONE SCREENSHOT'S BYTES, or null where there are none to be had.
 *
 * NULL IS A NORMAL ANSWER AND NOT AN ERROR. The object can be gone (a bucket
 * before 0170 has none at all), the mint can fail, the network can drop. Every
 * one of those produces a report with no image, which the archive states per
 * report rather than leaving as a silent absence.
 *
 * `contentType` IS WHAT THE STORE SAYS THE BYTES ARE, and may be null or the
 * generic octet-stream, which is why {@link archiveImageName} falls back to the
 * key's own extension rather than trusting it alone.
 */
export interface FeedbackScreenshotBytes {
	bytes: Uint8Array;
	contentType: string | null;
}

/** Fetch one object by its stored key. It must never throw: see {@link buildFeedbackArchive}. */
export type FeedbackScreenshotSource = (key: string) => Promise<FeedbackScreenshotBytes | null>;

/**
 * HOW MANY BYTES OF IMAGE ONE ARCHIVE CARRIES BEFORE IT STOPS ADDING THEM.
 *
 * 64 MiB, and the number is about MEMORY rather than about what a disk can
 * hold. `buildZip` buffers: every entry is compressed into memory and the whole
 * archive is concatenated into one array, so the peak resident set is the input
 * plus the output. Screenshots are PNG, JPEG and WebP, all already compressed,
 * so `buildZip` stores them rather than deflating and the output is about the
 * size of the input -- call it double this number at the peak, in a browser tab
 * that also has the console in it.
 *
 * WHAT THE CAP IS SIZED AGAINST: the bucket's own per-object ceiling is 8 MiB
 * (0170), so the worst case for the thirty-eight reports a batch actually runs
 * to is 304 MiB, which is not a thing to build in a tab. A real screenshot is
 * far smaller -- a full-screen PNG at 2560x1440 is comfortably under 4 MB and
 * most are a few hundred KB -- so this holds every image of an ordinary batch
 * and refuses only the pathological one.
 *
 * IT IS A BUDGET, NOT A FAILURE. Past it the remaining images are LEFT OUT and
 * NAMED: `index.json` carries a null path for them and a reason, the report's
 * own markdown says its image did not fit, and the README states the cap. The
 * mapping stays exact in both directions, which is the property that matters
 * more than carrying every image.
 */
export const FEEDBACK_ARCHIVE_IMAGE_BUDGET = 64 * 1024 * 1024;

/**
 * THE FILE NAME FOR ONE SCREENSHOT, "named by its real type".
 *
 * THE STORED TYPE FIRST, THE KEY'S EXTENSION SECOND, and `.png` last. The three
 * types are read from `FEEDBACK_SCREENSHOT_TYPES` -- the ONE map from a content
 * type to the extension it takes, which the uploader already uses to build the
 * key -- so a fourth type admitted by the bucket one day cannot mean one
 * extension on the way in and another on the way out.
 *
 * THE FINAL FALLBACK IS A GUESS AND IS THE RIGHT ONE ANYWAY: 0170's CHECK
 * admits only png, jpg and webp in a key, and the bucket admits only the three
 * matching types, so reaching here means a row whose key is already outside
 * what the database accepts. A file with a wrong extension opens; a file with
 * no name does not exist.
 */
export function archiveImageName(contentType: string | null, key: string): string {
	const declared = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
	const byType = (FEEDBACK_SCREENSHOT_TYPES as Record<string, string>)[declared];
	if (byType) return `screenshot.${byType}`;
	const ext = key.split('.').pop()?.toLowerCase() ?? '';
	const known = new Set<string>(Object.values(FEEDBACK_SCREENSHOT_TYPES));
	if (known.has(ext)) return `screenshot.${ext}`;
	return 'screenshot.png';
}

// ---------------------------------------------------------------------------
// How old the build a report was filed against is
// ---------------------------------------------------------------------------

/** One commit as `virtual:site-changelog` carries it: see `VersionEntry`. */
export interface ArchiveCommit {
	/** Short sha, as git's `%h` gives it. */
	sha: string;
	/** Human date, e.g. "Sep 3, 2026". */
	date: string;
}

/**
 * The build the archive itself was exported from, as `virtual:site-versions`
 * carries it (`DeployStamp`). Null where the build saw no history at all.
 */
export interface ArchiveHead {
	sha: string;
	date: string;
	/** False when the build saw a shallow or unavailable history. */
	complete: boolean;
}

/**
 * TWO SHORT SHAS ARE THE SAME COMMIT WHEN EITHER IS A PREFIX OF THE OTHER.
 *
 * `%h` PICKS ITS OWN LENGTH and it grows with the repository, so a report filed
 * six months ago can carry a 7-character sha for a commit this build spells in
 * 8. An equality test would then read every older report as an unknown commit,
 * which is the failure mode that looks exactly like working code: every row
 * gets a plausible "not in the log" sentence and nobody checks.
 *
 * SEVEN CHARACTERS IS THE FLOOR, because a prefix test with no floor makes a
 * one-character value match most of the history.
 */
const MIN_SHA = 7;

export function sameCommit(a: string, b: string): boolean {
	const x = a.trim().toLowerCase();
	const y = b.trim().toLowerCase();
	if (x.length < MIN_SHA || y.length < MIN_SHA) return false;
	return x.startsWith(y) || y.startsWith(x);
}

/**
 * HOW FAR BEHIND THIS EXPORT'S OWN BUILD THE BUILD A REPORT WAS FILED AGAINST
 * IS, in one sentence, ALWAYS.
 *
 * WHAT IT MEASURES AGAINST, SAID PRECISELY, BECAUSE IT IS NOT WHAT SOMEBODY
 * WOULD ASSUME. It is the distance to the commit THIS BUILD was built from, not
 * to `origin/main` -- a browser has no git and no way to ask a remote what its
 * head is. The two are the same thing on a deployed production build, which is
 * where this runs, and they are NOT the same on a preview or a dev server. So
 * the sentence names its reference point rather than saying "behind main", and
 * a reader is never invited to believe a distance the page could not know.
 *
 * FIVE ANSWERS, AND EVERY ONE OF THEM IS A SENTENCE. An instrument's silence is
 * never a fact about the thing it measures: "no build was captured", "this is a
 * build timestamp rather than a commit" and "that commit is not in this build's
 * log" are three different things to know, and a line that was simply absent
 * for all three would read as the fourth (nothing to report).
 *
 * THE LOG IS NEWEST-FIRST AND EXCLUDES MERGES, which is `virtual:site-changelog`'s
 * own shape (`--no-merges`, so a merge subject never becomes changelog copy).
 * That is why "not in the log" is a real and ordinary answer rather than a
 * defect: `main` advances by `--no-ff` merges, so the commit a deployment was
 * built from is routinely one this log cannot contain. The sentence says so,
 * and says the other reason too (a shallow clone truncates the log), because a
 * reader who is told only one of them will conclude the wrong thing half the
 * time.
 */
export function feedbackBuildAge(
	row: FeedbackRow,
	log: readonly ArchiveCommit[],
	head: ArchiveHead | null
): string {
	const build = rowBuild(row);
	if (!build) {
		return 'no build identifier was captured with this report, so how old it is cannot be established.';
	}
	// THE REFERENCE POINT IS ITS OWN SENTENCE AT THE END, never an apposition in
	// the middle of one. Written inline it produced "so its distance from
	// 1ec2f640 (Sep 22, 2026), the build this archive was exported from cannot
	// be counted" -- measured on a real export, and a clause a reader has to
	// unpick is one they stop reading.
	const exportedFrom = head
		? `This archive was exported from commit ${head.sha} (${head.date}).`
		: 'This archive was exported from a build that recorded no commit of its own.';

	if (build.source !== 'git-commit') {
		// A BUILD ID IS A TIMESTAMP AND SAYS SO RATHER THAN BEING DECODED HERE.
		// It is milliseconds since the epoch in practice, but nothing in the
		// contract promises that, and a date printed from a value that turns out
		// not to be one is worse than the value printed plainly.
		return `filed against build id ${build.value}, which is a build timestamp rather than a commit, so its distance cannot be counted in commits. ${exportedFrom}`;
	}

	const at = log.findIndex((c) => sameCommit(c.sha, build.value));
	if (at < 0) {
		return `filed against commit ${build.value}, which is not in this build's own commit log -- that log omits merge commits and is truncated on a shallow clone -- so its distance cannot be counted. ${exportedFrom}`;
	}
	const when = log[at]!.date;
	if (at === 0) {
		return `filed against commit ${build.value} (${when}), the newest commit in this build's log: nothing has landed since.`;
	}
	return `filed against commit ${build.value} (${when}), with ${at} commit${at === 1 ? '' : 's'} landed since. ${exportedFrom}`;
}

// ---------------------------------------------------------------------------
// The archive
// ---------------------------------------------------------------------------

/** Why a report that HAS a screenshot key has no image in the archive. */
export type MissingImageReason = 'not-retrieved' | 'over-budget';

export interface ArchiveReportFiles {
	/** Always present: the path of this report's own markdown, archive-relative. */
	report: string;
	/** The image's archive-relative path, or null. */
	screenshot: string | null;
	/** Set only where a key existed and the bytes did not reach the archive. */
	screenshotMissing?: MissingImageReason;
}

export interface FeedbackArchive {
	/** The zip. */
	bytes: Uint8Array;
	/** The download filename. */
	name: string;
	/** The single top-level folder inside it. */
	root: string;
	/** How many reports are in it. */
	reports: number;
	/** How many images made it in. */
	images: number;
	/**
	 * Reports that name a screenshot whose bytes are not here, by id and reason.
	 * NEVER SILENT: each one is stated in `index.json` and in its own report.md.
	 */
	missing: { id: string; reason: MissingImageReason }[];
	/** Total image bytes carried, for the size the caller reports. */
	imageBytes: number;
}

export interface FeedbackArchiveOptions extends FeedbackExportOptions {
	/** Newest-first commit log, from `virtual:site-changelog`. */
	commitLog?: readonly ArchiveCommit[];
	/** This build's own head, from `virtual:site-versions`. */
	head?: ArchiveHead | null;
	/** See {@link FEEDBACK_ARCHIVE_IMAGE_BUDGET}. */
	imageBudget?: number;
}

/** `feedback-2026-09-22T14-05-31`: the one folder every path inside is under. */
export function feedbackArchiveRoot(stamp: string): string {
	const safe = stamp.replace(/[^0-9A-Za-z-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
	// A caller with no clock still gets a named folder rather than a bare
	// trailing dash, which is what unzipping `feedback-/` would produce.
	return safe ? `feedback-${safe}` : 'feedback-archive';
}

/**
 * THE FOLDER NAME FOR ONE REPORT, WHICH IS ITS ID AND NOTHING ELSE CAN GET IN.
 *
 * A report id is a uuid column, so in practice it is already
 * `[0-9a-f-]` -- this is not defending against a value the database can hold.
 * It is here because the whole point of this artifact is that SOMEBODY UNZIPS
 * IT, and a path assembled from a row and written into an archive is the shape
 * that becomes a zip-slip the day the id stops being a uuid. Making it
 * impossible costs one line; noticing it later costs an extracted file outside
 * the folder somebody thought they were unpacking.
 *
 * The id itself is untouched everywhere else: it stays the KEY of the `files`
 * lookup and the `id` on the row, so nothing has to be reversed to match a
 * folder back to a report.
 */
export function archiveReportFolder(id: string): string {
	// NO DOT IS ADMITTED AT ALL, which is what makes this total rather than
	// nearly so. Allowing `.` for the sake of looking permissive left an
	// internal `..` standing (`../../etc/passwd` came out `-..-etc-passwd`), and
	// a guard that handles the leading case and not the middle one is the kind
	// that reads as done. A folder name has no use for a dot: the IMAGE's
	// extension lives in its own filename, which `archiveImageName` builds.
	const safe = id
		.replace(/[^0-9A-Za-z_-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return safe || 'report';
}

/** The download name for the archive. Matches `feedbackExportName`'s shape. */
export function feedbackArchiveName(stamp: string): string {
	return `idea-${feedbackArchiveRoot(stamp)}.zip`;
}

/**
 * THE README, AND IT IS DELIBERATELY SHORT.
 *
 * It states what is in the archive and what the fields mean, and stops. It does
 * not restate `CLAUDE.md`, does not say how to branch, test or merge, and is
 * not a prompt: a session reading this already has every one of those from a
 * source that is kept current, and a second copy here would go stale and then
 * contradict it. Anything about PROCESS that gets added to this string is a bug.
 */
export function feedbackArchiveReadme(archive: {
	reports: number;
	images: number;
	missing: { id: string; reason: MissingImageReason }[];
	includeSubmitter: boolean;
	generatedAt: string | null;
	head: ArchiveHead | null;
	imageBudget: number;
}): string {
	const lines: string[] = [
		'# IDEA feedback archive',
		'',
		`${archive.reports} report${archive.reports === 1 ? '' : 's'} from the IDEA portal's feedback queue, with ${archive.images} screenshot${archive.images === 1 ? '' : 's'}.`
	];
	if (archive.generatedAt) lines.push(`Exported ${archive.generatedAt}.`);
	if (archive.head) {
		lines.push(
			`Exported from commit ${archive.head.sha} (${archive.head.date})${archive.head.complete ? '' : ', from a truncated clone'}.`
		);
	}
	lines.push('');
	lines.push('## What is in here');
	lines.push('');
	lines.push('- `index.json` -- every report as it is stored, plus two lookups beside them:');
	lines.push('  `files`, which gives each report id the archive-relative path of its own');
	lines.push('  markdown and of its screenshot, and `sections`, which resolves every section');
	lines.push('  id the set mentions to a course and a period.');
	lines.push('- `reports/<report id>/report.md` -- one report, written out.');
	lines.push('- `reports/<report id>/screenshot.<png|jpg|webp>` -- the image that report was');
	lines.push('  filed with, where there is one. It is named from `index.json`, so no image');
	lines.push('  has to be matched to a report by guessing.');
	lines.push('');
	lines.push('## What the fields mean');
	lines.push('');
	lines.push(
		'- **build age** -- how far the build a report was filed against is behind the build'
	);
	lines.push(
		'  this archive was exported from, counted in commits. A report filed a long way back'
	);
	lines.push(
		'  may describe something already fixed. The line says when it cannot be counted, and why.'
	);
	lines.push(
		'- **route** and **path** -- where the reporter was. The path appears only when it says'
	);
	lines.push('  something the route id did not.');
	lines.push(
		'- **tried** -- what the reporter says they tried first. Prose they typed, not a fact.'
	);
	lines.push(
		'- **contact** -- on an anonymous report only, an unverified string the reporter typed.'
	);
	lines.push('  Nobody signed in to leave it and nothing checked it. It is not an identity.');
	lines.push(
		'- **error id** -- joins a report to the server log line written for the same failure.'
	);
	lines.push('');
	lines.push('## Who filed these');
	lines.push('');
	lines.push(
		archive.includeSubmitter
			? 'Submitter identity: INCLUDED. Names and addresses of signed-in reporters are in this archive, and so is the contact string of any anonymous one. These are student records.'
			: 'Submitter identity: WITHHELD. No submitter name or address is in this archive, and no contact string from an anonymous report either. A report that says it is anonymous was filed that way; a report with no name shown had one withheld at export.'
	);
	if (archive.missing.length) {
		const over = archive.missing.filter((m) => m.reason === 'over-budget').length;
		const gone = archive.missing.length - over;
		lines.push('');
		lines.push('## Screenshots that are not here');
		lines.push('');
		const one = archive.missing.length === 1;
		lines.push(
			one
				? '1 report names a screenshot whose bytes are not in this archive. It says so in its own `report.md`, and `index.json` carries the reason.'
				: `${archive.missing.length} reports name a screenshot whose bytes are not in this archive. Each one says so in its own \`report.md\`, and \`index.json\` carries the reason.`
		);
		// "1 of them" reads badly when there is only one, and "1" alone reads
		// badly when there are several. The subject is picked rather than
		// interpolated so neither sentence has to carry both cases.
		const subject = (n: number) => (one ? 'It' : `${n} of them`);
		if (over) {
			lines.push('');
			lines.push(
				`${subject(over)} did not fit: this archive carries at most ${Math.round(archive.imageBudget / (1024 * 1024))} MiB of images, so that it can be built in a browser tab. Narrowing the filter and exporting again is what gets the rest.`
			);
		}
		if (gone) {
			lines.push('');
			lines.push(
				`${subject(gone)} could not be read back from storage. The report${gone === 1 ? '' : 's'} ${gone === 1 ? 'itself is' : 'themselves are'} complete; only the image is missing.`
			);
		}
	}
	return lines.join('\n') + '\n';
}

/**
 * BUILD THE ARCHIVE.
 *
 * THE ORDER IS FETCH, THEN WRITE, AND IT IS FORCED: a report's markdown has to
 * be able to say whether its own image is in the archive, and the `files`
 * lookup has to agree with what was actually written. Deciding that first and
 * writing once is what makes "no report points at a missing image, and no image
 * is an orphan" a property of the construction rather than something to check
 * afterwards.
 *
 * A TRANSPORT THAT THROWS IS THE SAME OUTCOME AS ONE THAT ANSWERS NULL, and is
 * caught here. One unreachable object must not cost the other thirty-seven
 * reports their archive -- the classroom's "a failed file never aborts the post"
 * rule, one subsystem over.
 */
export async function buildFeedbackArchive(
	rows: FeedbackRow[],
	source: FeedbackScreenshotSource,
	options: FeedbackArchiveOptions = {}
): Promise<FeedbackArchive> {
	const stamp = options.generatedAt ?? '';
	const root = feedbackArchiveRoot(stamp.slice(0, 19));
	const includeSubmitter = options.includeSubmitter !== false;
	const budget = options.imageBudget ?? FEEDBACK_ARCHIVE_IMAGE_BUDGET;
	const log = options.commitLog ?? [];
	const head = options.head ?? null;

	// ---- 1. The bytes, decided before anything is written --------------------
	const files = new Map<string, ArchiveReportFiles>();
	const images = new Map<string, { name: string; bytes: Uint8Array }>();
	const missing: { id: string; reason: MissingImageReason }[] = [];
	let imageBytes = 0;

	for (const row of rows) {
		const folder = archiveReportFolder(row.id);
		const entry: ArchiveReportFiles = {
			report: `reports/${folder}/report.md`,
			screenshot: null
		};
		files.set(row.id, entry);
		const key = rowScreenshotPath(row);
		if (!key) continue;

		let got: FeedbackScreenshotBytes | null = null;
		try {
			got = await source(key);
		} catch {
			got = null;
		}
		if (!got || got.bytes.byteLength === 0) {
			entry.screenshotMissing = 'not-retrieved';
			missing.push({ id: row.id, reason: 'not-retrieved' });
			continue;
		}
		if (imageBytes + got.bytes.byteLength > budget) {
			entry.screenshotMissing = 'over-budget';
			missing.push({ id: row.id, reason: 'over-budget' });
			continue;
		}
		const name = archiveImageName(got.contentType, key);
		entry.screenshot = `reports/${folder}/${name}`;
		images.set(row.id, { name, bytes: got.bytes });
		imageBytes += got.bytes.byteLength;
	}

	// ---- 2. The files --------------------------------------------------------
	const encoder = new TextEncoder();
	const entries: ZipEntry[] = [];
	const text = (path: string, body: string) =>
		entries.push({ path: `${root}/${path}`, bytes: encoder.encode(body) });

	const buildAge = (row: FeedbackRow) => feedbackBuildAge(row, log, head);

	for (const row of rows) {
		const entry = files.get(row.id)!;
		// ONE REPORT THROUGH THE SAME EXPORT THE PASTEABLE BUNDLE USES, so there
		// is one implementation of what a report reads like. The budget cannot
		// bite on a single row, so `included` is always 1 and nothing is cut.
		const one = feedbackMarkdown([row], {
			filter: options.filter ?? EMPTY_FEEDBACK_FILTER,
			generatedAt: options.generatedAt,
			includeSubmitter,
			classroomSections: options.classroomSections,
			buildAge,
			// THE IMAGE IS IN THE SAME FOLDER, SO THE REPORT LINKS IT. The
			// relative name -- not the archive-relative path -- because
			// `report.md` sits beside it. And a report whose image did NOT make
			// it says which of the two reasons applies, rather than carrying the
			// console's sentence about an image the reader has no console to go
			// and look in.
			screenshotNote: () => {
				const image = images.get(row.id);
				if (image) return `![Screenshot filed with this report](./${image.name})`;
				if (entry.screenshotMissing === 'over-budget') {
					return '_A screenshot was filed with this report. It is NOT in this archive: the images went over the archive size cap. Narrow the filter and export again to get it._';
				}
				return '_A screenshot was filed with this report. It is NOT in this archive: the image could not be read back from storage. Nothing else about the report is affected._';
			}
		});
		text(entry.report, one.text);
		const image = images.get(row.id);
		if (image) entries.push({ path: `${root}/${entry.screenshot!}`, bytes: image.bytes });
	}

	// `index.json` IS `feedbackJson`'s OUTPUT WITH ONE LOOKUP ADDED BESIDE THE
	// ROWS, never spliced into one. That is the file's own convention (`sections`
	// and `buildIdentifiers` already sit there), and it is what keeps a row in
	// this archive byte-identical to the same row in the plain JSON download.
	const base = JSON.parse(
		feedbackJson(rows, {
			filter: options.filter,
			generatedAt: options.generatedAt,
			includeSubmitter,
			classroomSections: options.classroomSections
		})
	) as Record<string, unknown>;
	base.archive = {
		root,
		exportedFrom: head,
		imageBudgetBytes: budget,
		images: images.size,
		imageBytes
	};
	base.files = Object.fromEntries([...files.entries()].map(([id, f]) => [id, f]));
	text('index.json', JSON.stringify(base, null, 2) + '\n');

	text(
		'README.md',
		feedbackArchiveReadme({
			reports: rows.length,
			images: images.size,
			missing,
			includeSubmitter,
			generatedAt: options.generatedAt ?? null,
			head,
			imageBudget: budget
		})
	);

	return {
		bytes: await buildZip(entries),
		name: feedbackArchiveName(stamp.slice(0, 19)),
		root,
		reports: rows.length,
		images: images.size,
		missing,
		imageBytes
	};
}
