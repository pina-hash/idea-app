export default {
	path: '/dev/foundry-author',
	label: 'Foundry publisher page, three states (report 31)',
	/*
		THREE CARDS AT ONCE -- everything present, everything optional missing,
		and no name at all -- so one pass reads all three rather than three
		passes reading one. The SPARSE case is the one that matters: a missing
		pathway, class or picture has to render as NOTHING rather than as an
		empty chip or a stranded separator, and an absence is exactly what a
		screenshot of the full case cannot prove.
	*/
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
		{
			selector: '[data-testid="foundry-author-name"]',
			label: 'three author headings',
			expectPresent: 3,
			maxPresent: 3,
			expectVisible: 3
		},
		/*
			THE PATHWAY CHIP RENDERS ONCE, FOR THE ONE AUTHOR WHO HAS A PATHWAY.
			`maxPresent: 1` is the assertion; without a ceiling this would pass on
			a component that rendered an empty chip for the two authors who have
			none, which is precisely the defect the sparse fixture exists to
			catch.
		*/
		{
			selector: '[data-case="full"] .pathway-chip, [data-case="full"] [class*="pathway"]',
			label: 'pathway chip on the author who has one',
			expectPresent: 1
		},
		{
			selector: '[data-case="sparse"] .fdy-author-class',
			label: 'class label absent when the author has no class',
			expectPresent: 0,
			maxPresent: 0
		},
		{
			selector: '[data-case="nameless"] .fdy-author-class',
			label: 'class label absent for the nameless author too',
			expectPresent: 0,
			maxPresent: 0
		},
		/*
			THE ONE PLACE "render nothing" IS NOT AVAILABLE. A page needs a title,
			and an empty h1 is a hole at the top of the document and is what a
			screen reader announces the page as. The heading for the nameless
			author has to be VISIBLE and non-empty.
		*/
		{
			selector: '[data-case="nameless"] [data-testid="foundry-author-name"]',
			label: 'the nameless author still has a visible heading',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-case="full"] [data-testid="foundry-author-apps"] > li',
			label: 'the full author’s four apps',
			expectPresent: 4,
			maxPresent: 4
		},
		{
			selector: '[data-case="sparse"] [data-testid="foundry-author-apps"] > li',
			label: 'the sparse author’s one app',
			expectPresent: 1,
			maxPresent: 1
		},
		{
			selector: '.fdy-author-count',
			label: 'how many apps, and since when',
			expectPresent: 3,
			expectVisible: 3
		}
	],
	contrast: [
		{ selector: '.fdy-author-who h1', label: 'author name', min: 4.5 },
		{ selector: '.fdy-author-count', label: 'app count line', min: 4.5 },
		{ selector: '.fdy-author-class', label: 'class label', min: 4.5 }
	],
	tapTargets: []
};
