/**
 * PRESELECTION: WHAT THE POINTER IS OVER LIGHTS UP. Ledger 0296, stage W2.
 *
 * A different STATE of `/dev/ideacad-solid` (`aliasOf`): a box (the empty
 * part's own "Start from a box"), then the pointer moved onto its top face
 * and then onto its top-front edge. The phase-0 audit measured 0 canvas
 * pixels changing on a hover (F027) and 1px edges nobody could see (F037).
 *
 * WHAT IS CLAIMED, AS COUNTS. The prepare step returns three pixel diffs read
 * straight off the renderer (`ideaCadSolid.pixels()`): the face tint, the thick
 * edge, and back to nothing off the model, and its `until` holds the first two
 * above a floor and the third at exactly zero, so a hover that lit nothing, or
 * one that stayed lit, fails the step. The canvas then says what it is over
 * as a word (`data-hover="edge"`), and every chrome control still clears 44px.
 */
import { BOX_READY, pointerSource } from './_ideacad-pointer.mjs';

export default {
	path: '/dev/ideacad-solid?state=hover',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: preselection, a face tinted and an edge drawn thick under the pointer',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: BOX_READY, attempts: 10, gapMs: 400 },
		{
			evaluate: pointerSource(`
				await idle(); s.select(null); await wait(100);
				const empty = await emptyPoint(); if (!empty) return 'no empty point on the canvas';
				const rest = s.pixels();
				await move(s.project([0.2, 0.3, 1]), 250); const face = diff(rest, s.pixels()), onFace = c.dataset.hover;
				await move(empty, 250); const back = diff(rest, s.pixels());
				await move(s.project([0.3, -1, 1]), 250); const edge = diff(rest, s.pixels()), onEdge = c.dataset.hover;
				window.__icHover = { face, edge, back, onFace, onEdge, cost: s.hoverCosts.length };
				return 'face ' + face + ' px (' + onFace + '), edge ' + edge + ' px (' + onEdge + '), back off the model ' + back + ' px, ' + s.hoverCosts.length + ' picks timed';
			`),
			until: '() => !!window.__icHover && window.__icHover.face > 5000 && window.__icHover.edge > 300 && window.__icHover.back === 0 && window.__icHover.onFace === "face" && window.__icHover.onEdge === "edge"',
			attempts: 3,
			gapMs: 500
		}
	],
	presence: [
		{ selector: '.solid-workspace canvas[data-hover="edge"]', label: 'the canvas names what the pointer is over: an edge', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.solid-workspace canvas[data-hover="face"]', label: 'no stale face under the pointer once it moved to the edge', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-pick-filter"]', label: 'the pick filter control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.solid-workspace .error', label: 'the refusal banner, absent', expectPresent: 0 }
	],
	textContains: [{ selector: '.solid-workspace footer', label: 'the footer counts', must: ['1 body', '2 features'] }],
	tapTargets: [{ selector: '.solid-workspace header button, .solid-workspace .tools button, .solid-workspace .view-tools .row button, .solid-workspace .pick-tools button, .solid-workspace .right-tools button', label: 'the workspace chrome, with the pick filter control', min: 44 }],
	canvasContent: [{ selector: '.solid-workspace canvas', label: 'the box, with its top-front edge lit' }],
	layoutSanity: [{ root: '.solid-workspace .workarea', label: 'the work area chrome while hovering', reserved: null }],
	ignoreConsole: []
};
