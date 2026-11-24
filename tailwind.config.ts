import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  /* Without this, `hover:` compiles with no `@media (hover: hover)` guard and
     the state LATCHES on touch: tap "Start My Day" and button.tsx's
     hover:-translate-y-px keeps it visibly lifted until you tap elsewhere -
     for the whole 20-second check-in. */
  future: { hoverOnlyWhenSupported: true },
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ['Plus Jakarta Sans', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
        },
        emerald: {
          DEFAULT: "hsl(var(--emerald))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out forwards",
      },

      /* The clinic's knowledge articles are markdown and `prose` is what
         draws them. The plugin was in package.json but was never registered
         below, so every `prose` class in the app emitted NO CSS at all:
         headings fell back to preflight's font-size:inherit, lists to
         list-style:none, paragraphs to margin:0, and a 16,700-character
         clinical article rendered as one grey slab.

         Every variable is bound to a semantic token rather than the
         plugin's hardcoded grays - AGENTS.md asks for tokens, and it is
         also what makes dark mode work with no second definition, because
         src/index.css redefines these same tokens under `.dark`. That is
         why `dark:prose-invert` must NOT be used alongside this: it would
         replace these token colours with the plugin's own inverted grays. */
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "hsl(var(--foreground))",
            "--tw-prose-headings": "hsl(var(--foreground))",
            "--tw-prose-lead": "hsl(var(--muted-foreground))",
            /* NOT --primary. Measured against the light background it is
               3.18:1, under the 4.5:1 AA needs for 14px text, in a reference
               staff read mid-appointment. --accent-foreground is the same
               teal as ink, flips with the theme (25% light / 70% dark), and
               measures 6.36:1. */
            "--tw-prose-links": "hsl(var(--accent-foreground))",
            "--tw-prose-bold": "hsl(var(--foreground))",
            /* Full ink, not muted: the number on a protocol step carries
               its order, which is part of the instruction. Bullets are only
               decoration, so muted (3.92:1, over the 3:1 AA asks of
               non-text) is right for those. */
            "--tw-prose-counters": "hsl(var(--foreground))",
            "--tw-prose-bullets": "hsl(var(--muted-foreground))",
            "--tw-prose-hr": "hsl(var(--border))",
            "--tw-prose-quotes": "hsl(var(--foreground))",
            "--tw-prose-quote-borders": "hsl(var(--border))",
            "--tw-prose-captions": "hsl(var(--muted-foreground))",
            "--tw-prose-code": "hsl(var(--foreground))",
            "--tw-prose-pre-code": "hsl(var(--foreground))",
            "--tw-prose-pre-bg": "hsl(var(--muted))",
            "--tw-prose-th-borders": "hsl(var(--border))",
            "--tw-prose-td-borders": "hsl(var(--border))",

            /* styles.js:1538 gives inline code a literal backtick in
               ::before and ::after, so `0.05% tretinoin` in a body would
               render WITH the backticks showing. Silenced. */
            "code::before": { content: '""' },
            "code::after": { content: '""' },
            /* Both call sites already pass max-w-none, so the plugin's 65ch
               never bites - but it would the moment someone dropped that
               utility, clamping the in-appointment panel and the two-column
               AI diff. Not left load-bearing. */
            maxWidth: "none",
          },
        },

        /* The heading ladder, and why it is ranked by weight not by size.

           ArticleContent.tsx prints a section label ("Clinical protocol")
           above each field, then renders that field's markdown - and the
           articles use `##` for their own sub-headings ("Scope and
           evidence"). At prose-sm the plugin's h2 default is 1.4285714em of
           0.875rem = 20px, LARGER than the label it sits under. Registering
           the plugin with stock sizes would invert the hierarchy and read
           worse than leaving it unstyled.

           Sizing the label up instead does not work either, because the
           label is not always the biggest thing around it. In the
           in-appointment panel each article is a <details> whose <summary>
           carries the article's own TITLE at text-sm = 14px
           (ClinicalGuidelines.tsx:47); a 16px section label would outrank
           the title of the article containing it.

           So every heading inside a body is capped at 1em (14px) and ranked
           by weight, which is how the rest of the app already ranks, and the
           label clears all of them at 15px/700:

             label 15px/700 > h1 800 > h2 700 > h3 600 > h4 500 > body 400

           Margins are restated because the plugin's are em-based off the
           heading's OWN size: dropping h2 from 20px to 14px would silently
           shrink its top margin from 32px to 22px, losing in space exactly
           the separation the heading just gave up in size. Held at 32px. */
        sm: {
          css: {
            h1: { fontSize: "1em", lineHeight: "1.4285714", marginTop: "0", marginBottom: "0.7142857em" },
            h2: { fontSize: "1em", lineHeight: "1.4285714", marginTop: "2.2857143em", marginBottom: "0.5714286em" },
            h3: { fontSize: "1em", lineHeight: "1.4285714", marginTop: "1.7142857em", marginBottom: "0.4285714em" },
            h4: { fontSize: "1em", lineHeight: "1.4285714", marginTop: "1.4285714em", marginBottom: "0.2857143em", fontWeight: "500" },
          },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate"), typography],
} satisfies Config;
