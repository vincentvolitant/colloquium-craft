-- 1. Remove all permissive anon write policies
DROP POLICY IF EXISTS "Anon insert exams" ON public.exams;
DROP POLICY IF EXISTS "Anon update exams" ON public.exams;
DROP POLICY IF EXISTS "Anon delete exams" ON public.exams;

DROP POLICY IF EXISTS "Anon insert staff" ON public.staff;
DROP POLICY IF EXISTS "Anon update staff" ON public.staff;
DROP POLICY IF EXISTS "Anon delete staff" ON public.staff;

DROP POLICY IF EXISTS "Anon insert rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anon update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anon delete rooms" ON public.rooms;

DROP POLICY IF EXISTS "Anon insert room_mappings" ON public.room_mappings;
DROP POLICY IF EXISTS "Anon update room_mappings" ON public.room_mappings;
DROP POLICY IF EXISTS "Anon delete room_mappings" ON public.room_mappings;

DROP POLICY IF EXISTS "Anon insert schedule_config" ON public.schedule_config;
DROP POLICY IF EXISTS "Anon update schedule_config" ON public.schedule_config;
DROP POLICY IF EXISTS "Anon delete schedule_config" ON public.schedule_config;

DROP POLICY IF EXISTS "Anon insert schedule_versions" ON public.schedule_versions;
DROP POLICY IF EXISTS "Anon update schedule_versions" ON public.schedule_versions;
DROP POLICY IF EXISTS "Anon delete schedule_versions" ON public.schedule_versions;

DROP POLICY IF EXISTS "Anon insert scheduled_events" ON public.scheduled_events;
DROP POLICY IF EXISTS "Anon update scheduled_events" ON public.scheduled_events;
DROP POLICY IF EXISTS "Anon delete scheduled_events" ON public.scheduled_events;

-- 2. Revoke broad write privileges from anon/authenticated (only service_role writes via edge function)
REVOKE INSERT, UPDATE, DELETE ON public.exams FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.staff FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rooms FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.room_mappings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.schedule_config FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.schedule_versions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scheduled_events FROM anon, authenticated;

-- Ensure service_role retains full access
GRANT ALL ON public.exams TO service_role;
GRANT ALL ON public.staff TO service_role;
GRANT ALL ON public.rooms TO service_role;
GRANT ALL ON public.room_mappings TO service_role;
GRANT ALL ON public.schedule_config TO service_role;
GRANT ALL ON public.schedule_versions TO service_role;
GRANT ALL ON public.scheduled_events TO service_role;

-- 3. Restrict public exam reads to safe columns only (no student_email)
REVOKE SELECT ON public.exams FROM anon, authenticated;
GRANT SELECT (
  id, degree, kompetenzfeld,
  student_first_name, student_last_name,
  topic, examiner1_id, examiner2_id,
  is_team, team_partner_first_name, team_partner_last_name,
  is_public, created_at, updated_at
) ON public.exams TO anon, authenticated;
