import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { safetyAlertCreateSchema } from "@/lib/validation/schemas";
import { parseBody } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/errors";

/**
 * POST /api/safety-alerts — citizen reports a local incident with explicit
 * location consent (FR-070). Queues for analyst review, separate from the
 * scam/misinformation queue (FR-071).
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    const body = parseBody(safetyAlertCreateSchema, await req.json());
    const admin = getSupabaseAdmin();

    // FR-074: rate-limit incident submissions per user to reduce false/malicious reports.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("safety_alerts")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", profile.id)
      .gte("created_at", oneHourAgo);

    if ((count ?? 0) >= 5) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many safety reports submitted recently. Please try again later.",
          },
        },
        { status: 429 }
      );
    }

    const { data, error } = await admin
      .from("safety_alerts")
      .insert({
        reporter_id: profile.id,
        category: body.category,
        description: body.description,
        media_url: body.media_url,
        location: `SRID=4326;POINT(${body.lng} ${body.lat})`,
        location_precision: body.location_precision,
        radius_meters: body.radius_meters,
        status: "pending",
      })
      .select("id, status, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** GET /api/safety-alerts — analyst moderation queue (FR-071). */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["analyst", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    const status = req.nextUrl.searchParams.get("status") ?? "pending";

    const { data, error } = await admin
      .from("safety_alerts")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ safety_alerts: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
