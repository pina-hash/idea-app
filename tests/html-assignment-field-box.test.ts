// tests/html-assignment-field-box.test.ts
//
// THE TWO BRIDGE MESSAGES PROGRESSIVE FEEDBACK ADDED (0238, decision 60), on
// the real gate.
//
// `idea:field-box` (document to parent) says where an answer sits, so the
// parent can pin a note beside it; `idea:feedback` (parent to document) says
// which fields have a note, and nothing else. Both fail silently: a field box
// accepted for a field the manifest does not declare would draw a pin over the
// wrong question, and a feedback message carrying a note's words would put a
// teacher's sentence in a document the student's own script controls. EVERY
// REFUSAL IS PAIRED WITH THE ACCEPTED CASE, so a gate refusing everything
// cannot pass.

import { describe, expect, it } from 'vitest';
import {
	HX_FEEDBACK_TYPE,
	HX_FIELD_BOX_TYPE,
	HX_SANDBOX_FLAGS,
	hxFeedbackMessage,
	hxReceive,
	type HxGate
} from '../src/lib/classroom/html-assignment/bridge.ts';
import { fieldBoxReporter, hxDocument, hxFieldMap } from '../src/routes/hx/_documents.ts';

const FRAME = { name: 'the frame contentWindow' };
const FIELDS = Object.freeze({ reflection: 'mod-1.b.reflection', photo: 'mod-1.d.photo' });
const gate = (): HxGate => ({
	documentOrigin: 'https://sandbox.ideabosco.com',
	frameWindow: FRAME,
	sandboxFlags: HX_SANDBOX_FLAGS,
	fieldToBlockId: FIELDS
});
const ask = (data: Record<string, unknown>, source: unknown = FRAME) =>
	hxReceive({ origin: 'null', source, data: { type: HX_FIELD_BOX_TYPE, ...data } }, gate());
const RECT = { x: 16, y: 420, w: 400, h: 112 };

describe('idea:field-box', () => {
	it('accepts a declared field with a rectangle and resolves its block through the parent map', () => {
		expect(ask({ field: 'reflection', rect: RECT })).toEqual({
			ok: true,
			message: { kind: 'field-box', blockId: FIELDS.reflection, field: 'reflection', rect: RECT, clipTop: 0 }
		});
	});

	it('accepts a null rect as a withdrawal', () => {
		expect(ask({ field: 'photo', rect: null })).toEqual({
			ok: true,
			message: { kind: 'field-box', blockId: FIELDS.photo, field: 'photo', rect: null, clipTop: 0 }
		});
	});

	it('refuses an undeclared field, a block id as a field and a prototype name', () => {
		for (const field of ['nope', FIELDS.reflection, 'constructor', '__proto__']) {
			const v = ask({ field, rect: RECT });
			expect(v.ok, field).toBe(false);
			if (!v.ok) expect(v.reason, field).toBe('field');
		}
	});

	it('refuses a rectangle outside the document as field-box, and a missing field as shape', () => {
		for (const rect of [{ x: -1, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: 9000, h: 10 }, 'big']) {
			const v = ask({ field: 'reflection', rect });
			expect(v.ok, JSON.stringify(rect)).toBe(false);
			if (!v.ok) expect(v.reason).toBe('field-box');
		}
		const v = ask({ rect: RECT });
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.reason).toBe('shape');
	});

	it('refuses a box from any window but this frame', () => {
		const v = ask({ field: 'reflection', rect: RECT }, { name: 'another window' });
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.reason).toBe('source');
	});
});

describe('idea:feedback carries field names and nothing else', () => {
	it('is sorted and deduplicated, so one set is always one message', () => {
		expect(hxFeedbackMessage(['reflection', 'photo', 'reflection'])).toEqual({
			type: HX_FEEDBACK_TYPE,
			fields: ['photo', 'reflection']
		});
		expect(hxFeedbackMessage([])).toEqual({ type: HX_FEEDBACK_TYPE, fields: [] });
	});

	it('has no key a note\'s words, author or state could ride in', () => {
		expect(Object.keys(hxFeedbackMessage(['photo'])).sort()).toEqual(['fields', 'type']);
	});
});

describe('the feedback fixture reports its boxes', () => {
	it('ships the reporter and declares every field it reports', () => {
		const doc = hxDocument('feedback', true);
		expect(doc).not.toBeNull();
		expect(doc?.html).toContain(fieldBoxReporter().trim().slice(0, 40));
		expect(doc?.html).toContain("type: 'idea:field-box'");
		for (const field of ['teamName', 'reflection', 'photo']) expect(Object.hasOwn(hxFieldMap('feedback', true), field)).toBe(true);
		// Never served outside dev.
		expect(hxDocument('feedback', false)).toBeNull();
	});
});
