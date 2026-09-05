// tests/feedback-tried-and-screenshot.test.ts
//
// THE CLIENT HALF OF 0170: what may be attached, where the answer lands, and
// what the triage queue does with either.
//
// WHAT IS ASSERTED HERE IS THE SET OF THINGS THAT FAIL SILENTLY:
//
//   1. THE THREE STATEMENTS OF ONE TYPE LIST. The bucket's
//      `allowed_mime_types`, the row CHECK's extension alternation and the
//      client's own sniffer are three spellings of "PNG, JPEG or WebP" in three
//      languages, and nothing type-checks one against another. A list that
//      drifted would refuse a legitimate screenshot at the far end of an upload,
//      or -- the direction that matters -- declare a type the bucket happens to
//      admit for bytes that are something else.
//   2. THE SNIFFER IS THE ONLY THING BETWEEN AN SVG AND A DECLARED TYPE.
//      Storage checks the DECLARED type and does not read bytes (0168's own
//      caveat), so if this returned a type for a document the upload would carry
//      a truthful-looking `image/png` for markup. It has to say no, and a test
//      that only fed it valid images would never notice.
//   3. WHERE `tried` LANDS. Two write paths and two backend states put the same
//      sentence in one of two places, and `rowTried` is what makes the queue
//      show it either way. A console reading only the column shows nothing for
//      every row filed through the anonymous route before an apply, and shows it
//      by rendering NOTHING, which nobody investigates.
//   4. IT MUST NOT PRINT TWICE. The console's generic `meta` pass prints every
//      key no named accessor claims; `tried` is now claimed, and a set that
//      forgot it would put the same paragraph on the card twice.
//   5. IT IS UNTRUSTED TEXT ON AN ADMIN SCREEN, exactly as the message is, and
//      it arrives through the same anonymous route anybody can reach.
//
// The render assertions use `svelte/server`'s `render()` on the REAL shipped
// component, and the escaping one is counted the way
// tests/feedback-untrusted-render.test.ts counts it: two whole documents
// compared, with the instrument proven against the raw fixture first.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FeedbackConsole from '../src/lib/classroom/FeedbackConsole.svelte';
import {
	FEEDBACK_TRIED_MAX,
	feedbackTriedIssue,
	type FeedbackRow
} from '../src/lib/feedback/feedback';
import {
	FEEDBACK_MEDIA_BUCKET,
	FEEDBACK_SCREENSHOT_KEY_PATTERN,
	FEEDBACK_SCREENSHOT_MAX_BYTES,
	FEEDBACK_SCREENSHOT_TYPES,
	feedbackScreenshotIssue,
	feedbackScreenshotKey,
	formatScreenshotBytes,
	sniffImageType,
	type FeedbackScreenshotType
} from '../src/lib/feedback/screenshot';
import { feedbackJson, feedbackMarkdown, rowScreenshotPath, rowTried } from '../src/lib/feedback/console';

const ROOT = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = read('supabase/migrations/0170_feedback_tried_and_screenshot.sql');

// ---------------------------------------------------------------------------
// 1. Three statements of one list
// ---------------------------------------------------------------------------

describe('the type list is the same list in all three places', () => {
	it('the client sniffer and the bucket admit exactly the same three types', () => {
		const client = Object.keys(FEEDBACK_SCREENSHOT_TYPES).sort();
		// READ OUT OF THE MIGRATION rather than retyped: a list typed twice is a
		// list that agrees with itself and with nothing else.
		const bucketArray = MIGRATION.match(
			/insert into storage\.buckets[\s\S]*?array\[([^\]]*)\]/
		)?.[1];
		expect(bucketArray).toBeTruthy();
		const bucket = [...(bucketArray ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
		expect(bucket).toEqual(client);
		expect(client).toEqual(['image/jpeg', 'image/png', 'image/webp']);
	});

	it('the row CHECK admits exactly the extensions the client produces', () => {
		const exts = Object.values(FEEDBACK_SCREENSHOT_TYPES).sort();
		expect(exts).toEqual(['jpg', 'png', 'webp']);
		// The CHECK's own alternation, twice (the signed-in branch and the anon
		// branch), read from the file.
		const alternations = [...MIGRATION.matchAll(/\\\.\(([a-z|]+)\)\$/g)].map((m) => m[1]);
		expect(alternations.length).toBeGreaterThanOrEqual(2);
		for (const alt of alternations) {
			expect(alt.split('|').sort()).toEqual(exts);
		}
	});

	it('names the same bucket and the same size cap as the migration', () => {
		expect(MIGRATION).toContain(`'${FEEDBACK_MEDIA_BUCKET}'`);
		expect(MIGRATION).toContain(String(FEEDBACK_SCREENSHOT_MAX_BYTES));
		expect(FEEDBACK_SCREENSHOT_MAX_BYTES).toBe(8388608);
	});

	it('states the same tried cap as the migration, in both of its spellings', () => {
		expect(FEEDBACK_TRIED_MAX).toBe(1000);
		expect(MIGRATION).toMatch(/between 1 and 1000/);
		expect(MIGRATION).toMatch(/_app_feedback_tried_max[\s\S]{0,120}select 1000/);
	});

	it('never admits SVG anywhere, in any of the three', () => {
		expect(Object.keys(FEEDBACK_SCREENSHOT_TYPES)).not.toContain('image/svg+xml');
		// Every `array[...]` the migration hands to a bucket.
		for (const m of MIGRATION.matchAll(/allowed_mime_types = array\[([^\]]*)\]/g)) {
			expect(m[1]).not.toMatch(/svg/i);
			// And the wildcard, which is what admits svg+xml in the first place.
			expect(m[1]).not.toMatch(/\*/);
		}
		expect(FEEDBACK_SCREENSHOT_KEY_PATTERN.test('u/x.svg')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 2. The sniffer
// ---------------------------------------------------------------------------

/** A real leading signature for each format, plus enough bytes to be read. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const WEBP = new Uint8Array([
	0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50
]);

function bytesOf(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

describe('the sniffer reads bytes, not names and not File.type', () => {
	it('recognises each of the three', () => {
		expect(sniffImageType(PNG)).toBe('image/png');
		expect(sniffImageType(JPEG)).toBe('image/jpeg');
		expect(sniffImageType(WEBP)).toBe('image/webp');
	});

	it('refuses an SVG however it is dressed up', () => {
		// THE CASE THIS EXISTS FOR. An SVG named `.png`, declared `image/png` by
		// whatever produced it, would be accepted by the bucket -- Storage checks
		// the DECLARED type and never the bytes. The sniffer is the only thing in
		// the chain that reads what the file actually is.
		expect(sniffImageType(bytesOf('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
		expect(sniffImageType(bytesOf('<?xml version="1.0"?><svg></svg>'))).toBeNull();
	});

	it('refuses the near misses, each for its own reason', () => {
		// A RIFF container that is NOT a WebP: `RIFF` alone is a .wav as well, so
		// the form type at bytes 8..11 is what has to be tested. A sniffer that
		// stopped at `RIFF` would declare a sound file an image.
		const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
		expect(sniffImageType(wav)).toBeNull();
		// A GIF, a PDF, a HEIC and plain text: all real files, none of them one of
		// the three.
		expect(sniffImageType(bytesOf('GIF89a...'))).toBeNull();
		expect(sniffImageType(bytesOf('%PDF-1.7'))).toBeNull();
		expect(
			sniffImageType(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))
		).toBeNull();
		expect(sniffImageType(bytesOf('just some words'))).toBeNull();
	});

	it('refuses a truncated header rather than guessing', () => {
		expect(sniffImageType(PNG.slice(0, 4))).toBeNull();
		expect(sniffImageType(new Uint8Array([]))).toBeNull();
		// The JPEG marker is only three bytes, so three is genuinely enough for
		// that one -- asserted so a future "require 12 bytes" tidy-up cannot
		// silently start refusing valid JPEGs.
		expect(sniffImageType(JPEG.slice(0, 3))).toBe('image/jpeg');
	});
});

describe('the refusals state the limit as well as the problem', () => {
	it('names the size AND the cap', () => {
		const issue = feedbackScreenshotIssue({ size: 12 * 1024 * 1024 }, 'image/png');
		expect(issue).toContain('12.0 MB');
		expect(issue).toContain(formatScreenshotBytes(FEEDBACK_SCREENSHOT_MAX_BYTES));
		// "Too large" with no number is a guessing game; and retrying cannot help,
		// which the sentence has to say or the person presses it again.
		expect(issue).toMatch(/retrying will\s+change that|Nothing about retrying/);
	});

	it('accepts the boundary itself, so the cap is the cap and not one less', () => {
		expect(feedbackScreenshotIssue({ size: FEEDBACK_SCREENSHOT_MAX_BYTES }, 'image/png')).toBeNull();
		expect(feedbackScreenshotIssue({ size: FEEDBACK_SCREENSHOT_MAX_BYTES + 1 }, 'image/png')).toBeTruthy();
	});

	it('names what IS accepted when the type is wrong, and says why not SVG', () => {
		const issue = feedbackScreenshotIssue({ size: 2048 }, null);
		expect(issue).toContain('PNG, JPEG or WebP');
		expect(issue).toMatch(/SVG/);
		expect(issue).toMatch(/HEIC/);
	});

	it('refuses an empty file, which is what a cancelled screenshot tool leaves', () => {
		expect(feedbackScreenshotIssue({ size: 0 }, 'image/png')).toMatch(/empty/i);
	});
});

describe('the object key', () => {
	const uid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
	const uuid = '11111111-2222-4333-8444-555555555555';

	it('produces a key the migration CHECK admits, for every type', () => {
		for (const type of Object.keys(FEEDBACK_SCREENSHOT_TYPES) as FeedbackScreenshotType[]) {
			const key = feedbackScreenshotKey(uid, uuid, type);
			expect({ type, ok: FEEDBACK_SCREENSHOT_KEY_PATTERN.test(key) }).toEqual({ type, ok: true });
			expect(key.startsWith(`${uid}/`)).toBe(true);
		}
	});

	it('carries nothing a person typed', () => {
		// The filename never reaches the key, which takes sanitization off the
		// security surface rather than making it careful.
		const key = feedbackScreenshotKey(uid, uuid, 'image/png');
		expect(key).toBe(`${uid}/${uuid}.png`);
		expect(key).not.toMatch(/\s/);
	});
});

describe('the tried validator', () => {
	it('treats empty as fine and only bounds the length', () => {
		expect(feedbackTriedIssue(null)).toBeNull();
		expect(feedbackTriedIssue('')).toBeNull();
		expect(feedbackTriedIssue('   ')).toBeNull();
		expect(feedbackTriedIssue('x'.repeat(FEEDBACK_TRIED_MAX))).toBeNull();
		expect(feedbackTriedIssue('x'.repeat(FEEDBACK_TRIED_MAX + 1))).toContain(
			String(FEEDBACK_TRIED_MAX)
		);
	});
});

// ---------------------------------------------------------------------------
// 3-5. The queue
// ---------------------------------------------------------------------------

function row(over: Partial<FeedbackRow>): FeedbackRow {
	return {
		id: 'r1',
		app: 'portal',
		context: '/notebook',
		kind: 'bug',
		message: 'The plate switch does nothing on my phone.',
		meta: { route: '/notebook', path: '/notebook' },
		status: 'new',
		created_at: '2026-08-31T09:02:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: null,
		submitter_email: null,
		anonymous: true,
		contact: null,
		...over
	} as FeedbackRow;
}

function renderConsole(rows: FeedbackRow[], screenshotUrls: Record<string, string> = {}): string {
	return render(FeedbackConsole, {
		props: {
			ready: true,
			rows,
			screenshotUrls,
			setStatus: async () => ({ ok: true }),
			now: () => Date.parse('2026-08-31T10:00:00.000Z')
		}
	}).body;
}

function countElements(html: string): number {
	return (html.match(/<\s*[a-zA-Z][^>]*>/g) ?? []).length;
}

describe('where tried is read from', () => {
	it('prefers 0170s column', () => {
		expect(rowTried(row({ tried: 'from the column' }))).toBe('from the column');
	});

	it('falls back to meta.tried, which is what both paths write before an apply', () => {
		// A row filed through the anonymous route against a backend that has not
		// had 0170 applied, and a row filed by the signed-in ladder's narrow rung,
		// both look like this. A console reading only the column renders nothing
		// for them, which is invisible.
		expect(rowTried(row({ meta: { route: '/', tried: 'from the blob' } }))).toBe('from the blob');
	});

	it('is null when neither carries one, and empty is null rather than an empty line', () => {
		expect(rowTried(row({}))).toBeNull();
		expect(rowTried(row({ tried: '   ' }))).toBeNull();
		expect(rowTried(row({ tried: '   ', meta: { tried: '  ' } }))).toBeNull();
	});

	it('prefers the column when a row somehow carries both', () => {
		expect(rowTried(row({ tried: 'column', meta: { tried: 'blob' } }))).toBe('column');
	});

	it('reads the screenshot key and never invents one', () => {
		expect(rowScreenshotPath(row({ screenshot_path: 'u/x.png' }))).toBe('u/x.png');
		expect(rowScreenshotPath(row({}))).toBeNull();
		expect(rowScreenshotPath(row({ screenshot_path: '  ' }))).toBeNull();
	});
});

describe('the console renders both, once', () => {
	it('shows the tried text from the column', () => {
		const html = renderConsole([row({ tried: 'Reloaded twice, then tried a different browser.' })]);
		expect(html).toContain('Reloaded twice, then tried a different browser.');
		expect(html).toContain('Tried first');
	});

	it('shows it from meta too, and NOT twice', () => {
		// THE DOUBLE-PRINT. The generic meta pass prints every key no named
		// accessor claims. `tried` is claimed now, so a set that forgot it would
		// put the same paragraph on the card twice -- which looks like a rendering
		// bug and is actually a set that fell out of step with its own reader.
		const html = renderConsole([row({ meta: { route: '/', tried: 'Asked a classmate to try it.' } })]);
		const hits = html.split('Asked a classmate to try it.').length - 1;
		expect(hits).toBe(1);
	});

	it('renders nothing at all for a row with neither, and that absence is measured', () => {
		const bare = renderConsole([row({})]);
		expect(bare).not.toContain('Tried first');
		expect(bare).not.toContain('Open the screenshot');

		// AN ABSENCE ASSERTION NEEDS THE OTHER HALF, or a renamed class passes it
		// forever. The SAME row with both fields renders strictly MORE elements
		// through the same component, so the bare count means "nothing was drawn"
		// rather than "this instrument draws nothing".
		const full = renderConsole([row({ tried: 'a thing I tried', screenshot_path: 'u/x.png' })], {
			'u/x.png': 'https://example-ref.supabase.co/signed/u/x.png'
		});
		expect(countElements(full)).toBeGreaterThan(countElements(bare));
		expect(full).toContain('Tried first');
	});

	it('draws a thumbnail when a signed URL was minted for the key', () => {
		const html = renderConsole([row({ screenshot_path: 'u/x.png' })], {
			'u/x.png': 'https://example-ref.supabase.co/signed/u/x.png?token=abc&download='
		});
		expect(html).toContain('Open the screenshot');
		expect(html).toContain('signed/u/x.png');
		// CONTAIN, not cover: a cropped thumbnail hides the edge of the thing
		// being reported, which is the reason the picture is there.
		expect(read('src/lib/classroom/FeedbackConsole.svelte')).toMatch(
			/\.fb-shot-thumb[\s\S]{0,200}object-fit:\s*contain/
		);
	});

	it('says so plainly when a key has no URL, rather than drawing a broken image', () => {
		const html = renderConsole([row({ screenshot_path: 'u/x.png' })], {});
		expect(html).toContain('A screenshot is attached, but no link could be made for it.');
		expect(html).not.toContain('<img');
	});
});

describe('tried is untrusted text on an admin screen', () => {
	/**
	 * The same instrument tests/feedback-untrusted-render.test.ts settled on: two
	 * WHOLE documents compared, because slicing the field out of the markup ends
	 * the slice early on exactly the payload that got out. The chrome is
	 * identical, so any difference is markup the fixture introduced.
	 */
	const HOSTILE = [
		{ name: 'script tag', text: '<script>alert("x")</script>' },
		{ name: 'image with a handler', text: '<img src=x onerror="alert(1)">' },
		{ name: 'breaks out of its own element', text: '</p><h1>promoted</h1><p>back inside' }
	];

	it('parses to real markup as a raw string, which is what makes the zeros below mean something', () => {
		// THE INSTRUMENT, PROVEN FIRST. A fixture that parsed to nothing would
		// make every zero below vacuous.
		for (const h of HOSTILE) {
			expect({ name: h.name, n: countElements(h.text) }).not.toEqual({ name: h.name, n: 0 });
		}
	});

	it('adds no elements to the document, in the column or in meta', () => {
		const benign = 'reloaded the page twice';
		for (const h of HOSTILE) {
			const control = countElements(renderConsole([row({ tried: benign })]));
			const hostile = countElements(renderConsole([row({ tried: h.text })]));
			expect({ name: h.name, delta: hostile - control }).toEqual({ name: h.name, delta: 0 });

			// The same string arriving through the OTHER place it can live.
			const metaControl = countElements(renderConsole([row({ meta: { tried: benign } })]));
			const metaHostile = countElements(renderConsole([row({ meta: { tried: h.text } })]));
			expect({ name: h.name, delta: metaHostile - metaControl }).toEqual({
				name: h.name,
				delta: 0
			});
		}
	});

	it('renders a screenshot KEY as an attribute value and never as markup', () => {
		// A key comes from the row, and a row can be written by anyone who can
		// reach the anonymous route. It is never interpolated as markup here: it
		// is only ever looked UP in the URL map, so a key nobody minted a URL for
		// reaches no attribute at all.
		const html = renderConsole([row({ screenshot_path: '"><script>alert(1)</script>' })], {});
		expect(html).not.toContain('<script>alert(1)</script>');
	});
});

describe('the exports', () => {
	const rows = [
		row({
			id: 'a',
			tried: 'Reloaded, then tried Firefox.',
			screenshot_path: 'u/x.png',
			message: 'The launcher card will not open.'
		})
	];

	it('quotes tried the way it quotes the message', () => {
		const md = feedbackMarkdown(rows, { generatedAt: '2026-08-31T10:00:00.000Z' }).text;
		expect(md).toContain('**Tried first:**');
		expect(md).toContain('> Reloaded, then tried Firefox.');
	});

	it('does not let a rule of dashes in tried promote the line above it', () => {
		// THE SETEXT HEADING. A line of nothing but dashes, after a line of prose,
		// is a heading -- so a report pasting a rule into this field would change
		// what the line above it means. `quoteMessage` is what stops that, and
		// this asserts the SECOND field goes through it too.
		const md = feedbackMarkdown(
			[row({ id: 'b', tried: 'first I did this\n-----\nthen this' })],
			{ generatedAt: '2026-08-31T10:00:00.000Z' }
		).text;
		expect(md).toContain('> \\-----');
		expect(md).not.toMatch(/^-----$/m);
	});

	it('names a screenshot rather than printing a key that resolves to nothing', () => {
		const md = feedbackMarkdown(rows, { generatedAt: '2026-08-31T10:00:00.000Z' }).text;
		expect(md).toContain('A screenshot is attached');
		// The key itself is not in the markdown: it is an address that always
		// 404s outside the console, and a reader would try it.
		expect(md).not.toContain('u/x.png');
	});

	it('keeps both fields when the identity toggle withholds names', () => {
		// THE TOGGLE WITHHOLDS IDENTITY, not the report. What somebody tried is
		// the report; a key is an opaque pointer into a private bucket that
		// resolves to nothing without a signed URL an admin has to mint.
		const json = JSON.parse(
			feedbackJson(rows, { includeSubmitter: false, generatedAt: '2026-08-31T10:00:00.000Z' })
		) as { reports: FeedbackRow[]; submitterIdentity: string };
		expect(json.submitterIdentity).toBe('withheld');
		expect(json.reports[0].tried).toBe('Reloaded, then tried Firefox.');
		expect(json.reports[0].screenshot_path).toBe('u/x.png');
		// The positive control beside it: the things it DOES withhold are gone.
		expect(json.reports[0].submitter_name).toBeNull();
		expect(json.reports[0].contact).toBeNull();
	});
});
