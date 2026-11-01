import { MapPin, MapPinOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type GeofenceState = "inside" | "outside";

// Fix §6.3: the pill shows the live geofence result. Inside = translucent pill
// on the green hero ("At the centre"); outside = warning styling ("Outside the centre").
export function LocationPill({
  state,
  className,
}: {
  state: GeofenceState;
  className?: string;
}) {
  const t = useTranslations("Shift");
  const Icon = state === "inside" ? MapPin : MapPinOff;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-1.5 text-label",
        state === "inside"
          ? "bg-primary-on-hero text-white"
          : "bg-warning-tint text-warning",
        className,
      )}
    >
      <Icon aria-hidden size={20} strokeWidth={1.75} className="shrink-0" />
      {state === "inside" ? t("insideCentre") : t("outsideCentre")}
    </span>
  );
}
