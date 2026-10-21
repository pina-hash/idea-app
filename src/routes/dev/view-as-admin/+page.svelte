<script lang="ts">
	/** /dev/view-as-admin (ledger 0422): the REAL /admin/view-as page over an in-memory search and record. */
	import Page from '../../admin/view-as/+page.svelte';

	const data = {
		q: 're',
		ready: true,
		people: [
			{ id: '11111111-1111-4111-8111-111111111111', email: 'ana.reyes@boscotech.net', full_name: 'Ana Reyes', display_name: null, role: 'student', avatar_url: null },
			{ id: '22222222-2222-4222-8222-222222222222', email: 'andres.reed@boscotech.net', full_name: 'Andres Reed', display_name: null, role: 'student', avatar_url: null },
			{ id: '33333333-3333-4333-8333-333333333333', email: 'jcosso@boscotech.edu', full_name: 'Jorge Cosso', display_name: 'Mr. Cosso', role: 'teacher', avatar_url: null }
		],
		history: [
			{
				session: 'a', mode: 'act' as const, admin_email: 'apina@boscotech.edu', admin_name: 'Mr. Pina', target_email: 'ana.reyes@boscotech.net', target_name: 'Ana Reyes',
				started_at: '2026-10-21T16:02:00Z', ended_at: '2026-10-21T16:09:00Z', expires_at: '2026-10-21T19:02:00Z',
				changes: [
					{ table: 'classroom_submissions', operation: 'UPDATE', path: '/rpc/classroom_submit_assignment', at: '2026-10-21T16:05:00Z' },
					{ table: 'classroom_responses', operation: 'INSERT', path: '/rpc/classroom_save_response', at: '2026-10-21T16:04:00Z' }
				]
			},
			{
				session: 'b', mode: 'view' as const, admin_email: 'apina@boscotech.edu', admin_name: 'Mr. Pina', target_email: 'test-1@test.ideabosco.com', target_name: 'Test Student One',
				started_at: '2026-10-21T15:40:00Z', ended_at: '2026-10-21T15:52:00Z', expires_at: '2026-10-21T18:40:00Z', changes: []
			}
		]
	};
</script>

<Page data={data as never} form={null} />
