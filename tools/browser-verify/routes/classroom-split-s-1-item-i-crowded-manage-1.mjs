// original array position 10 of 25 -- see ../README.md for what `order` means
export const order = 10;

export default {
	path: '/dev/classroom-split/s-1/item/i-crowded?manage=1',
	label: 'Item detail, second notebook check-in attach door (teacher, one already attached)',
	/* THE SECOND DOOR never ran in a browser before this either: the attach
	   control used to be the {:else} of `{#if checkIns.length}`, so an item
	   that already carried a check-in had no way to add a second one. It is
	   now mounted beside the list unconditionally once `canManageCheckIn`
	   holds. i-crowded carries one check-in (classroom-split/fixture.ts,
	   CHECK_INS) and this route now wires `checkInTransports` (previously
	   omitted here entirely, which is the whole reason this state was
	   unreachable from any dev route this session may touch). The
	   inspector strip is collapsed by default (`itemInspector.open` starts
	   false), so it has to be opened first. */
	prepare: [
		{
			click: '[data-testid="inspector-toggle"]',
			until: '() => !!document.querySelector("#item-inspector-body")'
		}
	],
	presence: [
		{ selector: '[data-testid="insp-check-in"]', label: 'check-in already attached', expectPresent: 1 },
		{ selector: '[data-testid="detach-check-in"]', label: 'detach control on the attached check-in', expectPresent: 1 },
		{ selector: '[data-testid="check-in-open"]', label: 'second attach door (Add a check-in)', expectPresent: 1 }
	],
	contrast: [
		{ selector: '[data-testid="insp-check-in"] strong', label: 'attached check-in label', min: 4.5 }
	],
	/* Same chip-sized control as the composer route above -- neither
	   `.cr-console` nor `.engine-host`, so the 24px floor applies rather
	   than the 44px one (classroom.css:195). */
	tapTargets: [
		{ selector: '[data-testid="check-in-open"]', label: 'second attach door control', min: 24 },
		{ selector: '[data-testid="detach-check-in"]', label: 'detach control', min: 24 }
	],
	/* THE ONE MOUNT WHERE THE ATTACHMENT ROWS ARE PACKED, and the only one
	   where the defect showed. `.attach-name` carries `.tap-reach-44` with a
	   height-only reach, and on this fixture the two rows sat 41.3px apart
	   centre to centre -- so the second row's reach, which paints later, took
	   the bottom of the first row's and the first filename walked 88 x 41.5 at
	   both widths. `/dev/classroom-images` mounts the same component with the
	   rows further apart and measured a clean 45 throughout, which is why a row
	   there could never have caught this: the spacing is the variable and this
	   is the fixture that has it. Fixed 2026-09-05 by giving `.attach-meta` a
	   44px floor, so every row owns its own band and two reaches cannot overlap
	   whatever the content; measured after, 88 x 45 on both rows at both
	   widths, list height 74.5 -> 96. */
	tapReach: [
		{ selector: 'a.attach-name', label: 'attachment filename links (packed rows)', min: 44 }
	],
	/* THE CROWDED FIXTURE'S OWN IMAGE ATTACHMENT (span-photo.jpg), not this
	   bundle's doing: `AttachmentList` always renders through
	   `attachmentSrc()` -> `/api/classroom/attachment/<id>`, a real server
	   route that needs a session this placeholder-.env dev server cannot
	   provide, so it 401s. Every route in this file with fixture-only
	   errors gets its own documented ignore, same as the harness's own
	   external-block pattern above. */
	ignoreConsole: ['Failed to load resource: the server responded with a status of 401']
};
