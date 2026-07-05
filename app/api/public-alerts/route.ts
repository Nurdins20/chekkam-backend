import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { publicAlertCreateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";

/**
 * GET /api/public-alerts — public, human-approved alerts only (SRS FR-090, 6.7).
 * ?scope=drafts (analyst/admin only) lists all alerts, including unpublished
 * drafts, for the dashboard's promote/edit/publish workflow (Phase 2 §7.3).
 */
export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();

    if (req.nextUrl.searchParams.get("scope") === "drafts") {
      const profile = await requireUser(req);
      requireRole(profile, ["analyst", "admin", "super_admin"]);

      const { data, error } = await admin
        .from("public_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return NextResponse.json({ alerts: data });
    }

    const { data, error } = await admin
      .from("public_alerts")
      .select("id, title, body, alert_type, severity, published_at")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ alerts: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** POST /api/public-alerts — analyst drafts an alert, unpublished until reviewed (SRS 6.7). */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["analyst", "admin", "super_admin"]);

    const body = parseBody(publicAlertCreateSchema, await req.json());
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("public_alerts")
      .insert({ ...body, created_by: profile.id, published: false })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
