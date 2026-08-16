<script lang="ts">
	import '$lib/classroom/classroom.css';

	/**
	 * The public reference viewer sits in the same room as the classroom.
	 *
	 * It is its own route tree because it serves a teacher-flagged material to
	 * someone with no account -- a parent scanning a printed syllabus -- but it
	 * renders the SAME document component the classroom does, so it must not
	 * render it in a different set of colours. Same wrapper, same stylesheet,
	 * same `.bg-fx` suppression.
	 */
	let { children } = $props();
</script>

<div class="cr-root">
	{@render children()}
</div>
