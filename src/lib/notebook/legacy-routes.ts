import type { ReviewSection } from '$lib/notebook-review';
import { classNotebookHref } from '$lib/classroom/nav';

/**
 * WHERE THE NOTEBOOK'S OLD ADDRESSES GO NOW (ledger 0297, package F4a).
 *
 * The notebook lived at `/notebook`, a separate app with its own masthead. It
 * lives inside the classroom now: a class's own Notebook tab, the whole
 * notebook at `/classroom/notebook`, and the review console at
 * `/classroom/notebook/review`. EVERY OLD ADDRESS KEEPS WORKING, because they
 * are on printed check-in cards, in posts, in bookmarks and in the history of
 * every student who used the notebook, and a link that 404s is work a student
 * cannot find.
 *
 * PLAIN DATA, NO REQUEST. The three legacy routes call these after their own
 * gate, so each answer is checkable in the `node` project with no server, and
 * the targets are asserted to be real routes on disk.
 *
 * 307, NEVER 308, at every call site: these are routing decisions that may
 * change again, and a permanent redirect is cached past the point where
 * changing it helps (the short-link rule in CLAUDE.md). And SAME-SITE, always:
 * every target below starts `/classroom`, so nothing here can be an open
 * redirector.
 */

/** `/notebook` and `/notebook?checkin=&section=`: the whole notebook, query intact. */
export function legacyNotebookTarget(url: URL): string {
	return `/classroom/notebook${url.search}`;
}

/**
 * `/notebook/review` and `/notebook/review?section=<id>`, for a caller who is
 * ALREADY KNOWN TO BE A REVIEWER (the route 404s everybody else first, so the
 * redirect confirms nothing to somebody who may not see the console).
 *
 * A section the caller MANAGES goes to that class's own Notebook tab, which is
 * exactly where the retired Check-ins tab used to send them, now inside the
 * class. Anything else -- no section, a section they only review (0169), an id
 * that is not on their list -- goes to the all-sections console, carrying the
 * section only when it is one of theirs (the console validates it again).
 */
export function legacyReviewTarget(url: URL, sections: ReviewSection[]): string {
	const asked = url.searchParams.get('section');
	const hit = asked ? sections.find((s) => s.id === asked) : undefined;
	if (hit?.manages) return classNotebookHref(hit.id);
	return hit
		? `/classroom/notebook/review?section=${encodeURIComponent(hit.id)}`
		: '/classroom/notebook/review';
}

/**
 * `/notebook/review/student/<email>?section=<id>`, for a caller already known
 * to be a reviewer. The address segment is passed through ENCODED and the
 * section only in the uuid shape the page itself accepts, so nothing a caller
 * types reaches a Location header as anything but a path segment.
 */
export function legacyStudentTarget(studentEmail: string, url: URL): string {
	const email = decodeURIComponent(studentEmail).trim().toLowerCase();
	const href = `/classroom/notebook/review/student/${encodeURIComponent(email)}`;
	const asked = url.searchParams.get('section');
	return asked && /^[0-9a-f-]{36}$/i.test(asked)
		? `${href}?section=${encodeURIComponent(asked)}`
		: href;
}
