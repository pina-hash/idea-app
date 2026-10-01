-- Marks the 27 reports of this feedback round as `seen`, so an
-- export filtered to `status: new` stops returning them. Only rows still `new`
-- move: a report somebody already resolved or marked spam is left alone.
-- Undo: the same statement with `status = 'new'` and `where status = 'seen'`.
-- Paste once in the Supabase SQL editor. It writes directly because
-- `app_feedback_set_status` needs a signed-in admin and the editor has no session;
-- the columns written are exactly the ones that function writes.
update public.app_feedback
set status = 'seen', reviewed_at = now(), reviewed_by = 'apina@boscotech.edu'
where status = 'new'
  and id in (
  '162057f0-2939-4123-b87b-94e6c3b21b77',
  'c26026b0-b6c9-4e0f-b41a-0bdcadd0d520',
  '6d076258-9b15-4791-a3af-9654c14ff4e8',
  'b2ba6d74-5ada-4e42-bc7e-bd923d68d437',
  '94e312c4-12f9-464f-98e1-dd9083e5dfa3',
  '9f94f730-2975-43c1-9199-ece84d467bbc',
  'd983e776-68f0-43fd-8595-31fde6c84ee0',
  '6f83abad-4103-4a6d-8ce3-2d22a9de253c',
  '2d83c063-07f2-4d87-bb05-81a7460ef26f',
  '647d1201-586c-417c-a07a-9fa49e6f2895',
  'c683efd2-5953-4d0b-9ac3-7b9d734fa6ad',
  'ab750cbc-1798-4a53-b45a-881e08eb19d2',
  'f7b3070d-a74b-4694-8680-e05d4f03c2c9',
  '8f78d5bd-fa3e-45e1-b5b5-4cd7263f3aa4',
  '77da8df3-2a6c-45ef-9eb2-0116aa29b52c',
  'c55aca24-f97c-41d1-883e-ad96e58679d7',
  '35d0d324-175f-4411-ab54-49749116ffb5',
  '42e51cae-c49b-4edc-b0c3-ef2955d95ab4',
  'f812f3d9-e909-4a6b-91d7-33a0f0fb1095',
  'a2fe2f8f-1db1-4ae5-b9c6-f547a15c5661',
  '586d60e1-8aba-42c7-8f8e-c32d78f728a7',
  'c994ce32-abdc-498b-bd63-b472072c8197',
  '38df7005-6171-4e66-8845-12d76ccbb636',
  '023f9d2f-4726-4ad4-aa00-59125e53ae69',
  '7933566a-0013-47a8-8fd6-5f9167cf876d',
  'f09ccabd-a6ed-4852-a05d-9f02d5c215d3',
  '41c7fcd5-20be-47d7-8b4f-1d4683171170'
);
-- Expect: UPDATE 27 on a fresh round (fewer if some were already triaged).
