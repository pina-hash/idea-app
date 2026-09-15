-- 0216: Standalone exact-solid documents and revisioned admin advisory rules.
-- Verified on a disposable full migration chain. Apply manually; this file does not record application.
-- Contract: existing blade-v1 documents retain their current behavior.
-- solid-v1 is a standalone document format; geometry is immutable BREP bytes.
-- SQL validates persistence and permissions, not geometric validity.
-- Exact kernel identifier and model envelope must match the worker implementation.
-- There is deliberately no invented geometry-size or dimensional clamp here.
-- Measure combined artifact and action-log growth before claiming a storage budget.

begin;

alter table public.ideacad_documents alter column item_id drop not null;
alter table public.ideacad_documents
	add column if not exists model_format text not null default 'blade-v1',
	add column if not exists title text not null default 'Untitled document',
	add column if not exists assignment_context jsonb,
	add column if not exists linked_at timestamptz;

do $documentchecks$
begin
	if not exists(select 1 from pg_constraint where conrelid = 'public.ideacad_documents'::regclass and conname = 'ideacad_documents_model_format_check') then
		alter table public.ideacad_documents add constraint ideacad_documents_model_format_check check(model_format in ('blade-v1','solid-v1'));
	end if;
	if not exists(select 1 from pg_constraint where conrelid = 'public.ideacad_documents'::regclass and conname = 'ideacad_documents_title_check') then
		alter table public.ideacad_documents add constraint ideacad_documents_title_check check(length(btrim(title)) between 1 and 120);
	end if;
	if not exists(select 1 from pg_constraint where conrelid = 'public.ideacad_documents'::regclass and conname = 'ideacad_documents_direct_context_check') then
		alter table public.ideacad_documents add constraint ideacad_documents_direct_context_check check(
			model_format <> 'solid-v1' or (
				((item_id is null) = (assignment_context is null)) and ((item_id is null) = (linked_at is null))
			)
		);
	end if;
end;
$documentchecks$;

create table if not exists public.ideacad_assignment_sections (
	document_id uuid not null references public.ideacad_documents(id) on delete cascade,
	section_id uuid not null references public.classroom_sections(id) on delete restrict,
	linked_at timestamptz not null default now(),
	primary key(document_id, section_id)
);

create table if not exists public.ideacad_brep_artifacts (
	document_id uuid not null references public.ideacad_documents(id) on delete cascade,
	hash text not null check(hash ~ '^[0-9a-f]{64}$'),
	kernel text not null check(length(kernel) between 1 and 120),
	bytes bytea not null check(octet_length(bytes) > 0),
	created_at timestamptz not null default now(),
	primary key(document_id, hash)
);

-- One operation groups all JSON-Pointer changes produced by one gesture.
-- The first row alone owns the retry receipt. Existing rows remain null.
alter table public.ideacad_history
	add column if not exists operation_id uuid,
	add column if not exists operation_start boolean,
	add column if not exists operation_label text,
	add column if not exists request_hash text,
	add column if not exists result_revision integer;
create unique index if not exists ideacad_history_operation_once_idx
	on public.ideacad_history(concept_id, operation_id)
	where operation_start is true;

create or replace function public._ideacad_direct_manager(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $directmanager$
	select exists (
		select 1 from public.ideacad_documents d
		join public.ideacad_assignment_sections s on s.document_id = d.id
		where d.id = p_document_id and d.model_format = 'solid-v1'
			and public.classroom_manages_section(s.section_id)
	);
$directmanager$;

-- Keep every existing read policy delegated to this one predicate.
-- The section rows are captured at link time; owner enrollment is NOT re-read.
create or replace function public._ideacad_can_read_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $canread$
	select public._ideacad_document_role(p_document_id) is not null
		or exists (
			select 1 from public.ideacad_documents d
			where d.id = p_document_id and (
				(d.model_format = 'blade-v1' and public._classroom_manages_item(d.item_id))
				or (d.model_format = 'solid-v1' and public._ideacad_direct_manager(d.id))
			)
		);
$canread$;

create or replace function public._ideacad_manages_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $manages$
	select exists (
		select 1 from public.ideacad_documents d where d.id = p_document_id and (
			d.student_email = public.current_user_email()
			or (d.model_format = 'blade-v1' and public._classroom_manages_item(d.item_id))
			or (d.model_format = 'solid-v1' and public._ideacad_direct_manager(d.id))
		)
	);
$manages$;

-- This is the LEGACY writer gate. Refusing solid-v1 here prevents all old
-- concept RPCs (including revision-leaping saves) from changing direct work.
create or replace function public._ideacad_can_write_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $legacywrite$
	select exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id and d.model_format = 'blade-v1'
	)
	and coalesce(public._ideacad_document_role(p_document_id) in ('owner','editor'), false)
	and not public._ideacad_document_archived(p_document_id);
$legacywrite$;

create or replace function public._ideacad_direct_can_write(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $directwrite$
	select exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id and d.model_format = 'solid-v1' and d.archived_at is null
	)
	and (coalesce(public._ideacad_document_role(p_document_id) in ('owner','editor'), false)
		or public._ideacad_direct_manager(p_document_id));
$directwrite$;

create or replace function public._ideacad_realtime_can_send(p_topic text)
returns boolean language sql stable security definer set search_path = ''
as $cansend$
	select case
		when public._ideacad_realtime_topic_id(p_topic,'ideacad-live:') is not null
			then public.classroom_can_read_item(public._ideacad_realtime_topic_id(p_topic,'ideacad-live:'))
		when public._ideacad_realtime_topic_id(p_topic,'ideacad-doc:') is not null then
			public._ideacad_can_write_document(public._ideacad_realtime_topic_id(p_topic,'ideacad-doc:'))
			or public._ideacad_direct_can_write(public._ideacad_realtime_topic_id(p_topic,'ideacad-doc:'))
		else false
	end;
$cansend$;

-- Close the owner shortcut as well as the general writer gate. The inert
-- Part 1 created by 0207's concept trigger remains for schema compatibility.
create or replace function public._ideacad_part_owner(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $partowner$
	select exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id and d.model_format = 'blade-v1'
			and d.student_email = public.current_user_email()
			and public.current_user_email() <> '' and d.archived_at is null
	);
$partowner$;

-- Because its owner shortcut and wide rung are both closed above,
-- _ideacad_part_writer needs no replacement on a full 0201..0214 chain.

-- Existing classroom item deletion cascades into document deletion. Direct
-- documents must refuse this path too; no client delete RPC is introduced.
create or replace function public._ideacad_preserve_direct_document()
returns trigger language plpgsql security definer set search_path = ''
as $preserve$
begin
	if old.model_format = 'solid-v1' then
		raise exception 'This assignment has IdeaCAD documents. Archive the work instead of deleting it.';
	end if;
	return old;
end;
$preserve$;
drop trigger if exists ideacad_preserve_direct_document on public.ideacad_documents;
create trigger ideacad_preserve_direct_document before delete on public.ideacad_documents
	for each row execute function public._ideacad_preserve_direct_document();

alter table public.ideacad_assignment_sections enable row level security;
alter table public.ideacad_brep_artifacts enable row level security;
drop policy if exists "read linked sections of readable ideacad documents" on public.ideacad_assignment_sections;
create policy "read linked sections of readable ideacad documents"
	on public.ideacad_assignment_sections for select to authenticated
	using(public._ideacad_can_read_document(document_id));
drop policy if exists "read artifacts of readable ideacad documents" on public.ideacad_brep_artifacts;
create policy "read artifacts of readable ideacad documents"
	on public.ideacad_brep_artifacts for select to authenticated
	using(public._ideacad_can_read_document(document_id));
revoke all on table public.ideacad_assignment_sections, public.ideacad_brep_artifacts
	from public, anon, authenticated;
grant select on table public.ideacad_assignment_sections, public.ideacad_brep_artifacts to authenticated;
grant all on table public.ideacad_assignment_sections, public.ideacad_brep_artifacts to service_role;

-- Apply the exact action vocabulary already consumed by history.ts, while
-- proving every recorded before-value matches the state it changes.
create or replace function public._ideacad_direct_apply_action(p_model jsonb, p_action jsonb)
returns jsonb language plpgsql immutable security definer set search_path = ''
as $patch$
declare
	k text := p_action->>'kind';
	p text := p_action->>'path';
	tokens text[];
	parent_tokens text[];
	parent_value jsonb;
	current_value jsonb;
	b jsonb := p_action->'before';
	a jsonb := p_action->'after';
	i integer;
	j integer;
	n integer;
	v jsonb;
	walk_value jsonb;
begin
	if k is null or k not in ('set','insert','remove','move')
		or jsonb_typeof(p_action->'path') is distinct from 'string'
		or p = '' or left(p,1) <> '/' or p ~ '~([^01]|$)' then
		raise exception 'Invalid IdeaCAD action.';
	end if;
	if p = '' then tokens := '{}'::text[];
	else
		select array_agg(replace(replace(t,'~1','/'),'~0','~') order by ord)
		into tokens from unnest(string_to_array(substr(p,2),'/')) with ordinality as x(t,ord);
	end if;
	-- PostgreSQL accepts negative array indexes; history.ts does not. Validate
	-- every segment, including intermediate arrays, before using JSONB paths.
	walk_value := p_model;
	for i in 1..cardinality(tokens) loop
		if jsonb_typeof(walk_value) = 'array' then
			if tokens[i] !~ '^(0|[1-9][0-9]*)$' then raise exception 'Invalid array index.'; end if;
			j := tokens[i]::integer;
			if j >= jsonb_array_length(walk_value) and not (k = 'insert' and i = cardinality(tokens) and j = jsonb_array_length(walk_value)) then
				raise exception 'Invalid array index.';
			end if;
			walk_value := walk_value->j;
		elsif jsonb_typeof(walk_value) = 'object' then
			walk_value := walk_value->tokens[i];
		else raise exception 'The action parent does not exist.';
		end if;
	end loop;
	current_value := case when p = '' then p_model else p_model #> tokens end;
	if k in ('set','remove') then
		if current_value is null or current_value is distinct from b then
			raise exception 'The action does not match the current document.';
		end if;
		if k = 'set' then
			if a is null then raise exception 'An action needs an after value.'; end if;
			return case when p = '' then a else jsonb_set(p_model,tokens,a,false) end;
		end if;
		if p = '' then raise exception 'Keep the document itself.'; end if;
		return p_model #- tokens;
	end if;
	if k = 'insert' then
		if p = '' or a is null then raise exception 'Invalid insertion.'; end if;
		parent_tokens := tokens[1:cardinality(tokens)-1];
		parent_value := case when cardinality(tokens) = 1 then p_model else p_model #> parent_tokens end;
		if jsonb_typeof(parent_value) = 'array' then
			if tokens[cardinality(tokens)] !~ '^(0|[1-9][0-9]*)$' then raise exception 'Invalid array index.'; end if;
			i := tokens[cardinality(tokens)]::integer;
			if i > jsonb_array_length(parent_value) then raise exception 'Invalid array index.'; end if;
			return jsonb_insert(p_model,tokens,a,false);
		elsif jsonb_typeof(parent_value) = 'object' and current_value is null then
			return jsonb_set(p_model,tokens,a,true);
		end if;
		raise exception 'The insertion target does not exist or is already filled.';
	end if;
	if jsonb_typeof(current_value) is distinct from 'array'
		or jsonb_typeof(b) is distinct from 'number' or jsonb_typeof(a) is distinct from 'number'
		or (b #>> '{}') !~ '^(0|[1-9][0-9]*)$' or (a #>> '{}') !~ '^(0|[1-9][0-9]*)$' then
		raise exception 'Invalid array move.';
	end if;
	i := (b #>> '{}')::integer; j := (a #>> '{}')::integer;
	n := jsonb_array_length(current_value);
	if i >= n or j >= n then raise exception 'Invalid array move.'; end if;
	v := current_value->i;
	current_value := jsonb_insert(current_value-i, array[j::text], v, false);
	return case when p = '' then current_value else jsonb_set(p_model,tokens,current_value,false) end;
end;
$patch$;

create or replace function public._ideacad_direct_validate_sketches(p_model jsonb)
returns void language plpgsql immutable security definer set search_path = ''
as $validsketches$
declare
	s jsonb; p jsonb; seg jsonb; vec jsonb; component jsonb;
	profiles jsonb; vectors jsonb; point_vectors jsonb;
	seen text[] := '{}'; sid text; n integer; i integer; j integer;
	x double precision; radius double precision;
	origin double precision[]; u double precision[]; v double precision[]; normal double precision[];
	point double precision[]; start_point double precision[]; end_point double precision[]; center_point double precision[];
	distance double precision; first_radius double precision; second_radius double precision;
	tolerance constant double precision := 1e-7;
begin
	if jsonb_typeof(p_model->'sketches') is distinct from 'array' then
		raise exception 'Sketches must be an array.';
	end if;
	select coalesce(array_agg(value->>'id'),'{}'::text[]) into seen from jsonb_array_elements(p_model->'bodies');
	for s in select value from jsonb_array_elements(p_model->'sketches') loop
		if jsonb_typeof(s) is distinct from 'object'
			or jsonb_typeof(s->'id') is distinct from 'string' or length(btrim(s->>'id')) = 0
			or jsonb_typeof(s->'name') is distinct from 'string' or length(btrim(s->>'name')) = 0
			or jsonb_typeof(s->'plane') is distinct from 'object'
			or (s ? 'supportBodyId' and (jsonb_typeof(s->'supportBodyId') is distinct from 'string' or length(btrim(s->>'supportBodyId')) = 0))
			or (s ? 'holes' and jsonb_typeof(s->'holes') is distinct from 'array') then
			raise exception 'A sketch needs an ID, name, plane, and valid optional fields.';
		end if;
		sid := s->>'id';
		if sid = any(seen) then raise exception 'Sketch IDs must be unique.'; end if;
		seen := array_append(seen,sid);
		vectors := jsonb_build_array(s->'plane'->'origin',s->'plane'->'u',s->'plane'->'v',s->'plane'->'normal');
		point_vectors := '[]'::jsonb;
		profiles := jsonb_build_array(s->'profile') || coalesce(s->'holes','[]'::jsonb);
		for p in select value from jsonb_array_elements(profiles) loop
			if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'type') is distinct from 'string' then
				raise exception 'A sketch profile must be a polygon, circle, or wire.';
			end if;
			case p->>'type'
				when 'polygon' then
					if jsonb_typeof(p->'points') is distinct from 'array' then raise exception 'A polygon needs at least three points.'; end if;
					if jsonb_array_length(p->'points') < 3 then raise exception 'A polygon needs at least three points.'; end if;
					point_vectors := point_vectors || (p->'points');
				when 'circle' then
					if jsonb_typeof(p->'radius') is distinct from 'number' then raise exception 'A circle needs a finite positive radius.'; end if;
					radius := (p->>'radius')::double precision;
					if radius <= 0 or radius in ('Infinity'::double precision,'-Infinity'::double precision,'NaN'::double precision) then
						raise exception 'A circle needs a finite positive radius.';
					end if;
					point_vectors := point_vectors || jsonb_build_array(p->'center');
				when 'wire' then
					if jsonb_typeof(p->'segments') is distinct from 'array' then raise exception 'A wire needs at least two connected segments.'; end if;
					if jsonb_array_length(p->'segments') < 2 then raise exception 'A wire needs at least two connected segments.'; end if;
					for seg in select value from jsonb_array_elements(p->'segments') loop
						if jsonb_typeof(seg) is distinct from 'object' or jsonb_typeof(seg->'type') is distinct from 'string'
							or seg->>'type' not in ('line','arc') then raise exception 'A wire segment must be a line or arc.'; end if;
						point_vectors := point_vectors || jsonb_build_array(seg->'start',seg->'end');
						if seg->>'type' = 'arc' then point_vectors := point_vectors || jsonb_build_array(seg->'center'); end if;
					end loop;
				else raise exception 'A sketch profile must be a polygon, circle, or wire.';
			end case;
		end loop;
		vectors := vectors || point_vectors;
		for vec in select value from jsonb_array_elements(vectors) loop
			if jsonb_typeof(vec) is distinct from 'array' then raise exception 'Coordinates must be finite three-number vectors.'; end if;
			if jsonb_array_length(vec) <> 3 then raise exception 'Coordinates must be finite three-number vectors.'; end if;
			for component in select value from jsonb_array_elements(vec) loop
				if jsonb_typeof(component) is distinct from 'number' then raise exception 'Coordinates must be finite three-number vectors.'; end if;
				x := (component #>> '{}')::double precision;
				if x in ('Infinity'::double precision,'-Infinity'::double precision,'NaN'::double precision) then
					raise exception 'Coordinates must be finite three-number vectors.';
				end if;
			end loop;
		end loop;
		select array_agg((value #>> '{}')::double precision order by ordinality) into origin from jsonb_array_elements(s->'plane'->'origin') with ordinality;
		select array_agg((value #>> '{}')::double precision order by ordinality) into u from jsonb_array_elements(s->'plane'->'u') with ordinality;
		select array_agg((value #>> '{}')::double precision order by ordinality) into v from jsonb_array_elements(s->'plane'->'v') with ordinality;
		select array_agg((value #>> '{}')::double precision order by ordinality) into normal from jsonb_array_elements(s->'plane'->'normal') with ordinality;
		if abs(u[1]^2+u[2]^2+u[3]^2-1)>tolerance or abs(v[1]^2+v[2]^2+v[3]^2-1)>tolerance
			or abs(normal[1]^2+normal[2]^2+normal[3]^2-1)>tolerance
			or abs(u[1]*v[1]+u[2]*v[2]+u[3]*v[3])>tolerance
			or abs(u[2]*v[3]-u[3]*v[2]-normal[1])>tolerance
			or abs(u[3]*v[1]-u[1]*v[3]-normal[2])>tolerance
			or abs(u[1]*v[2]-u[2]*v[1]-normal[3])>tolerance then
			raise exception 'A sketch plane must have an orthonormal right-handed basis.';
		end if;
		for vec in select value from jsonb_array_elements(point_vectors) loop
			select array_agg((value #>> '{}')::double precision order by ordinality) into point from jsonb_array_elements(vec) with ordinality;
			distance := (point[1]-origin[1])*normal[1]+(point[2]-origin[2])*normal[2]+(point[3]-origin[3])*normal[3];
			if abs(distance)>tolerance*greatest(1,abs(point[1]),abs(point[2]),abs(point[3]),abs(origin[1]),abs(origin[2]),abs(origin[3])) then
				raise exception 'A sketch coordinate is outside its plane.';
			end if;
		end loop;
		-- Closure/radius checks are local arithmetic, not Boolean or topology validation.
		for p in select value from jsonb_array_elements(profiles) where value->>'type' = 'wire' loop
			n := jsonb_array_length(p->'segments');
			for i in 0..n-1 loop
				seg := p->'segments'->i; j := (i+1)%n;
				select array_agg((value #>> '{}')::double precision order by ordinality) into start_point from jsonb_array_elements(seg->'start') with ordinality;
				select array_agg((value #>> '{}')::double precision order by ordinality) into end_point from jsonb_array_elements(seg->'end') with ordinality;
				select array_agg((value #>> '{}')::double precision order by ordinality) into point from jsonb_array_elements(p->'segments'->j->'start') with ordinality;
				if sqrt((end_point[1]-point[1])^2+(end_point[2]-point[2])^2+(end_point[3]-point[3])^2)>tolerance then
					raise exception 'Wire segments must connect and close.';
				end if;
				if seg->>'type' = 'arc' then
					select array_agg((value #>> '{}')::double precision order by ordinality) into center_point from jsonb_array_elements(seg->'center') with ordinality;
					first_radius := sqrt((start_point[1]-center_point[1])^2+(start_point[2]-center_point[2])^2+(start_point[3]-center_point[3])^2);
					second_radius := sqrt((end_point[1]-center_point[1])^2+(end_point[2]-center_point[2])^2+(end_point[3]-center_point[3])^2);
					if first_radius <= 0 or abs(first_radius-second_radius)>tolerance*greatest(1,first_radius,second_radius) then
						raise exception 'An arc needs nonzero matching endpoint radii.';
					end if;
				end if;
			end loop;
		end loop;
	end loop;
exception when numeric_value_out_of_range then
	raise exception 'Sketch numbers must fit finite double precision.';
end;
$validsketches$;
revoke all on function public._ideacad_direct_validate_sketches(jsonb) from public,anon,authenticated;


-- A snapshot envelope contains references, never the BREP itself. The kernel
-- owns deep topology validation; SQL refuses an unsupported outer format.
create or replace function public._ideacad_direct_validate_model(p_model jsonb)
returns void language plpgsql immutable security definer set search_path = ''
as $validmodel$
declare b jsonb;
begin
	if jsonb_typeof(p_model) is distinct from 'object'
		or p_model->>'format' is distinct from 'ideacad-solid-v1'
		or p_model->>'units' is distinct from 'in'
		or jsonb_typeof(p_model->'title') is distinct from 'string'
		or length(btrim(p_model->>'title')) not between 1 and 120
		or p_model->>'kernel' is distinct from 'remus-f7907f5-2.130.20'
		or jsonb_typeof(p_model->'bodies') is distinct from 'array'
		or jsonb_typeof(p_model->'sketches') is distinct from 'array'
		or jsonb_typeof(p_model->'addons') is distinct from 'object'
		or jsonb_typeof(p_model->'addons'->'ideaBlade') is distinct from 'boolean' then
		raise exception 'This IdeaCAD model format is not supported.';
	end if;
	for b in select value from jsonb_array_elements(p_model->'bodies') loop
		if jsonb_typeof(b) is distinct from 'object'
			or jsonb_typeof(b->'id') is distinct from 'string' or length(b->>'id') = 0
			or jsonb_typeof(b->'name') is distinct from 'string' or length(b->>'name') = 0
			or not (b ? 'materialId') or jsonb_typeof(b->'materialId') not in ('null','string')
			or b->>'role' is null or b->>'role' not in ('part','hex-core','collar','spin-bolt','blade')
			or (b ? 'topologyEpoch' and (jsonb_typeof(b->'topologyEpoch') is distinct from 'string' or b->>'topologyEpoch' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))
			or jsonb_typeof(b->'artifact') is distinct from 'string'
			or b->>'artifact' !~ '^[0-9a-f]{64}$' then
			raise exception 'A body needs a stable ID and a BREP artifact reference.';
		end if;
		if b ? 'massG' and jsonb_typeof(b->'massG') <> 'null' then
			if jsonb_typeof(b->'massG') <> 'number' or (b->>'massG')::numeric < 0
				or (b->>'massG')::double precision in ('Infinity'::double precision,'NaN'::double precision) then
				raise exception 'Part mass must be a finite, nonnegative number.';
			end if;
			if jsonb_typeof(b->'massSource') is distinct from 'string' then raise exception 'Part mass needs its measurement source.'; end if;
		end if;
		if b ? 'massSource' and (jsonb_typeof(b->'massSource') is distinct from 'string' or b->>'massSource' not in ('measured','bambu-studio')) then
			raise exception 'Choose scale measurement or Bambu Studio estimate for part mass.';
		end if;
	end loop;
	if (select count(*) from jsonb_array_elements(p_model->'bodies')) <>
		(select count(distinct value->>'id') from jsonb_array_elements(p_model->'bodies')) then
		raise exception 'Body IDs must be unique.';
	end if;
	perform public._ideacad_direct_validate_sketches(p_model);
end;
$validmodel$;

create or replace function public.ideacad_read_brep_artifacts(p_document_id uuid,p_hashes text[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $readartifacts$
begin
	if not public._ideacad_can_read_document(p_document_id) then raise exception 'That document does not exist.'; end if;
	return (select coalesce(jsonb_agg(jsonb_build_object('hash',a.hash,'kernel',a.kernel,
		'data',encode(a.bytes,'base64')) order by a.hash),'[]'::jsonb)
		from public.ideacad_brep_artifacts a where a.document_id = p_document_id and a.hash = any(p_hashes));
end;
$readartifacts$;

create or replace function public.ideacad_direct_concept_history(p_concept_id uuid,p_after_seq bigint default -1,p_limit integer default 2000)
returns jsonb language plpgsql stable security definer set search_path = ''
as $directhistory$
declare doc uuid; n integer := least(greatest(coalesce(p_limit,2000),2),5000); cursor_seq bigint := coalesce(p_after_seq,-1);
begin
	select c.document_id into doc from public.ideacad_concepts c
		join public.ideacad_documents d on d.id = c.document_id
		where c.id = p_concept_id and d.model_format = 'solid-v1';
	if doc is null or not public._ideacad_can_read_document(doc) then raise exception 'That document does not exist.'; end if;
	return jsonb_build_object('conceptId',p_concept_id,'rows',coalesce((
		select jsonb_agg(to_jsonb(r) order by r.seq) from (
			select h.seq,h.kind,h.path,h.before_value as before,h.after_value as after,
				h.undoes_seq as "undoesSeq",h.actor,h.at,h.operation_id as "operationId",
				h.operation_start as "operationStart",h.operation_label as "operationLabel",
				h.result_revision as "resultRevision"
			from public.ideacad_history h where h.concept_id = p_concept_id and (h.seq > cursor_seq or h.seq = 0)
			order by h.seq limit n
		) r
	),'[]'::jsonb),
	'total',(select count(*) from public.ideacad_history h where h.concept_id = p_concept_id),
	'newestSeq',(select max(h.seq) from public.ideacad_history h where h.concept_id = p_concept_id));
end;
$directhistory$;

create or replace function public._ideacad_direct_payload(p_document_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $payload$
declare d public.ideacad_documents; c public.ideacad_concepts; r text; hashes text[];
begin
	if not public._ideacad_can_read_document(p_document_id) then raise exception 'That document does not exist.'; end if;
	select * into d from public.ideacad_documents where id = p_document_id and model_format = 'solid-v1';
	if not found then raise exception 'This is a legacy IdeaCAD document.'; end if;
	select * into c from public.ideacad_concepts where id = d.active_concept_id and document_id = d.id and deleted_at is null;
	if not found then raise exception 'The document has no active model.'; end if;
	r := public._ideacad_document_role(d.id);
	if r is distinct from 'owner' and public._ideacad_direct_manager(d.id) then r := 'manager'; end if;
	select array_agg(value->>'artifact') into hashes from jsonb_array_elements(c.features->'bodies');
	return jsonb_build_object('document',to_jsonb(d),'concept',to_jsonb(c),'role',r,
		'canWrite',public._ideacad_direct_can_write(d.id),'archivedAt',d.archived_at,
		'artifacts',public.ideacad_read_brep_artifacts(d.id,coalesce(hashes,'{}'::text[])));
end;
$payload$;

create or replace function public.ideacad_open_direct_document(p_document_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $opendirect$ select public._ideacad_direct_payload(p_document_id); $opendirect$;

-- Small chooser summaries only. No BREP bytes or whole concept history are
-- loaded until the user selects a document. Covers standalone named shares
-- and captured-section managers without an assignment-specific discovery RPC.
create or replace function public.ideacad_direct_documents()
returns jsonb language sql stable security definer set search_path = ''
as $directlist$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id',d.id,'title',d.title,'itemId',d.item_id,'ownerEmail',d.student_email,
		'isOwn',d.student_email = public.current_user_email(),'updatedAt',d.updated_at,
		'archivedAt',d.archived_at,'modelFormat',d.model_format,
		'canWrite',public._ideacad_direct_can_write(d.id),
		'canArchive',(d.item_id is null and d.student_email = public.current_user_email()) or public._ideacad_direct_manager(d.id),
		'role',case when d.student_email = public.current_user_email() then 'owner'
			when public._ideacad_direct_manager(d.id) then 'manager'
			else public._ideacad_document_role(d.id) end,
		'bodyCount',coalesce(jsonb_array_length(c.features->'bodies'),0)
	) order by d.updated_at desc,d.id),'[]'::jsonb)
	from public.ideacad_documents d
	left join public.ideacad_concepts c on c.id = d.active_concept_id and c.document_id = d.id and c.deleted_at is null
	where d.model_format = 'solid-v1' and public._ideacad_can_read_document(d.id);
$directlist$;

-- p_kernel is validated by the client against its installed worker adapter.
-- It is recorded on an empty envelope so unknown/higher kernels refuse on open.
create or replace function public.ideacad_create_direct_document(p_title text,p_kernel text)
returns jsonb language plpgsql security definer set search_path = ''
as $createdirect$
declare d public.ideacad_documents; c public.ideacad_concepts; m jsonb; e text := public.current_user_email();
begin
	if auth.uid() is null or coalesce(e,'') = '' then raise exception 'You must be signed in.'; end if;
	if length(btrim(coalesce(p_title,''))) not between 1 and 120 then raise exception 'Name the document using 1 to 120 characters.'; end if;
	m := jsonb_build_object('format','ideacad-solid-v1','units','in','kernel',p_kernel,'title',btrim(p_title),
		'bodies','[]'::jsonb,'sketches','[]'::jsonb,'addons',jsonb_build_object('ideaBlade',false));
	perform public._ideacad_direct_validate_model(m);
	insert into public.ideacad_documents(item_id,student_email,model_format,title)
		values(null,e,'solid-v1',btrim(p_title)) returning * into d;
	insert into public.ideacad_concepts(document_id,name,position,features)
		values(d.id,'Model',1,m) returning * into c;
	update public.ideacad_documents set active_concept_id = c.id where id = d.id;
	return public._ideacad_direct_payload(d.id);
end;
$createdirect$;

create or replace function public.ideacad_link_direct_document(p_document_id uuid,p_item_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $linkdirect$
declare d public.ideacad_documents; i public.classroom_items; e public.ideacad_editors; sections uuid[]; email text := public.current_user_email();
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or d.student_email <> email or coalesce(email,'') = '' then
		raise exception 'You can only link your own document.';
	end if;
	if d.archived_at is not null then raise exception 'Restore the document before linking it.'; end if;
	if d.item_id = p_item_id then return public._ideacad_direct_payload(d.id); end if;
	if d.item_id is not null then raise exception 'This document is already linked. Make a copy for another assignment.'; end if;
	if not public.classroom_can_read_item(p_item_id) then raise exception 'Choose an available IdeaCAD assignment.'; end if;
	select * into i from public.classroom_items where id = p_item_id and kind = 'assignment' for share;
	if not found then raise exception 'Choose an available IdeaCAD assignment.'; end if;
	select * into e from public.ideacad_editors where item_id = p_item_id for share;
	if not found then raise exception 'Choose an available IdeaCAD assignment.'; end if;
	select array_agg(distinct cp.section_id) into sections
	from public.classroom_postings cp
	where cp.item_id = p_item_id and (
		exists(select 1 from public.classroom_enrollments ce where ce.section_id = cp.section_id and ce.student_email = email and ce.active)
		or public.classroom_manages_section(cp.section_id)
	);
	if sections is null then raise exception 'Choose an IdeaCAD assignment in your classes.'; end if;
	if exists(select 1 from public.ideacad_documents x where x.item_id = p_item_id and x.student_email = email and x.id <> d.id) then
		raise exception 'You already have a document linked to that assignment.';
	end if;
	update public.ideacad_documents set item_id = p_item_id,linked_at = now(),
		assignment_context = jsonb_build_object('version',1,'itemId',i.id,'title',i.title,'editor',e.editor,'config',e.config,'sectionIds',to_jsonb(sections)),
		updated_at = now() where id = d.id;
	insert into public.ideacad_assignment_sections(document_id,section_id)
		select d.id, unnest(sections) on conflict do nothing;
	return public._ideacad_direct_payload(d.id);
end;
$linkdirect$;

create or replace function public.ideacad_share_direct_document(p_document_id uuid,p_grantee_email text,p_role text)
returns jsonb language plpgsql security definer set search_path = ''
as $sharedirect$
declare d public.ideacad_documents; g public.ideacad_grants; e text := public.current_user_email(); target text := lower(btrim(coalesce(p_grantee_email,'')));
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or d.student_email <> e or coalesce(e,'') = '' then raise exception 'You can only share your own document.'; end if;
	if p_role is null or p_role not in ('viewer','editor') then raise exception 'Share as a viewer or editor.'; end if;
	if target = e then raise exception 'This document is already yours.'; end if;
	if not exists(select 1 from auth.users u where lower(u.email) = target) then raise exception 'Choose the email address of someone who has signed in.'; end if;
	insert into public.ideacad_grants(document_id,grantee_email,role,granted_by)
		values(d.id,target,p_role,e) on conflict(document_id,grantee_email)
		do update set role = excluded.role,granted_by = excluded.granted_by returning * into g;
	return to_jsonb(g);
end;
$sharedirect$;

-- Existing ideacad_unshare_document is already owner-only, document-keyed,
-- and class-independent. It can be reused unchanged for direct documents.

create or replace function public.ideacad_set_direct_document_archived(p_document_id uuid,p_archived boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $archivedirect$
declare d public.ideacad_documents; e text := public.current_user_email();
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or coalesce(e,'') = '' or not (
		(d.item_id is null and d.student_email = e) or public._ideacad_direct_manager(d.id)
	) then raise exception 'That document does not exist.'; end if;
	if p_archived is null then raise exception 'Choose archive or restore.'; end if;
	if p_archived then
		update public.ideacad_documents set archived_at = coalesce(archived_at,now()), archived_by = coalesce(archived_by,e), updated_at = now() where id = d.id;
	else
		delete from public.ideacad_section_grants where document_id = d.id;
		update public.ideacad_documents set archived_at = null,archived_by = null,updated_at = now() where id = d.id;
	end if;
	return public._ideacad_direct_payload(d.id);
end;
$archivedirect$;

create or replace function public.ideacad_share_direct_document_with_section(p_document_id uuid,p_section_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $directclassshare$
declare d public.ideacad_documents; g public.ideacad_section_grants;
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or not public._ideacad_direct_manager(d.id) then raise exception 'That document does not exist.'; end if;
	if d.archived_at is null then raise exception 'Archive this document before sharing it with a class.'; end if;
	if not exists(select 1 from public.classroom_postings cp where cp.item_id = d.item_id and cp.section_id = p_section_id) then
		raise exception 'You can only share this with a class this assignment is posted to.';
	end if;
	if not public.classroom_manages_section(p_section_id) then raise exception 'Choose a class you manage.'; end if;
	insert into public.ideacad_section_grants(document_id,section_id,granted_by)
		values(d.id,p_section_id,public.current_user_email()) on conflict(document_id,section_id)
		do update set granted_by = excluded.granted_by returning * into g;
	return jsonb_build_object('ok',true,'grant',to_jsonb(g));
end;
$directclassshare$;

create or replace function public.ideacad_unshare_direct_document_from_section(p_document_id uuid,p_section_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $directclassunshare$
declare d public.ideacad_documents; removed integer;
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or not public._ideacad_direct_manager(d.id) then raise exception 'That document does not exist.'; end if;
	delete from public.ideacad_section_grants where document_id = d.id and section_id = p_section_id;
	get diagnostics removed = row_count;
	return jsonb_build_object('ok',true,'removed',removed);
end;
$directclassunshare$;

-- Existing ideacad_document_section_grants delegates to
-- _ideacad_manages_document and therefore reads direct class grants unchanged.

create or replace function public.ideacad_save_direct_document(
	p_document_id uuid,
	p_expected_revision integer,
	p_operation_id uuid,
	p_label text,
	p_actions jsonb,
	p_model jsonb,
	p_artifacts jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $savedirect$
declare
	d public.ideacad_documents;
	c public.ideacad_concepts;
	receipt public.ideacad_history;
	target public.ideacad_history;
	a jsonb;
	blob jsonb;
	b jsonb;
	state jsonb;
	v_bytes bytea;
	v_hash text;
	fingerprint text;
	seq bigint;
	first_seq bigint;
	undo_seq bigint;
	n integer := 0;
	kind text;
	result jsonb;
begin
	-- Every direct write locks document THEN concept. Archive uses the same
	-- document lock, so it cannot interleave between authorization and write.
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or not public._ideacad_direct_can_write(p_document_id) then raise exception 'You cannot edit this document.'; end if;
	select * into c from public.ideacad_concepts where id = d.active_concept_id and document_id = d.id and deleted_at is null for update;
	if not found then raise exception 'The document has no active model.'; end if;
	if p_expected_revision is null or p_operation_id is null
		or length(btrim(coalesce(p_label,''))) not between 1 and 120
		or jsonb_typeof(p_actions) is distinct from 'array'
		or jsonb_typeof(p_artifacts) is distinct from 'array' then raise exception 'Invalid save request.'; end if;
	perform public._ideacad_direct_validate_model(p_model);
	if p_model->>'kernel' is distinct from c.features->>'kernel' then raise exception 'Copy the document to change its kernel version.'; end if;
	fingerprint := encode(sha256(convert_to(jsonb_build_object('base',p_expected_revision,'actions',p_actions,'model',p_model,'artifacts',p_artifacts,'label',p_label)::text,'UTF8')),'hex');
	select * into receipt from public.ideacad_history h
		where h.concept_id = c.id and h.operation_id = p_operation_id and h.operation_start is true;
	if found then
		if receipt.request_hash is distinct from fingerprint then raise exception 'That save ID was already used for a different change.'; end if;
		return public._ideacad_direct_payload(d.id) || jsonb_build_object('ok',true,'duplicate',true,'acceptedRevision',receipt.result_revision);
	end if;
	if p_expected_revision <> c.revision then
		return jsonb_build_object('ok',false,'reason','stale','concept',to_jsonb(c));
	end if;
	if jsonb_array_length(p_actions) = 0 then
		if p_model is distinct from c.features then raise exception 'A changed model needs history actions.'; end if;
		return public._ideacad_direct_payload(d.id) || jsonb_build_object('ok',true,'noop',true,'acceptedRevision',c.revision);
	end if;
	-- Stale/no-op requests cannot leave artifact rows behind.
	for blob in select value from jsonb_array_elements(p_artifacts) loop
		if jsonb_typeof(blob->'data') is distinct from 'string'
			or jsonb_typeof(blob->'hash') is distinct from 'string'
			or (blob ? 'kernel' and blob->>'kernel' is distinct from p_model->>'kernel') then raise exception 'Invalid BREP artifact.'; end if;
		v_bytes := decode(blob->>'data','base64');
		v_hash := encode(sha256(v_bytes),'hex');
		if v_hash is distinct from blob->>'hash' or octet_length(v_bytes) = 0 then raise exception 'BREP artifact checksum failed.'; end if;
		if not exists(select 1 from jsonb_array_elements(p_model->'bodies') x where x.value->>'artifact' = v_hash) then raise exception 'This artifact is not used by the saved model.'; end if;
		insert into public.ideacad_brep_artifacts(document_id,hash,kernel,bytes)
			values(d.id,v_hash,p_model->>'kernel',v_bytes) on conflict(document_id,hash) do nothing;
		if not exists(select 1 from public.ideacad_brep_artifacts x where x.document_id = d.id and x.hash = v_hash and x.bytes = v_bytes and x.kernel = p_model->>'kernel') then raise exception 'The artifact ID has different contents.'; end if;
	end loop;
	for b in select value from jsonb_array_elements(p_model->'bodies') loop
		if not exists(select 1 from public.ideacad_brep_artifacts x where x.document_id = d.id and x.hash = b->>'artifact' and x.kernel = p_model->>'kernel') then raise exception 'A body references a missing BREP artifact.'; end if;
	end loop;
	select coalesce(max(h.seq),0)+1 into seq from public.ideacad_history h where h.concept_id = c.id;
	first_seq := seq;
	state := c.features;
	for a in select value from jsonb_array_elements(p_actions) loop
		undo_seq := null;
		if a ? 'undoesSeq' and a->'undoesSeq' <> 'null'::jsonb then
			if jsonb_typeof(a->'undoesSeq') is distinct from 'number' or a->>'undoesSeq' !~ '^[1-9][0-9]*$' then raise exception 'Invalid undo target.'; end if;
			undo_seq := (a->>'undoesSeq')::bigint;
			select * into target from public.ideacad_history h where h.concept_id = c.id and h.seq = undo_seq and h.seq > 0;
			if not found then raise exception 'That action is not in this document history.'; end if;
			kind := case target.kind when 'insert' then 'remove' when 'remove' then 'insert' else target.kind end;
			if a->>'kind' is distinct from kind or a->>'path' is distinct from target.path
				or a->'before' is distinct from coalesce(target.after_value,'null'::jsonb)
				or a->'after' is distinct from coalesce(target.before_value,'null'::jsonb) then raise exception 'Undo must reverse the action it names.'; end if;
			if exists(select 1 from public.ideacad_history h where h.concept_id = c.id and h.undoes_seq = undo_seq) then raise exception 'Somebody already undid that action. Reload the history and try again.'; end if;
		end if;
		state := public._ideacad_direct_apply_action(state,a);
		insert into public.ideacad_history(concept_id,seq,kind,path,before_value,after_value,undoes_seq,actor,
			operation_id,operation_start,operation_label,request_hash,result_revision)
		values(c.id,seq,a->>'kind',a->>'path',a->'before',a->'after',undo_seq,public.current_user_email(),
			p_operation_id,n=0,case when n=0 then p_label end,case when n=0 then fingerprint end,case when n=0 then c.revision+1 end);
		seq := seq+1; n := n+1;
	end loop;
	if state is distinct from p_model then raise exception 'The history actions do not produce the saved model.'; end if;
	update public.ideacad_concepts set features = state,revision = c.revision+1,updated_at = now() where id = c.id returning * into c;
	update public.ideacad_documents set title = btrim(state->>'title'),updated_at = now() where id = d.id;
	result := public._ideacad_direct_payload(d.id);
	return result || jsonb_build_object('ok',true,'duplicate',false,'acceptedRevision',c.revision,'firstSeq',first_seq,'lastSeq',seq-1);
end;
$savedirect$;

-- LEGACY FORMAT DISPATCH
-- Keep the original blade bodies, closing independent hold writes and
-- live-posting authorization shortcuts for captured direct documents.
create or replace function public.ideacad_beat_part(
	p_part_id uuid,
	p_hold_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $beat$
declare
	v_part public.ideacad_parts;
	v_email text := public.current_user_email();
	v_window interval := public._ideacad_hold_window();
begin
	if v_email = '' then
		raise exception 'Sign in to work on a part.';
	end if;
	select * into v_part from public.ideacad_parts where id = p_part_id for update;
	if not found then
		raise exception 'That part does not exist.';
	end if;
	if exists(select 1 from public.ideacad_documents d where d.id = v_part.document_id and d.model_format = 'solid-v1') then
		raise exception 'Direct documents do not use legacy part holds.';
	end if;

	-- Identity AND generation, independently. The revision is a marker, not a
	-- credential: holding somebody else's number gets nothing.
	if v_part.held_by is distinct from v_email or v_part.hold_revision <> p_hold_revision then
		return jsonb_build_object('ok', false, 'reason', 'lost',
			'partId', v_part.id, 'heldBy', v_part.held_by,
			'holdRevision', v_part.hold_revision);
	end if;

	if v_part.hold_beat_at <= now() - v_window then
		-- Still recorded as ours, but the hold lapsed. Say so rather than
		-- quietly reviving it: anyone could have taken it in the meantime, and
		-- a client that believes it never lost the part will overwrite work.
		return jsonb_build_object('ok', false, 'reason', 'lapsed',
			'partId', v_part.id, 'heldBy', v_part.held_by,
			'holdRevision', v_part.hold_revision);
	end if;

	update public.ideacad_parts set hold_beat_at = now()
		where id = p_part_id returning * into v_part;
	return jsonb_build_object('ok', true, 'reason', 'beating',
		'partId', v_part.id, 'holdRevision', v_part.hold_revision,
		'holdBeatAt', v_part.hold_beat_at);
end;
$beat$;

create or replace function public.ideacad_release_part(p_part_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $release$
declare
	v_part public.ideacad_parts;
	v_email text := public.current_user_email();
begin
	if v_email = '' then
		raise exception 'Sign in to release a part.';
	end if;
	select * into v_part from public.ideacad_parts where id = p_part_id for update;
	if not found then
		raise exception 'That part does not exist.';
	end if;
	if exists(select 1 from public.ideacad_documents d where d.id = v_part.document_id and d.model_format = 'solid-v1') then
		raise exception 'Direct documents do not use legacy part holds.';
	end if;
	if v_part.held_by is null then
		return jsonb_build_object('ok', true, 'reason', 'already_free',
			'partId', v_part.id, 'holdRevision', v_part.hold_revision);
	end if;
	if v_part.held_by <> v_email and not public._ideacad_part_owner(v_part.document_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_yours',
			'partId', v_part.id, 'heldBy', v_part.held_by,
			'holdRevision', v_part.hold_revision);
	end if;
	update public.ideacad_parts
		set held_by = null, held_at = null, hold_beat_at = null,
			hold_revision = hold_revision + 1
		where id = p_part_id
		returning * into v_part;
	return jsonb_build_object('ok', true, 'reason', 'released',
		'partId', v_part.id, 'holdRevision', v_part.hold_revision);
end;
$release$;

create or replace function public.ideacad_set_document_archived(
	p_document_id uuid,
	p_archived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $setarchived$
declare
	v_email text := public.current_user_email();
	d public.ideacad_documents;
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_archived is null then
		raise exception 'Say whether to archive this document or restore it.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if found and d.model_format = 'solid-v1' then return public.ideacad_set_direct_document_archived(p_document_id,p_archived); end if;
	if not found or not public._classroom_manages_item(d.item_id) then
		raise exception 'That document does not exist.';
	end if;

	if p_archived then
		update public.ideacad_documents
		set archived_at = coalesce(archived_at, now()),
			archived_by = coalesce(archived_by, v_email)
		where id = p_document_id
		returning * into d;
	else
		-- Restoring drops the class grants with it, and that is the decision
		-- rather than an omission: narrowing (b) says a class grant is only
		-- available on an ARCHIVED document, so a restored document holding one
		-- would be a live student's work shared with a whole class through a
		-- door that is closed to every other route. Re-archiving therefore does
		-- NOT bring the old grants back, which is the safe direction.
		delete from public.ideacad_section_grants where document_id = p_document_id;
		update public.ideacad_documents
		set archived_at = null, archived_by = null
		where id = p_document_id
		returning * into d;
	end if;

	return jsonb_build_object('ok', true, 'document', to_jsonb(d));
end
$setarchived$;

create or replace function public.ideacad_share_document_with_section(
	p_document_id uuid,
	p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $sharesection$
declare
	v_email text := public.current_user_email();
	d public.ideacad_documents;
	g public.ideacad_section_grants;
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id;
	if found and d.model_format = 'solid-v1' then return public.ideacad_share_direct_document_with_section(p_document_id,p_section_id); end if;
	-- Not found and not managed answer identically, so a uuid cannot be probed.
	if not found or not public._classroom_manages_item(d.item_id) then
		raise exception 'That document does not exist.';
	end if;
	-- Narrowing (b). The owner-only default this reverses was written for LIVE
	-- work, and it still holds for live work.
	if d.archived_at is null then
		raise exception 'Archive this document first. Sharing with a whole class is for archived reference work.';
	end if;
	-- Narrowing (c). Same population ideacad_share_document computes, so a
	-- class outside the item's own postings is refused rather than merely
	-- unlikely.
	if not exists (
		select 1 from public.classroom_postings cp
		where cp.item_id = d.item_id and cp.section_id = p_section_id
	) then
		raise exception 'You can only share this with a class this assignment is posted to.';
	end if;
	-- The second manage check. Managing the ITEM is not managing every section
	-- somebody might name, and this is what stops an instructor pushing work
	-- into a colleague's class.
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section''s teacher of record or a site admin can share work with that class.';
	end if;

	insert into public.ideacad_section_grants(document_id, section_id, granted_by)
	values (d.id, p_section_id, v_email)
	on conflict (document_id, section_id) do update
		set granted_by = excluded.granted_by
	returning * into g;
	return jsonb_build_object('ok', true, 'grant', to_jsonb(g));
end
$sharesection$;

create or replace function public.ideacad_unshare_document_from_section(
	p_document_id uuid,
	p_section_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $unsharesection$
declare
	v_email text := public.current_user_email();
	d public.ideacad_documents;
	v_removed integer;
begin
	if coalesce(v_email, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id;
	if found and d.model_format = 'solid-v1' then return public.ideacad_unshare_direct_document_from_section(p_document_id,p_section_id); end if;
	if not found or not public._classroom_manages_item(d.item_id) then
		raise exception 'That document does not exist.';
	end if;
	-- NO ARCHIVED CHECK AND NO POSTING CHECK ON THE WAY OUT. Taking access away
	-- must never be refused by a precondition that has since stopped holding --
	-- a document restored while a grant existed, or a section the item was
	-- unposted from, would otherwise be a grant nobody could remove.
	delete from public.ideacad_section_grants
	where document_id = p_document_id and section_id = p_section_id;
	get diagnostics v_removed = row_count;
	-- Removing a grant that is not there is not an error: the instructor asked
	-- for that class not to have access and that class does not have access.
	return jsonb_build_object('ok', true, 'removed', v_removed);
end
$unsharesection$;

create or replace function public.ideacad_open_shared_document(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $openshared$
declare
	d public.ideacad_documents;
	v_role text;
	v_manager boolean := false;
	cfg jsonb;
begin
	if coalesce(public.current_user_email(), '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id;
	v_role := public._ideacad_document_role(p_document_id);
	if found then
		v_manager := case when d.model_format = 'solid-v1' then public._ideacad_direct_manager(d.id) else public._classroom_manages_item(d.item_id) end;
	end if;
	if v_role is null and not v_manager then
		raise exception 'That document does not exist.';
	end if;
	if d.model_format = 'solid-v1' then cfg := d.assignment_context->'config';
	else select config into cfg from public.ideacad_editors where item_id = d.item_id; end if;
	return jsonb_build_object(
		'document', to_jsonb(d),
		'concepts', (
			select coalesce(jsonb_agg(to_jsonb(x) order by x.position), '[]')
			from public.ideacad_concepts x
			where x.document_id = d.id and x.deleted_at is null
		),
		'prediction', (
			select to_jsonb(p) from public.ideacad_predictions p where p.document_id = d.id
		),
		'config', cfg,
		'role', coalesce(v_role, 'manager'),
		'canWrite', public._ideacad_can_write_document(p_document_id),
		'archived', d.archived_at is not null,
		'archivedAt', d.archived_at
	);
end
$openshared$;

create or replace function public.ideacad_archive(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $archive$
begin
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only a teacher for this class can open the archive.';
	end if;
	return (
		select coalesce(jsonb_agg(jsonb_build_object(
			'documentId', d.id,
			'ownerEmail', d.student_email,
			'archivedAt', d.archived_at,
			'archivedBy', d.archived_by,
			'onRoster', r.enrolled,
			'reason', case when d.archived_at is not null then 'archived' else 'off_roster' end,
			'conceptCount', (
				select count(*) from public.ideacad_concepts c
				where c.document_id = d.id and c.deleted_at is null
			),
			'updatedAt', d.updated_at,
			'sharedWithSections', (
				select coalesce(jsonb_agg(jsonb_build_object(
					'sectionId', s.id,
					'label', s.label,
					'grantedBy', sg.granted_by,
					'grantedAt', sg.granted_at
				) order by s.label), '[]')
				from public.ideacad_section_grants sg
				join public.classroom_sections s on s.id = sg.section_id
				where sg.document_id = d.id
			)
		) order by d.student_email), '[]')
		from public.ideacad_documents d
		cross join lateral (
			select exists (
				select 1
				from public.classroom_postings cp
				join public.classroom_enrollments ce on ce.section_id = cp.section_id
				where cp.item_id = p_item_id and ce.student_email = d.student_email
			) as enrolled
		) r
		where d.item_id = p_item_id
			and (d.model_format = 'blade-v1' or public._ideacad_can_read_document(d.id))
			and (d.archived_at is not null or not r.enrolled)
	);
end
$archive$;

create or replace function public.ideacad_roster(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $roster$
begin
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only a teacher for this class can open the live roster.';
	end if;
	return (
		select coalesce(jsonb_agg(jsonb_build_object(
			'studentEmail', e.student_email,
			'document', to_jsonb(d),
			'archivedAt', d.archived_at,
			'concepts', coalesce((
				select jsonb_agg(to_jsonb(c) order by c.position)
				from public.ideacad_concepts c
				where c.document_id = d.id and c.deleted_at is null
			), '[]'),
			'prediction', (
				select to_jsonb(p) from public.ideacad_predictions p where p.document_id = d.id
			)
		) order by e.student_email), '[]')
		from (
			select distinct ce.student_email
			from public.classroom_postings cp
			join public.classroom_enrollments ce on ce.section_id = cp.section_id
			where cp.item_id = p_item_id
		) e
		left join public.ideacad_documents d
			on d.item_id = p_item_id and d.student_email = e.student_email
			and (d.model_format = 'blade-v1' or public._ideacad_can_read_document(d.id))
	);
end
$roster$;

revoke all on function
	public.ideacad_beat_part(uuid,integer),
	public.ideacad_release_part(uuid),
	public.ideacad_set_document_archived(uuid,boolean),
	public.ideacad_share_document_with_section(uuid,uuid),
	public.ideacad_unshare_document_from_section(uuid,uuid),
	public.ideacad_open_shared_document(uuid),
	public.ideacad_archive(uuid),
	public.ideacad_roster(uuid)
	from public,anon,authenticated;
grant execute on function
	public.ideacad_beat_part(uuid,integer),
	public.ideacad_release_part(uuid),
	public.ideacad_set_document_archived(uuid,boolean),
	public.ideacad_share_document_with_section(uuid,uuid),
	public.ideacad_unshare_document_from_section(uuid,uuid),
	public.ideacad_open_shared_document(uuid),
	public.ideacad_archive(uuid),
	public.ideacad_roster(uuid)
	to authenticated,service_role;

-- REVIEW AND STORAGE NOTES:
-- The worker envelope and frozen per-gesture transport match this contract.
-- Measured 26 box operations: 41,865 bytes of artifacts, action rows and origin.
--    Consider a narrower structured body delta if measured operation rows or
--    combined artifact growth miss the recorded budget; never silently prune.

revoke all on function
	public._ideacad_direct_manager(uuid),public._ideacad_direct_can_write(uuid),
	public._ideacad_preserve_direct_document(),public._ideacad_direct_apply_action(jsonb,jsonb),
	public._ideacad_direct_validate_model(jsonb),public._ideacad_direct_payload(uuid)
	from public,anon,authenticated;
grant execute on function
	public._ideacad_direct_manager(uuid),public._ideacad_direct_can_write(uuid),
	public._ideacad_preserve_direct_document(),public._ideacad_direct_apply_action(jsonb,jsonb),
	public._ideacad_direct_validate_model(jsonb),public._ideacad_direct_payload(uuid)
	to service_role;

revoke all on function public._ideacad_can_read_document(uuid),public._ideacad_manages_document(uuid),public._ideacad_realtime_can_send(text)
	from public,anon,authenticated;
grant execute on function public._ideacad_can_read_document(uuid),public._ideacad_manages_document(uuid),public._ideacad_realtime_can_send(text)
	to authenticated,service_role;
revoke all on function public._ideacad_can_write_document(uuid),public._ideacad_part_owner(uuid)
	from public,anon,authenticated;
grant execute on function public._ideacad_can_write_document(uuid),public._ideacad_part_owner(uuid)
	to service_role;

revoke all on function
	public.ideacad_read_brep_artifacts(uuid,text[]),public.ideacad_direct_concept_history(uuid,bigint,integer),public.ideacad_open_direct_document(uuid),public.ideacad_direct_documents(),
	public.ideacad_create_direct_document(text,text),public.ideacad_link_direct_document(uuid,uuid),
	public.ideacad_share_direct_document(uuid,text,text),public.ideacad_set_direct_document_archived(uuid,boolean),
	public.ideacad_share_direct_document_with_section(uuid,uuid),public.ideacad_unshare_direct_document_from_section(uuid,uuid),
	public.ideacad_save_direct_document(uuid,integer,uuid,text,jsonb,jsonb,jsonb)
	from public,anon,authenticated;
grant execute on function
	public.ideacad_read_brep_artifacts(uuid,text[]),public.ideacad_direct_concept_history(uuid,bigint,integer),public.ideacad_open_direct_document(uuid),public.ideacad_direct_documents(),
	public.ideacad_create_direct_document(text,text),public.ideacad_link_direct_document(uuid,uuid),
	public.ideacad_share_direct_document(uuid,text,text),public.ideacad_set_direct_document_archived(uuid,boolean),
	public.ideacad_share_direct_document_with_section(uuid,uuid),public.ideacad_unshare_direct_document_from_section(uuid,uuid),
	public.ideacad_save_direct_document(uuid,integer,uuid,text,jsonb,jsonb,jsonb)
	to authenticated,service_role;

-- Global admin advisory rules. Geometry remains unconstrained.
-- These limits feed advisory evaluation. No document/geometry writer calls them.

create or replace function public._ideacad_valid_advisory_limits(p_limits jsonb)
returns boolean language plpgsql immutable security definer set search_path = ''
as $validlimits$
declare k text; dimension text; value jsonb; low_value numeric; high_value numeric; finite_value double precision;
begin
	if jsonb_typeof(p_limits) is distinct from 'object' then return false; end if;
	if (select count(*) from jsonb_object_keys(p_limits)) <> 8 then return false; end if;
	foreach dimension in array array['DiameterIn','HeightIn','MassG','HexExtensionIn'] loop
		foreach k in array array['min'||dimension,'max'||dimension] loop
			if not p_limits ? k then return false; end if;
			value := p_limits->k;
			if jsonb_typeof(value) = 'null' then continue; end if;
			if jsonb_typeof(value) is distinct from 'number' or (value::text)::numeric < 0 then return false; end if;
			-- The web evaluator uses finite JS numbers. This is a representation
			-- check on admin settings, never a student geometry dimension clamp.
			finite_value := (value::text)::double precision;
			if finite_value in ('Infinity'::double precision,'-Infinity'::double precision,'NaN'::double precision) then return false; end if;
		end loop;
		low_value := (p_limits->>('min'||dimension))::numeric;
		high_value := (p_limits->>('max'||dimension))::numeric;
		if low_value is not null and high_value is not null and low_value > high_value then return false; end if;
	end loop;
	return true;
exception when numeric_value_out_of_range or invalid_text_representation then return false;
end;
$validlimits$;

create table if not exists public.ideacad_rule_revisions (
	revision bigint primary key,
	schema_version smallint not null default 1 check(schema_version = 1),
	limits jsonb not null check(public._ideacad_valid_advisory_limits(limits)),
	changed_by text,
	changed_at timestamptz not null default now()
);

insert into public.ideacad_rule_revisions(revision,limits) values(1,
	'{"minDiameterIn":null,"maxDiameterIn":5,"minHeightIn":2.9,"maxHeightIn":3.1,"minMassG":null,"maxMassG":680,"minHexExtensionIn":0.5,"maxHexExtensionIn":null}'::jsonb)
	on conflict(revision) do nothing;

alter table public.ideacad_rule_revisions enable row level security;
drop policy if exists "signed in users read ideacad advisory rules" on public.ideacad_rule_revisions;
create policy "signed in users read ideacad advisory rules" on public.ideacad_rule_revisions
	for select to authenticated using(auth.uid() is not null);
revoke all on table public.ideacad_rule_revisions from public,anon,authenticated;
grant select on table public.ideacad_rule_revisions to authenticated;
grant all on table public.ideacad_rule_revisions to service_role;

create or replace function public.ideacad_advisory_rules()
returns jsonb language plpgsql stable security definer set search_path = ''
as $readrules$
declare result jsonb;
begin
	if auth.uid() is null then raise exception 'You must be signed in.'; end if;
	select jsonb_build_object('revision',r.revision,'schemaVersion',r.schema_version,
		'limits',r.limits,'changedAt',r.changed_at,'canEdit',public.is_admin())
	into result from public.ideacad_rule_revisions r order by r.revision desc limit 1;
	return result;
end;
$readrules$;

create or replace function public.ideacad_set_advisory_rules(p_expected_revision bigint,p_limits jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $setrules$
declare current_row public.ideacad_rule_revisions;
begin
	if not public.is_admin() then raise exception 'Only a site admin can change the IdeaBlade advisory rules.'; end if;
	if not public._ideacad_valid_advisory_limits(p_limits) then raise exception 'Use finite, nonnegative numeric limits or leave a bound empty. Each minimum must be at most its maximum.'; end if;
	-- All writers serialize before reading the head. Locking only the old
	-- latest row would not protect against a concurrent append.
	perform pg_advisory_xact_lock(hashtextextended('ideacad-advisory-rule-revisions-v1',0));
	select * into current_row from public.ideacad_rule_revisions order by revision desc limit 1;
	if p_expected_revision is distinct from current_row.revision then
		return jsonb_build_object('ok',false,'reason','stale','current',public.ideacad_advisory_rules());
	end if;
	if p_limits = current_row.limits then return jsonb_build_object('ok',true,'noop',true,'current',public.ideacad_advisory_rules()); end if;
	insert into public.ideacad_rule_revisions(revision,limits,changed_by)
		values(current_row.revision+1,p_limits,public.current_user_email());
	return jsonb_build_object('ok',true,'current',public.ideacad_advisory_rules());
end;
$setrules$;

revoke all on function public._ideacad_valid_advisory_limits(jsonb) from public,anon,authenticated;
grant execute on function public._ideacad_valid_advisory_limits(jsonb) to service_role;
revoke all on function public.ideacad_advisory_rules(),public.ideacad_set_advisory_rules(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.ideacad_advisory_rules(),public.ideacad_set_advisory_rules(bigint,jsonb) to authenticated,service_role;



commit;

-- One result-producing local readiness query; it does not record application.
with client_functions(signature) as (values
	('public.ideacad_read_brep_artifacts(uuid,text[])'),
	('public.ideacad_direct_concept_history(uuid,bigint,integer)'),
	('public.ideacad_open_direct_document(uuid)'),
	('public.ideacad_direct_documents()'),
	('public.ideacad_advisory_rules()'),
	('public.ideacad_set_advisory_rules(bigint,jsonb)'),
	('public.ideacad_create_direct_document(text,text)'),
	('public.ideacad_link_direct_document(uuid,uuid)'),
	('public.ideacad_share_direct_document(uuid,text,text)'),
	('public.ideacad_set_direct_document_archived(uuid,boolean)'),
	('public.ideacad_share_direct_document_with_section(uuid,uuid)'),
	('public.ideacad_unshare_direct_document_from_section(uuid,uuid)'),
	('public.ideacad_save_direct_document(uuid,integer,uuid,text,jsonb,jsonb,jsonb)')
), private_functions(signature) as (values
	('public._ideacad_direct_manager(uuid)'),('public._ideacad_direct_can_write(uuid)'),
	('public._ideacad_direct_apply_action(jsonb,jsonb)'),('public._ideacad_direct_validate_model(jsonb)'),
	('public._ideacad_direct_payload(uuid)'),('public._ideacad_preserve_direct_document()')
	,('public._ideacad_valid_advisory_limits(jsonb)'),('public._ideacad_direct_validate_sketches(jsonb)')
), checks as (
	select 'client function: '||signature as examined,
		to_regprocedure(signature) is not null and has_function_privilege('authenticated',signature,'execute') and not has_function_privilege('anon',signature,'execute') as ready
	from client_functions
	union all select 'private function: '||signature,
		to_regprocedure(signature) is not null and not has_function_privilege('authenticated',signature,'execute') and not has_function_privilege('anon',signature,'execute') from private_functions
	union all select 'RLS and grants: '||relname,relrowsecurity
		and has_table_privilege('authenticated',oid,'select') and not has_table_privilege('authenticated',oid,'insert')
		and not has_table_privilege('authenticated',oid,'update') and not has_table_privilege('authenticated',oid,'delete')
		and not has_table_privilege('anon',oid,'select')
	from pg_class where oid in ('public.ideacad_assignment_sections'::regclass,'public.ideacad_brep_artifacts'::regclass,'public.ideacad_rule_revisions'::regclass)
	union all select 'standalone document item nullable',not attnotnull from pg_attribute where attrelid='public.ideacad_documents'::regclass and attname='item_id'
	union all select 'operation receipt uniqueness',exists(select 1 from pg_index where indexrelid='public.ideacad_history_operation_once_idx'::regclass and indisunique and indisvalid)
	union all select 'direct document deletion protection',exists(select 1 from pg_trigger where tgrelid='public.ideacad_documents'::regclass and tgname='ideacad_preserve_direct_document' and tgenabled='O')
)
select examined,ready from checks order by examined;
