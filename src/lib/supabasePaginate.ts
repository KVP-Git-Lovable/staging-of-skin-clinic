// Paginated fetcher to bypass Supabase's 1000-row default cap.
// Pass a builder that returns a Supabase query for the given range.
//
// Example:
//   const all = await fetchAll<Patient>((from, to) =>
//     supabase.from("patients").select("*").order("first_name").range(from, to)
//   );
export async function fetchAll<T = any>(
  builder: (from: number, to: number) => any,
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Hard cap to avoid runaway loops
  for (let i = 0; i < 1000; i++) {
    const { data, error } = await builder(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}