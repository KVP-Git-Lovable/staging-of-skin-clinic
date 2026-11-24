/**
 * The clinic's own contact details, in one place.
 *
 * These were scattered and had drifted apart. The patient portal's landing
 * page dialled 9380682287 - a number that appeared nowhere else in the app -
 * while the clinic website page, the WhatsApp bot and the portal bot all gave
 * patients 96201 23030 and 63607 53030. The address disagreed too: "Kadri,
 * Mangalore" on the portal, the full street address on the website, and two
 * different PIN codes elsewhere (575003 and 575002).
 *
 * A patient reading one number on a page and hearing another from the bot is
 * the kind of thing nobody reports as a bug; it just quietly wastes a phone
 * call. So: one module, imported wherever the clinic's details are shown.
 *
 * src/pages/clinic/Landing.tsx still carries its own copies. It is a working
 * page and was deliberately left alone; it can adopt this module next time it
 * is touched.
 */

/** The number to ring first - the one the bots already give out. */
export const CLINIC_PHONES = [
  { label: "+91 96201 23030", tel: "tel:+919620123030" },
  { label: "+91 63607 53030", tel: "tel:+916360753030" },
] as const;

/** Everything that dials or messages uses the first number. */
export const CLINIC_TEL = CLINIC_PHONES[0].tel;
export const CLINIC_WHATSAPP = "https://wa.me/919620123030";

export const CLINIC_EMAILS = [
  "theskinclinic30@gmail.com",
  "vindhyapai@hotmail.com",
] as const;

/** Two lines, as they are written on the clinic's own website. */
export const CLINIC_ADDRESS_LINES = [
  "Vyasa Rao Road, Kadri Kambla Road",
  "Mangaluru, Karnataka 575003",
] as const;

/**
 * The clinic's Google listing, not a search URL built from the address - a
 * search can land on the wrong pin, and this one is already used by the
 * contact section of the clinic website page.
 */
export const CLINIC_DIRECTIONS_URL = "https://maps.google.com/?cid=5768419635675091400";

export const CLINIC_HOURS = { days: "Mon to Sat", time: "10:00 am – 8:00 pm" } as const;

export const CLINIC_SOCIALS = {
  instagram: "https://www.instagram.com/theskinclinic_mangalore/",
  facebook: "https://www.facebook.com/theskinclinicmangalore/",
  youtube: "https://www.youtube.com/channel/UCi9XPgx3UhtimTMLFmeC69A",
} as const;

export const CLINIC_TAGLINE = "Simply. Better. Skin.";

export const CLINIC_BLURB =
  "A family dermatology practice in Mangaluru offering medical dermatology, laser and aesthetic medicine — led by Dr. Vindhya A. Pai since 2018.";

/**
 * Where the footer's Explore column points.
 *
 * Every one of these is a real section of the /clinic page in this app -
 * checked against the `id=` attributes there. The clinic's public website has
 * a Skin AI, Blog and Careers page as well, but none of those exist here, and
 * `/portal/:tab` is a catch-all route: a link to a page that does not exist
 * would silently open the patient dashboard instead of saying anything.
 *
 * Plain hrefs rather than router links on purpose - the browser scrolls to a
 * hash on a real navigation, which client-side routing does not do here.
 */
export const CLINIC_EXPLORE_LINKS = [
  { label: "Treatments", href: "/clinic#treatments" },
  { label: "About & Team", href: "/clinic#about" },
  { label: "Our Doctors", href: "/clinic#doctors" },
  { label: "Results", href: "/clinic#results" },
  { label: "FAQs", href: "/clinic#faqs" },
  { label: "Contact", href: "/clinic#contact" },
] as const;
