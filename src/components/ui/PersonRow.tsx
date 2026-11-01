import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarColour } from "@/lib/avatar-colour";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

// §4 Person row: 48 px avatar (initials on the avatar colour set) + name + meta line.
export function PersonRow({
  id,
  name,
  meta,
  photoUrl,
  action,
  className,
}: {
  /** Stable id (employee id) so a person always gets the same avatar colour. */
  id: string;
  name: string;
  meta?: ReactNode;
  photoUrl?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <PersonAvatar id={id} name={name} photoUrl={photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="text-h3 font-medium text-ink">{name}</p>
        {meta ? <p className="text-meta text-ink-muted">{meta}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PersonAvatar({
  id,
  name,
  photoUrl,
  className,
}: {
  id: string;
  name: string;
  photoUrl?: string;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
      <AvatarFallback className={avatarColour(id)}>
        <span aria-hidden>{initials(name)}</span>
        <span className="sr-only">{name}</span>
      </AvatarFallback>
    </Avatar>
  );
}
