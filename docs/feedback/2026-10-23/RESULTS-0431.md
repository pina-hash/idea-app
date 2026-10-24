# Results, session 0431: HTML assignments in IDEA Classroom

_Draft; completed at the end of the session._

## The duplicates already left empty (read-only)

Paste into the Supabase SQL editor and Run. It only reads. Each row is an assignment that looks like a copy of an HTML assignment (its title is the source's title plus "(copy)", or its rubric is identical to the source's) but has no worksheet document.

<!-- empty-duplicates-sql:start -->
```sql
select course, class, post_title, created, copied_from, post_id
from (
	select distinct on (c.id, se.id)
		co.code as course,
		se.label as class,
		c.title as post_title,
		c.created_at as created,
		src.title as copied_from,
		c.id as post_id
	from public.classroom_items c
	join public.classroom_items src
		on src.id <> c.id
		and src.assignment_schema_version = 3
		and src.created_at < c.created_at
	join public.classroom_html_assignments h on h.item_id = src.id
	left join public.classroom_rubrics rc on rc.item_id = c.id
	left join public.classroom_rubrics rs on rs.item_id = src.id
	left join public.classroom_postings p on p.item_id = c.id
	left join public.classroom_sections se on se.id = p.section_id
	left join public.classroom_courses co on co.id = se.course_id
	where c.kind = 'assignment'
		and c.assignment_schema_version is null
		and not exists (select 1 from public.classroom_html_assignments x where x.item_id = c.id)
		and (
			c.title = left(coalesce(src.title, '') || ' (copy)', 300)
			or (rc.criteria is not null and rc.criteria = rs.criteria and rc.criteria <> '[]'::jsonb)
		)
	order by c.id, se.id, (c.title = left(coalesce(src.title, '') || ' (copy)', 300)) desc, src.created_at desc
) found
order by created, course, class;
```
<!-- empty-duplicates-sql:end -->
