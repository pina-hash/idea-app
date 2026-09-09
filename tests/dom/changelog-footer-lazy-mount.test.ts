// tests/dom/changelog-footer-lazy-mount.test.ts
//
// THE DISCLOSURE ACTUALLY FETCHES, AND `toggle` IS THE EVENT THAT PROVES IT.
//
// `ChangelogFooter` shows eight entries and used to import all 1,433 to do it.
// The log is now behind `await import('virtual:site-changelog')`, fired from
// the `<details>` element's own `toggle` event -- chosen over a click handler
// because a disclosure is also opened by the keyboard, by find-in-page and by
// the browser restoring its state, and `toggle` is the one event that fires for
// all of them.
//
// THIS HAS TO BE A MOUNT, NOT A SOURCE SWEEP. `tests/loading-static-imports.ts`
// already proves the import is dynamic; what it cannot prove is that the
// handler is REACHED. Svelte 5 delegates a fixed list of events at the root and
// attaches everything else directly, so whether `ontoggle` fires is a property
// of the compiled component rather than of the source -- exactly the shape that
// bit `dialog`'s non-bubbling `close` elsewhere in this repo. `tests/dom` is
// the only project where `mount()` runs an effect.
//
// NO GEOMETRY IS ASSERTED HERE. happy-dom has no layout engine, so a box, a
// ratio or a tap target read in this project is zero and passes vacuously; the
// claims below are structural and event-driven only.
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ChangelogFooter from '../../src/lib/frc/ChangelogFooter.svelte';
import { entries as stubEntries } from '../stubs/site-changelog';

function render() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ChangelogFooter, { target });
	flushSync();
	return {
		target,
		done: () => {
			unmount(component);
			target.remove();
		}
	};
}

const rows = (t: HTMLElement) => t.querySelectorAll('.cl-list li').length;

describe('the FRC changelog footer', () => {
	it('renders the summary WITHOUT the log, from the eager scalars', () => {
		const { target, done } = render();

		const details = target.querySelector('details');
		expect(details).not.toBeNull();
		/* The collapsed state is the whole reason `latest` stays eager: this
		   line is on screen before anybody touches the disclosure. */
		expect(target.querySelector('.cl-latest')?.textContent).toContain('Updated');
		expect(rows(target)).toBe(0);

		done();
	});

	it('fetches the log when the disclosure is opened, and lists it', async () => {
		const { target, done } = render();
		const details = target.querySelector('details') as HTMLDetailsElement;

		expect(rows(target)).toBe(0);

		details.open = true;
		details.dispatchEvent(new Event('toggle'));
		/* The import resolves in a microtask; let it and the rerender land. */
		await Promise.resolve();
		await new Promise((r) => setTimeout(r, 0));
		flushSync();

		expect(rows(target)).toBeGreaterThan(0);
		expect(rows(target)).toBe(Math.min(8, stubEntries.length));
		expect(target.textContent).toContain(stubEntries[0].note);

		done();
	});

	it('fetches once, not on every open and close', async () => {
		const { target, done } = render();
		const details = target.querySelector('details') as HTMLDetailsElement;

		for (const open of [true, false, true]) {
			details.open = open;
			details.dispatchEvent(new Event('toggle'));
			await Promise.resolve();
			await new Promise((r) => setTimeout(r, 0));
			flushSync();
		}

		/* The latch holds: still exactly the capped list, never a doubled one. */
		expect(rows(target)).toBe(Math.min(8, stubEntries.length));

		done();
	});

	it('does not fetch on a toggle that CLOSES it', async () => {
		const { target, done } = render();
		const details = target.querySelector('details') as HTMLDetailsElement;

		/* `open` stays false: this is the close half of a toggle, and the
		   handler must read the element rather than assume an open. */
		details.open = false;
		details.dispatchEvent(new Event('toggle'));
		await Promise.resolve();
		await new Promise((r) => setTimeout(r, 0));
		flushSync();

		expect(rows(target)).toBe(0);

		done();
	});
});
