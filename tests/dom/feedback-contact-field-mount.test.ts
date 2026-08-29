// tests/dom/feedback-contact-field-mount.test.ts
//
// THE OPTIONAL CONTACT FIELD, DRIVEN INSTEAD OF READ OUT OF THE SOURCE.
//
// `tests/feedback-coverage.test.ts` says why it could not do this, in its own
// words, at the test that owns this rule:
//
//     "The box is closed until the trigger is pressed, so what is asserted
//      here is the SOURCE wiring plus the note both renders would carry."
//
// So the rule -- an optional contact is offered ONLY where there is no account,
// and `contact` is not on the entry at all otherwise -- was asserted by
// `expect(box).toContain('...(askContact ? { contact } : {})')`. That is a
// string search over a file. It passes over a branch that is never reached,
// over a `submit` that assembles its entry somewhere else, and over a box that
// throws before it renders. It is a proxy, and it says so.
//
// This file presses the trigger, opens the real box, types into the real
// controls and reads THE ENTRY THE TRANSPORT WAS ACTUALLY HANDED. The four
// source-string assertions that stood in for it are deleted, each named beside
// its replacement in this bundle's history entry.
//
// WHY THE ENTRY AND NOT THE FIELD. The field being absent is the visible half
// and it is the half that fails loudly -- a signed-in reporter would see a
// stray box. The half that fails SILENTLY is the entry: a `contact` key sent
// with an empty string looks like nothing on screen, arrives at a write path
// whose whole design (0126) is that an account and a contact never sit on one
// row, and is discoverable only by reading the payload. So the payload is what
// is asserted, in both directions, and `'contact' in entry` is the assertion
// rather than a value comparison -- `{ contact: '' }` and no key at all are
// different rows and must be different results.
//
// NO GEOMETRY, NO CONTRAST, NO TAP TARGETS. happy-dom has no layout engine (see
// `tests/dom/README.md`); nothing here reads a box or a colour. That the
// trigger clears 44px is `verify:browser`'s claim and stays there.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';

import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
import { describeBuild, type BuildStamp } from '$lib/feedback/context';
import type { FeedbackEntry, FeedbackResult } from '$lib/feedback/feedback';
import { mountInto, type Mounted } from './mount';

const Feedback = SiteFeedback as unknown as Component<Record<string, unknown>>;

/** The same stamp the SSR file uses, built by the real describer. */
const BUILD: BuildStamp = describeBuild({ sha: 'a1b2c3d', complete: true }, null);

/** What a person typed. Spelled out here, never read back off the component. */
const TYPED = 'The launch button did nothing on the third try.';
const CONTACT = 'sam.cruz@boscotech.net';

interface Driven {
	m: Mounted;
	/** Every entry `submit` was called with, in order. */
	sent: FeedbackEntry[];
	/** Resolve the write that is currently in flight. Only for `hold: true`. */
	release: () => void;
}

function click(el: Element): void {
	el.dispatchEvent(new Event('click', { bubbles: true }));
}

/**
 * Type into a real control the way a person does: value, then the events
 * `bind:value` and `oninput` actually listen for, then a flush.
 *
 * THE FLUSH IS PART OF THE INSTRUMENT, NOT A CONVENIENCE. `canSend` is derived
 * from `message`, and reading `disabled` before the graph has settled reports
 * the PREVIOUS answer -- which reads exactly like a send control that never
 * enables. Found that way here.
 */
function typeInto(m: Mounted, el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.dispatchEvent(new Event('change', { bubbles: true }));
	m.flush();
}

/**
 * Mount the real shell affordance with a recording transport behind it.
 *
 * `hold` KEEPS THE WRITE IN FLIGHT until `release()` is called, which is the
 * only way to stand between the dispatch and the acknowledgement and ask what
 * the box is saying in between. Without it a test cannot tell "saved" from
 * "sent the request", because a transport that resolves immediately never
 * leaves the surface in the state where those two differ.
 */
function drive(props: Record<string, unknown> = {}, hold = false): Driven {
	const sent: FeedbackEntry[] = [];
	let release = () => {};
	const m = mountInto(Feedback, {
		routeId: '/notebook',
		pathname: '/notebook',
		build: BUILD,
		submit: async (entry: FeedbackEntry): Promise<FeedbackResult> => {
			sent.push(entry);
			if (!hold) return { error: null, retryable: false };
			return new Promise<FeedbackResult>((resolve) => {
				release = () => resolve({ error: null, retryable: false });
			});
		},
		...props
	});
	return { m, sent, release: () => release() };
}

/** Press the report trigger and let the box render. */
function openBox(d: Driven): void {
	const trigger = d.m.one('.sfb-trigger');
	click(trigger);
	d.m.flush();
}

const contactField = (m: Mounted) => m.all<HTMLInputElement>('#fb-contact');
const messageField = (m: Mounted) => m.one<HTMLTextAreaElement>('#fb-msg');

/* ---------------------------------------------- the box opens on the press */

describe('the box is closed until somebody presses the trigger', () => {
	it('renders the trigger and no dialog, then the dialog on the press', async () => {
		const d = drive({ anonymous: true });
		try {
			// The state SSR can see, asserted here too so the press below is a
			// transition rather than a fixture.
			expect(d.m.all('.sfb-trigger')).toHaveLength(1);
			expect(d.m.all('[role="dialog"]')).toHaveLength(0);
			expect(contactField(d.m)).toHaveLength(0);

			openBox(d);

			expect(d.m.all('[role="dialog"]')).toHaveLength(1);
			// POSITIVE CONTROL for every absence below: the box really did render
			// its own controls, so a missing field is a decision and not a
			// component that failed on the way up.
			expect(d.m.all('#fb-msg')).toHaveLength(1);
			expect(d.m.all('button').length).toBeGreaterThan(1);
		} finally {
			await d.m.stop();
		}
	});

	it('removes the control entirely when there is no transport', async () => {
		// ABSENCE IS THE MECHANISM, and it survives being mounted: there is no
		// write to execute rather than a disabled button.
		const d = drive({ submit: null, anonymous: true });
		try {
			expect(d.m.all('.sfb-trigger')).toHaveLength(0);
			expect(d.m.all('[role="dialog"]')).toHaveLength(0);
		} finally {
			await d.m.stop();
		}
	});
});

/* ------------------------------------- the field is offered in one direction */

describe('an optional contact is offered only where there is no account', () => {
	it('renders the field, said to be optional, for an anonymous reporter', async () => {
		const d = drive({ anonymous: true });
		try {
			openBox(d);

			const fields = contactField(d.m);
			expect(fields).toHaveLength(1);
			expect(fields[0].type).toBe('text');
			// PLAINLY OPTIONAL, IN THE LABEL. A placeholder disappears the moment
			// somebody types and is not read as part of the field; this asserts
			// the rendered label, where the SSR file asserted the source string.
			const label = d.m.one('label[for="fb-contact"]').textContent ?? '';
			expect(label).toContain('(optional)');
			// And nothing implies a report without one is worth less.
			expect(d.m.target.textContent).toContain(
				'Leave it empty and the report is still read.'
			);
		} finally {
			await d.m.stop();
		}
	});

	it('renders no contact field at all for a signed-in reporter', async () => {
		const d = drive({ anonymous: false });
		try {
			openBox(d);

			expect(contactField(d.m)).toHaveLength(0);
			expect(d.m.all('label[for="fb-contact"]')).toHaveLength(0);
			expect(d.m.target.textContent).not.toContain('Leave it empty');
			// POSITIVE CONTROL IN THE SAME RENDER: the box is open and usable,
			// so the three absences are about the field.
			expect(d.m.all('#fb-msg')).toHaveLength(1);
			expect(d.m.all('[role="dialog"]')).toHaveLength(1);
		} finally {
			await d.m.stop();
		}
	});
});

/* -------------------------- THE HALF THAT FAILS SILENTLY: what is sent */

describe('what the write actually receives', () => {
	it('carries the typed contact when the field was offered', async () => {
		const d = drive({ anonymous: true });
		try {
			openBox(d);
			typeInto(d.m, messageField(d.m), TYPED);
			typeInto(d.m, contactField(d.m)[0], CONTACT);
			click(d.m.one('.fb-btn-primary'));
			await d.m.settle();

			expect(d.sent).toHaveLength(1);
			const entry = d.sent[0];
			expect(entry.message).toBe(TYPED);
			expect('contact' in entry).toBe(true);
			expect(entry.contact).toBe(CONTACT);
		} finally {
			await d.m.stop();
		}
	});

	it('has NO contact key at all when the field was never offered', async () => {
		// The direct replacement for `expect(box).toContain('...(askContact ? {
		// contact } : {})')`. An empty string under the key and no key are
		// different rows: 0126 refuses an account and a contact on one row, and
		// the spread is what keeps that impossible from this side.
		const d = drive({ anonymous: false });
		try {
			openBox(d);
			typeInto(d.m, messageField(d.m), TYPED);
			click(d.m.one('.fb-btn-primary'));
			await d.m.settle();

			expect(d.sent).toHaveLength(1);
			const entry = d.sent[0];
			// POSITIVE CONTROL: the write really happened and carries the words.
			expect(entry.message).toBe(TYPED);
			expect('contact' in entry).toBe(false);
			expect(Object.keys(entry)).not.toContain('contact');
		} finally {
			await d.m.stop();
		}
	});

	it('sends nothing at all until something has been written', async () => {
		// The send control is a refusal gate, not decoration: an empty report is
		// the one thing the box must not file.
		const d = drive({ anonymous: true });
		try {
			openBox(d);
			const send = d.m.one<HTMLButtonElement>('.fb-btn-primary');
			expect(send.disabled).toBe(true);
			click(send);
			await d.m.settle();
			expect(d.sent).toHaveLength(0);

			// POSITIVE CONTROL: the identical control files a report the moment
			// there is one, so the refusal above is the gate and not a dead button.
			typeInto(d.m, messageField(d.m), TYPED);
			expect(d.m.one<HTMLButtonElement>('.fb-btn-primary').disabled).toBe(false);
			click(d.m.one('.fb-btn-primary'));
			await d.m.settle();
			expect(d.sent).toHaveLength(1);
		} finally {
			await d.m.stop();
		}
	});

	it('acknowledges the write when it LANDS, never when it is dispatched', async () => {
		// THE TEST THIS STARTED AS COULD NOT MAKE THIS CLAIM, and a mutation
		// said so: reporting `writing` as `saved` left every assertion green,
		// because a transport that resolves immediately never leaves the box in
		// the state where a dispatch and an acknowledgement look different. The
		// write is held open here so there IS such a moment to look at.
		const d = drive({ anonymous: true }, true);
		try {
			openBox(d);
			typeInto(d.m, messageField(d.m), TYPED);
			expect(d.m.target.textContent).not.toContain('Thanks, that went through');

			click(d.m.one('.fb-btn-primary'));
			await d.m.settle();

			// IN FLIGHT. The request is out -- the transport recorded it -- and
			// the box says so in the shared vocabulary rather than thanking
			// anybody for a write nothing has confirmed.
			expect(d.sent).toHaveLength(1);
			expect(d.m.target.textContent).not.toContain('Thanks, that went through');
			expect(d.m.one('.fb-btn-primary').textContent?.trim()).toBe('SENDING');
			// The person's words are still on screen, because they might not
			// have gone anywhere yet.
			expect(d.m.all('#fb-msg')).toHaveLength(1);

			d.release();
			await d.m.settle();

			// LANDED. Only now, and it renders in the box they are looking at.
			expect(d.m.target.textContent).toContain('Thanks, that went through');
			expect(d.m.all('#fb-msg')).toHaveLength(0);
		} finally {
			await d.m.stop();
		}
	});
});
