import { fitSweep } from './_fit-sweep.mjs';

/* A student open, which is what mounts the rubric and the Return dock: the
   dock over the floating Report pill at 960 was the named overlap. */
export default fitSweep('/dev/grading-bulk', 'the grading console with a student open', {
	root: '.grading-page',
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length > 0', label: 'the roster has loaded' },
		{
			click: '.roster-list li:first-child .roster-row',
			until: '() => !!document.querySelector(".console.split") && !!document.querySelector(".grade-actions")',
			label: 'a student is open, so the rubric column and its dock exist'
		}
	]
});
