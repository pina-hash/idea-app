-- Marks the 18 reports of this feedback round as `seen`, so an
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
  '33d143c0-a17e-4917-b3f5-219a2c3899ad',
  '92398c89-f443-4256-b091-4beec2256491',
  '26a682cd-e4af-408a-807f-98ce2b4c633c',
  '96aa5b66-821a-45f5-ae22-cf18c867dc1e',
  'f7be30e0-936b-42bc-b22f-c9f3176143e9',
  '7c0923f7-5ece-47a6-bd0f-a67e0803920c',
  '60838d52-6848-4f9a-a0b7-3beec15f567d',
  '7abb9593-005a-46af-ba9d-94af07bdc0db',
  'b995bbb4-1c7b-4863-bd09-b3e36cfc6c52',
  '583c212c-ec0d-45de-8e24-37d8c8626a66',
  'c40b79f9-c665-424c-881b-e57856f21264',
  'e8046054-b4cf-4cfd-8dce-eea17732a3be',
  '1aa33291-1e9b-464e-a537-3f95ccc7115a',
  '62e4fe62-4898-42bf-a401-173b2a85dc74',
  '244e94cf-f9df-4eff-893b-1ce6ba47c183',
  'e0397f7b-4355-4e0f-a00e-9127bf86e20e',
  '91711213-a131-433a-bbe1-5526a7743544',
  '481725b4-ff28-4155-95d3-73b0b61c52d2'
);
-- Expect: UPDATE 18 on a fresh round (fewer if some were already triaged).
