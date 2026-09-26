-- Template duplication also copies "choose up to N".
create or replace function public.duplicate_form_template(p_template_id uuid, p_name text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new_template uuid;
  sec record;
  v_new_section uuid;
  q record;
  v_map jsonb := '{}'::jsonb;
  v_new_q uuid;
begin
  insert into public.form_templates (name, description, project_type)
  select coalesce(nullif(trim(p_name), ''), name || ' (עותק)'), description, project_type
  from public.form_templates where id = p_template_id
  returning id into v_new_template;

  if v_new_template is null then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;

  for sec in select * from public.form_sections where template_id = p_template_id order by position loop
    insert into public.form_sections (template_id, title, description, position)
    values (v_new_template, sec.title, sec.description, sec.position)
    returning id into v_new_section;

    for q in select * from public.form_questions where section_id = sec.id order by position loop
      insert into public.form_questions (section_id, type, label, description, placeholder, required, options, condition, maps_to, max_choices, position)
      values (v_new_section, q.type, q.label, q.description, q.placeholder, q.required, q.options, q.condition, q.maps_to, q.max_choices, q.position)
      returning id into v_new_q;
      v_map := v_map || jsonb_build_object(q.id::text, v_new_q::text);
    end loop;
  end loop;

  update public.form_questions nq
     set condition = jsonb_set(nq.condition, '{question_id}', to_jsonb(v_map ->> (nq.condition ->> 'question_id')))
   where nq.condition is not null
     and v_map ? (nq.condition ->> 'question_id')
     and nq.section_id in (select id from public.form_sections where template_id = v_new_template);

  return v_new_template;
end;
$$;

revoke all on function public.duplicate_form_template(uuid, text) from public, anon;
grant execute on function public.duplicate_form_template(uuid, text) to authenticated;
