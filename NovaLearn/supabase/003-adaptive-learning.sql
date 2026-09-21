-- Run after schema.sql and 002-course-os.sql. Additive; no existing data is deleted.
-- Aggregate rows make an attempt + its evidence signals one atomic, version-checked write.
create table if not exists public.nova_learning_records (
 id uuid primary key default gen_random_uuid(),
 course_id uuid not null references public.nova_courses(id),
 student_id uuid not null references public.profiles(id),
 version integer not null default 1,
 data jsonb not null default '{"attempts":[],"signals":[],"support":[],"goal":""}'::jsonb,
 updated_at timestamptz not null default now(), unique(course_id,student_id)
);
create table if not exists public.nova_course_versions (
 id uuid primary key default gen_random_uuid(),
 course_id uuid not null references public.nova_courses(id), version integer not null,
 snapshot jsonb not null, released_at timestamptz not null default now(),
 unique(course_id,version)
);
alter table public.nova_learning_records enable row level security;
alter table public.nova_course_versions enable row level security;
drop policy if exists nova_learning_read on public.nova_learning_records;
create policy nova_learning_read on public.nova_learning_records for select to authenticated using (
 (student_id=auth.uid() and exists(select 1 from public.nova_publications p where p.id=course_id and public.enrolled(p.class_id)))
 or exists(select 1 from public.nova_courses c where c.id=course_id and c.teacher_id=auth.uid())
);
drop policy if exists nova_versions_owner on public.nova_course_versions;
create policy nova_versions_owner on public.nova_course_versions for select to authenticated using (
 exists(select 1 from public.nova_courses c where c.id=course_id and c.teacher_id=auth.uid())
);
revoke all on public.nova_learning_records,public.nova_course_versions from anon,authenticated;
grant select on public.nova_learning_records,public.nova_course_versions to authenticated;
grant all on public.nova_learning_records,public.nova_course_versions to service_role;

-- Private answer-key snapshot and sanitized student publication commit together.
create or replace function public.nova_release_course(p_course_id uuid,p_version integer,p_public_data jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare c public.nova_courses;
begin
 select * into c from public.nova_courses where id=p_course_id for update;
 if not found or c.version<>p_version then raise exception 'Course changed. Reload before release.'; end if;
 if c.class_id is null then raise exception 'Link a class before release.'; end if;
 insert into public.nova_course_versions(course_id,version,snapshot) values(c.id,c.version,to_jsonb(c)) on conflict(course_id,version) do nothing;
 insert into public.nova_publications(id,teacher_id,class_id,title,data,version,updated_at)
 values(c.id,c.teacher_id,c.class_id,c.title,p_public_data,c.version,now())
 on conflict(id) do update set teacher_id=excluded.teacher_id,class_id=excluded.class_id,title=excluded.title,data=excluded.data,version=excluded.version,updated_at=excluded.updated_at;
end $$;
revoke all on function public.nova_release_course(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.nova_release_course(uuid,integer,jsonb) to service_role;
