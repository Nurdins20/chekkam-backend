import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toErrorResponse } from "@/lib/errors";
import { verifyByIdOrPin, VerifierChannel } from "@/lib/documents/verify";

/**
 * GET /api/documents/verify/:verificationId — look up by verification ID or PIN.
 * SRS 6.4, 10.2 steps 1-3 (no file provided, so no hash comparison here).
 * ?channel=mobile|web|api|whatsapp|telegram|extension tags the verification log entry.
 *
 * Thin wrapper over lib/documents/verify.ts — the shared logic also used by
 * the WhatsApp/Telegram bots, so there is exactly one verification path.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ verificationId: string }> }
) {
  try {
    const { verificationId } = await params;
    const channel = (req.nextUrl.searchParams.get("channel") as VerifierChannel) || "web";
    const admin = getSupabaseAdmin();
    const result = await verifyByIdOrPin(admin, verificationId, channel);
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
