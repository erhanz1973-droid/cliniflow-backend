create or replace function create_treatment_group_atomic(
  p_clinic_id uuid,
  p_patient_id uuid,
  p_doctor_ids uuid[],
  p_primary_doctor_id uuid,
  p_name text,
  p_description text,
  p_admin_id uuid
)
returns json
language plpgsql
as $$
declare
  v_group_id uuid;
  v_doctor_id uuid;
begin

  -- 1️⃣ create group
  insert into treatment_groups (
    clinic_id,
    patient_id,
    group_name,
    description,
    status,
    created_by_doctor_id
  )
  values (
    p_clinic_id,
    p_patient_id,
    p_name,
    p_description,
    'ACTIVE',
    p_primary_doctor_id
  )
  returning id into v_group_id;

  -- 2️⃣ insert members
  foreach v_doctor_id in array p_doctor_ids
  loop
    insert into treatment_group_members (
      treatment_group_id,
      doctor_id,
      role,
      status,
      joined_at
    )
    values (
      v_group_id,
      v_doctor_id,
      case
        when v_doctor_id = p_primary_doctor_id then 'PRIMARY'
        else 'MEMBER'
      end,
      'ACTIVE',
      now()
    );
  end loop;

  return json_build_object(
    'ok', true,
    'group_id', v_group_id
  );

exception
  when others then
    raise exception 'Treatment group creation failed: %', sqlerrm;
end;
$$;
