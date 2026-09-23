/**
 * BOX SELECT, BOTH WAYS. Ledger 0296, stage W2.
 *
 * The audit's box drag drew nothing and selected the page's words instead
 * (F029). Here the prepare step drags a WINDOW (left to right) around the
 * whole box and lets go, which picks the three faces and nine edges a student
 * can see and none of the three behind, with no page text selected; then it
 * starts a CROSSING (right to left) over one corner and holds it, so the
 * measured state is the dashed rectangle with its word "Touching" on screen
 * while the twelve stay selected.
 */
import { BOX_READY, pointerSource } from './_ideacad-pointer.mjs';

export default {
	path: '/dev/ideacad-solid?state=box',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: box select, a window picked and a crossing being drawn',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: BOX_READY, attempts: 10, gapMs: 400 },
		{
			evaluate: pointerSource(`
				await idle(); s.select(null); await wait(100);
				const corners = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map((q) => s.project(q));
				const minX = Math.min(...corners.map((q) => q.x)) - 16, maxX = Math.max(...corners.map((q) => q.x)) + 16, minY = Math.min(...corners.map((q) => q.y)) - 16, maxY = Math.max(...corners.map((q) => q.y)) + 16;
				ev('pointerdown', { x: minX, y: minY }); await wait(30);
				for (let i = 1; i <= 6; i++) { ev('pointermove', { x: minX + (maxX - minX) * i / 6, y: minY + (maxY - minY) * i / 6 }, { buttons: 1 }); await wait(30); }
				const drawn = document.querySelector('[data-testid="ideacad-box-select"]')?.getAttribute('data-mode');
				ev('pointerup', { x: maxX, y: maxY }, { buttons: 0 }); await wait(200);
				const kinds = s.selections.map((x) => x.kind), picked = { faces: kinds.filter((k) => k === 'face').length, edges: kinds.filter((k) => k === 'edge').length };
				const text = String(getSelection());
				/* Now a crossing over the top-right corner, held. */
				const corner = s.project([1, 1, 1]);
				ev('pointerdown', { x: maxX, y: corner.y - 40 }); await wait(30);
				for (let i = 1; i <= 5; i++) { ev('pointermove', { x: maxX + (corner.x - 20 - maxX) * i / 5, y: corner.y - 40 + 70 * i / 5 }, { buttons: 1 }); await wait(30); }
				const held = document.querySelector('[data-testid="ideacad-box-select"]');
				window.__icBox = { drawn, picked, text, held: held?.getAttribute('data-mode'), word: held?.textContent.trim(), border: held ? getComputedStyle(held).borderTopStyle : null };
				return 'window drawn as ' + drawn + ', picked ' + picked.faces + ' faces and ' + picked.edges + ' edges, page text selected "' + text + '"; crossing held as ' + window.__icBox.held + ' "' + window.__icBox.word + '" ' + window.__icBox.border;
			`),
			until: '() => !!window.__icBox && window.__icBox.drawn === "window" && window.__icBox.picked.faces === 3 && window.__icBox.picked.edges === 9 && window.__icBox.text === "" && window.__icBox.held === "crossing" && window.__icBox.word === "Touching" && window.__icBox.border === "dashed"',
			attempts: 3,
			gapMs: 500
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-box-select"][data-mode="crossing"]', label: 'the crossing rectangle, held', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-box-select"][data-mode="window"]', label: 'no window rectangle left behind', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-box-select"]', label: 'the rectangle says its rule', must: ['Touching'] },
		{ selector: '.solid-workspace footer', label: 'the window picked twelve', must: ['12 selected'] }
	],
	contrast: [{ selector: '[data-testid="ideacad-box-select"] span', label: 'the rule word', min: 4.5 }],
	canvasContent: [{ selector: '.solid-workspace canvas', label: 'the box with its visible faces and edges selected' }],
	ignoreConsole: []
};
