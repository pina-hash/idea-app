// tests/dom/composer-draft-drive.ts
//
// THE INSTRUMENT for 0061, kept apart from the assertions that use it for the
// reason `composer-mount.ts` gives: the mutation proof has to drive the
// IDENTICAL instrument against a deliberately broken copy of the component,
// and a body written inline in the test file would have to be retyped to do
// that -- which characterizes what somebody believed it did.
//
// Not a `.test.ts`, so vitest does not collect it as a file of its own.

import { flushSync, mount, unmount } from 'svelte';
import type { Component } from 'svelte';
import type { ClassroomComposerTransports, ClassroomSection } from '$lib/classroom/classroom';

export const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

export interface CreateCall {
	title: string | null;
	published: boolean;
}
export interface UpdateCall {
	itemId: string;
	title: string | null;
	published: boolean;
}

export interface DriveOutcome {
	/** Every `createItem` the component issued: one per row the server would write. */
	creates: CreateCall[];
	/** Every `updateItem` it issued instead. */
	updates: UpdateCall[];
	/** What is still in the title field when the drive ends. */
	titleAfter: string;
	/** The acknowledgement the composer printed last, verbatim. */
	message: string;
	/** Every `onsaved` payload, so the parent's view can be asserted too. */
	saved: { published: boolean; itemId: string }[];
}

/** How the injected `createItem` answers. */
export type CreateBehaviour =
	| { kind: 'ok' }
	/**
	 * THE FALSE NEGATIVE: the row IS written and the client is told it was not.
	 * A fetch aborted by the tab going to the background after the RPC
	 * committed, which is the ordinary shape of this on a phone.
	 */
	| { kind: 'commits-then-fails'; message?: string }
	/** A considered refusal: nothing is written. */
	| { kind: 'refuses'; message: string };

export interface DriveOptions {
	/** How many times to press the button. */
	presses?: number;
	/** Which button: `false` is Save draft, `true` is Post now. */
	publish?: boolean;
	/** How many times to hide the tab AFTER the presses. */
	hides?: number;
	behaviour?: CreateBehaviour;
	/** Rows the server ends up holding, appended to by the transport. */
	serverRows?: string[];
}

function setHidden(hidden: boolean) {
	Object.defineProperty(document, 'visibilityState', {
		value: hidden ? 'hidden' : 'visible',
		configurable: true
	});
	document.dispatchEvent(new Event('visibilitychange'));
}

const settle = async () => {
	flushSync();
	await new Promise((r) => setTimeout(r, 80));
	flushSync();
};

/**
 * Mount the composer in CREATE mode, type a title, press a save button N
 * times, then hide the tab M times, and report every write it issued.
 *
 * The transports are counting stand-ins rather than the real ones because the
 * question this instrument answers is how many times the COMPONENT decides to
 * create -- `tests/db/classroom-draft-checkpoint.test.ts` is what turns those
 * decisions into row counts against real Postgres.
 */
export async function driveDraftSaves(
	Composer: Component<Record<string, unknown>>,
	opts: DriveOptions = {}
): Promise<DriveOutcome> {
	const {
		presses = 1,
		publish = false,
		hides = 0,
		behaviour = { kind: 'ok' } as CreateBehaviour,
		serverRows = []
	} = opts;

	const creates: CreateCall[] = [];
	const updates: UpdateCall[] = [];
	const saved: { published: boolean; itemId: string }[] = [];
	let n = 0;

	const transports = {
		async createItem(
			_kind: string,
			_ids: string[],
			input: { title: string | null },
			published: boolean
		) {
			creates.push({ title: input.title, published });
			if (behaviour.kind === 'refuses') {
				return { ok: false as const, message: behaviour.message };
			}
			n += 1;
			const id = `item-${n}`;
			serverRows.push(id);
			if (behaviour.kind === 'commits-then-fails') {
				return { ok: false as const, message: behaviour.message ?? 'Save failed.' };
			}
			return { ok: true as const, data: { itemId: id } };
		},
		async updateItem(itemId: string, input: { title: string | null }, published: boolean) {
			updates.push({ itemId, title: input.title, published });
			return { ok: true as const, data: { itemId } };
		},
		async loadCategorySuggestions() {
			return { ok: true as const, data: [] as string[] };
		}
	} as unknown as ClassroomComposerTransports;

	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(Composer, {
		target,
		props: {
			mode: 'create',
			kind: 'assignment',
			sections: [SECTION],
			initialTargets: [SECTION.id],
			transports,
			onsaved: (info: { published: boolean; itemId: string }) =>
				saved.push({ published: info.published, itemId: info.itemId })
		}
	});
	flushSync();

	const titleField = () => target.querySelector('input[type="text"]') as HTMLInputElement;
	const field = titleField();
	field.value = 'Bridge lab writeup';
	field.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();

	const testid = publish ? 'composer-publish-top' : 'composer-draft-top';
	for (let i = 0; i < presses; i++) {
		const btn = target.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement | null;
		// A press against a composer that has unmounted itself is not a press.
		if (!btn) break;
		btn.click();
		await settle();
	}

	for (let i = 0; i < hides; i++) {
		setHidden(true);
		await settle();
		setHidden(false);
		await settle();
	}

	const outcome: DriveOutcome = {
		creates,
		updates,
		titleAfter: titleField()?.value ?? '',
		message: (target.querySelector('p.feedback') as HTMLElement | null)?.textContent?.trim() ?? '',
		saved
	};

	await unmount(app);
	target.remove();
	setHidden(false);
	return outcome;
}
