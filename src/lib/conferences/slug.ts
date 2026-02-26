export function slugify(input: string): string {
  const normalized = (input ?? "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "conference";
}

export function buildDefaultConferenceSlug(input: { name: string; startDate: Date }): string {
  const base = slugify(input.name);
  const year = input.startDate.getUTCFullYear();
  return `${base}-${year}`;
}

