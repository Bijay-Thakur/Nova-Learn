-- Run after 003-adaptive-learning.sql. Additive: historical JSONB remains intact.
-- Service-role-only writes; authenticated clients cannot read private evaluator/rubric metadata.
create table if not exists public.nova_evidence_runs (
 id text primary key, demonstration_id uuid not null references public.nova_demonstrations(id),
 course_id uuid not null references public.nova_courses(id), student_id uuid not null references public.profiles(id),
 artifact_snapshot jsonb not null, bundle jsonb not null, created_at timestamptz not null default now(),
 constraint nova_evidence_runs_artifacts check (jsonb_typeof(artifact_snapshot) = 'array')
);
create table if not exists public.nova_evidence_events (
 id text primary key, run_id text not null references public.nova_evidence_runs(id),
 demonstration_id uuid not null references public.nova_demonstrations(id),
 course_id uuid not null references public.nova_courses(id), student_id uuid not null references public.profiles(id),
 module_id text not null, chapter_ids text[] not null default '{}', topic_ids text[] not null default '{}',
 concept_ids text[] not null default '{}', objective_id text not null,
 assessment_id text not null, assessment_item_id text not null, target_id text not null,
 evidence_type text not null, status text not null check (status in ('SUPPORTED','PARTIALLY_SUPPORTED','CONTRADICTED','NOT_OBSERVED','AMBIGUOUS')),
 strength text not null, confidence text not null, claim text not null, expected text not null,
 criterion text not null, supports jsonb not null default '[]'::jsonb,
 misconception jsonb, attempt_number integer not null check (attempt_number > 0),
 variant_id text, scaffolding text not null, evaluator text not null,
 routing text, prompt_version text, observed_at timestamptz not null,
 created_at timestamptz not null default now(),
 constraint nova_evidence_events_supports check (jsonb_typeof(supports) = 'array' and
  (status not in ('SUPPORTED','PARTIALLY_SUPPORTED','CONTRADICTED') or jsonb_array_length(supports) > 0)),
 constraint nova_evidence_unique_target unique(run_id,target_id)
);
create table if not exists public.nova_evidence_reviews (
 id uuid primary key default gen_random_uuid(), demonstration_id uuid not null references public.nova_demonstrations(id),
 run_id text references public.nova_evidence_runs(id), course_id uuid not null references public.nova_courses(id),
 student_id uuid not null references public.profiles(id), reviewer_id uuid not null references public.profiles(id),
 decision text not null check (decision in ('confirm','override','request_revision')),
 previous_findings jsonb, reviewed_findings jsonb not null, note text not null,
 created_at timestamptz not null default now()
);
create index if not exists nova_evidence_event_timeline on public.nova_evidence_events(student_id,course_id,observed_at,id);
create index if not exists nova_evidence_event_objective on public.nova_evidence_events(student_id,course_id,objective_id,observed_at);
create index if not exists nova_evidence_event_concepts on public.nova_evidence_events using gin(concept_ids);
create index if not exists nova_evidence_event_submission on public.nova_evidence_events(demonstration_id,observed_at,id);
create index if not exists nova_evidence_run_submission on public.nova_evidence_runs(demonstration_id,created_at);
create index if not exists nova_evidence_review_submission on public.nova_evidence_reviews(demonstration_id,created_at);
alter table public.nova_evidence_runs enable row level security;
alter table public.nova_evidence_events enable row level security;
alter table public.nova_evidence_reviews enable row level security;
revoke all on public.nova_evidence_runs,public.nova_evidence_events,public.nova_evidence_reviews from public,anon,authenticated;
grant select,insert on public.nova_evidence_runs,public.nova_evidence_events,public.nova_evidence_reviews to service_role;

-- Every RPC call is one Postgres transaction. A stale version or failed insert rolls back all rows.
create or replace function public.nova_save_evidence(p_id uuid,p_version integer,p_data jsonb,p_bundle jsonb,p_events jsonb)
returns setof public.nova_demonstrations language plpgsql security invoker set search_path=public as $$
declare d public.nova_demonstrations; e jsonb; s jsonb; answer text;
begin
 select * into d from public.nova_demonstrations where id=p_id for update;
 if not found then raise exception 'Evidence not found.'; end if;
 if d.version<>p_version then raise exception 'This record changed in another session. Reload before saving.'; end if;
 if d.status not in ('draft','followup','ready','revision_requested') then raise exception 'Submission is locked.'; end if;
 if coalesce(jsonb_typeof(p_events)<>'array',true) or coalesce(jsonb_array_length(p_events)=0,true)
    or coalesce(jsonb_typeof(p_data->'evidence')<>'array',true)
    or coalesce(jsonb_typeof(p_bundle->'eventIds')<>'array',true)
    or nullif(p_bundle->>'id','') is null then raise exception 'Invalid evidence payload.'; end if;
 insert into public.nova_evidence_runs(id,demonstration_id,course_id,student_id,artifact_snapshot,bundle)
 values(p_bundle->>'id',d.id,d.course_id,d.student_id,p_data->'evidence',p_bundle);
 for e in select value from jsonb_array_elements(p_events) loop
  if e->>'submissionId'<>d.id::text or e->>'studentId'<>d.student_id::text or e->>'courseId'<>d.course_id::text
     or e->>'assessmentId'<>d.checkpoint_id or not (p_bundle->'eventIds' ? (e->>'id'))
     then raise exception 'Evidence event does not match its submission.'; end if;
  for s in select value from jsonb_array_elements(coalesce(e->'supports','[]'::jsonb)) loop
   select a->>'answer' into answer from jsonb_array_elements(p_data->'evidence') a where a->>'id'=s->>'evidenceId';
   if answer is null or nullif(s->>'quote','') is null or strpos(answer,s->>'quote')=0
      or (s->>'start')::integer < 0 or (s->>'end')::integer <= (s->>'start')::integer
      then raise exception 'Evidence support does not match the saved student artifact.'; end if;
  end loop;
  insert into public.nova_evidence_events(id,run_id,demonstration_id,course_id,student_id,module_id,chapter_ids,topic_ids,concept_ids,
   objective_id,assessment_id,assessment_item_id,target_id,evidence_type,status,strength,confidence,claim,expected,criterion,
   supports,misconception,attempt_number,variant_id,scaffolding,evaluator,routing,prompt_version,observed_at)
  values(e->>'id',p_bundle->>'id',d.id,d.course_id,d.student_id,e->>'moduleId',
   array(select jsonb_array_elements_text(coalesce(e->'chapterIds','[]'::jsonb))),
   array(select jsonb_array_elements_text(coalesce(e->'topicIds','[]'::jsonb))),
   array(select jsonb_array_elements_text(coalesce(e->'conceptIds','[]'::jsonb))),
   e->>'objectiveId',e->>'assessmentId',e->>'assessmentItemId',e->>'targetId',e->>'type',e->>'status',e->>'strength',
   e->>'confidence',e->>'claim',e->>'expected',e->>'criterion',coalesce(e->'supports','[]'::jsonb),e->'misconception',
   (e->>'attemptNumber')::integer,e->>'variantId',e->>'scaffolding',e->>'evaluator',e->>'routing',e->>'promptVersion',
   (e->>'at')::timestamptz);
 end loop;
 if (select count(*) from public.nova_evidence_events where run_id=p_bundle->>'id')<>jsonb_array_length(p_bundle->'eventIds')
    then raise exception 'Evidence bundle does not match persisted events.'; end if;
 update public.nova_demonstrations set data=p_data,status='submitted',version=d.version+1 where id=d.id;
 return query select * from public.nova_demonstrations where id=d.id;
end $$;

create or replace function public.nova_record_evidence_review(p_id uuid,p_version integer,p_data jsonb,p_status text,p_review jsonb)
returns setof public.nova_demonstrations language plpgsql security invoker set search_path=public as $$
declare d public.nova_demonstrations; active_run text;
begin
 select * into d from public.nova_demonstrations where id=p_id for update;
 if not found then raise exception 'Evidence not found.'; end if;
 if d.version<>p_version then raise exception 'This record changed in another session. Reload before saving.'; end if;
 if d.status not in ('submitted','reviewed','revision_requested') or p_status not in ('reviewed','revision_requested')
    or p_review->>'decision' not in ('confirm','override','request_revision') then raise exception 'Invalid evidence review.'; end if;
 if not exists(select 1 from public.nova_courses c where c.id=d.course_id and c.teacher_id=(p_review->>'reviewerId')::uuid)
    then raise exception 'Action not permitted.'; end if;
 select id into active_run from public.nova_evidence_runs where id=p_data->'evidenceBundle'->>'id' and demonstration_id=d.id;
 insert into public.nova_evidence_reviews(demonstration_id,run_id,course_id,student_id,reviewer_id,decision,
  previous_findings,reviewed_findings,note,created_at)
 values(d.id,active_run,d.course_id,d.student_id,(p_review->>'reviewerId')::uuid,p_review->>'decision',
  coalesce(d.data->'review'->'findings',d.data->'evaluation'->'findings'),p_review->'findings',p_review->>'note',
  (p_review->>'at')::timestamptz);
 update public.nova_demonstrations set data=p_data,status=p_status,version=d.version+1 where id=d.id;
 return query select * from public.nova_demonstrations where id=d.id;
end $$;
revoke all on function public.nova_save_evidence(uuid,integer,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.nova_record_evidence_review(uuid,integer,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.nova_save_evidence(uuid,integer,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.nova_record_evidence_review(uuid,integer,jsonb,text,jsonb) to service_role;
