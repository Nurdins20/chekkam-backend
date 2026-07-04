import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireUser, requireRole } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

/** GET /api/campaigns — analyst campaign queue (SRS 6.2, FR-032). */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireUser(req);
    requireRole(profile, ["analyst", "admin", "super_admin"]);

    const admin = getSupabaseAdmin();
    const status = req.nextUrl.searchParams.get("status");

    let query = admin
      .from("campaigns")
      .select("id, title, category, risk_level, report_count, status, created_at, updated_at")
      .order("report_count", { ascending: false });
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ campaigns: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
