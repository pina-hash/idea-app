/**
 * EVERY MANIFEST FORM, THROUGH THE REAL COMPOSER, AND A HAND-SET THUMBNAIL
 * SURVIVING A RE-UPLOAD (ledger 0396, review round 1). The harness hands both
 * composers its in-memory HTML import (the database's sync mirrored: a
 * document's thumbnail becomes the post's unless a person set one by hand),
 * and this spec stages a real document the importer accepts
 * (`window.__thumbDocument`, the html-instructor harness's own) with its
 * manifest's thumbnail key rewritten into each form, through the composer's
 * own file input:
 *
 *   html          `{ kind: "html", template }`: Automatic is the live
 *                 thumbnail, which a new post cannot show before it is saved
 *                 and published, and says so
 *   data          `{ kind: "image", src: "data:image/png;..." }`: previewed in
 *                 every shape at once
 *   attachment    `{ kind: "image", src: "attachment:badge.png" }` with
 *                 badge.png staged in the post's own files: previewed from the
 *                 staged picture before the post exists
 *   missing       the same alias with nothing of that name attached: the
 *                 generated look, said in the status line too, and a sentence
 *                 naming the file to attach
 *   notemplate    `{ kind: "html", template: "nope" }` over a document that
 *                 carries only `idea-thumbnail`: never a promise of a live
 *                 thumbnail; the generated look, and the template to add
 *   invalid       an `https:` src: the generated look, and the validator's
 *                 warning, verbatim
 *
 * Then four new posts are saved (data, attachment, html, notemplate) and each saved
 * post's slot is read as the class page draws it, and the HTML assignment
 * being edited is given the generated look by hand, saved, and has a document
 * declaring a picture uploaded over it: the hand-set look is still what it
 * shows, and the row still says manual.
 */
import { THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

/** Shared by the evaluate steps: the staging helpers, as source. */
const HELPERS = `
	const wait = async (pred, ms = 10000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (pred()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
	const create = document.querySelector('[data-testid="thumbs-create"]');
	const editRoot = () => document.querySelector('[data-testid="thumbs-edit"]');
	const RE = /(<script type="application\\/json" id="idea-manifest">)([\\s\\S]*?)(<\\/script>)/;
	const TEMPLATE = '<template id="idea-thumbnail"><div style="position:absolute;inset:0;background:#0b1d12"></div></template>';
	const base = window.__thumbDocument.replace('</body>', TEMPLATE + '\\n</body>');
	const manifest = JSON.parse(RE.exec(base)[2]);
	const doc = (thumbnail) => base.replace(RE, (_, a, _b, z) => a + JSON.stringify({ ...manifest, thumbnail }) + z);
	const put = (input, file) => { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); };
	const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 40;
	const g = canvas.getContext('2d'); g.fillStyle = '#1b6a93'; g.fillRect(0, 0, 64, 40); g.fillStyle = '#f0b429'; g.fillRect(20, 8, 24, 24);
	const png = canvas.toDataURL('image/png');
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const shapes = (root) => [...root.querySelectorAll('[data-testid="thumbnail-preview"] [data-testid="post-thumb"]')].map((p) => p.getAttribute('data-shape') + ':' + p.getAttribute('data-source') + (p.getAttribute('data-ready') === 'true' ? ' painted' : '')).join(', ');
	const stageDoc = async (root, thumb, name) => {
		root.querySelector('[data-testid="staged-html-remove"]')?.click();
		await wait(() => !!root.querySelector('[data-testid="staged-html-input"]'), 3000);
		put(root.querySelector('[data-testid="staged-html-input"]'), new File([doc(thumb)], name, { type: 'text/html' }));
		await wait(() => !!root.querySelector('[data-testid="staged-html-remove"]'));
		await new Promise((r) => setTimeout(r, 500));
	};
`;

export default {
	path: `${THUMBS}?view=editor&forms=1`,
	label: 'Every manifest form through the real composer, and a hand-set thumbnail surviving a re-upload',
	prepare: [
		THUMBS_READY,
		{
			evaluate: `async () => {
				${HELPERS}
				const out = [];
				const read = (tag) => {
					const ed = create.querySelector('[data-testid="thumbnail-editor"]');
					const notes = ['thumbnail-live-note', 'thumbnail-missing-picture', 'thumbnail-missing-template', 'thumbnail-live-failed'].filter((t) => ed.querySelector('[data-testid="' + t + '"]'));
					const warn = [...create.querySelectorAll('[data-testid="staged-html-warnings"] li')].map((l) => l.textContent.trim()).filter((w) => /thumbnail/i.test(w));
					out.push([tag, ed.querySelector('[data-testid="thumbnail-now"]').textContent.trim(), shapes(ed), 'notes: ' + (notes.join(' ') || 'none'), 'warnings: ' + (warn.join(' ') || 'none')].join(' | '));
				};
				put(create.querySelector('input[type="file"][multiple]'), new File([blob], 'badge.png', { type: 'image/png' }));
				await wait(() => create.querySelectorAll('[data-testid="thumbnail-pick-item"]').length > 0, 4000);
				await stageDoc(create, { kind: 'html', template: 'idea-thumbnail' }, 'gear.html');
				read('html');
				await stageDoc(create, { kind: 'image', src: png }, 'gear.html');
				await wait(() => /painted/.test(shapes(create)), 4000);
				read('data');
				await stageDoc(create, { kind: 'image', src: 'attachment:badge.png' }, 'gear.html');
				await wait(() => /painted/.test(shapes(create)), 4000);
				read('attachment');
				await stageDoc(create, { kind: 'image', src: 'attachment:missing.png' }, 'gear.html');
				read('missing');
				await stageDoc(create, { kind: 'html', template: 'nope' }, 'gear.html');
				read('notemplate');
				await stageDoc(create, { kind: 'image', src: 'https://example.com/cover.png' }, 'gear.html');
				read('invalid');
				window.__forms = out;
				return out.length + ' forms staged';
			}`,
			until: `() => (window.__forms ?? []).length === 6`
		},
		{
			evaluate: `async () => {
				${HELPERS}
				const saveCreate = async (thumb, title) => {
					await stageDoc(create, thumb, 'gear.html');
					const t = create.querySelector('input[type="text"]');
					t.value = title;
					t.dispatchEvent(new Event('input', { bubbles: true }));
					const before = document.querySelectorAll('[data-testid="thumbs-write"][data-op="html"]').length;
					create.querySelector('[data-testid="composer-publish-bottom"]').click();
					await wait(() => document.querySelectorAll('[data-testid="thumbs-write"][data-op="html"]').length > before, 8000);
					await new Promise((r) => setTimeout(r, 500));
				};
				await saveCreate({ kind: 'image', src: png }, 'A data picture');
				put(create.querySelector('input[type="file"][multiple]'), new File([blob], 'badge.png', { type: 'image/png' }));
				await new Promise((r) => setTimeout(r, 300));
				await saveCreate({ kind: 'image', src: 'attachment:badge.png' }, 'An attached picture');
				await saveCreate({ kind: 'html', template: 'idea-thumbnail' }, 'A live thumbnail');
				await saveCreate({ kind: 'html', template: 'nope' }, 'A template the document lacks');
				// The edited assignment: the generated look by hand, saved ...
				editRoot().querySelector('[data-testid="thumbnail-generated"]').click();
				await new Promise((r) => setTimeout(r, 200));
				editRoot().querySelector('[data-testid="composer-publish-bottom"]').click();
				await wait(() => document.querySelectorAll('[data-testid="thumbs-write"][data-op="generated"]').length > 0, 8000);
				await new Promise((r) => setTimeout(r, 600));
				// ... then a document declaring a picture uploaded over it.
				await stageDoc(editRoot(), { kind: 'image', src: png }, 'gear-v2.html');
				editRoot().querySelector('[data-testid="staged-html-confirm"]')?.click();
				const before = document.querySelectorAll('[data-testid="thumbs-write"][data-op="html"]').length;
				editRoot().querySelector('[data-testid="composer-publish-bottom"]').click();
				await wait(() => document.querySelectorAll('[data-testid="thumbs-write"][data-op="html"]').length > before, 8000);
				await new Promise((r) => setTimeout(r, 600));
				document.querySelector('[data-testid="thumbs-writes"] .saved').scrollIntoView({ block: 'center', behavior: 'instant' });
				return 'saved';
			}`,
			until: `() => document.querySelectorAll('[data-testid="thumbs-saved"]').length === 5`
		},
		{
			waitFor: `() => [...document.querySelectorAll('[data-testid="thumbs-saved"] [data-testid="post-thumb"]')].filter((p) => p.getAttribute('data-ready') === 'true').length === 3`,
			timeoutMs: 20000
		}
	],
	orderResult: [
		{
			label: 'each manifest form, staged on a new post: what Automatic says, how every shape previews it, and what is said beside it',
			evaluate: `() => window.__forms ?? []`,
			expected: [
				"html | Automatic: the HTML document's live thumbnail. | tile:generated, wide:generated, banner:generated | notes: thumbnail-live-note | warnings: none",
				"data | Automatic: the HTML document's picture. | tile:image painted, wide:image painted, banner:image painted | notes: none | warnings: none",
				"attachment | Automatic: the HTML document's picture. | tile:image painted, wide:image painted, banner:image painted | notes: none | warnings: none",
				"missing | Automatic: the generated look, because the picture the HTML document names is not one of this post's files. | tile:generated, wide:generated, banner:generated | notes: thumbnail-missing-picture | warnings: none",
				'notemplate | Automatic: the generated look, because the HTML document does not carry the thumbnail template "nope" its manifest names. | tile:generated, wide:generated, banner:generated | notes: thumbnail-missing-template | warnings: The manifest names a thumbnail template "nope" the document does not carry. Add <template id="nope"> with the thumbnail inside it, or posts show the generated look.',
				'invalid | Automatic: the generated look: its type on a tile in its unit color. | tile:generated, wide:generated, banner:generated | notes: none | warnings: The manifest\'s thumbnail image must be "attachment:<filename>" (a picture attached to the post) or a data: PNG, JPEG, GIF or WebP, so posts show the generated look instead.'
			]
		},
		{
			label: 'each saved post, drawn as the class page draws it',
			evaluate: `() => [...document.querySelectorAll('[data-testid="thumbs-saved"]')].map((r) => { const p = r.querySelector('[data-testid="post-thumb"]'); return r.getAttribute('data-item-id') + ' ' + p.getAttribute('data-source') + (p.getAttribute('data-ready') === 'true' ? ' painted' : ''); })`,
			expected: ['new-1 image painted', 'new-2 image painted', 'new-3 html painted', 'new-4 generated', 'as-edit generated']
		},
		{
			label: 'the hand-set look survived the re-upload: still manual, still the generated look, and the editor says so',
			evaluate: `() => [
				'writes ' + [...document.querySelectorAll('[data-testid="thumbs-write"]')].filter((w) => w.textContent.includes('as-edit')).map((w) => w.getAttribute('data-op')).join(' '),
				'manual ' + /"manual":true/.test(document.querySelector('[data-testid="thumbs-last-row"]')?.textContent ?? ''),
				document.querySelector('[data-testid="thumbs-edit"] [data-testid="thumbnail-now"]')?.textContent.trim()
			]`,
			expected: ['writes update generated update html', 'manual true', 'The generated look, chosen by hand.']
		}
	],
	presence: [
		{ selector: '[data-testid="thumbs-saved"] [data-testid="post-thumb"]', label: 'a slot for each saved post', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="thumbs-saved"] iframe[sandbox]', label: "the saved live thumbnail's sandboxed frame", expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="thumbs-saved"] iframe[sandbox*="allow-same-origin"]', label: 'no frame granted allow-same-origin', expectPresent: 0 }
	],
	/* The edited post's own pictures load from the attachment route, which
	   answers 401 with no session in a harness; their tiles name the file. */
	ignoreConsole: [/api\/classroom\/attachment\/att-/, /Failed to load resource: net::ERR_FAILED/]
};
