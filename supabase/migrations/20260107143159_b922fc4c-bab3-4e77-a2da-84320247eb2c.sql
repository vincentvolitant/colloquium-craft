
-- 1. Staff table (Mitarbeiter)
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  competence_fields TEXT[] NOT NULL DEFAULT '{}',
  employment_type TEXT NOT NULL CHECK (employment_type IN ('internal', 'external', 'adjunct')),
  availability_override JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Exams table (Prüfungen)
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  degree TEXT NOT NULL CHECK (degree IN ('BA', 'MA')),
  kompetenzfeld TEXT NOT NULL,
  student_first_name TEXT NOT NULL,
  student_last_name TEXT NOT NULL,
  student_email TEXT,
  topic TEXT NOT NULL,
  examiner1_id UUID REFERENCES public.staff(id),
  examiner2_id UUID REFERENCES public.staff(id),
  is_team BOOLEAN NOT NULL DEFAULT false,
  team_partner_first_name TEXT,
  team_partner_last_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Rooms table (Räume)
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Room mappings table (Zuordnung Kompetenzfeld zu Räumen)
CREATE TABLE public.room_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  degree_scope TEXT NOT NULL CHECK (degree_scope IN ('BA', 'MA', 'all')),
  kompetenzfeld TEXT NOT NULL,
  room_names TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(degree_scope, kompetenzfeld)
);

-- 5. Schedule config table (Konfiguration)
CREATE TABLE public.schedule_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  days DATE[] NOT NULL DEFAULT '{}',
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  ba_slot_minutes INTEGER NOT NULL DEFAULT 45,
  ma_slot_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Schedule versions table (Versionen)
CREATE TABLE public.schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Scheduled events table (Geplante Termine)
CREATE TABLE public.scheduled_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_version_id UUID REFERENCES public.schedule_versions(id) ON DELETE CASCADE NOT NULL,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
  day_date DATE NOT NULL,
  room TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  protocolist_id UUID REFERENCES public.staff(id),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'cancelled')) DEFAULT 'scheduled',
  cancellation_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_events ENABLE ROW LEVEL SECURITY;

-- Public read policies (everyone can read all data for the schedule display)
CREATE POLICY "Public read staff" ON public.staff FOR SELECT USING (true);
CREATE POLICY "Public read exams" ON public.exams FOR SELECT USING (true);
CREATE POLICY "Public read rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Public read room_mappings" ON public.room_mappings FOR SELECT USING (true);
CREATE POLICY "Public read schedule_config" ON public.schedule_config FOR SELECT USING (true);
CREATE POLICY "Public read schedule_versions" ON public.schedule_versions FOR SELECT USING (true);
CREATE POLICY "Public read scheduled_events" ON public.scheduled_events FOR SELECT USING (true);

-- Anon write policies (Admin writes go through Edge Functions that validate the password)
CREATE POLICY "Anon insert staff" ON public.staff FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update staff" ON public.staff FOR UPDATE USING (true);
CREATE POLICY "Anon delete staff" ON public.staff FOR DELETE USING (true);

CREATE POLICY "Anon insert exams" ON public.exams FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update exams" ON public.exams FOR UPDATE USING (true);
CREATE POLICY "Anon delete exams" ON public.exams FOR DELETE USING (true);

CREATE POLICY "Anon insert rooms" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update rooms" ON public.rooms FOR UPDATE USING (true);
CREATE POLICY "Anon delete rooms" ON public.rooms FOR DELETE USING (true);

CREATE POLICY "Anon insert room_mappings" ON public.room_mappings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update room_mappings" ON public.room_mappings FOR UPDATE USING (true);
CREATE POLICY "Anon delete room_mappings" ON public.room_mappings FOR DELETE USING (true);

CREATE POLICY "Anon insert schedule_config" ON public.schedule_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update schedule_config" ON public.schedule_config FOR UPDATE USING (true);
CREATE POLICY "Anon delete schedule_config" ON public.schedule_config FOR DELETE USING (true);

CREATE POLICY "Anon insert schedule_versions" ON public.schedule_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update schedule_versions" ON public.schedule_versions FOR UPDATE USING (true);
CREATE POLICY "Anon delete schedule_versions" ON public.schedule_versions FOR DELETE USING (true);

CREATE POLICY "Anon insert scheduled_events" ON public.scheduled_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update scheduled_events" ON public.scheduled_events FOR UPDATE USING (true);
CREATE POLICY "Anon delete scheduled_events" ON public.scheduled_events FOR DELETE USING (true);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply update triggers to all tables
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_room_mappings_updated_at BEFORE UPDATE ON public.room_mappings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedule_config_updated_at BEFORE UPDATE ON public.schedule_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedule_versions_updated_at BEFORE UPDATE ON public.schedule_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scheduled_events_updated_at BEFORE UPDATE ON public.scheduled_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default config row
INSERT INTO public.schedule_config (days, start_time, end_time, ba_slot_minutes, ma_slot_minutes)
VALUES ('{}', '09:00', '18:00', 45, 60);
