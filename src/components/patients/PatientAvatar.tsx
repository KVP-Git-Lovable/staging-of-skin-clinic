import { useState } from "react";
import { ImageOff } from "lucide-react";

interface PatientAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  className?: string;
  /** Show a small badge when no usable photo is linked to the patient. */
  showFallbackIndicator?: boolean;
}

/**
 * Patient display picture — uses the best photo linked to the patient,
 * falling back to initials (with an optional "no photo" badge) when none exists.
 */
export function PatientAvatar({
  firstName,
  lastName,
  photoUrl,
  className = "h-10 w-10",
  showFallbackIndicator = true,
}: PatientAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = `${firstName?.[0] || "?"}${lastName?.[0] || ""}`.toUpperCase();
  const name = `${firstName || ""} ${lastName || ""}`.trim() || "Patient";
  const hasPhoto = !!photoUrl && !failed;

  return (
    <div className="relative shrink-0">
      <div
        className={`${className} rounded-full overflow-hidden bg-primary/10 flex items-center justify-center text-primary font-display font-semibold text-sm ring-1 ring-border`}
      >
        {hasPhoto ? (
          <img
            src={photoUrl as string}
            alt={`${name} photo`}
            loading="lazy"
            className="h-full w-full object-cover object-top"
            onError={() => setFailed(true)}
          />
        ) : (
          initials
        )}
      </div>
      {!hasPhoto && showFallbackIndicator && (
        <span
          title="No photo on file"
          aria-label="No photo on file"
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-muted text-muted-foreground ring-1 ring-border p-[2px]"
        >
          <ImageOff className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );
}
