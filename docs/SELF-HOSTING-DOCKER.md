# Kolloquienplaner — Self-Hosting mit Docker

Anleitung zum Betrieb des Backends auf einem eigenen Server mit dem offiziellen
[Supabase Self-Hosting Stack](https://supabase.com/docs/guides/self-hosting/docker).
Stand: aktueller Sicherheits-Refactor (PII-Schutz auf `exams.student_email`,
alle Schreibzugriffe ausschließlich über die Edge Function `admin-db`).

> **Voraussetzungen**
> - Linux-Server mit Docker + Docker Compose
> - Eine Domain (z.B. `supabase.example.org`) mit TLS-fähigem Reverse Proxy
> - Optional: `openssl` für die Generierung von Secrets

---

## 1. Supabase-Stack klonen & konfigurieren

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

Pflichtfelder in `.env` setzen (Auszug):

| Variable                                 | Wert                                                 |
|------------------------------------------|------------------------------------------------------|
| `POSTGRES_PASSWORD`                      | starkes Passwort                                     |
| `JWT_SECRET`                             | mind. 32 Zeichen Zufall                              |
| `ANON_KEY`                               | aus JWT_SECRET signiert (siehe Supabase-Doku)        |
| `SERVICE_ROLE_KEY`                       | aus JWT_SECRET signiert (siehe Supabase-Doku)        |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Studio-Login                                       |
| `SITE_URL`                               | URL des Lovable-Frontends, z.B. `https://kolloquien.example.org` |
| `API_EXTERNAL_URL`                       | Öffentliche URL der Supabase-API, z.B. `https://supabase.example.org` |
| `ADMIN_PASSWORD`                         | **Neu:** Passwort für den Admin-Bereich (wird von beiden Edge Functions gelesen) |

Anschließend Stack starten:

```bash
docker compose pull
docker compose up -d
```

Studio ist anschließend unter `http://<server>:8000` (oder hinter dem Proxy auf
`https://supabase.example.org`) erreichbar.

---

## 2. Datenbank initialisieren

1. Studio → **SQL Editor** → **New Query**
2. Inhalt von [`docs/supabase-migration.sql`](./supabase-migration.sql) einfügen
3. **Run**

Die Migration legt alle 7 Tabellen, Trigger, RLS-Policies und die korrekten
Spalten-GRANTs an. **`student_email` ist danach für anon/authenticated nicht mehr lesbar.**

---

## 3. Edge Functions deployen

Es gibt zwei Funktionen:

| Funktion       | Zweck                                                  | JWT-Pflicht |
|----------------|--------------------------------------------------------|-------------|
| `verify-admin` | Prüft das Admin-Passwort beim Login                    | nein        |
| `admin-db`     | Führt alle Schreibzugriffe nach Passwort-Prüfung aus   | nein        |

Beide Funktionen erwarten das Secret `ADMIN_PASSWORD`. `SUPABASE_URL` und
`SUPABASE_SERVICE_ROLE_KEY` werden vom Runtime automatisch bereitgestellt — die
müssen **nicht** separat gesetzt werden.

### 3.1 Code in den Stack legen

Im selbst-gehosteten Stack werden Funktionen aus `supabase/docker/volumes/functions/`
geladen. Aus diesem Repo dorthin kopieren:

```bash
mkdir -p supabase/docker/volumes/functions/verify-admin
mkdir -p supabase/docker/volumes/functions/admin-db

cp <repo>/supabase/functions/verify-admin/index.ts \
   supabase/docker/volumes/functions/verify-admin/index.ts

cp <repo>/supabase/functions/admin-db/index.ts \
   supabase/docker/volumes/functions/admin-db/index.ts
```

### 3.2 JWT-Verifikation deaktivieren

Der `functions`-Container im Compose-File startet standardmäßig mit
`--verify-jwt`. Damit beide Funktionen ohne Supabase-JWT aufrufbar sind, in
`supabase/docker/docker-compose.yml` beim Dienst `functions` den Command
anpassen:

```yaml
  functions:
    # ...
    command:
      - start
      - --main-service
      - /home/deno/functions/main
      - --no-verify-jwt
```

Alternativ kann man pro Funktion über `volumes/functions/main/index.ts`
selektiv `verifyJWT: false` setzen — die globale Variante oben ist einfacher
und ausreichend, weil beide Funktionen ihre eigene Authentisierung (Admin-
Passwort) mitbringen.

### 3.3 Neu starten

```bash
cd supabase/docker
docker compose up -d functions
```

Logs anschauen:

```bash
docker compose logs -f functions
```

---

## 4. Reverse Proxy & TLS

Der `kong`-Container hört auf Port 8000 (HTTP) und 8443 (HTTPS, self-signed).
In Produktion davor einen Reverse Proxy mit echtem Zertifikat schalten
(Caddy / Traefik / Nginx). Wichtig:

- `API_EXTERNAL_URL` in der Stack-`.env` muss **exakt** die öffentliche URL
  sein, die das Frontend ansprechen wird — sonst schlägt z.B.
  `supabase.functions.invoke()` mit CORS-Fehlern fehl.
- Der Proxy muss Pfade unter `/auth/`, `/rest/`, `/realtime/`, `/storage/`,
  `/functions/v1/` und `/` (Studio) durchreichen.

Beispiel **Caddyfile**:

```caddy
supabase.example.org {
    reverse_proxy localhost:8000
}
```

---

## 5. Frontend (Lovable-Projekt) konfigurieren

Im Projekt eine `.env` anlegen (falls noch nicht vorhanden) mit:

```
VITE_SUPABASE_URL=https://supabase.example.org
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY aus dem Stack>
VITE_SUPABASE_PROJECT_ID=local
```

`VITE_SUPABASE_PROJECT_ID` ist nur ein Label und wird nirgendwo zum Routing
benutzt — `local` ist OK.

---

## 6. Smoketest

| Schritt | Erwartetes Ergebnis |
|---------|---------------------|
| Frontend laden | Veröffentlichter Plan ist ohne Login sichtbar |
| `/admin` öffnen | Passwort-Dialog erscheint |
| Mit `ADMIN_PASSWORD` einloggen | Admin-Oberfläche lädt |
| Beliebiger XLS-Import / Speichern | Läuft durch, Daten erscheinen in Studio |
| PII-Test (siehe unten) | `permission denied for column student_email` |

PII-Test (zeigt, dass der E-Mail-Schutz greift):

```bash
curl -sS "https://supabase.example.org/rest/v1/exams?select=student_email" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
# erwartete Antwort: {"code":"42501","message":"permission denied for column student_email"}
```

Zum Vergleich darf dieser Aufruf erfolgreich Daten liefern:

```bash
curl -sS "https://supabase.example.org/rest/v1/exams?select=id,student_first_name,topic" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
```

---

## 7. Updates einspielen

Wenn sich im Repo Migrationen oder Edge Functions ändern:

1. **Migrationen**: neue SQL-Statements im Studio ausführen (oder per `psql`).
   Die Datei `docs/supabase-migration.sql` ist ein vollständiger Re-Setup —
   für Updates nur die neuen Teile übernehmen.
2. **Edge Functions**: Dateien unter `volumes/functions/<name>/index.ts`
   überschreiben und `docker compose restart functions`.

---

## 8. Häufige Stolperfallen

- **CORS-Fehler bei `functions.invoke()`** → `API_EXTERNAL_URL` und Proxy-Domain
  stimmen nicht überein, oder der Proxy schluckt die `Access-Control-*`-Header.
- **`Invalid JWT` von der Function** → `--no-verify-jwt` fehlt (siehe 3.2).
- **`permission denied for table exams`** beim öffentlichen Plan → Spalten-GRANT
  aus Abschnitt 4.2 der Migration wurde nicht ausgeführt; die Abfrage im
  Frontend versucht `select('*')`. Das Repo verwendet eine explizite
  Spaltenliste (`PUBLIC_EXAM_COLUMNS` in `src/lib/supabaseSync.ts`).
- **Admin-Login klappt, Speichern nicht** → `ADMIN_PASSWORD` ist im
  Stack-`.env` nicht gesetzt oder die `functions`-Container wurden nach dem
  Setzen nicht neu gestartet.
