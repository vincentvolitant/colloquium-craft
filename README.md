# Kolloquiumsplaner - Self-Hosting Guide

Ein Tool zur automatischen Planung von Kolloquien/Prüfungsterminen mit Raum- und Personalzuordnung.

## 🚀 Quick Start (Lovable Cloud)

Wenn du Lovable Cloud nutzt, ist alles bereits konfiguriert. Einfach loslegen!

---

## 🏠 Self-Hosting Anleitung

Diese Anleitung erklärt Schritt für Schritt, wie du den Kolloquiumsplaner auf deiner eigenen Infrastruktur betreiben kannst.

### Voraussetzungen

- [Node.js](https://nodejs.org/) v18 oder höher
- [Supabase Account](https://supabase.com/) (Free Tier reicht aus)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, für Edge Functions)
- Ein Webhosting-Dienst (z.B. Vercel, Netlify, oder eigener Server)

---

## Schritt 1: Supabase Projekt erstellen

1. Gehe zu [supabase.com](https://supabase.com/) und melde dich an
2. Klicke auf **"New Project"**
3. Wähle eine Organisation und gib folgendes ein:
   - **Name**: `kolloquiumsplaner` (oder beliebig)
   - **Database Password**: Ein sicheres Passwort (notieren!)
   - **Region**: Wähle eine Region nahe deinem Standort
4. Klicke auf **"Create new project"** und warte ca. 2 Minuten

---

## Schritt 2: Datenbank einrichten

### Option A: Über SQL Editor im Dashboard

1. Öffne dein Supabase Projekt
2. Gehe zu **SQL Editor** (linke Seitenleiste)
3. Klicke auf **"New query"**
4. Kopiere den gesamten Inhalt der Datei `docs/supabase-migration.sql` und füge ihn ein
5. Klicke auf **"Run"**

### Option B: Über Supabase CLI

```bash
# CLI installieren (falls noch nicht vorhanden)
npm install -g supabase

# Mit Projekt verbinden
supabase link --project-ref DEINE_PROJECT_ID

# Migration ausführen
supabase db push
```

### Datenbank-Tabellen (zur Referenz)

Die Migration erstellt folgende Tabellen:

| Tabelle | Beschreibung |
|---------|--------------|
| `staff` | Prüfer und Protokollanten |
| `exams` | Registrierte Prüfungen |
| `rooms` | Verfügbare Räume |
| `room_mappings` | Raum-Zuordnungen pro Kompetenzfeld |
| `schedule_config` | Globale Planungseinstellungen |
| `schedule_versions` | Versionen des Plans (Entwurf/Veröffentlicht) |
| `scheduled_events` | Konkrete Termine |

---

## Schritt 3: Edge Function "verify-admin" einrichten

Diese Funktion ist für die sichere Admin-Authentifizierung zuständig.

### Option A: Über Supabase Dashboard (einfacher)

1. Öffne dein Supabase Projekt
2. Gehe zu **Edge Functions** (linke Seitenleiste)
3. Klicke auf **"Create a new function"**
4. Name: `verify-admin`
5. Ersetze den gesamten Inhalt mit folgendem Code:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { password } = await req.json();

    if (!password || typeof password !== 'string') {
      console.log('Invalid request: missing or invalid password field');
      return new Response(
        JSON.stringify({ success: false, error: 'Passwort erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminPassword = Deno.env.get('ADMIN_PASSWORD');

    if (!adminPassword) {
      console.error('ADMIN_PASSWORD secret is not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Serverkonfigurationsfehler' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (password === adminPassword) {
      console.log('Admin authentication successful');
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log('Admin authentication failed: incorrect password');
      return new Response(
        JSON.stringify({ success: false, error: 'Falsches Passwort' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in verify-admin function:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

6. Klicke auf **"Deploy"**

### Option B: Über Supabase CLI

```bash
# Function erstellen
supabase functions new verify-admin

# Code einfügen (Datei: supabase/functions/verify-admin/index.ts)
# Inhalt: siehe Code oben

# Deployen
supabase functions deploy verify-admin
```

---

## Schritt 4: Admin-Passwort als Secret setzen

### Option A: Über Dashboard

1. Gehe zu **Project Settings** (Zahnrad-Symbol unten links)
2. Klicke auf **Edge Functions** in der linken Seitenleiste
3. Scrolle zu **Edge Function Secrets**
4. Klicke auf **"Add new secret"**
5. Gib ein:
   - **Name**: `ADMIN_PASSWORD`
   - **Value**: Dein gewünschtes Admin-Passwort (sicher aufbewahren!)
6. Klicke auf **"Save"**

### Option B: Über CLI

```bash
supabase secrets set ADMIN_PASSWORD=dein_sicheres_passwort
```

---

## Schritt 5: Frontend konfigurieren

### Umgebungsvariablen setzen

Erstelle eine `.env` Datei im Projektroot:

```env
VITE_SUPABASE_URL=https://DEINE_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=dein_anon_key_hier
VITE_SUPABASE_PROJECT_ID=DEINE_PROJECT_ID
```

**So findest du die Werte:**

1. Öffne dein Supabase Projekt
2. Gehe zu **Project Settings** → **API**
3. Kopiere:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** Key → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Reference ID** (aus der URL) → `VITE_SUPABASE_PROJECT_ID`

### Lokale Entwicklung

```bash
# Repository klonen
git clone <DEIN_GIT_URL>
cd kolloquiumsplaner

# Dependencies installieren
npm install

# Entwicklungsserver starten
npm run dev
```

Die App läuft nun unter `http://localhost:5173`

---

## Schritt 6: Für Produktion deployen

### Option A: Vercel (empfohlen)

1. Pushe deinen Code zu GitHub
2. Gehe zu [vercel.com](https://vercel.com/) und importiere das Repository
3. Füge die Umgebungsvariablen hinzu:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
4. Klicke auf **"Deploy"**

### Option B: Netlify

1. Pushe deinen Code zu GitHub
2. Gehe zu [netlify.com](https://netlify.com/) und importiere das Repository
3. Build-Befehl: `npm run build`
4. Publish directory: `dist`
5. Füge die Umgebungsvariablen unter **Site settings** → **Environment variables** hinzu

### Option C: Statischer Build

```bash
# Produktions-Build erstellen
npm run build

# Der Ordner 'dist' kann auf jeden statischen Webserver kopiert werden
```

---

## 🔧 Konfiguration

### Admin-Zugang

- Navigiere zu `/admin`
- Gib das in Schritt 4 gesetzte `ADMIN_PASSWORD` ein

### Ersteinrichtung

1. **Personal anlegen**: Prüfer und Protokollanten mit Kompetenzfeldern
2. **Räume definieren**: Verfügbare Räume anlegen
3. **Raum-Mapping**: Welche Räume für welche Kompetenzfelder (BA/MA)
4. **Zeitfenster**: Prüfungstage und -zeiten festlegen
5. **Prüfungen importieren**: Excel-Import oder manuell
6. **Plan generieren**: Automatische Planung starten

---

## 📋 Technologie-Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui
- **State Management**: Zustand
- **Backend**: Supabase (PostgreSQL, Edge Functions)
- **Datenimport**: xlsx (Excel-Parser)

---

## ⚠️ Wichtige Hinweise

### Supabase Free Tier

- Kostenlose Projekte werden nach **1 Woche Inaktivität pausiert**
- Du kannst sie jederzeit wieder aktivieren
- Für produktiven Einsatz empfehlen wir ein Pro-Projekt

### Sicherheit

- Das Admin-Passwort wird **niemals** im Frontend gespeichert
- Authentifizierung läuft ausschließlich über die Edge Function
- Row Level Security (RLS) schützt die Datenbank

### Datenschutz

- Studentendaten werden in der Datenbank gespeichert
- Stelle sicher, dass dein Hosting DSGVO-konform ist
- Supabase bietet EU-Regionen für datenschutzkonforme Speicherung

---

## 🐛 Troubleshooting

### "Serverkonfigurationsfehler" beim Admin-Login

→ Das `ADMIN_PASSWORD` Secret ist nicht gesetzt. Siehe Schritt 4.

### "Failed to fetch" Fehler

→ Prüfe, ob die Umgebungsvariablen korrekt gesetzt sind und die Edge Function deployed ist.

### Daten werden nicht geladen

→ Stelle sicher, dass die SQL-Migration vollständig ausgeführt wurde.

### Edge Function antwortet nicht

→ Überprüfe in den Supabase Logs unter **Edge Functions** → **Logs**.

---

## 📞 Support

Bei Fragen oder Problemen:
- Erstelle ein Issue im GitHub Repository
- Prüfe die Supabase Dokumentation: https://supabase.com/docs

---

## 📄 Lizenz

MIT License - siehe LICENSE Datei für Details.
