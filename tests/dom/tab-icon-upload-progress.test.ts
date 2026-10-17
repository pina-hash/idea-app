// tests/dom/tab-icon-upload-progress.test.ts
//
// The classroom upload drives the tab icon's progress hairline (ledger 0396),
// and clears it on every way a transfer can end. A transfer that ended with
// the status still raised would leave a half-filled hairline on every page
// until a reload, so each ending is driven here: success, a refusal (which
// resolves), a dropped connection and an abort.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { putFileWithProgress } from '../../src/lib/classroom/upload-progress';
import { clearAllTabStatuses, currentTabStatus } from '../../src/lib/tab-icon/live';

/** The one XHR the module opens, driven by the test. */
class FakeXhr {
	static last: FakeXhr | null = null;
	upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
		onprogress: null
	};
	onerror: (() => void) | null = null;
	onabort: (() => void) | null = null;
	onload: (() => void) | null = null;
	status = 0;
	responseText = '';
	constructor() {
		FakeXhr.last = this;
	}
	open() {}
	setRequestHeader() {}
	send() {}
}

const realXhr = globalThis.XMLHttpRequest;
beforeEach(() => {
	(globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
	clearAllTabStatuses();
});
afterEach(() => {
	(globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = realXhr;
	clearAllTabStatuses();
});

const file = new Blob(['x']);

describe('the upload drives the tab progress hairline', () => {
	it('raises at 0, follows the bytes, and clears on load', async () => {
		const seen: number[] = [];
		const done = putFileWithProgress('https://example.test/put', file, 'application/octet-stream', (f) => seen.push(f));
		const xhr = FakeXhr.last as FakeXhr;
		expect(currentTabStatus()).toEqual({ kind: 'progress', p: 0 });
		xhr.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 });
		expect(currentTabStatus()).toEqual({ kind: 'progress', p: 0.4 });
		xhr.upload.onprogress?.({ lengthComputable: false, loaded: 90, total: 0 });
		expect(currentTabStatus()).toEqual({ kind: 'progress', p: 0.4 });
		xhr.status = 200;
		xhr.onload?.();
		await done;
		expect(currentTabStatus().kind).toBe('none');
		// The caller's own progress callback is unchanged.
		expect(seen).toEqual([0.4, 1]);
	});

	it('a refusal resolves and still clears', async () => {
		const done = putFileWithProgress('u', file, 'application/octet-stream');
		const xhr = FakeXhr.last as FakeXhr;
		xhr.status = 403;
		xhr.responseText = '{"error":"no"}';
		xhr.onload?.();
		expect((await done).status).toBe(403);
		expect(currentTabStatus().kind).toBe('none');
	});

	it('a dropped connection and an abort each clear', async () => {
		const a = putFileWithProgress('u', file, 'application/octet-stream');
		(FakeXhr.last as FakeXhr).onerror?.();
		await expect(a).rejects.toThrow(/connection dropped/);
		expect(currentTabStatus().kind).toBe('none');
		const b = putFileWithProgress('u', file, 'application/octet-stream');
		expect(currentTabStatus().kind).toBe('progress');
		(FakeXhr.last as FakeXhr).onabort?.();
		await expect(b).rejects.toThrow(/cancelled/);
		expect(currentTabStatus().kind).toBe('none');
	});
});
