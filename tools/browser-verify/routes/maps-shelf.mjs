export default {
	path: '/dev/maps-shelf',
	label: 'Shelf entry at a drawer (the phone flow: photo, name, aliases, tags, save, next one)',
	/* 375px IS THE PRIMARY WIDTH FOR THIS SURFACE, not the one checked
	   afterwards: it is used standing at a toolbox holding a phone. Every
	   measurement below is taken at both, and the ones that matter -- no
	   horizontal overflow, every control in the flow at 44px, the inch-input
	   overflow case this surface's sibling has already paid for once -- are
	   about the narrow one.

	   The four orderResult probes are what a presence or contrast read cannot
	   settle: they are claims about what a PRESS does, and two of them (the
	   refusal before upload, the container after a save) are the bundle's
	   whole point. */
	/* HYDRATION, PROVEN RATHER THAN WAITED FOR, AND IT HAS TO BE PROVEN HERE.
	   `waitForApp` returns once the DOM has stopped changing, which a
	   SERVER-RENDERED page satisfies BEFORE any handler is attached -- CLAUDE.md
	   states this exactly ("PAINT IS NOT INTERACTIVITY, AND NO WINDOW MARKER
	   SEPARATES THEM"), and every `orderResult` below then presses a control on
	   a page that may not be listening yet. It went unnoticed while this route's
	   module graph was small; adding two imports to `ShelfEntry` was enough to
	   push the first press before hydration, and the symptom was four assertions
	   reporting a working surface as broken.

	   So: type into the name box and RETRY until the plan line appears, which
	   only a live effect can produce, reporting the attempt count -- the shape
	   CLAUDE.md prescribes over any timer or marker. The box is cleared again
	   afterwards, so everything below starts from the same blank card it always
	   did. */
	prepare: [
		{
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				const type = (v) => {
					const name = q('[data-testid="maps-shelf-name"]');
					setter.call(name, v);
					name.dispatchEvent(new Event('input', { bubbles: true }));
				};
				for (let attempt = 1; attempt <= 60; attempt += 1) {
					type('hydration probe');
					await new Promise((r) => setTimeout(r, 100));
					if (q('[data-testid="maps-shelf-plan"]')) {
						type('');
						await new Promise((r) => setTimeout(r, 100));
						return 'interactive after ' + attempt + ' attempt(s)';
					}
				}
				return 'NEVER BECAME INTERACTIVE in 60 attempts';
			}`,
			label: 'the page is answering, not merely painted (retries until its own effect fires)'
		}
	],
	presence: [
		{
			selector: '[data-testid="maps-shelf-card"]',
			label: 'the entry card, open on the container it was handed',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			/* THE INPUT ITSELF IS DELIBERATELY TRANSPARENT and is not asked to
			   be visible: it is stretched at `opacity: 0` over the `<label>`
			   that paints the button, which is the only way to style a file
			   input at all. The VISIBLE, tappable control is the label, and it
			   is measured as such by the `camera and gallery buttons`
			   tap-target row below -- CLAUDE.md's "a control wrapped in a
			   <label> is measured at the label, which is what a finger hits".
			   Asking for `expectVisible: 1` here reported a working button as a
			   failure on the first run of this spec. */
			selector: '[data-testid="maps-shelf-camera"]',
			label: 'the camera input (capture=environment): present, and painting nothing itself',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 0,
			maxVisible: 0
		},
		{
			selector: '[data-testid="maps-shelf-picker-input"]',
			label: 'the gallery picker beside it, WITHOUT capture, so there is a way back to the roll',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 0,
			maxVisible: 0
		},
		{
			selector: '[data-testid="maps-shelf-card"] .file-btn',
			label: 'and the two labels that actually paint them ARE visible',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="maps-shelf-picker"]',
			label: 'NO container picker open: the container is context, not a field to re-pick',
			expectPresent: 0
		},
		{
			/* The positive control for that zero is `?state=no-container`,
			   where the same selector is the whole surface. */
			selector: '[data-testid="maps-shelf-container"]',
			label: 'the container named as a heading instead',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-shelf-receipts"]',
			label: 'NO receipts before anything has been added',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-shelf-publish-confirm"]',
			label: 'NO publish confirmation until the publish control is pressed',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-shelf-photo-problem"]',
			label: 'NO photo refusal before a photo is chosen',
			expectPresent: 0
		}
	],
	orderResult: [
		{
			label: 'A PHOTO OVER THE BUCKET LIMIT IS REFUSED BEFORE ANY UPLOAD STARTS',
			/* Stages a 21 MB file at the real camera input and reads back what
			   the surface says AND whether the upload transport was called at
			   all. The second half is the one that matters: a refusal shown
			   after the bytes went is not this rule. The harness's in-memory
			   photo transport logs every call, and the page exposes its length
			   nowhere -- so the probe reads the RENDERED refusal plus the
			   absence of a progress/receipt state, and the call log itself is
			   asserted in tests/dom/maps-shelf-mount.test.ts where it is
			   reachable. Here: the refusal is on screen and the photo did not
			   become a staged preview. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const input = q('[data-testid="maps-shelf-camera"]');
				if (!input) return ['no camera input'];
				const dt = new DataTransfer();
				dt.items.add(new File([new Uint8Array(21 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' }));
				input.files = dt.files;
				input.dispatchEvent(new Event('change', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 120));
				const problem = q('[data-testid="maps-shelf-photo-problem"]');
				const text = problem ? problem.textContent.replace(/\\s+/g, ' ').trim() : '';
				return [
					problem ? 'refused' : 'accepted',
					text.includes('21 MB') ? 'said the size' : 'size missing: ' + text,
					text.includes('20 MB') ? 'said the limit' : 'limit missing',
					q('[data-testid="maps-shelf-preview"]') || q('[data-testid="maps-shelf-preview-fallback"]')
						? 'STAGED ANYWAY'
						: 'nothing staged'
				];
			}`,
			expected: ['refused', 'said the size', 'said the limit', 'nothing staged']
		},
		{
			label: 'A HEIC THE BROWSER CAN DECODE IS CONVERTED, ON THE REAL SURFACE, AND SAYS SO',
			/* THE WIRING, END TO END, on the component that ships rather than on
			   `/dev/maps-media`'s direct call. A photo stored in a format only
			   its author's phone can draw is not a photo that saved: it is a
			   broken image every later reader gets, weeks after whoever could
			   have retaken it walked away from the drawer.

			   The bytes are a real PNG under a `.HEIC` name with an EMPTY
			   `File.type`, which is what an iPhone picker hands over and is the
			   state Safari is genuinely in with a real HEIC -- a browser decodes
			   by content and never by filename. There is no HEIC encoder in this
			   container (no ImageMagick, no libheif, no ffmpeg), so this is the
			   only way to reach the SUCCESS branch at all, and it is stated here
			   rather than described as equivalent. `/dev/maps-media` carries the
			   cannot-decode half with real ISOBMFF heic bytes. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const canvas = document.createElement('canvas');
				canvas.width = 40; canvas.height = 25;
				const ctx = canvas.getContext('2d');
				ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 40, 25);
				ctx.fillStyle = '#e0c060'; ctx.fillRect(0, 0, 13, 25);
				const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
				const dt = new DataTransfer();
				dt.items.add(new File([png], 'IMG_0042.HEIC', { type: '' }));
				const input = q('[data-testid="maps-shelf-camera"]');
				input.files = dt.files;
				input.dispatchEvent(new Event('change', { bubbles: true }));
				let converted = null;
				for (let i = 0; i < 60; i += 1) {
					await new Promise((r) => setTimeout(r, 100));
					converted = q('[data-testid="maps-shelf-photo-converted"]');
					if (converted) break;
				}
				const note = converted ? converted.textContent.replace(/\\s+/g, ' ').trim() : '';
				const out = [
					converted ? 'said it converted' : 'NO CONVERSION NOTICE',
					note.includes('HEIC') ? 'named the format' : 'did not name it: ' + note,
					q('[data-testid="maps-shelf-photo-problem"]') ? 'ALSO REFUSED IT' : 'not refused',
					q('[data-testid="maps-shelf-preview"]') ? 'previewed' : 'no preview'
				];
				/* Leave the card exactly as the next check expects to find it:
				   this one owns the photo, not the entry. */
				const remove = [...document.querySelectorAll('[data-testid="maps-shelf-card"] .btn')]
					.find((b) => b.textContent.trim() === 'Remove photo');
				if (remove) remove.click();
				await new Promise((r) => setTimeout(r, 120));
				return out;
			}`,
			expected: ['said it converted', 'named the format', 'not refused', 'previewed']
		},
		{
			label: 'AFTER A SAVE THE NEXT ENTRY IS IN THE SAME CONTAINER, WITH AN EMPTY CARD',
			/* The requirement in one measurement: thirty things in a drawer is
			   thirty names, not thirty round trips. Reads the container heading
			   and the name box before and after a real save. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const name = q('[data-testid="maps-shelf-name"]');
				const before = q('[data-testid="maps-shelf-container"]').textContent.trim();
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				setter.call(name, 'Bevel Protractor');
				name.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 80));
				q('[data-testid="maps-shelf-save"]').click();
				await new Promise((r) => setTimeout(r, 300));
				const after = q('[data-testid="maps-shelf-container"]').textContent.trim();
				const receipt = q('[data-testid="maps-shelf-receipts"] li');
				return [
					before,
					after,
					q('[data-testid="maps-shelf-name"]').value === '' ? 'card empty' : 'card still holds it',
					document.activeElement === q('[data-testid="maps-shelf-name"]') ? 'name focused' : 'focus elsewhere',
					/* The LABEL element, not the whole row: the row also carries
					   the status chip, whose glyph would land inside a sliced
					   string and make this assert something about a chip. */
					receipt ? receipt.querySelector('.receipt-label').textContent.replace(/\\s+/g, ' ').trim() : 'no receipt'
				];
			}`,
			expected: [
				'Drawer 1',
				'Drawer 1',
				'card empty',
				'name focused',
				'Bevel Protractor in Drawer 1.'
			]
		},
		{
			label: 'THE FRESHLY CREATED ITEM IS VISIBLY A DRAFT',
			/* Runs after the save above, on the receipt it left. A draft chip
			   and no published chip -- both directions, because "shows a chip"
			   would pass on a surface that showed the wrong one. */
			evaluate: `() => {
				const li = document.querySelector('[data-testid="maps-shelf-receipts"] li');
				if (!li) return ['no receipt to read'];
				return [
					li.querySelector('[data-state="draft"]') ? 'draft chip' : 'no draft chip',
					li.querySelector('[data-state="published"]') ? 'PUBLISHED CHIP TOO' : 'not published',
					/* The chip's WORD, with its glyph stripped: colour is never
					   the only signal here, and the word is the half a reader
					   who cannot see the glyph relies on. */
					((li.querySelector('[data-state="draft"]') || {}).textContent || '').replace(/[^A-Za-z]/g, '')
				];
			}`,
			expected: ['draft chip', 'not published', 'Draft']
		},
		{
			label: 'THE PUBLISH CONTROL EXPLAINS BEFORE IT PUBLISHES, AND NOTHING IS WRITTEN BY THE FIRST PRESS',
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const before = document.querySelectorAll('[data-testid="maps-shelf-receipts"] li').length;
				const name = q('[data-testid="maps-shelf-name"]');
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				setter.call(name, 'Public Thing');
				name.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 60));
				q('[data-testid="maps-shelf-publish-arm"]').click();
				await new Promise((r) => setTimeout(r, 120));
				const confirm = q('[data-testid="maps-shelf-publish-confirm"]');
				const text = confirm ? confirm.textContent.replace(/\\s+/g, ' ').trim() : '';
				const after = document.querySelectorAll('[data-testid="maps-shelf-receipts"] li').length;
				return [
					confirm ? 'explained' : 'no confirmation shown',
					text.includes('Anyone can read it without signing in') ? 'said who can read it' : 'did not: ' + text,
					after === before ? 'nothing written yet' : 'WROTE ON THE FIRST PRESS'
				];
			}`,
			expected: ['explained', 'said who can read it', 'nothing written yet']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-shelf-crumb"]',
			label: 'the whole containment chain, so the drawer is not just a name',
			must: ['IDEA Building', 'Tool Chest A', 'Drawer 1']
		},
		{
			selector: '[data-testid="maps-shelf-how-many"]',
			label: 'the one branch a person at a drawer can answer',
			must: ['Just this one', 'Several of them']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-shelf"] .eyebrow', label: 'the surface eyebrow', min: 4.5 },
		{ selector: '[data-testid="maps-shelf-crumb"]', label: 'the containment chain', min: 4.5 },
		{ selector: '[data-testid="maps-shelf-card"] .label', label: 'field labels', min: 4.5 },
		{ selector: '[data-testid="maps-shelf-card"] .hint', label: 'the hint copy under each field', min: 4.5 },
		{ selector: '[data-testid="maps-shelf-how-many"] .choice', label: 'the how-many choices', min: 4.5 },
		{ selector: '[data-testid="maps-shelf-save"]', label: 'the primary save control', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-shelf-name"]', label: 'the name box', min: 44 },
		{ selector: '[data-testid="maps-shelf-card"] .file-btn', label: 'camera and gallery buttons', min: 44 },
		{ selector: '[data-testid="maps-shelf-how-many"] .choice', label: 'the how-many choices', min: 44 },
		{ selector: '[data-testid="maps-shelf-save"]', label: 'Save', min: 44 },
		{ selector: '[data-testid="maps-shelf-publish-arm"]', label: 'Save & publish', min: 44 },
		{ selector: '[data-testid="maps-shelf-change-container"]', label: 'Change container', min: 44 },
		{ selector: '#shelf-aliases', label: 'the aliases chip input', min: 44 },
		{ selector: '#shelf-tags', label: 'the tags chip input', min: 44 }
	]
};
