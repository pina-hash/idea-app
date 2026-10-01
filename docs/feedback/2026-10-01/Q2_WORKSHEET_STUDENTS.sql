-- Q2 (affected students; addresses are for Mr. Pina's screen only): take section 1's four CTEs of
-- supabase/data/0360-hx-optional-blocks.sql and replace its final select with:
select j.item_id, j.student_email, coalesce(s.state, 'no row') as state,
  count(*) filter (where not (has_text or has_boolean or has_photo)) as empty_blocks,
  string_agg(j.module_title || ': ' || j.field, '; ' order by j.module_ord, j.block_ord)
    filter (where not (has_text or has_boolean or has_photo)) as empty_fields
from judged j
left join public.classroom_submissions s on s.item_id = j.item_id and s.student_email = j.student_email
group by j.item_id, j.student_email, s.state
having count(*) filter (where not (has_text or has_boolean or has_photo)) > 0
order by j.item_id, empty_blocks, j.student_email;
