<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
	import type { FeedbackScreenshotBytes } from '$lib/feedback/archive';
	import type { FeedbackStatus } from '$lib/feedback/feedback';
	import { FEEDBACK_MEDIA_BUCKET } from '$lib/feedback/screenshot';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	async function setStatus(id: string, status: FeedbackStatus) {
		const { error } = await supabase.rpc('app_feedback_set_status', {
			p_id: id,
			p_status: status
		});
		if (error) return { ok: false, message: error.message };
		void invalidateAll();
		return { ok: true };
	}

	/**
	 * ONE SCREENSHOT'S BYTES, FOR THE ARCHIVE EXPORT.
	 *
	 * ON THE ADMIN'S OWN CLIENT, SO THE STORAGE POLICY IS STILL THE BOUNDARY.
	 * `feedback-media` is private and 0170 gives it exactly one policy that
	 * reaches another person's object -- `feedback media admin read`, `select`,
	 * `to authenticated`, `using (bucket_id = 'feedback-media' and is_admin())`.
	 * This runs as the caller, so that policy answers, and NOTHING HAD TO BE
	 * WIDENED to build the archive: the same session already reads the same
	 * bytes to draw the thumbnail on the row.
	 *
	 * A DOWNLOAD RATHER THAN A SIGNED URL, and the difference is staleness. The
	 * load mints signed URLs valid for five minutes, which is right for a
	 * thumbnail on a page somebody is looking at now; a queue is worked through
	 * for a good deal longer, so an export pressed twenty minutes in would fetch
	 * a set of expired links and produce an archive with no images and no reason
	 * on screen. Asking storage at the moment of the press has no window to be
	 * outside of.
	 *
	 * IT NEVER THROWS. Every outcome is a value, because one unreachable object
	 * must not cost the other thirty-seven reports their archive; the builder
	 * records the absence per report and the archive states it.
	 */
	async function fetchScreenshot(key: string): Promise<FeedbackScreenshotBytes | null> {
		try {
			const { data: blob, error } = await supabase.storage
				.from(FEEDBACK_MEDIA_BUCKET)
				.download(key);
			if (error || !blob) return null;
			return {
				bytes: new Uint8Array(await blob.arrayBuffer()),
				// WHAT THE STORE SAYS THE BYTES ARE. It can be empty or generic,
				// which is why the archive falls back to the key's own extension
				// rather than trusting this alone.
				contentType: blob.type || null
			};
		} catch {
			return null;
		}
	}
</script>

<!--
	THE PORTAL'S OWN CHROME (report R03). The console reads reports from every
	surface on the site, so it sits in the admin area with the header every
	other /admin page carries, the site plate the root layout puts on /admin,
	and the report control the root layout mounts. The way back is the admin
	console's Feedback panel, where the queue's new-report count is.
-->
<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/dashboard#panel-feedback">&lsaquo; Admin console</a>
		<ProfileMenu />
	</div>
</div>

<FeedbackConsole
	ready={data.ready}
	rows={data.rows}
	classroomSections={data.classroomSections}
	screenshotUrls={data.screenshotUrls}
	{fetchScreenshot}
	{setStatus}
/>
