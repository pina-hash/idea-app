/**
 * PAGE-SIDE SOURCES SHARED BY THE `deploy-safety-*` ROUTE SPECS.
 *
 * `_`-prefixed, so `../routes.mjs` does not load it as a spec. Every string
 * here is a function SOURCE the runner invokes as `(${src})()` in the page.
 *
 * WHAT THE SPECS COUNT, AND WHY IT IS SESSION STORAGE. The thing under test is
 * a full page load, which destroys everything a component or a closure could
 * have counted with. `/dev/deploy-safety`'s harness writes raw entries to
 * `sessionStorage` (per tab, empty in each fresh browser context the runner
 * opens): one `document` per full page load (installed once per document, so
 * an in-app navigation adds none), one `verdict` per navigation
 * `DeployWatch` judged, with the rule that answered, `ack` per acknowledged
 * save, and the upload's `upload-start` / `upload-recorded`. The specs add
 * `mark` entries at the moments they act and judge everything between marks.
 *
 * THE LOG IS CHECKED AGAINST THE NETWORK ONCE, OUTSIDE THE RUNNER: a probe
 * counting `request.resourceType() === 'document'` from Playwright saw exactly
 * the document entries the log recorded (one, to `/dev/deploy-safety/next`, on
 * the text case), which is what licenses reading the log as "document
 * requests" here.
 */

/** The harness has hydrated: its layout's onMount has run. */
export const HYDRATED = `() => typeof window.__dsLog === 'function' && typeof window.__dsFlipUpdated === 'function'`;

/**
 * Tell this tab a newer version is live. THROWS when the kit module is not
 * found, so a spec that could not flip fails at this step instead of passing
 * every "nothing reloaded" assertion vacuously.
 */
export const FLIP = `async () => await window.__dsFlipUpdated()`;

/** Mark a moment, then press an in-app link the router intercepts. */
export const PRESS = (selector, label) => `() => {
	const link = document.querySelector(${JSON.stringify(selector)});
	if (!link) throw new Error('no ' + ${JSON.stringify(selector)} + ' on ' + location.pathname);
	window.__dsMark(${JSON.stringify(label)});
	link.click();
	return 'marked ${label} and pressed ' + ${JSON.stringify(selector)} + ' on ' + location.pathname;
}`;

/**
 * TYPE INTO THE REAL ENGINE, THEN PRESS THE LINK INSIDE THE DEBOUNCE WINDOW.
 *
 * Every keystroke re-arms the engine's 800ms autosave, so the answer is still
 * unacknowledged when the link is pressed 25ms after the last one -- the exact
 * window the save guard exists for. Typing goes through the textarea's own
 * value setter and an `input` event, the way a browser delivers it.
 */
export const TYPE_THEN_PRESS = (text, selector, label) => `async () => {
	const ta = document.querySelector('[data-testid="engine-here"] textarea');
	if (!ta) throw new Error('no answer field in the engine');
	const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
	const text = ${JSON.stringify(text)};
	for (let i = 1; i <= text.length; i++) {
		setter.call(ta, text.slice(0, i));
		ta.dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise((r) => setTimeout(r, 20));
	}
	const link = document.querySelector(${JSON.stringify(selector)});
	if (!link) throw new Error('no ' + ${JSON.stringify(selector)});
	window.__dsMark(${JSON.stringify(label)});
	link.click();
	return 'typed ' + text.length + ' characters and pressed ' + ${JSON.stringify(selector)} + ' 20ms after the last';
}`;

/** How many full page loads the log holds. */
export const DOCUMENTS_AT_LEAST = (n) =>
	`() => (window.__dsLog?.() ?? []).filter((e) => e.kind === 'document').length >= ${n}`;

/** A log entry of this kind exists. */
export const LOGGED = (kind) => `() => (window.__dsLog?.() ?? []).some((e) => e.kind === ${JSON.stringify(kind)})`;

/**
 * THE READING EVERY SPEC ASSERTS, built from the raw log: between two marks,
 * how many full page loads happened and where to, which rule the verdicts
 * gave, and whether a save was acknowledged before the next page load began.
 * Returned as an array of strings so `orderResult` compares it element for
 * element and prints both sides.
 */
export const READ_BETWEEN = (fromMark, toMark) => `() => {
	const log = window.__dsLog();
	const at = (label) => {
		const m = log.find((e) => e.kind === 'mark' && e.label === label);
		return m ? m.at : null;
	};
	const from = at(${JSON.stringify(fromMark)});
	const to = ${toMark ? `at(${JSON.stringify(toMark)})` : 'Infinity'};
	if (from === null) return ['mark ${fromMark} was never written'];
	if (to === null) return ['mark ${toMark} was never written'];
	const inside = log.filter((e) => e.at >= from && e.at < to);
	const docs = inside.filter((e) => e.kind === 'document');
	const verdicts = inside.filter((e) => e.kind === 'verdict');
	const acks = inside.filter((e) => e.kind === 'ack');
	const firstDoc = docs[0];
	return [
		'documents ' + docs.length,
		'to ' + (docs.map((d) => d.path).join(',') || '(none)'),
		'verdicts ' + (verdicts.map((v) => v.reason + '/' + v.type).join(',') || '(none)'),
		'acknowledged first ' +
			(acks.length === 0 ? 'no-ack' : !firstDoc ? 'no-reload' : acks[0].at < firstDoc.at ? 'yes' : 'NO')
	];
}`;
