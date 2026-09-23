/**
 * DRIVING THE SOLID MODELER'S CANVAS FROM A PREPARE STEP. Shared by the
 * ideacad-solid-state-* specs that measure hover, the right-click menu, box
 * select and the context toolbar (ledger 0296, stage W2). A leading underscore
 * keeps the loader from reading this file as a route.
 *
 * A prepare step can only click a selector, wait or evaluate, so these are
 * EVALUATE SOURCES: each dispatches real PointerEvent and MouseEvent objects at
 * the canvas, which reach the viewport's own listeners exactly as a mouse
 * would (the viewport captures a pointer as a courtesy and goes on without one
 * the browser does not count as active, which is what a dispatched event is).
 *
 * `BUILD_BOX` presses the empty part's "Start from a box" through the dev hook's
 * model and waits for the one body; every other source assumes that box: a
 * 2 x 2 in square on Top pulled up 1 in, in the iso view.
 */
export const BOX_READY = '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && window.ideaCadSolid.model.bodies.length === 1';

/** The helpers every source below opens with: a wait, a dispatched pointer event, a pixel diff, and an empty point on the canvas. */
const HELPERS = `
	const s = window.ideaCadSolid, c = document.querySelector('.solid-workspace canvas');
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	const idle = async () => { for (let i = 0; i < 400 && s.busy; i++) await wait(25); };
	const ev = (type, p, extra = {}) => c.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointermove' ? 0 : 1, ...extra }));
	const move = async (p, ms = 150) => { ev('pointermove', p); await wait(ms); };
	const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n; };
	const r = c.getBoundingClientRect();
	const clear = (p) => { const el = document.elementFromPoint(p.x, p.y); return el === c; };
	const emptyPoint = async () => { for (const [fx, fy] of [[0.5, 0.2], [0.55, 0.9], [0.85, 0.5], [0.2, 0.55]]) { const p = { x: r.left + r.width * fx, y: r.top + r.height * fy }; if (!clear(p)) continue; await move(p); if (!s.hovered) return p; } return null; };
`;
export const pointerSource = (body) => `async () => {${HELPERS}${body}}`;
