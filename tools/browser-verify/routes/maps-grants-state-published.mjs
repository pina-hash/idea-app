import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/maps-grants?state=published',
	label: 'Maps granted editors (Drawer 1 open: inside the grant, but already public)',
	widths: WIDTHS,
	/* THE CASE A SUBTREE-ONLY CHECK GETS WRONG. Drawer 1 is INSIDE the granted
	   room and is PUBLISHED, so scope alone says yes and the draft ceiling says
	   no. Measuring it beside the admin's own view of the SAME node is what
	   separates "the grantee sees less" from "the grantee sees less of this
	   particular thing, for this particular reason". */
	presence: [
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-readonly-note"]',
			label: 'the grantee is told why there is no Save, where the Save would have been',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-readonly-note"]',
			label: 'the admin gets no note, because nothing is missing for them',
			expectPresent: 0
		},
		{
			/* A DRAFT CHILD UNDER A PUBLISHED CONTAINER IS ALLOWED, and this
			   spec asserted the opposite in its first draft. The gate is
			   `canEditAt(node.id)` -- is this container in the subtree -- and
			   NOT "is this container a draft", because a grantee cataloguing a
			   public drawer is putting DRAFT items into it, which is the whole
			   ordinary case. The container's own published-ness only stops the
			   container from being renamed, which is the readonly note above.
			   Measured: present 1 on both sides, so the pair is a control for
			   the scope filter rather than for the draft ceiling. */
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-add-child"]',
			label: 'a grantee MAY still add draft content inside a published container they hold',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-add-child"]',
			label: 'the admin the same -- the pair that says this row is not about the draft ceiling',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-node-detail"]',
			/* THE PANE IS STILL THERE. "You may not change this" and "you may
			   not see this" are different answers, and the second one is the
			   database's. A grantee reads the drawer they are cataloguing
			   around; they simply cannot rename it. */
			label: 'the detail pane still renders: read-only is not invisible',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-readonly-note"]',
			label: 'the refusal names both halves of the rule',
			must: ['drafts', 'containers you have been given', 'site admin']
		}
	],
	contrast: [
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-readonly-note"]',
			label: 'the read-only reason',
			min: 4.5
		}
		/* The who-publishes line is NOT here and that is the state's own rule
		   rather than an omission: a PUBLISHED object has nothing pending, so
		   `maps_publish` answers `nothing_pending` and the panel offers no
		   control and no substitute sentence to anybody. It is measured on
		   ?state=granted, where the object is a draft and there genuinely is
		   something a grantee cannot do. */,
	],
	tapTargets: []
};
