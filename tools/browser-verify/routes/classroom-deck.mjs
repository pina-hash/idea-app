// original array position 22 of 25 -- see ../README.md for what `order` means
export const order = 22;

export default {
	path: '/dev/classroom-deck',
	label: 'Classroom deck harness controls (long select option text)',
	/*
		REGRESSION GUARD FOR c04e448. `.controls` wraps (flex-wrap: wrap),
		but a flex child's automatic minimum is still its own min-content --
		here the mode `<select>`'s widest OPTION text ("normal export
		(wrapper folder + hidden state file)"), wider than a 375px viewport
		on its own (CLAUDE.md: "min-width: 0 on grid/flex children").
		Wrapping the LABEL onto its own row does nothing for a label that is,
		by itself, wider than the row; `min-width: 0` on `.controls label` is
		what lets the select shrink to fit. The default 'panel' view renders
		`.controls` immediately, no prepare step needed.
	*/
	presence: [
		{ selector: '.controls', label: 'mode/fault controls', expectPresent: 1 },
		{ selector: '.controls select', label: 'mode + fault selects', expectPresent: 2 }
	]
};
