export default {
	path: '/dev/maps-shelf?state=no-photos',
	label: 'Shelf entry with the photo transports withheld (absence as the mechanism)',
	/* THE POSITIVE-CONTROL PAIR FOR THE PHOTO CONTROLS. `maps-shelf.mjs`
	   asserts the camera and the picker are PRESENT; this state withholds the
	   transports and asserts they are gone. Neither reading means anything on
	   its own -- a renamed testid reads as "absent" and a broken transport
	   check reads as "present" -- and together they say the control is
	   genuinely driven by whether there is anywhere for a photo to go.

	   Everything else about the flow is unchanged here, which is the second
	   half of the claim: withholding photos removes the camera and NOT the
	   ability to record what is in the drawer. */
	presence: [
		{
			selector: '[data-testid="maps-shelf-photo"]',
			label: 'NO photo section at all without photo transports',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-shelf-camera"]',
			label: 'NO camera input',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-shelf-picker-input"]',
			label: 'NO gallery picker',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-shelf-card"]',
			label: 'the rest of the card is untouched (the control for those three zeros)',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-shelf-save"]',
			label: 'and it still saves: no photo path is not no entry path',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	orderResult: [
		{
			label: 'AN ENTRY STILL SAVES WITH NO PHOTO PATH AT ALL',
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const name = q('[data-testid="maps-shelf-name"]');
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				setter.call(name, 'Thing With No Picture');
				name.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 80));
				q('[data-testid="maps-shelf-save"]').click();
				await new Promise((r) => setTimeout(r, 300));
				const li = q('[data-testid="maps-shelf-receipts"] li');
				return [
					li ? 'saved' : 'no receipt',
					li && li.textContent.includes('photo') ? 'CLAIMED A PHOTO' : 'no photo claimed'
				];
			}`,
			expected: ['saved', 'no photo claimed']
		}
	]
};
