const avatarTones = [
  "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
  "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
] as const;

export function emailAvatarInitials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function emailAvatarTone(identity: string) {
  const hash = [...identity.toLowerCase()].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );

  return avatarTones[hash % avatarTones.length];
}

export function safeCrmAvatarUrl(value: string | null | undefined) {
  return value && /^\/api\/media\/[a-zA-Z0-9_-]+$/.test(value) ? value : null;
}
