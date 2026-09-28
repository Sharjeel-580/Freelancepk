export function normalizeClientName(name: string) {
  return name.trim().normalize("NFKC").toLowerCase();
}