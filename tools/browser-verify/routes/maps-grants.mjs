import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/maps-grants',
	label: 'Maps granted editors (admin and grantee side by side, nothing selected)',
	widths: WIDTHS,
	/* THE WHOLE CLAIM OF 0172 IS A DIFFERENCE, so the harness renders BOTH
	   roles over one fixture and every number below is a pair. A spec that
	   drove the grantee alone would be comparing against a figure remembered
	   from another run, which is the shape of measurement that silently drifts.

	   Both columns mount the REAL MapsEditor -- the same component the route
	   mounts -- so a measured difference is a fact about the editor rather
	   than about this page. */
	presence: [
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-add-root"]',
			label: 'the ADMIN can add a root container (site, building, outdoor zone)',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-add-root"]',
			label: 'the GRANTEE cannot: a subtree grant never reaches the root',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-scope-note"]',
			label: 'the grantee is told what they hold, before touching anything',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-scope-note"]',
			label: 'an admin gets no scope note (there is no scope to state)',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-grant-admin"]',
			label: 'the grant console is on the admin side',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-grant-admin"]',
			label: 'and NOT on the grantee side -- a separate injected transport, absent',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-node-tree"] .tree-row',
			label: 'admin tree rows (the whole 8-node fixture)',
			expectPresent: 8,
			expectVisible: 8
		},
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-node-tree"] .tree-row',
			/* 7, not 8: `Prototype Lab` is a DRAFT outside the grant. Every
			   PUBLISHED node is still there, which is 0161's public read and
			   not this tier's doing -- stating the number rather than "fewer"
			   is what makes a policy that started hiding published rows, or one
			   that stopped hiding the draft, both visible. */
			label: 'grantee tree rows: 7 of 8 -- the one draft outside the grant is gone',
			expectPresent: 7,
			expectVisible: 7
		},
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-grant-roster"] li',
			label: 'no roster in the grantee column at all',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-scope-note"]',
			label: 'the scope names the CONTAINMENT PATH, and says what is not included',
			must: ['Machine Shop', 'Publishing', 'site admin'],
			/* A uuid on this line is the failure mapsNodePath exists to
			   prevent: nobody can check a grant they cannot read. */
			mustNot: ['node-machine-shop']
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-grant-roster"]',
			label: 'the roster reads by path, never by id',
			must: ['IDEA Building / Machine Shop', 'student@boscotech.net'],
			mustNot: ['node-machine-shop']
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-grant-admin"] .hint',
			label: 'the console states what a grant covers and what it never covers',
			must: ['drafts', 'never covers publishing', 'immediately']
		}
	],
	contrast: [
		{
			selector: '[data-testid="maps-grants-grantee"] [data-testid="maps-scope-note"]',
			label: 'the scope sentence',
			min: 4.5
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-grant-admin"] .hint',
			label: 'the grant console rule copy',
			min: 4.5
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-grant-roster"] .path',
			label: 'the containment path on a roster row',
			min: 4.5
		},
		{
			selector: '[data-testid="maps-grants-admin"] [data-testid="maps-grant-roster"] .email',
			label: 'the granted address on a roster row',
			min: 4.5
		},
		/* `> h2`, not `.col h2`: the testid IS on the `.col` element, so a
		   descendant `.col` never matches and the row came back "no match" --
		   a contrast check that measures nothing and reports it as neither
		   pass nor fail. */
		{ selector: '[data-testid="maps-grants-admin"] > h2', label: 'the column heading', min: 4.5 }
	],
	tapTargets: [
		{
			selector: '[data-testid="maps-grant-submit"]',
			label: 'the Grant editing control',
			min: 44
		},
		{
			selector: '[data-testid="maps-grant-revoke-arm"]',
			label: 'the Revoke control on a roster row',
			min: 44
		},
		{
			selector: '[data-testid="maps-grant-email"]',
			label: 'the email field (a grant is typed on a phone as often as not)',
			min: 44
		},
		{ selector: '[data-testid="maps-grant-node"]', label: 'the container picker', min: 44 }
	],
	orderResult: [
		{
			label: 'THE REVOKE IS TWO STEPS AND ACTUALLY REMOVES THE ROW',
			/* A destructive control arms then confirms, and the confirmation
			   lands on the surface that is on screen AFTERWARDS -- the list,
			   which is what the revoke changed. Reading the row count before
			   and after is reading the thing the rule is about; reading the
			   notice alone would pass over a list that never moved.

			   RETRIED AGAINST ITS OWN EFFECT rather than waited on with a
			   timer: SSR markup satisfies DOM stability before hydration
			   attaches a handler, so an early click is a no-op that a fixed
			   delay reports as success. The attempt count is returned. */
			evaluate: `async () => {
				const rows = () => document.querySelectorAll('[data-testid="maps-grant-roster"] li').length;
				const before = rows();
				const press = async (sel, want) => {
					for (let i = 1; i <= 20; i += 1) {
						const el = document.querySelector(sel);
						if (!el) return { attempts: i, ok: false, why: 'no ' + sel };
						el.click();
						await new Promise((r) => setTimeout(r, 150));
						if (want()) return { attempts: i, ok: true };
					}
					return { attempts: 20, ok: false, why: 'never took effect: ' + sel };
				};
				const arm = await press(
					'[data-testid="maps-grant-revoke-arm"]',
					() => !!document.querySelector('[data-testid="maps-grant-revoke-go"]')
				);
				if (!arm.ok) return ['arm ' + arm.why];
				const go = await press('[data-testid="maps-grant-revoke-go"]', () => rows() < before);
				const notice = document.querySelector('[data-testid="maps-grant-notice"]');
				return [
					'before ' + before,
					'after ' + rows(),
					go.ok ? 'removed' : go.why,
					'arm attempts ' + arm.attempts + ', confirm attempts ' + go.attempts,
					notice && /no longer edit/.test(notice.textContent || '') ? 'said so' : 'silent'
				];
			}`,
			expected: ['before 1', 'after 0', 'removed', 'arm attempts 1, confirm attempts 1', 'said so']
		},
		{
			label: 'A NON-BOSCO ADDRESS IS REFUSED IN THE SAME WORDS THE DATABASE USES',
			/* The browser pre-check and `maps_editor_grant`'s own raise are the
			   same sentence (`mapsGrantEmailProblem`), so somebody who trips it
			   before pressing and somebody who trips it after read one thing.
			   This measures the sentence, not that something went red. */
			evaluate: `async () => {
				const input = document.querySelector('[data-testid="maps-grant-email"]');
				if (!input) return ['no email field'];
				const setter = Object.getOwnPropertyDescriptor(
					window.HTMLInputElement.prototype, 'value'
				).set;
				setter.call(input, 'someone@gmail.com');
				input.dispatchEvent(new Event('input', { bubbles: true }));
				for (let i = 0; i < 20; i += 1) {
					await new Promise((r) => setTimeout(r, 100));
					const p = document.querySelector('[data-testid="maps-grant-email-problem"]');
					if (p) {
						return [
							/Bosco Tech account/.test(p.textContent || '') ? 'named the rule' : 'said: ' + p.textContent,
							/someone@gmail.com/.test(p.textContent || '') ? 'quoted the address back' : 'did not quote it'
						];
					}
				}
				return ['no refusal shown after 2s'];
			}`,
			expected: ['named the rule', 'quoted the address back']
		}
	]
};
