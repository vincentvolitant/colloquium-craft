// Admin database write proxy.
// All writes from the admin UI flow through here. The function validates the
// admin password and then performs the requested write using the service role
// (which bypasses RLS). Anonymous browsers cannot write to the database directly.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Only these tables can be written through this endpoint.
const ALLOWED_TABLES = new Set([
  "exams",
  "staff",
  "rooms",
  "room_mappings",
  "schedule_config",
  "schedule_versions",
  "scheduled_events",
]);

type Op =
  | { kind: "upsert"; table: string; rows: Record<string, unknown>[] }
  | {
      kind: "update";
      table: string;
      values: Record<string, unknown>;
      match?: Record<string, unknown>;
      eqStatus?: string; // shortcut: where status = X
    }
  | {
      kind: "delete";
      table: string;
      match?: Record<string, unknown>;
      neqId?: string; // delete all (id != neqId)
      inIds?: string[]; // delete where id in (...)
      notInIds?: string[]; // delete where id NOT in (...) — diff delete
    };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ success: false, error: "Ungültige Anfrage" }, 400);
    }

    const { password, ops } = body as { password?: unknown; ops?: unknown };

    if (typeof password !== "string" || password.length === 0) {
      return json({ success: false, error: "Passwort erforderlich" }, 400);
    }

    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) {
      console.error("ADMIN_PASSWORD secret is not configured");
      return json({ success: false, error: "Serverkonfigurationsfehler" }, 500);
    }
    if (password !== adminPassword) {
      return json({ success: false, error: "Falsches Passwort" }, 401);
    }

    if (!Array.isArray(ops) || ops.length === 0) {
      return json({ success: false, error: "Keine Operationen" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const results: unknown[] = [];

    for (const raw of ops as Op[]) {
      if (!raw || typeof raw !== "object" || !("kind" in raw) || !("table" in raw)) {
        return json({ success: false, error: "Ungültige Operation" }, 400);
      }
      if (!ALLOWED_TABLES.has(raw.table)) {
        return json(
          { success: false, error: `Tabelle nicht erlaubt: ${raw.table}` },
          400,
        );
      }

      if (raw.kind === "upsert") {
        if (!Array.isArray(raw.rows)) {
          return json({ success: false, error: "rows muss ein Array sein" }, 400);
        }
        if (raw.rows.length === 0) {
          results.push({ ok: true, skipped: true });
          continue;
        }
        const { error, data } = await supabase
          .from(raw.table)
          // deno-lint-ignore no-explicit-any
          .upsert(raw.rows as any)
          .select();
        if (error) {
          console.error(`upsert ${raw.table} failed:`, error);
          return json({ success: false, error: error.message }, 500);
        }
        results.push({ ok: true, data });
      } else if (raw.kind === "update") {
        let q = supabase.from(raw.table).update(raw.values);
        if (raw.match) {
          for (const [k, v] of Object.entries(raw.match)) {
            q = q.eq(k, v as never);
          }
        }
        if (raw.eqStatus) {
          q = q.eq("status", raw.eqStatus as never);
        }
        const { error } = await q;
        if (error) {
          console.error(`update ${raw.table} failed:`, error);
          return json({ success: false, error: error.message }, 500);
        }
        results.push({ ok: true });
      } else if (raw.kind === "delete") {
        let q = supabase.from(raw.table).delete();
        if (raw.match) {
          for (const [k, v] of Object.entries(raw.match)) {
            q = q.eq(k, v as never);
          }
        }
        if (raw.neqId) {
          q = q.neq("id", raw.neqId);
        }
        if (raw.inIds && raw.inIds.length > 0) {
          q = q.in("id", raw.inIds);
        }
        if (raw.notInIds) {
          // Diff-delete: remove rows whose id is NOT in the provided list.
          // Empty list is treated as "delete all rows matching the other filters".
          if (raw.notInIds.length > 0) {
            const list = "(" +
              raw.notInIds
                .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                .join(",") +
              ")";
            q = q.not("id", "in", list);
          }
        }
        const { error } = await q;
        if (error) {
          console.error(`delete ${raw.table} failed:`, error);
          return json({ success: false, error: error.message }, 500);
        }
        results.push({ ok: true });
      } else {
        return json({ success: false, error: "Unbekannte Operation" }, 400);
      }
    }

    return json({ success: true, results });
  } catch (err) {
    console.error("admin-db error:", err);
    return json({ success: false, error: "Serverfehler" }, 500);
  }
});
