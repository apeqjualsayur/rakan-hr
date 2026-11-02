// Storage object names for uploaded files (private buckets, data-model.md §6).

/** "{timestamp}-{safe name}.{ext}": ASCII-only, no path characters, max 60 chars of name. */
export function storageFileName(
  fileName: string,
  fallback: string,
  now = Date.now(),
) {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${now}-${base || fallback}${/^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : ""}`;
}

/** The original-looking file name, for display ("1730000000000-epf.pdf" → "epf.pdf"). */
export function displayFileName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/^\d+-/, "");
}
