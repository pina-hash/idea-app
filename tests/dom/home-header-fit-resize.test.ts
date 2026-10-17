// tests/dom/home-header-fit-resize.test.ts
//
// A phone's address bar showing and hiding resizes the window's HEIGHT during
// ordinary scrolling. Every reading `fitHomeHeader` takes is a function of the
// width, so a height-only resize must not re-run the fit (which, below 900px,
// clones the header and lays the copy out up to four times). A width change
// still must. The fit's own work is counted through the header's
// `querySelector`, which every run calls first.
import { afterEach, describe, expect, it } from 'vitest';
import { fitHomeHeader } from '../../src/lib/home-header-fit';

function setWindow(width: number, height: number) {
	Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
	Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
	window.dispatchEvent(new Event('resize'));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

let teardown: (() => void) | null = null;
afterEach(() => {
	teardown?.();
	teardown = null;
	document.body.innerHTML = '';
});

describe('fitHomeHeader and window resizes', () => {
	it('re-runs on a width change and not on a height-only change', async () => {
		setWindow(375, 700);
		const header = document.createElement('header');
		header.innerHTML = '<div class="header-left"></div><div class="header-right"></div>';
		document.body.append(header);
		let runs = 0;
		const original = header.querySelector.bind(header);
		header.querySelector = ((selector: string) => {
			runs++;
			return original(selector);
		}) as typeof header.querySelector;

		const action = fitHomeHeader(header);
		teardown = () => action.destroy();
		await flush();
		const afterMount = runs;
		expect(afterMount).toBeGreaterThan(0);

		setWindow(375, 640);
		setWindow(375, 700);
		await flush();
		expect(runs).toBe(afterMount);

		setWindow(414, 700);
		await flush();
		expect(runs).toBeGreaterThan(afterMount);
	});
});
