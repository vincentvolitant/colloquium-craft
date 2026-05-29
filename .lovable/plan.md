Du willst Supabase wirklich selbst auf eurem Server per Docker betreiben — also den **Self-Hosted-Stack** (`supabase/docker`, nicht das CLI-`supabase start`, das ist nur für lokale Entwicklung). Damit die Migration und die Edge Functions dort sauber laufen, sind ein paar Anpassungen am Projekt nötig, weil die aktuelle Self-Hosting-Doku noch auf dem Stand vor dem Security-Refactor von gestern ist.

## Was ich am Projekt vorbereite

### 1. `docs/supabase-migration.sql` auf den aktuellen Stand bringen
Aktuell richtet die Datei die alten, unsicheren „Anon insert/update/delete"-Policies wieder ein. Ich schreibe sie auf den jetzigen Sicherheitsstand um:
- Tabellen + `updated_at`-Trigger unverändert
- Pro Tabelle nur noch eine `Public read …`-Policy
- `REVOKE INSERT, UPDATE, DELETE` auf allen 7 Tabellen für `anon` und `authenticated`
- `GRANT ALL … TO service_role` auf allen 7 Tabellen
- Auf `exams`: `REVOKE SELECT FROM anon, authenticated` + Spalten-Level `GRANT SELECT (…ohne student_email…)`
- Default-Zeile in `schedule_config` bleibt

### 2. Neue Anleitung `docs/SELF-HOSTING-DOCKER.md`
Eine deutsche Schritt-für-Schritt-Anleitung, zugeschnitten auf den offiziellen Docker-Stack:

1. **Stack holen & starten**
   - `git clone --depth 1 https://github.com/supabase/supabase`
   - `cd supabase/docker && cp .env.example .env`
   - In `.env`: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_USERNAME`/`PASSWORD`, `SITE_URL`, `API_EXTERNAL_URL` setzen
   - `docker compose pull && docker compose up -d`

2. **Datenbank initialisieren**
   - Studio öffnen (`http://<server>:8000`) → SQL Editor → `docs/supabase-migration.sql` einfügen + Run

3. **Edge Functions deployen**
   Der Docker-Stack erwartet die Funktionen unter `./volumes/functions/<name>/index.ts`. Zwei Wege, ich empfehle (a):

   **(a) Verzeichnis-Mount** (empfohlen)
   - `mkdir -p volumes/functions/verify-admin volumes/functions/admin-db`
   - Inhalt aus `supabase/functions/verify-admin/index.ts` und `supabase/functions/admin-db/index.ts` dort hineinkopieren
   - In `volumes/functions/main/index.ts` einen Eintrag pro Funktion ergänzen (ist in der Beispiel-Datei dokumentiert)
   - `docker compose restart functions`

   **(b) CLI gegen die lokale Instanz**: `supabase functions deploy` mit `--project-ref` auf die lokale URL — funktioniert, ist aber fummeliger.

   Wichtig: Beide Funktionen brauchen **kein JWT** (`verify_jwt = false`). Beim Docker-Stack erreicht man das, indem in `volumes/functions/main/index.ts` der Pfad **ohne** Auth-Check eingetragen wird, oder über Kong (`volumes/api/kong.yml`) die Routen ohne `key-auth`-Plugin freigegeben werden. Ich dokumentiere den genauen Patch.

4. **Secret setzen**
   In der `.env` des Stacks: `ADMIN_PASSWORD=<euer-passwort>` ergänzen. `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` bekommen die Edge Functions automatisch vom Runtime — nicht doppelt setzen.

5. **Frontend `.env`** im Lovable-Projekt:
   ```
   VITE_SUPABASE_URL=https://<euer-server>
   VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY aus dem Stack>
   VITE_SUPABASE_PROJECT_ID=local
   ```

6. **CORS / Reverse Proxy**
   Hinweis auf TLS-Terminierung (Caddy/Traefik/Nginx vor Kong) und dass `API_EXTERNAL_URL` in der Stack-`.env` zur öffentlichen URL passen muss, sonst schlagen die Function-Invokes aus dem Browser fehl.

7. **Smoketest-Checkliste**
   - Admin-Login funktioniert
   - Ein XLS-Import läuft durch
   - Veröffentlichter Plan ist ohne Login sichtbar
   - `curl <url>/rest/v1/exams?select=student_email` mit Anon-Key liefert `permission denied for column student_email` → Schutz greift

### 3. Memory aktualisieren
`mem://deployment/self-hosting` so umschreiben, dass beide Funktionen (`verify-admin` + `admin-db`), die `REVOKE`/Spalten-`GRANT`-Schritte und der Docker-Pfad erwähnt sind.

## Was ich von dir noch brauche

- **Bestätigung**: Du nutzt den offiziellen `supabase/docker`-Stack (nicht z.B. eine eigene Compose-Datei oder Coolify/Dokploy)?
- **Domain & TLS**: Läuft schon ein Reverse Proxy mit HTTPS davor, oder soll ich Caddy-Beispiel mit reinpacken?

Sobald das geklärt ist, schreibe ich die Migration + die Anleitung und passe die Memory an.