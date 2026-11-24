import { useState } from "react";
import SurveyIllustration from "@/components/portal/SurveyIllustration";
import type { SurveyIllustrationKey } from "@/lib/surveyIllustration";

/**
 * The picture above a survey question.
 *
 * The clinic looked at the line drawings this replaced and asked for
 * something real: "some real world kind of pics which is realistic, with
 * gamification, but make sure the patients wont get offended by those pics."
 *
 * That last clause is the design constraint, and it is why none of these
 * photographs shows a skin or hair condition, a face, or a body. A patient
 * answering "how much does your hair loss bother you?" does not need a
 * picture of thinning hair; they know. The set is objects, rooms and light -
 * a hairbrush on marble, a made bed, sun through a window - so the pictures
 * can be warm without ever being a comment on the person looking at them.
 *
 * ── Why the files are discovered rather than imported ──
 *
 * A static `import calendar from ".../calendar.webp"` fails the build if the
 * file is not there. These are generated, so some may be missing, late, or
 * replaced one at a time. `import.meta.glob` picks up whatever exists and
 * yields nothing for what does not, and anything without a picture falls
 * back to the line drawing, which is kept for exactly this reason. A missing
 * or broken file costs a photograph, never a blank step.
 *
 * ── Why .webp specifically ──
 *
 * vite.config.ts pre-caches `**\/*.{js,css,html,ico,png,svg,woff2}`. WebP is
 * not in that list, so these load only when a patient actually reaches the
 * question instead of being downloaded by every patient before the portal
 * opens. Renaming them to .png would quietly add about 1.5MB to that
 * download; src/lib/surveyImages.test.ts fails if the extension drifts.
 */
const FILES = import.meta.glob("/src/assets/survey/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const BY_KEY: Partial<Record<SurveyIllustrationKey, string>> = {};
for (const [path, url] of Object.entries(FILES)) {
  const key = path.split("/").pop()?.replace(/\.webp$/, "");
  if (key) BY_KEY[key as SurveyIllustrationKey] = url;
}

export default function SurveyQuestionImage({
  name,
  className,
}: {
  name: SurveyIllustrationKey;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = BY_KEY[name];

  // One fixed height whichever branch renders, so the answer control sits at
  // the same place on every step and nothing jumps as the patient moves
  // through the survey.
  const box = `h-32 sm:h-36 w-full overflow-hidden rounded-xl ${className ?? ""}`;

  if (!src || failed) {
    return (
      <div className={`${box} flex items-center justify-center bg-muted/40`}>
        <SurveyIllustration name={name} />
      </div>
    );
  }

  return (
    <div className={box}>
      <img
        src={src}
        // Decorative: the question text above it carries the meaning, and a
        // screen reader announcing a photograph before the question would
        // only get in the way.
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
