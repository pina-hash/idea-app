import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the QUICK NOTE and the notebook INBOX (ledger 0298,
 * R33). 404s in production; no auth, no Supabase, no network beyond the
 * dev-only normalizer the notebook harness already uses.
 *
 * IT MOUNTS THE REAL `ClassroomShell` -- so the Note control is measured in the
 * real header, beside the real Report slot and the real profile menu -- and the
 * REAL `NotebookView` below it, both writing to ONE in-memory notebook, so a
 * note saved from the header is the row the Inbox lists and files.
 *
 * THE PATH AFTER `/dev/quick-note` IS A CLASSROOM PATH, read by the shell
 * through its `basePath` exactly as the shipping nav functions read
 * `/classroom/...`:
 *   /dev/quick-note                        the classroom home (no class: Inbox)
 *   /dev/quick-note/s-1                    a class page (filed to the class)
 *   /dev/quick-note/s-1/item/i-1           an assignment page (class + title)
 *   /dev/quick-note/s-1/item/i-1/deck      the lesson deck: the control is ABSENT
 *
 * `claims` and `userProfile` are returned at PAGE level, the way
 * /dev/theme-switch does it, so the profile menu renders at its real width.
 *   ?signedout=1   no session and no harness viewer: the control is ABSENT
 *   ?hidden=1      the viewer has hidden the control (the stored preference)
 *   ?view=inbox    the notebook opens on its Inbox
 *   ?fail=create   every note create is refused (the file control's first half)
 *   ?fail=delete   every delete is refused (filed, with the old copy left)
 */
export const prerender = false;

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const signedOut = url.searchParams.get('signedout') === '1';
	const hidden = url.searchParams.get('hidden') === '1';
	return {
		claims: signedOut ? null : { sub: 'dev-quick-note-user', email: 'alice@boscotech.net', exp: 4102444800 },
		userProfile: signedOut
			? null
			: {
					id: 'dev-quick-note-user',
					role: 'student',
					pathway: 'IDEA',
					display_name: 'Alice Nguyen',
					full_name: 'Alice Nguyen',
					avatar: null,
					avatar_url: null,
					section_id: null,
					preferences: hidden ? { quickNote: { hidden: true } } : {}
				},
		isAdmin: false,
		foundryReviewPending: null
	};
};
