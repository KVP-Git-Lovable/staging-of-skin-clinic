import type { SurveyIllustrationKey } from "@/lib/surveyIllustration";

/**
 * The drawings that sit under each survey question.
 *
 * Hand-drawn here rather than uploaded, so all 58 of the clinic's existing
 * questions get a relevant picture with nobody having to find 58 images.
 * src/lib/surveyIllustration.ts decides which one a question gets.
 *
 * How they are built, and why:
 *
 *  - Colour is `currentColor` throughout, set by Tailwind classes bound to the
 *    app's semantic tokens (`text-primary`, `text-muted-foreground`). There is
 *    not one hex value in this file, which is what makes the set work in dark
 *    mode without a second drawing - `--primary` is 38% lightness in light and
 *    50% in dark, and the shapes simply follow it.
 *  - Fills are `currentColor` at 0.18-0.3 opacity. Below about 0.15 the wash
 *    disappears against the dark card, so the structure is always carried by
 *    the strokes and the fills are decoration.
 *  - Every drawing shares one viewBox and one rendered height, so the answer
 *    control underneath sits at the same place on every step and nothing
 *    jumps as the patient moves through the survey.
 *  - They are decorative: `aria-hidden`, no title. The question text above is
 *    what carries the meaning, and a screen reader announcing a picture
 *    before the question would only get in the way.
 */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="h-24 w-auto sm:h-28"
    >
      {children}
    </svg>
  );
}

export default function SurveyIllustration({
  name,
  className,
}: {
  name: SurveyIllustrationKey;
  className?: string;
}) {
  return (
    <div className={`flex justify-center text-primary ${className ?? ""}`}>
      {draw(name)}
    </div>
  );
}

function draw(name: SurveyIllustrationKey) {
  switch (name) {
    case "severity":
      // A gauge with a needle, and three rising bars.
      return (
        <Frame>
          <path d="M24 66a36 36 0 0 1 72 0" />
          <path d="M60 66 82 44" />
          <circle cx="60" cy="66" r="4" fill="currentColor" />
          <g className="text-muted-foreground">
            <path d="M30 82v-6M46 82v-12M62 82v-18" opacity={0.6} />
          </g>
        </Frame>
      );

    case "calendar":
      return (
        <Frame>
          <rect x="26" y="24" width="68" height="60" rx="8" />
          <path d="M26 42h68M44 16v16M76 16v16" />
          <rect x="40" y="52" width="16" height="14" rx="3" fill="currentColor" opacity={0.25} />
          <g className="text-muted-foreground">
            <path d="M66 58h14M66 72h14M40 72h14" opacity={0.6} />
          </g>
        </Frame>
      );

    case "bodyMap":
      return (
        <Frame>
          <circle cx="60" cy="22" r="10" />
          <path d="M44 44a16 16 0 0 1 32 0v20H44z" fill="currentColor" opacity={0.18} />
          <path d="M44 44a16 16 0 0 1 32 0v20H44zM50 64v20M70 64v20M44 48 32 62M76 48l12 14" />
          <g className="text-muted-foreground">
            <circle cx="54" cy="52" r="3" opacity={0.7} />
            <circle cx="68" cy="58" r="3" opacity={0.7} />
          </g>
        </Frame>
      );

        case "skinConcerns":
case "appearance":
      return (
        <Frame>
          <ellipse cx="60" cy="40" rx="24" ry="28" fill="currentColor" opacity={0.18} />
          <ellipse cx="60" cy="40" rx="24" ry="28" />
          <path d="M60 68v16M50 86h20" />
          <g className="text-muted-foreground">
            <path d="M50 32a14 14 0 0 1 10-8" opacity={0.7} />
          </g>
        </Frame>
      );

        case "speed":
case "frequency":
      return (
        <Frame>
          <path d="M32 48a28 28 0 0 1 48-20" />
          <path d="M80 16v14H66" />
          <path d="M88 48a28 28 0 0 1-48 20" />
          <path d="M40 82V68h14" />
          <circle cx="60" cy="48" r="7" fill="currentColor" opacity={0.25} />
        </Frame>
      );

        case "treatmentOptions":
    case "products":
    case "medication":
    case "pastTreatment":
case "treatmentsTried":
      return (
        <Frame>
          <path d="M52 16h16v12H52z" />
          <path d="M46 36a8 8 0 0 1 8-8h12a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H54a8 8 0 0 1-8-8z" />
          <path d="M46 56h28v20a8 8 0 0 1-8 8H54a8 8 0 0 1-8-8z" fill="currentColor" opacity={0.25} />
          <g className="text-muted-foreground">
            <path d="M84 44h12M90 38v12" opacity={0.6} />
          </g>
        </Frame>
      );

    case "trigger":
      return (
        <Frame>
          <path d="M64 16 44 52h14l-6 28 24-38H60z" fill="currentColor" opacity={0.25} />
          <path d="M64 16 44 52h14l-6 28 24-38H60z" />
          <g className="text-muted-foreground">
            <path d="M26 30h8M22 48h8M26 66h8M90 30h-8M94 48h-8M90 66h-8" opacity={0.55} />
          </g>
        </Frame>
      );

        case "outcome":
case "goals":
      return (
        <Frame>
          <circle cx="54" cy="52" r="30" />
          <circle cx="54" cy="52" r="18" />
          <circle cx="54" cy="52" r="7" fill="currentColor" opacity={0.3} />
          <path d="M54 52 94 16M82 16h12v12" />
        </Frame>
      );

    case "family":
      return (
        <Frame>
          <circle cx="34" cy="34" r="9" />
          <path d="M20 76a14 14 0 0 1 28 0" />
          <circle cx="86" cy="34" r="9" />
          <path d="M72 76a14 14 0 0 1 28 0" />
          <circle cx="60" cy="48" r="8" fill="currentColor" opacity={0.25} />
          <circle cx="60" cy="48" r="8" />
          <path d="M48 80a12 12 0 0 1 24 0" />
        </Frame>
      );

        case "downtime":
case "sleep":
      return (
        <Frame>
          <path d="M72 20a28 28 0 1 0 24 34A30 30 0 0 1 72 20z" fill="currentColor" opacity={0.22} />
          <path d="M72 20a28 28 0 1 0 24 34A30 30 0 0 1 72 20z" />
          <g className="text-muted-foreground">
            <path d="M26 82h68" opacity={0.5} />
            <path d="M84 24h12l-12 12h12" opacity={0.7} />
          </g>
        </Frame>
      );

        case "motivation":
case "sun":
      return (
        <Frame>
          <circle cx="60" cy="42" r="16" fill="currentColor" opacity={0.25} />
          <circle cx="60" cy="42" r="16" />
          <path d="M60 14v8M60 62v8M32 42h8M80 42h8M40 22l6 6M80 22l-6 6M40 62l6-6M80 62l-6-6" />
          <g className="text-muted-foreground">
            <path d="M24 84h72" opacity={0.5} />
          </g>
        </Frame>
      );

        case "health":
case "stress":
      return (
        <Frame>
          <circle cx="60" cy="52" r="24" fill="currentColor" opacity={0.15} />
          <circle cx="60" cy="52" r="24" />
          <g className="text-muted-foreground">
            <path d="M48 56c4-10 9 6 13-3s7 7 11-1" opacity={0.9} />
            <path d="M48 46c5-7 9 4 13-2s8 5 11-1" opacity={0.7} />
          </g>
          <path d="M60 16v-8M38 24l-5-6M82 24l5-6" />
        </Frame>
      );

        case "hobbies":
    case "activity":
case "smoking":
      return (
        <Frame>
          <rect x="26" y="58" width="52" height="14" rx="4" fill="currentColor" opacity={0.22} />
          <rect x="26" y="58" width="52" height="14" rx="4" />
          <path d="M64 58v14M84 58h10v14H84z" />
          <g className="text-muted-foreground">
            <path d="M58 44c0-8 10-8 10-16M74 44c0-8 10-8 10-16" opacity={0.7} />
          </g>
          <path d="M24 78 96 50" />
        </Frame>
      );

        case "workplace":
case "work":
      return (
        <Frame>
          <rect x="22" y="34" width="76" height="48" rx="8" />
          <path d="M48 34V26a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v8" />
          <path d="M22 56h76" />
          <rect x="52" y="50" width="16" height="12" rx="3" fill="currentColor" opacity={0.3} />
        </Frame>
      );

    case "pregnancy":
      return (
        <Frame>
          <circle cx="44" cy="24" r="11" />
          <path d="M42 38c10 2 18 10 18 22s-8 20-18 24z" fill="currentColor" opacity={0.22} />
          <path d="M42 38c10 2 18 10 18 22s-8 20-18 24" />
          <path d="M42 36v48" />
          <path d="M58 56a5 5 0 0 0-9-3 5 5 0 0 0 9 7 5 5 0 0 0 0-4z" fill="currentColor" opacity={0.5} />
          <g className="text-muted-foreground">
            <path d="M28 88h54" opacity={0.5} />
          </g>
        </Frame>
      );

        case "hairPattern":
    case "scalpCare":
    case "hairWash":
case "hairBrush":
      return (
        <Frame>
          <circle cx="52" cy="48" r="22" />
          <path d="M30 48a22 22 0 0 1 44 0z" fill="currentColor" opacity={0.25} />
          <path d="M30 48a22 22 0 0 1 44 0" />
          <path d="M38 40c4-6 9-8 14-8s10 2 14 8" />
          <g className="text-muted-foreground">
            <path d="M80 42c7 5 11 13 10 22" opacity={0.75} />
            <path d="M88 32c8 8 12 18 10 30" opacity={0.6} />
            <path d="M72 66c5 5 7 12 6 18" opacity={0.75} />
          </g>
        </Frame>
      );

        case "worry":
    case "dailyLife":
case "chat":
      return (
        <Frame>
          <path d="M24 28a8 8 0 0 1 8-8h56a8 8 0 0 1 8 8v32a8 8 0 0 1-8 8H52L34 82V68h-2a8 8 0 0 1-8-8z" fill="currentColor" opacity={0.18} />
          <path d="M24 28a8 8 0 0 1 8-8h56a8 8 0 0 1 8 8v32a8 8 0 0 1-8 8H52L34 82V68h-2a8 8 0 0 1-8-8z" />
          <g className="text-muted-foreground">
            <path d="M38 36h44M38 50h30" opacity={0.7} />
          </g>
        </Frame>
      );

    case "checklist":
      return (
        <Frame>
          <rect x="24" y="20" width="18" height="18" rx="5" fill="currentColor" opacity={0.3} />
          <rect x="24" y="20" width="18" height="18" rx="5" />
          <path d="m28 29 4 4 7-8" />
          <rect x="24" y="48" width="18" height="18" rx="5" fill="currentColor" opacity={0.3} />
          <rect x="24" y="48" width="18" height="18" rx="5" />
          <path d="m28 57 4 4 7-8" />
          <rect x="24" y="76" width="18" height="16" rx="5" />
          <g className="text-muted-foreground">
            <path d="M54 29h42M54 57h42M54 84h28" opacity={0.65} />
          </g>
        </Frame>
      );

    case "choice":
    default:
      return (
        <Frame>
          <circle cx="32" cy="26" r="9" />
          <circle cx="32" cy="26" r="4" fill="currentColor" />
          <circle cx="32" cy="54" r="9" />
          <circle cx="32" cy="82" r="9" />
          <g className="text-muted-foreground">
            <path d="M50 26h44M50 54h38M50 82h30" opacity={0.65} />
          </g>
        </Frame>
      );
  }
}
