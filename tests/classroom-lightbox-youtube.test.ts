// tests/classroom-lightbox-youtube.test.ts
//
// THE LIGHTBOX'S PURE HALF AND THE YOUTUBE CARD RULE (ledger 0297, package
// ITEM). Both regressions here are SILENT on screen:
//
//   * a pan control that moves nothing looks exactly like one that works until
//     somebody presses it on the one picture it matters for, and a pan that
//     runs past the edge opens a gap the clamp exists to prevent;
//   * a link whose host is not YouTube's, or whose safety check refused it,
//     becoming a video card sends every reader's browser to a URL nobody chose
//     to load -- and a card dropped into the middle of a sentence breaks it.
//
// WHERE THE EXPECTED VALUES COME FROM: fixture geometry (a stage and a picture
// of stated sizes) and real URL shapes, each with a positive control so an
// absence cannot pass on a predicate that answers no to everything.

import { describe, expect, it } from 'vitest';
import {
	LIGHTBOX_PAN_FRACTION,
	lightboxKeyAction,
	lightboxPan,
	lightboxPanAxes,
	lightboxRetrySrc
} from '../src/lib/media/lightbox';
import { fitView } from '../src/lib/panzoom/transform';
import {
	normalizeYouTubeId,
	paragraphVideo,
	youtubeThumbnailUrl,
	youtubeVideoId
} from '../src/lib/youtube';
import { normalizeYouTubeId as gauntletNormalize } from '../src/lib/gauntlet/authoring';
import { safeHref } from '../src/lib/rich-text';

describe('the key map is the buttons’ own vocabulary', () => {
	it('every control has a key, and plain arrows page while shift arrows pan', () => {
		const got = Object.fromEntries(
			(
				[
					['ArrowLeft', false],
					['ArrowRight', false],
					['Home', false],
					['End', false],
					['+', false],
					['=', false],
					['-', false],
					['_', false],
					['0', false],
					['ArrowLeft', true],
					['ArrowRight', true],
					['ArrowUp', true],
					['ArrowDown', true]
				] as const
			).map(([k, shift]) => [`${shift ? 'Shift+' : ''}${k}`, lightboxKeyAction(k, shift)])
		);
		expect(got).toEqual({
			ArrowLeft: 'prev',
			ArrowRight: 'next',
			Home: 'first',
			End: 'last',
			'+': 'zoom-in',
			'=': 'zoom-in',
			'-': 'zoom-out',
			_: 'zoom-out',
			'0': 'fit',
			'Shift+ArrowLeft': 'pan-left',
			'Shift+ArrowRight': 'pan-right',
			'Shift+ArrowUp': 'pan-up',
			'Shift+ArrowDown': 'pan-down'
		});
	});

	it('Escape, Enter and letters are not ours (Escape is the dialog’s own)', () => {
		for (const k of ['Escape', 'Enter', 'a', 'n', ' ', 'ArrowUp', 'ArrowDown']) {
			expect(lightboxKeyAction(k, false), k).toBeNull();
		}
	});
});

describe('Move controls: only a direction that overflows, and never past an edge', () => {
	const stage = { w: 1440, h: 778 };
	const tall = { w: 1200, h: 1600 };

	it('a fitted picture overflows on neither axis (no Move controls at all)', () => {
		const f = fitView(stage, tall);
		expect(lightboxPanAxes(f, stage, tall)).toEqual({ x: false, y: false });
	});

	it('a tall photo zoomed on a wide screen overflows top to bottom only', () => {
		// 1.96x the fit, the two presses of Zoom in the gallery harness makes:
		// 583px wide at fit becomes 1143px, still inside 1440.
		const f = fitView(stage, tall);
		const z = { s: f.s * 1.96, tx: 0, ty: 0 };
		expect(lightboxPanAxes(z, stage, tall)).toEqual({ x: false, y: true });
		// Positive control: zoom further and the sides overflow too.
		expect(lightboxPanAxes({ s: f.s * 3, tx: 0, ty: 0 }, stage, tall)).toEqual({ x: true, y: true });
	});

	it('an unmeasured stage or picture answers no on both axes, never true', () => {
		expect(lightboxPanAxes({ s: 5, tx: 0, ty: 0 }, { w: 0, h: 0 }, tall)).toEqual({ x: false, y: false });
		expect(lightboxPanAxes({ s: 5, tx: 0, ty: 0 }, stage, { w: 0, h: 0 })).toEqual({ x: false, y: false });
	});

	it('"Move right" shows what is to the right: the content moves LEFT by a quarter stage', () => {
		const big = { w: 4000, h: 4000 };
		const centred = { s: 1, tx: -(4000 - 1440) / 2, ty: -(4000 - 778) / 2 };
		const moved = lightboxPan(centred, 'right', stage, big);
		expect(moved.tx).toBeCloseTo(centred.tx - stage.w * LIGHTBOX_PAN_FRACTION);
		expect(moved.ty).toBe(centred.ty);
		const down = lightboxPan(centred, 'down', stage, big);
		expect(down.ty).toBeCloseTo(centred.ty - stage.h * LIGHTBOX_PAN_FRACTION);
	});

	it('a press at an edge changes nothing rather than opening a gap', () => {
		const big = { w: 4000, h: 4000 };
		const atRightEdge = { s: 1, tx: -(4000 - 1440), ty: 0 };
		expect(lightboxPan(atRightEdge, 'right', stage, big)).toEqual(atRightEdge);
		const atLeftEdge = { s: 1, tx: 0, ty: 0 };
		expect(lightboxPan(atLeftEdge, 'left', stage, big)).toEqual(atLeftEdge);
	});
});

describe('a retry busts the cache without breaking a URL that already has a query', () => {
	it('tick 0 is the URL the thumbnail already loaded', () => {
		expect(lightboxRetrySrc('/api/classroom/attachment/a1', 0)).toBe('/api/classroom/attachment/a1');
	});
	it('a plain URL gains ?r=, a public one keeps its ?public=1 and gains &r=', () => {
		expect(lightboxRetrySrc('/api/classroom/attachment/a1', 2)).toBe('/api/classroom/attachment/a1?r=2');
		expect(lightboxRetrySrc('/api/classroom/attachment/a1?public=1', 1)).toBe(
			'/api/classroom/attachment/a1?public=1&r=1'
		);
	});
});

describe('which links are YouTube videos', () => {
	const ID = 'dQw4w9WgXcQ';

	it('the five shapes on YouTube’s own hosts (positive controls)', () => {
		for (const href of [
			`https://www.youtube.com/watch?v=${ID}`,
			`https://youtube.com/watch?feature=share&v=${ID}`,
			`https://m.youtube.com/watch?v=${ID}`,
			`https://youtu.be/${ID}?t=42`,
			`https://www.youtube.com/embed/${ID}`,
			`https://www.youtube.com/shorts/${ID}`,
			`https://www.youtube.com/live/${ID}`,
			`https://www.youtube-nocookie.com/embed/${ID}`
		]) {
			expect(youtubeVideoId(href), href).toBe(ID);
		}
	});

	it('another host carrying ?v= is NOT a video, nor is a YouTube page with no video', () => {
		for (const href of [
			`https://news.example.com/story?v=${ID}`,
			`https://youtube.com.evil.example/watch?v=${ID}`,
			'https://www.youtube.com/@engineeringchannel',
			'https://www.youtube.com/results?search_query=gearbox',
			`javascript:alert('${ID}')`,
			`ftp://youtu.be/${ID}`,
			ID,
			'',
			null
		]) {
			expect(youtubeVideoId(href as string | null), String(href)).toBeNull();
		}
	});

	it('the still is the fixed public URL, and the id is encoded into it', () => {
		expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
	});

	it('GAUNTLET reads the SAME function, not a copy of it', () => {
		expect(gauntletNormalize).toBe(normalizeYouTubeId);
	});
});

describe('which paragraphs earn a card', () => {
	const href = 'https://youtu.be/9bZkp7q19f0';
	const hrefOf = (r: { href?: string | null }) => safeHref(r.href ?? null);

	it('a paragraph that IS the link: a card that replaces it', () => {
		expect(paragraphVideo([{ text: href, href }], hrefOf)).toEqual({
			id: '9bZkp7q19f0',
			href,
			label: href,
			alone: true
		});
	});

	it('a sentence that ENDS on the link: the sentence stays, the card follows', () => {
		const v = paragraphVideo(
			[{ text: 'Watch this before class: ' }, { text: 'bearing ', href }, { text: 'removal', href }, { text: '  ' }],
			hrefOf
		);
		expect(v).toEqual({ id: '9bZkp7q19f0', href, label: 'bearing removal', alone: false });
	});

	it('a link in the MIDDLE of a sentence stays a link (the negative control for the one above)', () => {
		expect(
			paragraphVideo([{ text: 'See ' }, { text: 'this', href }, { text: ' for the method.' }], hrefOf)
		).toBeNull();
	});

	it('a link the safety check refuses can never become a card', () => {
		const refused = `javascript://youtu.be/9bZkp7q19f0`;
		expect(safeHref(refused)).toBeNull();
		expect(paragraphVideo([{ text: 'x', href: refused }], hrefOf)).toBeNull();
	});

	it('an ordinary link at the end of a sentence is not a video', () => {
		expect(paragraphVideo([{ text: 'Read ' }, { text: 'the notes', href: 'https://example.com/notes' }], hrefOf)).toBeNull();
	});
});
