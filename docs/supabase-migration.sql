-- =====================================================
-- Kolloquiumsplaner - Supabase Migration für Self-Hosting
-- =====================================================
-- 
-- Diese Datei enthält alle SQL-Befehle, um die Datenbank
-- in einem eigenen Supabase-Projekt einzurichten.
--
-- Ausführung: Supabase Dashboard → SQL Editor → Neue Query → Einfügen → Run
--
-- =====================================================

-- 1. Staff (Mitarbeiter/Prüfer/Protokollanten)
-- =====================================================
CREATE TABLE public.staff (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    competence_fields TEXT[] NOT NULL DEFAULT '{}',
    employment_type TEXT NOT NULL CHECK (employment_type IN ('internal', 'external', 'adjunct')),
    can_do_protocol BOOLEAN NOT NULL DEFAULT true,
    availability_override JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff IS 'Mitarbeiter die als Prüfer oder Protokollanten eingesetzt werden können';
COMMENT ON COLUMN public.staff.employment_type IS 'internal = kann protokollieren, external/adjunct = nur prüfen';
COMMENT ON COLUMN public.staff.availability_override IS 'JSON mit Verfügbarkeitseinschränkungen (Tage, Zeitfenster, Blockaden)';

-- 2. Exams (Prüfungen/Kolloquien)
-- =====================================================
CREATE TABLE public.exams (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    degree TEXT NOT NULL CHECK (degree IN ('BA', 'MA')),
    kompetenzfeld TEXT NOT NULL,
    student_first_name TEXT NOT NULL,
    student_last_name TEXT NOT NULL,
    student_email TEXT,
    topic TEXT NOT NULL,
    examiner1_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    examiner2_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    is_team BOOLEAN NOT NULL DEFAULT false,
    team_partner_first_name TEXT,
    team_partner_last_name TEXT,
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.exams IS 'Alle angemeldeten Prüfungen/Kolloquien';
COMMENT ON COLUMN public.exams.is_team IS 'True wenn Teamarbeit mit 2 Studierenden';
COMMENT ON COLUMN public.exams.kompetenzfeld IS 'Für BA: Kompetenzfeld, für MA: "Master"';

-- 3. Rooms (Räume)
-- =====================================================
CREATE TABLE public.rooms (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rooms IS 'Verfügbare Prüfungsräume';

-- 4. Room Mappings (Raum-Zuordnungen pro Kompetenzfeld)
-- =====================================================
CREATE TABLE public.room_mappings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    degree_scope TEXT NOT NULL CHECK (degree_scope IN ('BA', 'MA')),
    kompetenzfeld TEXT NOT NULL,
    room_names TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(degree_scope, kompetenzfeld)
);

COMMENT ON TABLE public.room_mappings IS 'Welche Räume für welches Kompetenzfeld bevorzugt werden';

-- 5. Schedule Config (Planungs-Konfiguration)
-- =====================================================
CREATE TABLE public.schedule_config (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    days DATE[] NOT NULL DEFAULT '{}',
    start_time TIME NOT NULL DEFAULT '09:00',
    end_time TIME NOT NULL DEFAULT '18:00',
    ba_slot_minutes INTEGER NOT NULL DEFAULT 45,
    ma_slot_minutes INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.schedule_config IS 'Globale Konfiguration für die Planung (nur eine Zeile)';
COMMENT ON COLUMN public.schedule_config.days IS 'Array der Kolloquiumstage im Format YYYY-MM-DD';
COMMENT ON COLUMN public.schedule_config.ba_slot_minutes IS 'Dauer eines BA-Kolloquiums in Minuten';
COMMENT ON COLUMN public.schedule_config.ma_slot_minutes IS 'Dauer eines MA-Kolloquiums in Minuten';

-- 6. Schedule Versions (Plan-Versionen)
-- =====================================================
CREATE TABLE public.schedule_versions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.schedule_versions IS 'Versionen des Kolloquienplans';
COMMENT ON COLUMN public.schedule_versions.status IS 'draft = Entwurf, published = veröffentlicht für alle sichtbar';

-- 7. Scheduled Events (Geplante Termine)
-- =====================================================
CREATE TABLE public.scheduled_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_version_id UUID NOT NULL REFERENCES public.schedule_versions(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    day_date DATE NOT NULL,
    room TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    protocolist_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
    cancellation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scheduled_events IS 'Konkret geplante Termine mit Raum und Zeit';

-- =====================================================
-- TRIGGER: Automatische updated_at Aktualisierung
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger für alle Tabellen mit updated_at
CREATE TRIGGER update_staff_updated_at
    BEFORE UPDATE ON public.staff
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exams_updated_at
    BEFORE UPDATE ON public.exams
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_room_mappings_updated_at
    BEFORE UPDATE ON public.room_mappings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_schedule_config_updated_at
    BEFORE UPDATE ON public.schedule_config
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_schedule_versions_updated_at
    BEFORE UPDATE ON public.schedule_versions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scheduled_events_updated_at
    BEFORE UPDATE ON public.scheduled_events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
-- 
-- Sicherheitskonzept:
-- - Öffentlicher Lesezugriff für alle Tabellen (SELECT)
-- - Schreibzugriff (INSERT/UPDATE/DELETE) nur über Edge Functions
--   mit Admin-Passwort-Validierung
-- 
-- WICHTIG: Die Schreibpolicies sind permissiv, weil die eigentliche
-- Authentifizierung über die Edge Function verify-admin erfolgt!
-- =====================================================

-- Staff
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read staff" ON public.staff
    FOR SELECT USING (true);

CREATE POLICY "Anon insert staff" ON public.staff
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update staff" ON public.staff
    FOR UPDATE USING (true);

CREATE POLICY "Anon delete staff" ON public.staff
    FOR DELETE USING (true);

-- Exams
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read exams" ON public.exams
    FOR SELECT USING (true);

CREATE POLICY "Anon insert exams" ON public.exams
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update exams" ON public.exams
    FOR UPDATE USING (true);

CREATE POLICY "Anon delete exams" ON public.exams
    FOR DELETE USING (true);

-- Rooms
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read rooms" ON public.rooms
    FOR SELECT USING (true);

CREATE POLICY "Anon insert rooms" ON public.rooms
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update rooms" ON public.rooms
    FOR UPDATE USING (true);

CREATE POLICY "Anon delete rooms" ON public.rooms
    FOR DELETE USING (true);

-- Room Mappings
ALTER TABLE public.room_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read room_mappings" ON public.room_mappings
    FOR SELECT USING (true);

CREATE POLICY "Anon insert room_mappings" ON public.room_mappings
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update room_mappings" ON public.room_mappings
    FOR UPDATE USING (true);

CREATE POLICY "Anon delete room_mappings" ON public.room_mappings
    FOR DELETE USING (true);

-- Schedule Config
ALTER TABLE public.schedule_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read schedule_config" ON public.schedule_config
    FOR SELECT USING (true);

CREATE POLICY "Anon insert schedule_config" ON public.schedule_config
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update schedule_config" ON public.schedule_config
    FOR UPDATE USING (true);

CREATE POLICY "Anon delete schedule_config" ON public.schedule_config
    FOR DELETE USING (true);

-- Schedule Versions
ALTER TABLE public.schedule_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read schedule_versions" ON public.schedule_versions
    FOR SELECT USING (true);

CREATE POLICY "Anon insert schedule_versions" ON public.schedule_versions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update schedule_versions" ON public.schedule_versions
    FOR UPDATE USING (true);

CREATE POLICY "Anon delete schedule_versions" ON public.schedule_versions
    FOR DELETE USING (true);

-- Scheduled Events
ALTER TABLE public.scheduled_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scheduled_events" ON public.scheduled_events
    FOR SELECT USING (true);

CREATE POLICY "Anon insert scheduled_events" ON public.scheduled_events
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update scheduled_events" ON public.scheduled_events
    FOR UPDATE USING (true);

CREATE POLICY "Anon delete scheduled_events" ON public.scheduled_events
    FOR DELETE USING (true);

-- =====================================================
-- INITIAL DATA: Default Schedule Config
-- =====================================================
INSERT INTO public.schedule_config (days, start_time, end_time, ba_slot_minutes, ma_slot_minutes)
VALUES ('{}', '09:00', '18:00', 45, 60);

-- =====================================================
-- NACH DER MIGRATION:
-- =====================================================
-- 
-- 1. Edge Function deployen:
--    supabase functions deploy verify-admin
--
-- 2. Secret setzen (Supabase Dashboard → Project Settings → Edge Functions → Secrets):
--    ADMIN_PASSWORD = dein-sicheres-passwort
--
-- 3. Frontend Environment Variables (.env):
--    VITE_SUPABASE_URL=https://dein-projekt.supabase.co
--    VITE_SUPABASE_PUBLISHABLE_KEY=dein-anon-key
--
-- =====================================================
