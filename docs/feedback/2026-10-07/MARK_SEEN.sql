-- Marks the 19 reports of this feedback round as `seen`, so an
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
  '792eb6b1-2ea2-4584-8095-25f748addad4',
  '4c614121-7b03-4372-93e5-65cd872d7cc6',
  '6a8e90e0-1e13-4766-bf43-acfad749a742',
  '43a6e5f0-2cfd-4122-8655-0b0abc217834',
  '3b56fb50-5e26-4fd0-83db-50132112513a',
  '26033e4b-4347-4977-84f2-35aaf6551d9e',
  '787862db-1462-46a2-abf4-acfcc50d8670',
  '145c0352-fb58-4500-b480-29855a8aa0c7',
  'c4d516ca-e7f4-4f8c-b1e3-fb37b480b837',
  '927b1c69-7708-428a-838a-a285da07e9ff',
  'e36c5437-09cf-4712-8ca2-9ae702bdc10d',
  '444c7c2a-b890-4fff-928c-e0237c406b31',
  'd362bfb3-e6ca-4002-be44-3d04f47e5cf2',
  '5ab3adb6-87a2-40a6-8c38-d65062332714',
  '63fb1c49-b59f-4804-91ee-01718318ac90',
  'd8810fd5-5ce8-4dbc-ba33-0f3d85946016',
  '1c7c63b8-ba9a-4fcc-bb14-98afb09cad9d',
  'a31dbfa7-f065-4265-aa46-8c7d538b4f7c',
  'c824569e-ae37-4dd5-8a4c-cff32d1b989e'
);
-- Expect: UPDATE 19 on a fresh round (fewer if some were already triaged).
