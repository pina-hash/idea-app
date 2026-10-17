/**
 * A SCHEDULED HTML ASSIGNMENT'S EDIT FORM ASKS THE ROUTE FOR NOTHING EITHER:
 * published for a later date, so the route refuses its live thumbnail until
 * then, exactly as it does a draft's (./post-thumbnails-view-editor-editdoc-draft.mjs).
 */
import base from './post-thumbnails-view-editor-editdoc-draft.mjs';

export default {
	...base,
	path: '/dev/post-thumbnails?view=editor&editdoc=scheduled',
	label: "A scheduled HTML assignment's edit form: the generated look, the publishing note, and nothing asked of the route"
};
