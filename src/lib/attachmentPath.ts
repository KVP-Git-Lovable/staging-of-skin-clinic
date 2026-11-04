/**
 * Where one attachment goes in storage.
 *
 * The single-file version named the object `${patientId}/${Date.now()}.${ext}`,
 * which is unique only because nothing else was uploading. Uploading a batch
 * breaks that: several files finish inside the same millisecond, and Supabase
 * storage rejects a key that already exists - so a staff member selecting seven
 * scans would have got one row and six errors.
 *
 * The index separates files within a batch and the random suffix separates two
 * batches that start in the same millisecond (two people on two machines, or
 * one person clicking twice). Neither is a guess about the file; the real name
 * is kept in `procedure_attachments.file_name` and is what the screen shows.
 */

/** The extension of a filename, lowercased, or "bin" when it has none. */
export function fileExtension(fileName: string): string {
  const base = fileName.slice(fileName.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  // A leading dot is a hidden file ("...profile"), not an extension.
  if (dot <= 0 || dot === base.length - 1) return "bin";
  return base.slice(dot + 1).toLowerCase();
}

export function attachmentStoragePath(
  patientId: string,
  fileName: string,
  index: number,
  now: number = Date.now(),
  random: string = Math.random().toString(36).slice(2, 8),
): string {
  return `${patientId}/${now}_${index}_${random}.${fileExtension(fileName)}`;
}
