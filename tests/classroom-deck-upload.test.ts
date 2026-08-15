// tests/classroom-deck-upload.test.ts
//
// The browser half of a direct-to-Drive deck upload: chunk arithmetic, the
// exact headers a chunk PUT carries, and resumption driven by Drive's own
// session status query. Pure -- no fixture, no database, no browser.
//
// WHY THIS ONE IS HERE, against this repo's default of not writing tests for
// feature behaviour. A 43 MB deck uploaded from a real classroom, reached 100%,
// and then failed on the FINAL chunk with a status the browser was not allowed
// to read. Every failure in this layer has that shape: it cannot be reproduced
// locally, it reports almost nothing when it happens, and it is silent in the
// direction that matters -- an off-by-one on the inclusive end byte, a total
// that disagrees with the session, a zero-length slice, or one header too many
// all produce "the connection dropped" and nothing else.
//
// So what is asserted here is the request itself, not the outcome:
//
//   * the boundary cases that stress the LAST chunk -- an exact multiple of the
//     chunk size, one byte over it, a file smaller than one chunk -- since
//     those are where an off-by-one either appears or hides;
//   * the final chunk's Content-Range against Google's resumable specification,
//     inclusive end byte and declared total included;
//   * that a chunk PUT carries Content-Range and the SESSION'S OWN Content-Type
//     and nothing else, because a header that contradicts the session is one of
//     the few things that can be refused at finalize while every earlier chunk
//     succeeds -- and because the browser's own guess for a .zip differs by
//     platform, so taking it from the File is exactly that contradiction;
//   * that a failed chunk asks Drive where it got to and RESUMES FROM THAT
//     ANSWER, including the case that matters most -- the final chunk landed,
//     the file finalized, and the response was simply not readable.
//
// The transfer is driven through a fake DeckUploadTransport (the module's
// documented test seam), so the conversation is real even though there is no
// XMLHttpRequest in node.

import { describe, expect, it } from 'vitest';
import {
	CHUNK_BYTES,
	DeckUploadError,
	chunkContentRange,
	chunkRequestHeaders,
	nextChunk,
	parseReceived,
	planChunks,
	statusContentRange,
	statusRequestHeaders,
	uploadZipToDrive,
	type DeckChunk,
	type DeckUploadTransport
} from '../src/lib/classroom/deck-upload';

/** A File of exactly `size` bytes, with content that identifies its offset. */
function fileOf(size: number): File {
	const bytes = new Uint8Array(size);
	for (let i = 0; i < size; i++) bytes[i] = i % 251;
	return new File([bytes], 'deck.zip', { type: 'application/zip' });
}

// ---------------------------------------------------------------------------
// 1. Chunk boundary arithmetic
// ---------------------------------------------------------------------------

describe('chunk boundaries', () => {
	const K = 1024;

	it('covers a file smaller than one chunk in a single final chunk', () => {
		const plan = planChunks(500, K);
		expect(plan).toHaveLength(1);
		expect(plan[0]).toMatchObject({
			index: 0,
			start: 0,
			endExclusive: 500,
			endInclusive: 499,
			length: 500,
			isLast: true
		});
	});

	it('does not emit a trailing empty chunk for an exact multiple of the chunk size', () => {
		const plan = planChunks(4 * K, K);
		expect(plan).toHaveLength(4);
		expect(plan.every((c) => c.length === K)).toBe(true);
		// The decisive one: the LAST chunk is the fourth, and it is the last.
		expect(plan[3]).toMatchObject({ start: 3 * K, endInclusive: 4 * K - 1, isLast: true });
		expect(plan.filter((c) => c.isLast)).toHaveLength(1);
		expect(plan.some((c) => c.length === 0)).toBe(false);
	});

	it('gives a file one byte over a multiple a one-byte final chunk', () => {
		const plan = planChunks(4 * K + 1, K);
		expect(plan).toHaveLength(5);
		expect(plan[4]).toMatchObject({
			start: 4 * K,
			endExclusive: 4 * K + 1,
			endInclusive: 4 * K,
			length: 1,
			isLast: true
		});
		expect(chunkContentRange(plan[4], 4 * K + 1)).toBe(`bytes ${4 * K}-${4 * K}/${4 * K + 1}`);
	});

	it('gives a file one byte under a multiple a short final chunk', () => {
		const plan = planChunks(4 * K - 1, K);
		expect(plan).toHaveLength(4);
		expect(plan[3]).toMatchObject({ length: K - 1, endInclusive: 4 * K - 2, isLast: true });
	});

	it('covers every byte exactly once, contiguously, at every size around a boundary', () => {
		for (const total of [1, 2, K - 1, K, K + 1, 2 * K - 1, 2 * K, 2 * K + 1, 5 * K + 7]) {
			const plan = planChunks(total, K);
			expect(plan[0].start).toBe(0);
			for (let i = 1; i < plan.length; i++) {
				expect(plan[i].start).toBe(plan[i - 1].endExclusive);
			}
			expect(plan[plan.length - 1].endExclusive).toBe(total);
			expect(plan.reduce((n, c) => n + c.length, 0)).toBe(total);
			expect(plan.filter((c) => c.isLast)).toHaveLength(1);
		}
	});

	it('resumes from an offset that is not a multiple of the chunk size', () => {
		// What a real resume looks like: Drive reports an odd received count.
		const chunk = nextChunk(1500, 4 * K, 7, K)!;
		expect(chunk).toMatchObject({ index: 7, start: 1500, length: K, isLast: false });
		const last = nextChunk(4 * K - 10, 4 * K, 8, K)!;
		expect(last).toMatchObject({ length: 10, endInclusive: 4 * K - 1, isLast: true });
	});

	it('has nothing left to send once the whole file is accounted for', () => {
		expect(nextChunk(4 * K, 4 * K, 0, K)).toBeNull();
	});

	it('refuses an offset outside the file, and an empty file, rather than sending one', () => {
		expect(() => nextChunk(5, 4, 0, K)).toThrow(DeckUploadError);
		expect(() => nextChunk(0, 0, 0, K)).toThrow(/no length/i);
	});

	it('uses an 8 MiB chunk, a multiple of the 256 KiB the protocol requires', () => {
		expect(CHUNK_BYTES % (256 * 1024)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// 2. Final-chunk header construction, against the specification
// ---------------------------------------------------------------------------

describe('final-chunk request', () => {
	const total = 43_102_948; // the size of the deck that failed live

	it("declares the whole file's length and an INCLUSIVE end byte", () => {
		const plan = planChunks(total);
		const last = plan[plan.length - 1];
		expect(last.isLast).toBe(true);
		// bytes <start>-<total-1>/<total>: the end is the index of the last byte,
		// not the count, and the total is the file, not the chunk.
		expect(chunkContentRange(last, total)).toBe(`bytes ${last.start}-${total - 1}/${total}`);
		const [, end, declared] = /bytes \d+-(\d+)\/(\d+)/.exec(chunkContentRange(last, total))!;
		expect(Number(end)).toBe(total - 1);
		expect(Number(declared)).toBe(total);
		expect(Number(end) - last.start + 1).toBe(last.length);
	});

	it('carries Content-Range and a Content-Type, and NOTHING else -- no Authorization', () => {
		const last = planChunks(total).at(-1)!;
		const headers = chunkRequestHeaders(last, total, 'application/zip');
		expect(Object.keys(headers).sort()).toEqual(['content-range', 'content-type']);
		const lower = Object.keys(headers).map((k) => k.toLowerCase());
		expect(lower).not.toContain('authorization');
		expect(lower).not.toContain('x-upload-content-length');
		expect(lower).not.toContain('x-upload-content-type');
	});

	it("uses the SESSION's content type verbatim, whatever the browser called the file", () => {
		const last = planChunks(total).at(-1)!;
		// Windows Chrome types a .zip as application/x-zip-compressed; the
		// session was opened as application/zip. The chunk must carry the
		// session's, or it contradicts it at the moment Drive finalizes.
		expect(chunkRequestHeaders(last, total, 'application/zip')['content-type']).toBe(
			'application/zip'
		);
		expect(chunkRequestHeaders(last, total, 'application/octet-stream')['content-type']).toBe(
			'application/octet-stream'
		);
		// And an absent one is refused rather than guessed at.
		expect(() => chunkRequestHeaders(last, total, '')).toThrow(/content type/i);
	});

	it('declares the same total on every chunk, not just the last', () => {
		const plan = planChunks(total);
		for (const chunk of plan) {
			expect(chunkRequestHeaders(chunk, total, 'application/zip')['content-range']).toMatch(
				new RegExp(`/${total}$`)
			);
		}
	});

	it('refuses a degenerate range instead of formatting one', () => {
		const zero: DeckChunk = {
			index: 0,
			start: 5,
			endExclusive: 5,
			endInclusive: 4,
			length: 0,
			isLast: false
		};
		expect(() => chunkContentRange(zero, 10)).toThrow(/zero-length/i);

		const past: DeckChunk = {
			index: 0,
			start: 0,
			endExclusive: 11,
			endInclusive: 10,
			length: 11,
			isLast: true
		};
		expect(() => chunkContentRange(past, 10)).toThrow(/outside the file/i);

		const lying: DeckChunk = { ...planChunks(10, 4)[0], isLast: true };
		expect(() => chunkContentRange(lying, 10)).toThrow(/last one/i);
	});

	it('asks for status with a star and the whole total, and reads Range back', () => {
		expect(statusContentRange(total)).toBe(`bytes */${total}`);
		expect(Object.keys(statusRequestHeaders(total))).toEqual(['content-range']);
		// Drive's Range is inclusive, so N bytes held reads as bytes=0-(N-1).
		expect(parseReceived('bytes=0-8388607')).toBe(8 * 1024 * 1024);
		expect(parseReceived('bytes=0-0')).toBe(1);
		expect(parseReceived(null)).toBeNull();
		expect(parseReceived('')).toBeNull();
		expect(parseReceived('nonsense')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 3. The transfer: resumption driven by the session status query
// ---------------------------------------------------------------------------

interface Call {
	kind: 'put' | 'status' | 'discard';
	start?: number;
	length?: number;
	range?: string;
	headers?: Record<string, string>;
}

/**
 * A stand-in Drive that HOLDS BYTES: a chunk starting past what it holds is
 * ignored (as Google's is), the status query reports the contiguous count, and
 * the file finalizes when the last byte lands. `script` decides what fails.
 */
function fakeDrive(opts: {
	total: number;
	calls: Call[];
	/** Return a failure for this PUT, or null to let it through. */
	fail?: (chunk: DeckChunk, putIndex: number) => Error | null;
	/** Override what the status query reports. */
	status?: (held: number, statusIndex: number) => { fileId?: string; received?: number; unreadable?: boolean } | null;
	/** Report a stored size other than the total on finalize. */
	storedSize?: number;
}): DeckUploadTransport {
	let held = 0;
	let puts = 0;
	let statuses = 0;
	const total = opts.total;
	const finalize = () => ({
		fileId: 'drive-file-1',
		storedSize: opts.storedSize ?? held,
		received: total
	});
	return {
		async putChunk({ blob, chunk, contentType }) {
			const headers = chunkRequestHeaders(chunk, total, contentType);
			opts.calls.push({
				kind: 'put',
				start: chunk.start,
				length: blob.size,
				range: headers['content-range'],
				headers
			});
			const failure = opts.fail?.(chunk, puts++);
			if (failure) throw failure;
			if (chunk.start <= held) held = Math.max(held, chunk.endExclusive);
			if (held >= total) return finalize();
			return { received: held };
		},
		async queryStatus() {
			opts.calls.push({ kind: 'status' });
			// A scripted answer is Drive's real state, not a story told about it:
			// it moves `held` too, so a later chunk lands where the answer said
			// the file already was. A fake that could contradict itself would let
			// the uploader look correct against something no Drive would do.
			const scripted = opts.status?.(held, statuses++);
			if (scripted?.fileId) {
				held = total;
				return finalize();
			}
			if (scripted?.unreadable) return { received: 0, rangeUnreadable: true };
			if (scripted?.received !== undefined) {
				held = Math.max(held, scripted.received);
				return { received: held };
			}
			if (held >= total) return finalize();
			return { received: held };
		},
		discard() {
			opts.calls.push({ kind: 'discard' });
		}
	};
}

describe('resumable transfer', () => {
	const K = 1024;

	it('uploads a whole file in order and confirms the stored size', async () => {
		const calls: Call[] = [];
		const total = 4 * K + 100;
		const id = await uploadZipToDrive({
			uploadUrl: 'https://upload.example/session',
			file: fileOf(total),
			declaredSize: total,
			chunkBytes: K,
			contentType: 'application/zip',
			retryDelayMs: 0,
			transport: fakeDrive({ total, calls })
		});
		expect(id).toBe('drive-file-1');
		const puts = calls.filter((c) => c.kind === 'put');
		expect(puts).toHaveLength(5);
		expect(puts.at(-1)!.range).toBe(`bytes ${4 * K}-${total - 1}/${total}`);
		expect(calls.some((c) => c.kind === 'status')).toBe(false);
	});

	it('resumes the FINAL chunk from Drive’s own received count, not its own', async () => {
		const calls: Call[] = [];
		const total = 4 * K;
		// The live shape: every chunk lands until the last, which is refused
		// before its body is read (status 0, nothing readable).
		let failedOnce = false;
		const id = await uploadZipToDrive({
			uploadUrl: 'https://upload.example/session',
			file: fileOf(total),
			declaredSize: total,
			chunkBytes: K,
			contentType: 'application/zip',
			retryDelayMs: 0,
			transport: fakeDrive({
				total,
				calls,
				fail: (chunk) => {
					if (!chunk.isLast || failedOnce) return null;
					failedOnce = true;
					return new DeckUploadError('chunk_network', 'The connection dropped.');
				}
			})
		});
		expect(id).toBe('drive-file-1');
		// The failure was followed IMMEDIATELY by a status query, before any
		// retry -- that ordering is the fix.
		const kinds = calls.map((c) => c.kind);
		const firstStatus = kinds.indexOf('status');
		expect(firstStatus).toBeGreaterThan(-1);
		expect(kinds[firstStatus - 1]).toBe('put');
		// And the retry re-sent exactly the final chunk, from the same offset.
		const puts = calls.filter((c) => c.kind === 'put');
		expect(puts).toHaveLength(5);
		expect(puts[3].range).toBe(puts[4].range);
		expect(puts[4].range).toBe(`bytes ${3 * K}-${4 * K - 1}/${4 * K}`);
	});

	it('notices that the final chunk actually landed when its answer was unreadable', async () => {
		// The case that must not be reported as a failure: Drive finalized the
		// file and the browser could not read the 200.
		const calls: Call[] = [];
		const total = 2 * K;
		const id = await uploadZipToDrive({
			uploadUrl: 'https://upload.example/session',
			file: fileOf(total),
			declaredSize: total,
			chunkBytes: K,
			contentType: 'application/zip',
			retryDelayMs: 0,
			transport: fakeDrive({
				total,
				calls,
				fail: (chunk) =>
					chunk.isLast ? new DeckUploadError('chunk_network', 'Never answered.') : null,
				status: () => ({ fileId: 'drive-file-1' })
			})
		});
		expect(id).toBe('drive-file-1');
		// One status query answered it; nothing was re-sent.
		expect(calls.filter((c) => c.kind === 'put')).toHaveLength(2);
		expect(calls.filter((c) => c.kind === 'status')).toHaveLength(1);
	});

	it('resumes a PARTIAL upload from the offset Drive reports, skipping what it holds', async () => {
		const calls: Call[] = [];
		const total = 4 * K;
		let failed = false;
		const id = await uploadZipToDrive({
			uploadUrl: 'https://upload.example/session',
			file: fileOf(total),
			declaredSize: total,
			chunkBytes: K,
			contentType: 'application/zip',
			retryDelayMs: 0,
			transport: fakeDrive({
				total,
				calls,
				fail: (chunk) => {
					if (chunk.start !== K || failed) return null;
					failed = true;
					return new DeckUploadError('chunk_network', 'Dropped mid-chunk.');
				},
				// Drive says it received the chunk anyway (it did land, the answer
				// did not) plus a bit of the next one.
				status: (held) => ({ received: Math.max(held, 2 * K + 300) })
			})
		});
		expect(id).toBe('drive-file-1');
		const starts = calls.filter((c) => c.kind === 'put').map((c) => c.start);
		// Never re-sent byte K: it resumed from 2K+300, exactly what Drive said.
		expect(starts).toEqual([0, K, 2 * K + 300, 3 * K + 300]);
	});

	it('reports which chunk failed, its range, the total, and what Drive held', async () => {
		const calls: Call[] = [];
		const total = 4 * K;
		const err = await uploadZipToDrive({
			uploadUrl: 'https://upload.example/session',
			file: fileOf(total),
			declaredSize: total,
			chunkBytes: K,
			contentType: 'application/zip',
			retryDelayMs: 0,
			transport: fakeDrive({
				total,
				calls,
				fail: (chunk) =>
					chunk.isLast ? new DeckUploadError('chunk_network', 'Never answered.') : null
			})
		}).catch((e) => e as DeckUploadError);

		expect(err).toBeInstanceOf(DeckUploadError);
		const failure = err as DeckUploadError;
		expect(failure.code).toBe('chunk_network');
		expect(failure.detail).toMatchObject({
			chunkIndex: 3,
			chunkStart: 3 * K,
			chunkEnd: 4 * K - 1,
			chunkBytes: K,
			declaredTotal: total,
			isLastChunk: true,
			statusQuery: 'holds',
			driveReceived: 3 * K
		});
		expect(failure.message).toMatch(/final chunk/i);
		expect(failure.message).toContain(`${3 * K} of ${total} bytes`);
		// It genuinely tried, and asked Drive every time.
		expect(calls.filter((c) => c.kind === 'put')).toHaveLength(4 - 1 + 5);
		expect(calls.filter((c) => c.kind === 'status').length).toBeGreaterThanOrEqual(5);
	});

	it('says so when Drive’s progress header could not be read at all', async () => {
		const calls: Call[] = [];
		const total = 2 * K;
		const err = (await uploadZipToDrive({
			uploadUrl: 'https://upload.example/session',
			file: fileOf(total),
			declaredSize: total,
			chunkBytes: K,
			contentType: 'application/zip',
			retryDelayMs: 0,
			transport: fakeDrive({
				total,
				calls,
				fail: (chunk) =>
					chunk.isLast ? new DeckUploadError('chunk_network', 'Never answered.') : null,
				status: () => ({ unreadable: true })
			})
		}).catch((e) => e)) as DeckUploadError;

		expect(err.code).toBe('headers_blocked');
		expect(err.detail).toMatchObject({ originalCode: 'chunk_network', statusQuery: 'unreadable' });
	});

	it('fails rather than confirming a file Drive stored short', async () => {
		const total = 2 * K;
		const err = (await uploadZipToDrive({
			uploadUrl: 'https://upload.example/session',
			file: fileOf(total),
			declaredSize: total,
			chunkBytes: K,
			contentType: 'application/zip',
			retryDelayMs: 0,
			transport: fakeDrive({ total, calls: [], storedSize: total - 17 })
		}).catch((e) => e)) as DeckUploadError;

		expect(err.code).toBe('size_mismatch');
		expect(err.detail).toMatchObject({ storedSize: total - 17, total });
	});

	it('refuses to start when the file is not the length the session was opened for', async () => {
		const total = 2 * K;
		const err = (await uploadZipToDrive({
			uploadUrl: 'https://upload.example/session',
			file: fileOf(total),
			declaredSize: total + 1,
			chunkBytes: K,
			contentType: 'application/zip',
			retryDelayMs: 0,
			transport: fakeDrive({ total, calls: [] })
		}).catch((e) => e)) as DeckUploadError;

		expect(err.code).toBe('size_mismatch');
		expect(err.detail).toMatchObject({ declaredSize: total + 1, fileBytes: total });
	});

	it('cancels by aborting the transfer and asking Drive to discard the session', async () => {
		const calls: Call[] = [];
		const total = 4 * K;
		const controller = new AbortController();
		const err = (await uploadZipToDrive({
			uploadUrl: 'https://upload.example/session',
			file: fileOf(total),
			declaredSize: total,
			chunkBytes: K,
			contentType: 'application/zip',
			retryDelayMs: 0,
			signal: controller.signal,
			transport: {
				...fakeDrive({ total, calls }),
				async putChunk({ chunk }) {
					calls.push({ kind: 'put', start: chunk.start });
					controller.abort();
					throw new (await import('../src/lib/classroom/deck-upload')).DeckUploadCancelled();
				}
			}
		}).catch((e) => e)) as DeckUploadError;

		expect(err.code).toBe('cancelled');
		expect(calls.filter((c) => c.kind === 'discard')).toHaveLength(1);
	});
});
