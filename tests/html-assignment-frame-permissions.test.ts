// tests/html-assignment-frame-permissions.test.ts
//
// LEDGER 0456, REPORT ed0b584e: THE WORKSHEET FRAME MAY USE THE CAMERA, AND
// NOTHING ELSE POWERFUL.
//
// A student's Take photo key (tools/hx-kit/kit/camera.js, a file input with
// `capture`) opened a black camera screen on a phone while the camera roll
// worked. The frame is cross-origin with an opaque origin and the camera's
// Permissions-Policy default allowlist is `self`, so with no `allow` the
// capture view was given no camera. Removing the grant reddens the first row;
// widening it to a microphone, location, screen or clipboard reddens the
// second. The structural read strips comments first, the same reason the
// Foundry frame's test does: prose about an attribute is not the attribute.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HX_FRAME_ALLOW, HX_SANDBOX_FLAGS } from '../src/lib/classroom/html-assignment/bridge';

const SOURCE = readFileSync(
	fileURLToPath(new URL('../src/lib/classroom/html-assignment/HtmlAssignmentFrame.svelte', import.meta.url)),
	'utf8'
).replace(/<!--[\s\S]*?-->/g, '');

/** The worksheet's own iframe: the one carrying `data-hx-frame`. */
function worksheetTag(): string | null {
	const tags = SOURCE.match(/<iframe[\s\S]*?><\/iframe>/g) ?? [];
	return tags.find((t) => t.includes('data-hx-frame')) ?? null;
}

describe('the worksheet frame permissions', () => {
	it('grants the camera, through the one constant', () => {
		const tag = worksheetTag();
		expect(tag).not.toBeNull();
		expect(tag).toContain('allow={HX_FRAME_ALLOW}');
		expect(HX_FRAME_ALLOW.split(';').map((s) => s.trim())).toEqual(['camera']);
	});

	it('grants nothing else powerful, and the sandbox does not gain same-origin', () => {
		for (const refused of ['microphone', 'geolocation', 'display-capture', 'clipboard-read', 'clipboard-write', 'usb', 'serial']) {
			expect(HX_FRAME_ALLOW).not.toContain(refused);
		}
		expect(HX_FRAME_ALLOW).not.toContain('*');
		expect(HX_SANDBOX_FLAGS).not.toContain('allow-same-origin');
	});
});
