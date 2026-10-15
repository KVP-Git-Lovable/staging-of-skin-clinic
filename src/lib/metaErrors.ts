/**
 * Read the most useful error message from a `supabase.functions.invoke("meta-api")` result.
 *
 * meta-api answers domain failures with HTTP 200 + `{ error }`, and real HTTP errors with a
 * FunctionsHttpError whose JSON body also carries `{ error }` (for example Meta's
 * "accept the Custom Audience terms" guidance). `error.message` alone hides that body.
 */
type InvokeError = { message?: string; context?: { json?: () => Promise<unknown> } } | null | undefined;
type InvokeData = { error?: unknown } | null | undefined;

export async function readMetaApiError(error: InvokeError, data: InvokeData): Promise<string> {
  if (data?.error) return String(data.error);
  try {
    const body = (await error?.context?.json?.()) as { error?: unknown } | undefined;
    if (body?.error) return String(body.error);
  } catch {
    /* ignore */
  }
  return error?.message || "Something went wrong";
}
