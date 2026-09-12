-- tools/backup/roundtrip-seed.sql
--
-- Rows of the kinds this backup exists to protect, written straight into the
-- SOURCE database by `tools/backup/roundtrip.sh`. The point is not to exercise
-- the write RPCs (`tests/db/` does that, at length) -- it is to put something
-- in every shape the dump has to carry ACROSS the two parts it is made of, so
-- that "the rows match" is a claim about more than one table.
--
--   auth.users              -- part 1. The identity every keyed row hangs off.
--   auth.identities         -- part 1. Which Google account IS that uuid.
--   storage.buckets/objects -- part 1. Metadata only, deliberately: the BYTES
--                              are on another service and no dump reaches them.
--   public.profiles         -- part 2, and written by 0001's own trigger rather
--                              than by hand, so the restore is compared against
--                              a row the schema produced.
--   public.coin_transactions-- part 2. Append-only money. The one table where a
--                              lost row is a student's balance changing.
--   public.notebook_entries -- part 2, and the cross-part join: student_id
--                              REFERENCES auth.users(id), so if part 1 did not
--                              restore first this insert is what fails.
--
-- Deterministic uuids, so a failing comparison names a row somebody can look up.

insert into auth.users (id, email, raw_user_meta_data) values
	('11111111-1111-4111-8111-111111111111', 'ana.reyes@boscotech.net',   '{"full_name":"Ana Reyes"}'::jsonb),
	('22222222-2222-4222-8222-222222222222', 'jordan.k@boscotech.net',    '{"full_name":"Jordan K"}'::jsonb),
	('33333333-3333-4333-8333-333333333333', 'apina@boscotech.edu',       '{"full_name":"A Pina"}'::jsonb)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider, provider_id, identity_data) values
	('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'google', '100000000000000000001', '{"email":"ana.reyes@boscotech.net"}'::jsonb),
	('aaaaaaaa-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'google', '100000000000000000002', '{"email":"jordan.k@boscotech.net"}'::jsonb),
	('aaaaaaaa-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'google', '100000000000000000003', '{"email":"apina@boscotech.edu"}'::jsonb)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('notebook-photos', 'notebook-photos', false)
on conflict (id) do nothing;
insert into storage.objects (id, bucket_id, name, owner) values
	('bbbbbbbb-0000-4000-8000-000000000001', 'notebook-photos', '11111111-1111-4111-8111-111111111111/page-01.jpg', '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

-- Money. Two students, both signs, a correction: the shapes the coin reader is
-- documented as getting wrong when it re-derives them instead of reading them.
insert into public.coin_transactions (id, student_email, category_id, amount, note, actor_email) values
	('cccccccc-0000-4000-8000-000000000001', 'ana.reyes@boscotech.net', 'shop_safety_violation', -8,  'seeded: a fine',        'apina@boscotech.edu'),
	('cccccccc-0000-4000-8000-000000000002', 'ana.reyes@boscotech.net', 'shop_safety_violation', -8,  'seeded: a second fine', 'apina@boscotech.edu'),
	('cccccccc-0000-4000-8000-000000000003', 'jordan.k@boscotech.net',  'shop_not_cleaned_up',  -12,  'seeded: another fine',  'apina@boscotech.edu')
on conflict (id) do nothing;

-- The cross-part join. `student_id` references auth.users(id), which part 1
-- restored; a dump whose parts were the other way round fails HERE.
insert into public.notebook_entries (id, student_id, custom_label, status) values
	('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Blade CAD 01 bench notes', 'compliant'),
	('dddddddd-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Gauntlet practice log',    'flagged')
on conflict (id) do nothing;
