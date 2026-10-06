-- Run AFTER schema.sql. Additive migration; existing classes and learning records stay intact.
create table if not exists public.nova_courses (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.profiles(id),
 class_id uuid references public.classes(id), title text not null, data jsonb not null,
 version integer not null default 1, updated_at timestamptz not null default now()
);
create table if not exists public.nova_publications (
 id uuid primary key references public.nova_courses(id), teacher_id uuid not null references public.profiles(id),
 class_id uuid not null references public.classes(id), title text not null, data jsonb not null,
 version integer not null, updated_at timestamptz not null default now()
);
create table if not exists public.nova_demonstrations (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.nova_courses(id),
 student_id uuid not null references public.profiles(id), checkpoint_id text not null,
 version integer not null default 1,
 status text not null check (status in ('draft','followup','ready','submitted','reviewed','revision_requested')),
 snapshot jsonb not null, data jsonb not null, created_at timestamptz not null default now(),
 unique(course_id,student_id,checkpoint_id)
);
create index if not exists nova_course_owner on public.nova_courses(teacher_id);
create index if not exists nova_demo_course on public.nova_demonstrations(course_id);
alter table public.nova_courses enable row level security;
alter table public.nova_publications enable row level security;
alter table public.nova_demonstrations enable row level security;
drop policy if exists nova_drafts_owner on public.nova_courses;
create policy nova_drafts_owner on public.nova_courses for select to authenticated using (teacher_id=auth.uid());
drop policy if exists nova_published_read on public.nova_publications;
create policy nova_published_read on public.nova_publications for select to authenticated using (teacher_id=auth.uid() or public.enrolled(class_id));
drop policy if exists nova_evidence_read on public.nova_demonstrations;
create policy nova_evidence_read on public.nova_demonstrations for select to authenticated using (
 student_id=auth.uid() or (status in ('submitted','reviewed','revision_requested') and exists(select 1 from public.nova_courses c where c.id=course_id and c.teacher_id=auth.uid()))
);
-- Mutations go through the server's authenticated, role-checked API, never the browser.
revoke all on public.nova_courses,public.nova_publications,public.nova_demonstrations from anon,authenticated;
grant select on public.nova_courses,public.nova_publications,public.nova_demonstrations to authenticated;
grant all on public.nova_courses,public.nova_publications,public.nova_demonstrations to service_role;
