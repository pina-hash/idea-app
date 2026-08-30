import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/navigation-room',
	label: 'The pending primitive on the classroom plate (.cr-root)',
	widths: WIDTHS,
	/*
		THE ROOM HALF. `Pending` was written on the portal plate and mounted into
		three classroom surfaces and three notebook surfaces in the same change,
		which is exactly the shape of the two defects CLAUDE.md records under
		"A SHARED COMPONENT MOVING INTO A SCOPED ROOM": `SaveIndicator`'s failed
		message arrived on the notebook's paper at 3.65:1 and `VersionBadge`'s
		stamp at 3.20:1, both having passed review in the room they were written
		for. So the primitive is measured in every room it ships in, and this is
		the classroom one.

		THE GROUND IS `--surface-1`, NOT THE PAGE. Every real mount is inside a
		card; measuring the label against the page plate would report a ground it
		never lands on.
	*/
	presence: [
		/*
			THE ROOM ACTUALLY MOUNTED. Without `classroom.css` imported, `.cr-root`
			is a class with no rules -- a wrapper that reads as a room in the
			markup and paints nothing -- and the contrast row below would quietly
			go on reporting the portal plate. routes/README.md names this as the
			thing every room fix here has to assert.
		*/
		{ selector: '[data-testid="cr-room"].cr-root', label: 'the classroom room mounted', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '.pending', label: 'the primitive, on a card and in a narrow pane', expectPresent: 2, maxPresent: 2, expectVisible: 2, maxVisible: 2 }
	],
	contrast: [
		{ selector: '.cr-root .card .pending', label: 'pending label on the classroom card surface', min: 4.5 }
	],
	textContains: [
		{ selector: '.pending', label: 'one ellipsis spelling in this room too', must: ['…'], mustNot: ['...', '&hellip;'] }
	]
};
