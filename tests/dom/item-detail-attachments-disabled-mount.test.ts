// tests/dom/item-detail-attachments-disabled-mount.test.ts
//
// `ItemDetail.attachmentsEnabled` IN ITS FALSE STATE, on the REAL component.
//
// WHY THIS FILE EXISTS. The prop defaults `true` (ItemDetail.svelte:111) and
// reaches the student hand-in as
// `<AssignmentEngine ... uploadEnabled={attachmentsEnabled} />`
// (ItemDetail.svelte:1124). Verified for this bundle rather than taken on
// trust: FOUR dev harnesses mount `ItemDetail` -- `/dev/classroom` (four
// mounts), `/dev/classroom-reference` (two), `/dev/classroom-phase1` (two) and
// `/dev/classroom-split` (one) -- and a sweep of `src/routes/dev/` for the
// prop name returns NOTHING. The only writers are production
// (`classroom/[sectionId]/item/[itemId]/+page.svelte:84` and
// `+layout.svelte:329/368`). So every mount that has ever existed took the
// default and the FALSE branch has never rendered anywhere, in any harness, in
// any test.
//
// AND IT IS ONE LINE FROM BEING LIVE. `+layout.server.ts:585` hardcodes
// `attachmentsEnabled: true` today; before 0133 it was `driveConfigured()`, and
// CLAUDE.md records what leaving it there would have cost -- the file picker
// removed from every item and the hand-in from every assignment on a deployment
// with no Google credentials, with the bucket sitting there unused. The flag is
// kept precisely so that outage can be expressed again. What has never been
// checked is what it EXPRESSES: a hand-in surface that silently loses its
// upload is the failure that rule exists to prevent, and "silently" is a claim
// about rendered output that only a mount can settle.
//
// WHAT IS ASSERTED, AND WHAT DELIBERATELY IS NOT. Structure and words only:
// which controls exist, which do not, and what sentence stands in their place.
// happy-dom has no layout engine, so no geometry, contrast or tap-target claim
// appears here -- see tests/dom/README.md and the mount helper's own header.

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `$app/navigation` NEEDS ONE MORE EXPORT THAN THE SHARED STUB HAS, and it is
 * mocked HERE rather than added there.
 *
 * `AssignmentEngine` calls `guardSaveNavigation`, which calls `beforeNavigate`
 * during component init (save-guard.svelte.ts:64). `tests/stubs/app-navigation.ts`
 * exports the four navigation functions an SSR render reaches and no lifecycle
 * hook, so the call lands on `undefined` and the mount dies before rendering a
 * single node. Widening that shared stub would be an edit to a file three other
 * suites import; this factory keeps the addition inside the one file that needs
 * it. A no-op is the honest stand-in: nothing here navigates, and what is under
 * test is what the component RENDERS, not what it would do on a navigation.
 */
vi.mock('$app/navigation', async () => {
	const actual = await vi.importActual<Record<string, unknown>>('$app/navigation');
	return { ...actual, beforeNavigate: () => {}, afterNavigate: () => {} };
});

import ItemDetail from '../../src/lib/classroom/ItemDetail.svelte';
import { SECTION, ITEMS } from '../../src/routes/dev/classroom-split/fixture';
import type { ClassroomItem } from '../../src/lib/classroom/classroom';
import type {
	AssignmentEngineTransports,
	StudentEngineData
} from '../../src/lib/classroom/assignment-spec';
import { mountInto, type Mounted } from './mount';

/**
 * An ASSIGNMENT out of the real split fixture, because the branch under test
 * only renders for one: line 1120 is `{:else if engine && engineTransports}`,
 * and a material or a post never reaches it.
 */
const ASSIGNMENT: ClassroomItem = (() => {
	const found = ITEMS.find((i) => i.kind === 'assignment' && i.published);
	if (!found) throw new Error('the split fixture has no published assignment');
	return found;
})();

/**
 * The student's own slice, empty. `spec: null` on purpose: it takes
 * `SpecRenderer` out of the picture entirely, so the plain hand-in panel is the
 * only thing `uploadEnabled` can be governing and an absence cannot be blamed
 * on a spec that rendered no imageZone. The spec-driven half has its own
 * assertion at the bottom of this file.
 */
function engineData(): StudentEngineData {
	return {
		spec: null,
		rubric: null,
		submission: null,
		responses: [],
		files: [],
		approvals: []
	};
}

/**
 * Transports that would work. THE POINT: the hand-in is withheld by the FLAG
 * and not by a missing transport, so `uploadSubmissionFile` is present and
 * callable throughout. Absence-as-mechanism is the repo's usual lever and it is
 * deliberately not the lever here -- if the control vanished because nothing
 * could upload, this file would be measuring the wrong thing.
 */
function engineTransports(): AssignmentEngineTransports {
	const ok = async () => ({ ok: true as const, data: {} });
	return {
		saveResponse: ok,
		submitAssignment: ok,
		unsubmitAssignment: ok,
		uploadSubmissionFile: async () => ({ ok: true as const, data: {} }),
		deleteSubmissionFile: ok,
		setFileCaption: ok,
		reloadStudent: async () => ({ ok: true as const, data: engineData() })
	} as unknown as AssignmentEngineTransports;
}

/** Mount the REAL ItemDetail as a STUDENT (canManage false, no manage transports). */
function mountStudent(
	attachmentsEnabled: boolean | undefined,
	engine: StudentEngineData = engineData()
): Mounted {
	const props: Record<string, unknown> = {
		section: SECTION,
		item: ASSIGNMENT,
		canManage: false,
		transports: null,
		engine,
		engineTransports: engineTransports()
	};
	// UNDEFINED IS NOT FALSE. Omitting the key is what every harness does and is
	// how the default gets exercised; passing `false` is the state under test.
	if (attachmentsEnabled !== undefined) props.attachmentsEnabled = attachmentsEnabled;
	return mountInto(ItemDetail as never, props);
}

/** The sentence AssignmentEngine renders in the panel's place (line 419). */
const NOT_CONFIGURED = 'File uploads are not configured on this deployment.';
/** SpecRenderer's own equivalent for an imageZone (line 632). */
const NO_PHOTOS = 'Photo uploads are not configured on this deployment.';

let open: Mounted[] = [];
function track(m: Mounted): Mounted {
	open.push(m);
	return m;
}
afterEach(async () => {
	for (const m of open) await m.stop();
	open = [];
});

describe('the student hand-in when uploads are switched off', () => {
	it('offers a real file input by default, which is the control that must go', async () => {
		// POSITIVE CONTROL, and it is load-bearing rather than symmetry: every
		// absence asserted below is meaningless unless the thing was there to
		// begin with. A student's hand-in picker is a `<input type="file">`.
		const d = track(mountStudent(undefined));
		const pickers = d.all<HTMLInputElement>('input[type="file"]');
		expect(pickers.length).toBeGreaterThan(0);
		expect(d.target.textContent).not.toContain(NOT_CONFIGURED);
	});

	it('REMOVES the picker entirely rather than disabling it', async () => {
		const d = track(mountStudent(false));
		// Absent, not present-and-disabled. Stated as both counts because
		// "0 enabled pickers" would also be true of a picker rendered disabled,
		// and the two are different answers to the question the task asks.
		expect(d.all('input[type="file"]')).toHaveLength(0);
		expect(d.all('input[type="file"][disabled]')).toHaveLength(0);
	});

	it('says why, in words, where the picker used to be', async () => {
		// THE HALF THAT MATTERS. A hand-in surface that silently loses its upload
		// is the failure the rule exists to prevent, and the difference between
		// that failure and a correct refusal is exactly this sentence.
		const d = track(mountStudent(false));
		expect(d.target.textContent).toContain(NOT_CONFIGURED);
	});

	it('keeps the rest of the hand-in surface, so the page is not just gone', async () => {
		// The heading ItemDetail wraps the engine in (line 1122). A false flag
		// must cost the UPLOAD and nothing else: if this went too, the branch
		// would be removing the student's whole work surface and the sentence
		// above would be sitting on an otherwise empty page.
		const d = track(mountStudent(false));
		expect(d.target.textContent).toContain('Your work');
		expect(d.target.textContent).toContain('Your files');
	});

	it('leaves the manager-facing branch untouched, because it is a different flag', async () => {
		// `instructorAttachmentsEnabled` is a SEPARATE prop (ItemDetail.svelte:112)
		// and 0135 gave answer keys their own bucket precisely so the two could
		// move apart. Asserted so a future change that folds them together has to
		// redden something.
		const d = track(mountStudent(false));
		expect(d.target.textContent).not.toContain('answer key uploads are not configured');
	});
});

describe('the spec-driven half of the same flag', () => {
	it('withholds an imageZone picker and says so, through the same one prop', async () => {
		// `attachmentsEnabled` reaches SpecRenderer through the SAME
		// `uploadEnabled` (AssignmentEngine.svelte:382), so a spec module that
		// asks for a photograph is governed by it too. Driven from ItemDetail
		// rather than by mounting SpecRenderer directly: the existing
		// `classroom-manager-spec-visibility-mount` and
		// `classroom-module-collapse-mount` files already pass
		// `uploadEnabled: false` straight to SpecRenderer, which proves that
		// component's branch and says nothing about whether ItemDetail's prop
		// ever reaches it. That wiring is the untested part.
		const withZone = engineData();
		withZone.spec = {
			schemaVersion: 1,
			meta: { assignmentId: 'a-1', title: 'Bridge design', totalPoints: 10 },
			modules: [
				{
					id: 'm1',
					title: 'Photograph the joint',
					points: 10,
					blocks: [
						{ type: 'instructions', content: 'Take one picture of the finished joint.' },
						{ type: 'imageZone', id: 'photos', minImages: 1, captions: true }
					]
				}
			]
		} as unknown as StudentEngineData['spec'];

		const off = track(mountStudent(false, withZone));
		expect(off.target.textContent).toContain(NO_PHOTOS);

		// POSITIVE CONTROL on the same spec: with the flag defaulted the sentence
		// is absent, so the assertion above is the flag's doing and not a spec
		// that failed to render a zone at all.
		const on = track(mountStudent(undefined, engineDataWithSameSpec(withZone)));
		expect(on.target.textContent).not.toContain(NO_PHOTOS);
	});
});

/** A second engine slice carrying the identical spec, for the control mount. */
function engineDataWithSameSpec(from: StudentEngineData): StudentEngineData {
	const d = engineData();
	d.spec = from.spec;
	return d;
}
