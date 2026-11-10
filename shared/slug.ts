/** Same slug function as the LF schedule page (view.js `ot`), so URLs translate both ways. */
export function slug(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
