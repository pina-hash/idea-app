/**
 * THE CHECKED OUT TABLE UNDER SPACE WHITE: the tone inks and the row text were
 * measured on panel faces before this round, so they are re-measured here on
 * the WELL face the table now sits on, with the tabs as the plate's pads.
 */
import { ARMORY_HYDRATED } from './_armory.mjs';

export default {
	path: '/dev/armory?state=many-out&theme=space-white',
	label: 'IDEA Armory: sixty checkouts under Space White',
	prepare: [...ARMORY_HYDRATED, { waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="armory-checkout"]', label: '25 rows', expectPresent: 25, maxPresent: 25, expectVisible: 25 }
	],
	contrast: [
		{ selector: ':is(.ar-out-who, .ar-out-device, .ar-out-since, .ar-out-folder)', label: 'who, where, since and folder, on the well', min: 4.5 },
		{ selector: '.ar-out-name', label: 'file names', min: 4.5 },
		{ selector: '.ar-out-file .ar-tone-editing', label: 'the checked-out glyph', min: 3 },
		{ selector: '.ar-tab', label: 'the tabs', min: 4.5 },
		{ selector: '.ar-readout', label: 'the readouts', min: 4.5 },
		{ selector: '[data-testid="armory-holder"]', label: 'holder keys', min: 4.5 },
		{ selector: '.ar-live', label: 'live, in words', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.ar-tab', label: 'the tabs', min: 44 },
		{ selector: '[data-testid="armory-take-back"]', label: 'Force check in', min: 44 }
	]
};
