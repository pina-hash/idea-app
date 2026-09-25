-- Marks the 35 reports of this feedback round as `seen`, so an
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
  '400b6aaf-c5b7-4c50-a40b-cfd6d0221b05',
  '64f89e38-606e-4afd-83ba-dd26881b4017',
  'c9487c6f-79a1-4821-b885-a89f431e1793',
  'c31b5824-cb3e-42ca-b4cc-a67edad0e75d',
  'b04efb05-dba0-4819-a0f3-27228b98a865',
  'efe055b3-9e54-4af9-8052-4a25fd37fe6a',
  'bbceb8fa-cb57-4f61-9c48-38f2073c15d4',
  '1d3e0f1e-bcbd-4784-b466-4b457aabc0e6',
  '8cba8428-19a7-4459-9775-9fa785ead2b9',
  'd521d2df-c8e7-4a9d-b887-d31c6e0d2725',
  '5e641f01-0df4-4868-bad5-05310bfce830',
  '16b92615-39b6-44ee-be11-12efd8c5de7d',
  'ad7b347c-fddd-4df6-8f31-df6afbe2024d',
  'e905d5c3-c333-4f55-ab19-158cf5c94366',
  '9e28d1ee-1f00-410f-a79f-3a3fbf897edc',
  '8d141817-2e75-4bf6-9355-70a13b727033',
  '71e91616-54a2-4340-b8ee-cf2466c752e7',
  '7d0da3c1-dd95-4fb5-bb84-da21a979e86d',
  '64aa1380-361c-4882-8ab6-94ced1117ee4',
  '9a0e793a-ded6-4055-9c5b-9c3483b316df',
  '6f9e57a9-d4a0-492f-8c79-b40132dc72a7',
  '97fd7daf-d962-4992-a291-fced8bcd7c94',
  '8ba6d43e-91d8-443f-ab2b-eff92be7313e',
  'a3a77fb2-48a8-494f-95b8-83c0cd0472be',
  '79ba1ac5-0057-427c-bf73-ef6b3c600b79',
  'c9faa191-61f0-4975-9970-40e39ecafc3c',
  'cfccd544-0ed3-4200-8c2d-be3042f8451e',
  '83119eb4-caea-4867-ba70-d049e85217e8',
  'a7a4c423-c73e-4f87-a722-97df6ce76a48',
  '5d35c20c-a90b-4b26-9757-89e7604dea5c',
  'fa61a71a-ba1a-4d9e-bcb8-39f2c2fd61ab',
  '4159bf96-3d73-4567-b86d-003aa384114a',
  '22a72700-8dd7-4b6d-8246-0bcb82c665a8',
  '3923f8b4-3637-4c66-b6de-1668556d40fd',
  '1790428c-2bcd-4748-93a3-137bb7c6c933'
);
-- Expect: UPDATE 35 on a fresh round (fewer if some were already triaged).
