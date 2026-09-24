/**
 * Every classroom picture source opens the ONE lightbox (ledger 0297, package
 * ITEM): an imageZone photo, a handout, a hand-in and an authored figure, each
 * through its REAL component on /dev/classroom-images. The geometry spec for
 * that page (classroom-images.mjs) is what says wrapping each thumbnail in a
 * button left its box unchanged; this one opens each and closes it again.
 */
export default {
	path: '/dev/classroom-images?open=each',
	aliasOf: '/dev/classroom-images',
	label: 'Classroom image sources each open the lightbox',
	prepare: [{ waitFor: '() => document.documentElement.hasAttribute("data-fixtures-ready")' }],
	orderResult: [
		{
			label: 'each source opens a decoded picture with Download, and closes',
			evaluate: `async () => {
				const wait = (ms) => new Promise((r) => setTimeout(r, ms));
				const cases = [
					['zone', '[data-probe="zone-landscape"] [data-testid="zone-shot-open"]', 'zone-lightbox'],
					['handout', '[data-probe="attach-landscape"] [data-testid="attach-preview"]', 'attach-lightbox'],
					['hand-in', '[data-probe="submission-landscape"] [data-testid="submission-file-preview"]', 'submission-lightbox'],
					['figure', '[data-probe="figure-landscape"] [data-testid="md-figure-open"]', 'md-figure-lightbox']
				];
				const out = [];
				for (const [name, opener, id] of cases) {
					const btn = document.querySelector(opener);
					if (!btn) { out.push(name + ': no opener'); continue; }
					btn.scrollIntoView({ block: 'center', behavior: 'instant' });
					btn.click();
					await wait(500);
					const open = [...document.querySelectorAll('dialog[open]')];
					const dlg = open.find((d) => d.getAttribute('data-testid') === id);
					const img = dlg?.querySelector('[data-testid="' + id + '-img"]');
					const dl = dlg?.querySelector('[data-testid="' + id + '-download"]');
					const ok = open.length === 1 && dlg && img && img.naturalWidth > 0 && dl && dl.hasAttribute('download');
					dlg?.querySelector('[data-testid="' + id + '-close"]')?.click();
					await wait(300);
					const closed = document.querySelectorAll('dialog[open]').length === 0;
					out.push(name + ': ' + (ok ? 'opened' : 'NOT opened') + ', ' + (closed ? 'closed' : 'still open'));
				}
				return out;
			}`,
			expected: ['zone: opened, closed', 'handout: opened, closed', 'hand-in: opened, closed', 'figure: opened, closed']
		}
	]
};
