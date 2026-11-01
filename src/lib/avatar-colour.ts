// Avatar colour set (ui-system.md §2.1), cycled by a stable id so a person
// always keeps the same colour.
const avatarColours = [
  "bg-avatar-amber",
  "bg-avatar-mint",
  "bg-avatar-rose",
] as const;

export function avatarColour(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return avatarColours[hash % avatarColours.length];
}
