/**
 * ONE DOCUMENT SCROLL LOCK, COUNTED, SO NO TEARDOWN ORDER CAN LEAVE A PAGE
 * THAT CANNOT SCROLL.
 *
 * A layer that covers the page (the classroom composer, the first-login
 * pathway sheet) stops the page underneath from scrolling while it is up. Each
 * used to do it by hand: remember `body.style.overflow`, set `hidden`, put the
 * remembered value back on teardown. That composes only when layers close in
 * the reverse of the order they opened. Open A, open B (which remembers A's
 * `hidden`), close A (restores ''), close B (restores `hidden`): the page is
 * locked with nothing on screen holding it, and it stays locked until a
 * reload -- the same symptom as the stylesheet leak ledger 0298 fixed in
 * IdeaCAD, arriving by a different road.
 *
 * So there is one lock per document and it is COUNTED. `lockDocumentScroll`
 * takes a hold and returns the release for it; the first hold records the
 * inline value that was there before anybody held it, and the LAST release
 * puts exactly that back. Order does not matter. A release is idempotent --
 * calling one twice must not give back somebody else's hold -- which is what
 * makes it safe to call from every teardown path.
 *
 * It is the inline style on `body` and nothing else, exactly as both callers
 * did before, so nothing that reads the page changes. A document-level CSS
 * rule is NOT the way to lock scrolling: a route's stylesheet outlives the
 * route, which is the defect `tests/no-global-document-lock.test.ts` guards.
 */

interface Hold {
	holders: number;
	/** The inline `overflow` the body had before the first hold. */
	before: string;
}

/** The part of a document this touches, so the arithmetic is testable without a DOM. */
export interface ScrollLockDocument {
	body: { style: { overflow: string } };
}

const holds = new WeakMap<ScrollLockDocument, Hold>();

/**
 * Stop the document scrolling until the returned function is called. Every
 * caller calls its own release exactly once in practice; a second call is a
 * no-op rather than a second decrement.
 */
export function lockDocumentScroll(doc: ScrollLockDocument = document): () => void {
	let hold = holds.get(doc);
	if (!hold || hold.holders === 0) {
		hold = { holders: 0, before: doc.body.style.overflow };
		holds.set(doc, hold);
		doc.body.style.overflow = 'hidden';
	}
	hold.holders += 1;
	const mine = hold;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		mine.holders -= 1;
		if (mine.holders === 0) doc.body.style.overflow = mine.before;
	};
}

/** How many holds are open on a document. For tests and for a debugging console. */
export function documentScrollHolds(doc: ScrollLockDocument = document): number {
	return holds.get(doc)?.holders ?? 0;
}
