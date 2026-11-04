import {
  emailAvatarInitials,
  emailAvatarTone,
  safeCrmAvatarUrl,
} from "@/lib/email/avatar";

export default function EmailParticipantAvatar({
  avatarUrl,
  email,
  name,
  size = "md",
}: {
  avatarUrl?: string | null;
  email?: string | null;
  name: string;
  size?: "md" | "lg";
}) {
  const safeAvatarUrl = safeCrmAvatarUrl(avatarUrl);
  const identity = email || name;
  const sizeClassName =
    size === "lg" ? "h-11 w-11 text-sm" : "h-10 w-10 text-sm";

  return (
    <span
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-cover bg-center font-semibold ${sizeClassName} ${
        safeAvatarUrl ? "bg-gray-100 dark:bg-gray-800" : emailAvatarTone(identity)
      }`}
      role="img"
      style={
        safeAvatarUrl
          ? { backgroundImage: `url(${safeAvatarUrl})` }
          : undefined
      }
    >
      {safeAvatarUrl ? null : emailAvatarInitials(name)}
    </span>
  );
}
