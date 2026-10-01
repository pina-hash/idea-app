import type { FeedbackRow } from '$lib/feedback/feedback';
import { rowScreenshotPath, rowSection, type ClassroomSectionInfo } from '$lib/feedback/console';
import { FEEDBACK_MEDIA_BUCKET } from '$lib/feedback/screenshot';
import { requireFeedbackConsole } from '$lib/server/feedback-console';
import type { PageServerLoad } from './$types';

/**
 * The feedback console, site-wide, at `/admin/feedback` since report R03
 * (decision 42). ADMIN ONLY, and a non-admin gets a 404 rather than a
 * redirect: `requireFeedbackConsole` is the gate, shared with the 307 that
 * `/classroom/feedback` answers, so the two addresses cannot disagree about
 * who may open it.
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireFeedbackConsole(locals);
	const { supabase } = locals;

	// EVERY APP, NOT JUST THE CLASSROOM. `p_app` was 'classroom' when the
	// classroom was the only surface with a Feedback button; the affordance is
	// mounted in the root layout now, so narrowing to one app here would hide
	// most of what arrives. `app_feedback_admin_list` already defaults `p_app` to
	// null (all apps), so this is an omission rather than a new parameter -- no
	// deploy-ordering problem, and it works against the schema already applied.
	const { data, error: rpcError } = await supabase.rpc('app_feedback_admin_list');
	const newest = (data ?? []) as unknown as FeedbackRow[];

	// THE LONG-TERM IDEAS, READ ON THEIR OWN (0230). The read above is the
	// newest 200 reports of any kind, and a long-term idea is by definition one
	// that sits there for months: without this second read the oldest ideas
	// would fall off the console the week enough bugs arrived, with nothing on
	// screen saying so. 0230's WIDE form takes the horizon and declares no
	// defaults, so this call can only ever bind to it.
	//
	// A `PGRST202` here means the function is not there yet, which is a
	// deployment before 0230 and a supported state: the console shows what the
	// first read holds and offers no move control. Any OTHER error is treated
	// the same way and for the same reason -- the first list is still right,
	// and a move control offered beside a read that just failed is a control
	// nobody can say will work. Neither case fails the page.
	let horizonReady = false;
	let rows = newest;
	if (!rpcError) {
		const wide = await supabase.rpc('app_feedback_admin_list', {
			p_app: null,
			p_limit: 500,
			p_horizon: 'long_term'
		});
		if (!wide.error) {
			horizonReady = true;
			const byId = new Map(newest.map((r) => [r.id, r]));
			for (const r of (wide.data ?? []) as unknown as FeedbackRow[]) byId.set(r.id, r);
			// Newest first, the order both reads already return.
			rows = [...byId.values()].sort((a, b) =>
				a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
			);
		}
	}

	// `meta.section` on a row captured from /classroom/[sectionId] is a
	// classroom_sections uuid (the route param), a DIFFERENT namespace from the
	// curriculum.ts slug resolveSectionId falls back to. Resolved HERE, at
	// export time, off the live table -- never at capture -- so a section
	// renamed after a report was filed exports under today's name. See
	// resolveSectionId in $lib/feedback/console.
	const sectionIds = [...new Set(rows.map(rowSection).filter((v): v is string => !!v))];
	let classroomSections: ClassroomSectionInfo[] = [];
	if (sectionIds.length) {
		const { data: sectionRows } = await supabase
			.from('classroom_sections')
			.select('id, label, block, classroom_courses(code)')
			.in('id', sectionIds);
		classroomSections = (sectionRows ?? []).map((r) => {
			const course = Array.isArray(r.classroom_courses)
				? r.classroom_courses[0]
				: r.classroom_courses;
			return {
				id: r.id as string,
				course: (course?.code as string | undefined) ?? 'unknown course',
				label: r.label as string,
				block: (r.block as string | null) ?? null
			};
		});
	}

	// A SHORT-LIVED SIGNED URL PER SCREENSHOT, MINTED ON THE CALLER'S OWN CLIENT.
	//
	// `feedback-media` is PRIVATE: no object in it has a public URL, and the only
	// readers are the object's own uploader and an admin, by storage policy
	// (0170). This runs on `locals.supabase`, which carries the admin's own
	// session, so the POLICY is what decides -- this route is not the
	// authorization boundary and must never become one by reaching for the
	// service key.
	//
	// `download` PUTS `Content-Disposition: attachment` ON THE RESPONSE, on the
	// Supabase origin rather than ours, so following the link SAVES the
	// reporter's bytes rather than rendering them as a document. The console
	// still draws a thumbnail from the same URL: an `<img>` decodes a response
	// carrying that header (measured in Chromium, recorded in CLAUDE.md), and an
	// image element is not a navigation -- script does not run in one, and the
	// bucket admits no SVG in the first place.
	//
	// FIVE MINUTES, because the bytes are immutable but WHO may read them is
	// not, and a queue is worked through in one sitting.
	//
	// IT FAILS SOFT, AND A MISSING URL IS A NORMAL STATE. On a deployment before
	// 0170 there is no bucket and no `screenshot_path` on any row, so this is an
	// empty map and the console renders exactly what it rendered before.
	const screenshotUrls: Record<string, string> = {};
	const keys = [...new Set(rows.map(rowScreenshotPath).filter((k): k is string => !!k))];
	if (keys.length) {
		const { data: signed } = await supabase.storage
			.from(FEEDBACK_MEDIA_BUCKET)
			.createSignedUrls(keys, 300, { download: true });
		for (const entry of signed ?? []) {
			if (entry.signedUrl && entry.path) screenshotUrls[entry.path] = entry.signedUrl;
		}
	}

	return {
		// Fails soft: 0085 unapplied reads as a clearly-flagged card, not a crash.
		ready: !rpcError,
		rows,
		// Whether this backend can move a report between the two lists: true
		// only when 0230's wide read answered, which is the same migration that
		// adds `app_feedback_set_horizon`. "Cannot tell" is false.
		horizonReady,
		classroomSections,
		screenshotUrls
	};
};
