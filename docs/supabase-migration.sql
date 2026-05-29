-- =====================================================
-- Kolloquienplaner - Supabase Migration für Self-Hosting
-- =====================================================
--
-- Stand: aktueller Sicherheits-Refactor (PII-Schutz + Edge-Function-Writes).
--
-- Ausführung:
--   Supabase Studio  →  SQL Editor  →  Neue Query  →  Einfügen  →  Run
--
-- Sicherheitskonzept (wichtig!):
--   • Öffentlicher LESEZUGRIFF auf alle Tabellen, damit der veröffentlichte
--     Kolloquienplan ohne Login funktioniert.
--   • Auf `exams` wird der Spaltenzugriff für anon/authenticated explizit
--     beschnitten — `student_email` ist niemals über die Data API lesbar.
--   • KEIN direkter Schreibzugriff für anon/authenticated.
--     Alle Schreibzugriffe laufen über die Edge Function `admin-db`,
--     die das Admin-Passwort prüft und mit dem `service_role`-Key schreibt.
-- =====================================================


-- =====================================================
-- 1. Tabellen
-- =====================================================

-- 1.1 Staff (Mitarbeiter/Prüfer/Protokollanten)
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

-- 1.2 Exams (Prüfungen/Kolloquien)
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
COMMENT ON COLUMN public.exams.student_email IS 'PII — niemals an anon/authenticated freigeben (siehe Spalten-GRANTs unten)';

-- 1.3 Rooms (Räume)
CREATE TABLE public.rooms (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.rooms IS 'Verfügbare Prüfungsräume';

-- 1.4 Room Mappings
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

-- 1.5 Schedule Config (genau eine Zeile)
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

-- 1.6 Schedule Versions
CREATE TABLE public.schedule_versions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.schedule_versions IS 'Versionen des Kolloquienplans';

-- 1.7 Scheduled Events
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
-- 2. updated_at Trigger
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_staff_updated_at              BEFORE UPDATE ON public.staff              FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_exams_updated_at              BEFORE UPDATE ON public.exams              FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_room_mappings_updated_at      BEFORE UPDATE ON public.room_mappings      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedule_config_updated_at    BEFORE UPDATE ON public.schedule_config    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedule_versions_updated_at  BEFORE UPDATE ON public.schedule_versions  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scheduled_events_updated_at   BEFORE UPDATE ON public.scheduled_events   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =====================================================
-- 3. Row Level Security — nur Lesen für anon/authenticated
-- =====================================================
ALTER TABLE public.staff              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_mappings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read staff"              ON public.staff              FOR SELECT USING (true);
CREATE POLICY "Public read exams"              ON public.exams              FOR SELECT USING (true);
CREATE POLICY "Public read rooms"              ON public.rooms              FOR SELECT USING (true);
CREATE POLICY "Public read room_mappings"      ON public.room_mappings      FOR SELECT USING (true);
CREATE POLICY "Public read schedule_config"    ON public.schedule_config    FOR SELECT USING (true);
CREATE POLICY "Public read schedule_versions"  ON public.schedule_versions  FOR SELECT USING (true);
CREATE POLICY "Public read scheduled_events"   ON public.scheduled_events   FOR SELECT USING (true);

-- Bewusst KEINE INSERT/UPDATE/DELETE-Policies für anon/authenticated.
-- Alle Schreibzugriffe laufen über die Edge Function `admin-db` (service_role).


-- =====================================================
-- 4. Data-API GRANTs
-- =====================================================
-- 4.1 Standard-Grants (Lesen für anon/authenticated, alles für service_role)
GRANT SELECT ON public.staff             TO anon, authenticated;
GRANT SELECT ON public.rooms             TO anon, authenticated;
GRANT SELECT ON public.room_mappings     TO anon, authenticated;
GRANT SELECT ON public.schedule_config   TO anon, authenticated;
GRANT SELECT ON public.schedule_versions TO anon, authenticated;
GRANT SELECT ON public.scheduled_events  TO anon, authenticated;

GRANT ALL ON public.staff             TO service_role;
GRANT ALL ON public.exams             TO service_role;
GRANT ALL ON public.rooms             TO service_role;
GRANT ALL ON public.room_mappings     TO service_role;
GRANT ALL ON public.schedule_config   TO service_role;
GRANT ALL ON public.schedule_versions TO service_role;
GRANT ALL ON public.scheduled_events  TO service_role;

-- 4.2 PII-Schutz auf exams: anon/authenticated dürfen NICHT die volle Tabelle lesen,
--     sondern nur die freigegebenen Spalten (kein student_email!).
REVOKE SELECT ON public.exams FROM anon, authenticated;
GRANT SELECT (
  id, degree, kompetenzfeld,
  student_first_name, student_last_name,
  topic, examiner1_id, examiner2_id,
  is_team, team_partner_first_name, team_partner_last_name,
  is_public, created_at, updated_at
) ON public.exams TO anon, authenticated;

-- 4.3 Schreibrechte explizit entziehen (Defense in Depth, falls Defaults sich ändern)
REVOKE INSERT, UPDATE, DELETE ON public.staff             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.exams             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rooms             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.room_mappings     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.schedule_config   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.schedule_versions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scheduled_events  FROM anon, authenticated;


-- =====================================================
-- 5. Initial-Daten
-- =====================================================
INSERT INTO public.schedule_config (days, start_time, end_time, ba_slot_minutes, ma_slot_minutes)
VALUES ('{}', '09:00', '18:00', 45, 60);


-- =====================================================
-- NACH DER MIGRATION:
--   • Edge Functions `verify-admin` und `admin-db` deployen
--     (siehe docs/SELF-HOSTING-DOCKER.md)
--   • Secret `ADMIN_PASSWORD` setzen
--   • Frontend-`.env` mit VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY befüllen
-- =====================================================
