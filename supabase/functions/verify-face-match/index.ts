import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

/**
 * Does the attendance selfie show the same person as their profile photo?
 *
 * Ported from the Bharath Builders app (APK99-dot/field-force-friendly,
 * read-only reference), with its prompt and threshold kept, and two things
 * changed for this clinic:
 *
 *  - It is gated on a signed-in caller, as knowledge-ai is. The reference's
 *    version answers anybody who can reach the URL, which would let someone
 *    feed it two arbitrary images all day on the clinic's AI budget.
 *  - It answers only about the CALLER's own staff photo. The client passes
 *    nothing but the selfie's path; the baseline is looked up server-side, so
 *    a caller cannot ask "does this selfie match THAT person" by swapping a
 *    URL - which is how a face check gets turned into a face search.
 *
 * The threshold is applied here, not taken from the model's own `matched`
 * field, so a chatty answer cannot talk its way to a pass.
 */

/** Used when the settings row cannot be read - the same value the migration
 *  seeds, so a database hiccup never silently loosens the check. */
const DEFAULT_THRESHOLD = 75;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/**
 * A service failure is NOT a mismatch.
 *
 * Every path where nothing could actually be compared answers "bypassed" with
 * HTTP 200. The client treats that differently from "failed": a mismatch
 * refuses the check-in, a service fault eventually records the attendance and
 * flags it. Returning an error status here, or confidence 0 with
 * matched=false, would collapse the two and lock people out of their own
 * working day whenever the gateway hiccupped.
 */
const bypassed = (reason: string) => json({ confidence: 0, matched: false, status: "bypassed", reason });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const token = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return bypassed("Supabase configuration unavailable");
    if (!token.startsWith("Bearer ")) return json({ error: "Please sign in" }, 401);

    const caller = createClient(url, anon, { global: { headers: { Authorization: token } } });
    const { data: auth, error: authError } = await caller.auth.getUser(token.slice(7));
    if (authError || !auth.user) return json({ error: "Please sign in" }, 401);

    const body = await req.json().catch(() => null);
    const selfiePath = typeof body?.selfie_path === "string" ? body.selfie_path : "";
    if (!selfiePath) return json({ error: "selfie_path is required" }, 400);

    // The caller's own staff row, and their own photo. Not a parameter.
    const { data: staff, error: staffError } = await caller
      .from("staff")
      .select("id, photo_url")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();
    if (staffError || !staff) return json({ error: "No staff record for this login" }, 403);
    if (!staff.photo_url) return json({ error: "Set your profile photo first" }, 400);

    // The selfie must be inside the caller's own folder - the same rule the
    // storage policy enforces, checked here too so a mismatch is a clear
    // answer rather than an opaque download failure.
    if (!selfiePath.startsWith(`${staff.id}/`)) return json({ error: "That photo is not yours" }, 403);

    // The threshold lives in attendance_config and is applied HERE, not in the
    // browser, so it cannot be relaxed by anyone holding a devtools console.
    // Clamped, because a stored 0 would pass every face and a stored 200
    // would pass none.
    let threshold = DEFAULT_THRESHOLD;
    {
      const { data: cfg } = await caller
        .from("attendance_config")
        .select("face_match_threshold")
        .maybeSingle();
      const configured = Number(cfg?.face_match_threshold);
      if (Number.isFinite(configured) && configured >= 1 && configured <= 100) threshold = configured;
    }

    const { data: signed, error: signError } = await caller.storage
      .from("attendance-photos")
      .createSignedUrl(selfiePath, 120);
    if (signError || !signed?.signedUrl) return bypassed("Could not read the attendance photo");

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return bypassed("AI is not configured");

    const [baselineRes, selfieRes] = await Promise.all([
      fetch(staff.photo_url),
      fetch(signed.signedUrl),
    ]);
    if (!baselineRes.ok || !selfieRes.ok) return bypassed("Could not fetch both images");

    const [baselineBuf, selfieBuf] = await Promise.all([baselineRes.arrayBuffer(), selfieRes.arrayBuffer()]);

    // Chunked, because String.fromCharCode(...bytes) on a whole photo blows
    // the call stack.
    const toBase64 = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return btoa(binary);
    };

    // Everybody starts and ends their day within the same few minutes, so the
    // gateway is busiest exactly when this runs. One or two quick retries
    // clear most 429s and brief 5xxs instead of surfacing them.
    const callGateway = async (payload: string): Promise<Response> => {
      let res: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: payload,
        });
        if (res.ok || (res.status !== 429 && res.status < 500)) return res;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
      return res!;
    };

    const response = await callGateway(JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "system",
          content: `You are an EXTREMELY STRICT face verification check used for employee attendance. Your ONLY job is to decide whether two photos show THE EXACT SAME INDIVIDUAL.

CRITICAL RULES:
- DEFAULT to NOT MATCHED. Return ${threshold} or above only if you are certain beyond reasonable doubt that both faces are the same person.
- Compare: distance between eyes, eye shape, nose width and bridge, lip shape, jawline, ear shape, forehead height, cheekbone structure, chin shape.
- Two DIFFERENT people of the same gender, age range, ethnicity, or with similar hairstyles, glasses or skin tone MUST score below 40. Surface similarity is NOT a match.
- If either image is blurry, dark, partly covered, shows no clear face, shows several faces, or shows the back or side of a head, return confidence 0 and matched false.
- If you have ANY doubt they might be different people, return below ${threshold}.
- A FALSE POSITIVE lets one employee mark another present. That is far worse than a false negative, which only asks someone to retake a photo.

Respond ONLY with strict JSON: {"confidence": <integer 0-100>, "matched": <true|false>, "reason": "<short explanation>"}
No markdown, no code fences, no extra text.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Image 1 is the registered profile photo. Image 2 is the attendance selfie just taken. Are they the SAME person? Be strict." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${toBase64(baselineBuf)}` } },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${toBase64(selfieBuf)}` } },
          ],
        },
      ],
    }));

    if (!response.ok) {
      console.error("verify-face-match gateway error", response.status, await response.text());
      return bypassed("AI gateway error");
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    let confidence = 0;
    const found = content.match(/\{[\s\S]*\}/);
    if (!found) {
      console.error("verify-face-match: no JSON in reply", content);
      return bypassed("Unreadable AI reply");
    }
    try {
      confidence = parseInt(JSON.parse(found[0]).confidence, 10) || 0;
    } catch {
      console.error("verify-face-match: unparseable JSON", content);
      return bypassed("Unreadable AI reply");
    }

    // Our threshold, not the model's opinion of its own answer.
    const matched = confidence >= threshold;
    return json({ confidence, matched, status: matched ? "verified" : "failed" });
  } catch (err) {
    console.error("verify-face-match error:", err);
    return bypassed(String(err));
  }
});
