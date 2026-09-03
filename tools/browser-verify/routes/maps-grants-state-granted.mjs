import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/maps-grants?state=granted',
	label: 'Maps granted editors (Drawer 2 open: a DRAFT container inside the grant)',
	widths: WIDTHS,
	/* THE STATE A GRANTED EDITOR ACTUALLY WORKS IN. Drawer 2 is inside the
	   granted room and is a draft, so everything the tier is FOR is available
	   -- and the one thing it is not, publishing, is the difference this file
	   measures against the admin column beside it. */
	presence: [
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-readonly-note"]',
			label: 'no refusal note: a draft inside the grant is fully editable',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-who-publishes"]',
			label: 'the sentence that takes the place of the publish control',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-who-publishes"]',
			label: 'and NOT for the admin, who has the control instead',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-grants-admin"] .publish-actions .btn',
			label: 'the admin publish controls (the positive control for the row above)',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-grants-grantee"] .publish-actions .btn',
			label: 'zero publish controls for the grantee',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-node-delete"]',
			label: 'the delete section is there -- a grantee deletes their own drafts',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-who-publishes"]',
			label: 'it names who publishes and what is true until then',
			must: ['site admin', 'public map']
		},
		{
			selector: '[data-testid="maps-grants-grantee"] .actions',
			label: 'the grantee gets Save draft and no publish verb beside it',
			must: ['Save draft'],
			mustNot: ['publish']
		},
		{
			selector: '[data-testid="maps-grants-admin"] .actions',
			label: 'the admin gets both -- the pair that makes the row above a measurement',
			must: ['Save draft', 'publish']
		}
	],
	contrast: [
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-who-publishes"]',
			label: 'the who-publishes line',
			min: 4.5
		}
	],
	tapTargets: [
		{
			selector: '[data-testid="maps-grants-grantee"] .actions .btn',
			label: 'the grantee Save control',
			min: 44
		}
	]
};
