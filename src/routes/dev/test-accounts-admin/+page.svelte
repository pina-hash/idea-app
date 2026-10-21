<script lang="ts">
	/** /dev/test-accounts-admin (ledger 0422): the REAL /admin/test-accounts page over in-memory accounts. */
	import Page from '../../admin/test-accounts/+page.svelte';

	const data = {
		ready: true,
		sections: [
			{ id: '11111111-1111-4111-8111-111111111111', label: 'IDEA100 Block 2' },
			{ id: '22222222-2222-4222-8222-222222222222', label: 'IDEA209H Section 3' }
		],
		accounts: [
			{ email: 'test-student-block-2-mh1@test.ideabosco.com', user_id: 'aaaaaaaa-1111-4111-8111-111111111111', label: 'Test Student, Block 2', created_by: 'apina@boscotech.edu', created_at: '2026-10-21T15:00:00Z', retired_at: null, classes: [{ section_id: '1', label: 'IDEA100 Block 2', active: true }], last_session: '2026-10-21T16:00:00Z' },
			{ email: 'test-209h-mh2@test.ideabosco.com', user_id: 'bbbbbbbb-1111-4111-8111-111111111111', label: 'Test 209H', created_by: 'apina@boscotech.edu', created_at: '2026-10-21T15:10:00Z', retired_at: null, classes: [], last_session: null },
			{ email: 'old-mh0@test.ideabosco.com', user_id: 'cccccccc-1111-4111-8111-111111111111', label: 'Old test', created_by: 'apina@boscotech.edu', created_at: '2026-10-01T15:10:00Z', retired_at: '2026-10-10T15:10:00Z', classes: [], last_session: null }
		]
	};
</script>

<Page data={data as never} form={null} />
