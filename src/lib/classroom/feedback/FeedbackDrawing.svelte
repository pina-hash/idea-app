<script lang="ts">
	/**
	 * THE DRAWING TOOL, MOUNTED WHILE AN INSTRUCTOR'S SESSION HOLDS A PICTURE TO
	 * DRAW ON (0238). One host per session, so the frame's "Draw on this", the
	 * list's "Draw on" keys and a note's "Draw again" all open the same tool on
	 * the same state, and a student's session, which can never hold a target,
	 * mounts nothing.
	 */
	import Annotator from './Annotator.svelte';
	import type { FeedbackSession } from './session.svelte';

	let { session }: { session: FeedbackSession } = $props();
</script>

{#if session.drawing}
	{@const target = session.drawing}
	{#key `${target.fileId}:${target.threadId ?? 'new'}`}
		<Annotator
			src={target.src}
			alt={target.alt}
			title={target.threadId ? 'Change this drawing' : 'Draw on this picture'}
			initialMarks={target.initialMarks ?? null}
			initialBody={target.initialBody ?? ''}
			saveLabel={target.threadId ? 'Save changes' : 'Save and send'}
			onsave={(marks, body) => session.saveDrawing(marks, body)}
			onclose={() => session.endDrawing()}
		/>
	{/key}
{/if}
