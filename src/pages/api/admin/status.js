import { jsonResponse } from "../../../lib/apiResponse.js";
import { requireAdmin } from "../../../lib/adminAuth.js";
import { checkRateLimit } from "../../../lib/serverRateLimit.js";
import { getSupabaseAdmin } from "../../../lib/supabaseServer.js";

/** @type {import("astro").APIRoute} */
export const GET = async ({ request }) => {
  try {
    const rate = checkRateLimit({
      request,
      routeKey: "admin-status",
      windowMs: 60_000,
      max: 120,
    });
    if (!rate.allowed) {
      return jsonResponse({ is_admin: false }, 429);
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return jsonResponse({ is_admin: false }, 503);

    const admin = await requireAdmin(supabaseAdmin, request);
    return jsonResponse({ is_admin: Boolean(admin.ok) }, 200);
  } catch {
    return jsonResponse({ is_admin: false }, 200);
  }
};
