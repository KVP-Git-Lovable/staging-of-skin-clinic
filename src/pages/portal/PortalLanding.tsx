import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Phone,
  MessageCircle,
  Star,
  Sparkles,
  ChevronRight,
  Clock,
  Heart,
  MapPin,
  Mail,
  Instagram,
  Facebook,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { motion } from "framer-motion";
import clinicLogo from "@/assets/skin-clinic-logo.png";
import {
  CLINIC_ADDRESS_LINES,
  CLINIC_BLURB,
  CLINIC_DIRECTIONS_URL,
  CLINIC_EMAILS,
  CLINIC_EXPLORE_LINKS,
  CLINIC_HOURS,
  CLINIC_PHONES,
  CLINIC_SOCIALS,
  CLINIC_TAGLINE,
  CLINIC_TEL,
  CLINIC_WHATSAPP,
} from "@/lib/clinicContact";
import baAcneScars from "@/assets/portal-ba-acne-scars.jpg";
import baPigmentation from "@/assets/portal-ba-pigmentation.jpg";
import baAcneFace from "@/assets/portal-ba-acne-face.jpg";
/* Already in the repo, used by the clinic page - a real 300x300 JPEG. The
   other two doctors come from the clinic's CDN; she has no CDN image. */
import docAshwini from "@/assets/clinic/real/dr-ashwini.jpg";

/* ───────── tokens ───────── */
const heading = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const NAVY = "#1F2A44";
const NAVY_DARK = "#1A1F36";
const GREEN = "#1F8A3C";
/* Every number, link and address on this page comes from one module. This
   page used to dial 9380682287, which appeared nowhere else in the app, while
   the clinic website and both bots gave patients 96201 23030. */
const WA_URL = CLINIC_WHATSAPP;
const TEL_URL = CLINIC_TEL;

/* ───────── CDN (real clinic images from theskinclinic.org.in) ───────── */
const CDN_NOV = "https://theskinclinicorgin.swipepages.media/2023/11/64c3bc8f029443001063c027";
const CDN_DEC = "https://theskinclinicorgin.swipepages.media/2023/12/64c3bc8f029443001063c027";

const HERO_IMG = `${CDN_DEC}/closeup-handsome-young-man-getting-facial-rejuvenation-therapy-health-spa-spxoq8.jpg`;
const DOCTOR_1 = `${CDN_NOV}/doctor1.webp`;
const DOCTOR_2 = `${CDN_NOV}/doctor2.webp`;

const services = [
  {
    title: "Skin Treatments",
    img: `${CDN_DEC}/facial.webp`,
    desc:
      "Give yourself a treat – pamper your skin. We offer personalised face skincare for Melasma, brightening, neck and chest rejuvenation, and more — bask in your sheen and glow.",
  },
  {
    title: "Laser Hair Reduction",
    img: `${CDN_DEC}/laser-uyv67m.webp`,
    desc:
      "Say goodbye to excessive hair. Using Deka and Lumenis diode laser, we offer long-term hair detachment so you can enjoy life anytime.",
  },
  {
    title: "Anti Ageing Treatment",
    img: `${CDN_DEC}/anti-aging-treatment-and-filler-injection.webp`,
    desc:
      "State-of-the-art anti-ageing solutions from our skin specialist in Mangalore — take care of your timeless beauty without makeup.",
  },
  {
    title: "Pre Wedding Skin Care",
    img: `${CDN_DEC}/beautiful-woman-getting-beauty-treatment--1--2500.webp`,
    desc:
      "A series of pre-wedding skin regimens designed to make you appear as beautiful and glowing as possible on your special day.",
  },
  {
    title: "Fat Loss",
    img: `${CDN_DEC}/fat.webp`,
    desc:
      "Personalised body fat-burning approaches like DEKA ONDA — bring out your inner glow and a body that represents the essence of your being.",
  },
  {
    title: "Filler Treatment",
    img: `${CDN_DEC}/pimples.webp`,
    desc:
      "Lip, cheek and under-eye dermal fillers that restore youthful contours, hydrate lips, lift tired eyes and smooth wrinkles for a refreshed glowing look.",
  },
];

const reasons = [
  {
    icon: `${CDN_DEC}/dermatologist.webp`,
    title: "Experienced Dermatologist",
    desc:
      "Trust your skin in the experienced hands of our dermatologist in Mangalore for targeted treatment that meets your specific requirements.",
  },
  {
    icon: `${CDN_NOV}/deadline.webp`,
    title: "No-Rush Appointments",
    desc:
      "Enjoy unhurried consultations, ensuring your questions are answered and needs met with personalised attention and care.",
  },
  {
    icon: `${CDN_NOV}/commitment.webp`,
    title: "Comfortable & Confidential",
    desc:
      "Feel at ease as we take you through your skincare journey in a relaxed environment that guarantees your privacy and comfort.",
  },
  {
    icon: `${CDN_NOV}/interactivity.webp`,
    title: "State-of-the-Art Facility",
    desc:
      "Discover the peak of facial rejuvenation therapies in our ultra-modern facility that uses up-to-date technology for top-notch procedures.",
  },
];

const beforeAfter = [
  { src: baAcneScars, alt: "Before and after acne scar treatment" },
  { src: baPigmentation, alt: "Before and after pigmentation treatment" },
  { src: baAcneFace, alt: "Before and after acne treatment" },
];

const testimonials = [
  {
    name: "Sharvari Shetty",
    quote:
      "Highly recommended for all your skin problems! I visited this place for my facial hair reduction and I'm amazed to see the changes with my skin. Dr. Vindhya A. Pai is so passionate about everything she does, and the details she remembers of her own patients is remarkable. The place and the people are an absolute delight once you walk in.",
  },
  {
    name: "Varsha Rani",
    quote:
      "Perfect place for all your skin problems. The Skin Clinic in Kadri Kambla road is a real boon to patients suffering from skin ailments. Dr. Vindhya A. Pai, leading dermatologist, with her latest equipment and procedures knows the exact antidote for any skin problem.",
  },
  {
    name: "Sagar Jogi",
    quote:
      "It was good to be treated with professionalism and care. I am writing to thank your entire staff for the excellent care received during my visit to your clinic.",
  },
  {
    name: "Sahana A",
    quote:
      "I consulted this clinic for my acne scars. After a few sessions of treatment now I can see the difference in my skin and my scars have reduced. Thanks to Dr. Vindhya A. Pai and Skin Clinic.",
  },
];

const faqs = [
  {
    q: "Are Your Treatments Safe?",
    a: "Yes, your safety is our utmost priority. Our clinic is dedicated to providing treatments that are both effective and safe. We only utilize approved and reputable technologies, products, and techniques. Our team of experienced skincare professionals and licensed doctors follows stringent protocols to minimize any risks. During your consultation, we will thoroughly assess your skin and medical history to recommend treatments tailored to your unique needs.",
  },
  {
    q: "How do I Book an Appointment?",
    a: "Booking with us is easy. Online: open the Patient Portal, fill out the form and a specialist will contact you. Phone: call +91 96201 23030 during working hours and our friendly staff will help you choose a time. Walk-In: visit our Kadri, Mangalore clinic and our receptionists will be happy to schedule you in.",
  },
  {
    q: "Is There Any Down Time After Treatments?",
    a: "Most of our treatments are designed to have minimal downtime, allowing you to quickly return to regular activities. Some may cause slight redness or mild swelling that subsides within a few hours to a day. For deeper laser therapies, the recovery period can be slightly longer — we provide detailed post-treatment care instructions to ensure a comfortable, speedy recovery.",
  },
];

/* ───────── component ───────── */
const PortalLanding = () => {
  const navigate = useNavigate();
  const goLogin = () => navigate("/portal/login");

  return (
    <div
      className="min-h-screen flex flex-col bg-white"
      style={{ color: NAVY, fontFamily: "Inter, sans-serif" }}
    >
      {/* ── Sticky Navbar ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 md:px-8 h-16 md:h-20">
          <div className="flex items-center gap-2 md:gap-3">
            <img src={clinicLogo} alt="The Skin Clinic" className="h-10 md:h-14 w-auto object-contain" />
            <span
              className="hidden sm:inline text-base md:text-lg font-bold tracking-tight"
              style={{ ...heading, color: NAVY }}
            >
              The Skin Clinic
            </span>
          </div>
          <Button
            onClick={goLogin}
            className="font-semibold text-xs md:text-sm h-9 md:h-11 px-3 md:px-6 text-white hover:opacity-90"
            style={{ backgroundColor: NAVY_DARK }}
          >
            <span className="hidden sm:inline">Access My Portal</span>
            <span className="sm:hidden">Portal</span>
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-white via-gray-50 to-white">
        <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center px-6 py-12 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="order-2 lg:order-1"
          >
            <h1
              className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight"
              style={{ ...heading, color: NAVY }}
            >
              For the perfect
              <br />
              skin you desire
            </h1>
            <p className="mt-6 text-lg md:text-xl leading-relaxed text-gray-600 max-w-lg">
              Find the permanent solution to your skin issues with our expert care!
            </p>
            <div className="mt-6 flex items-center gap-1.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <p className="mt-2 text-sm italic text-gray-600">200+ 5 Star Google Rating</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href={TEL_URL}>
                <Button
                  size="lg"
                  className="text-white font-semibold h-12 md:h-14 px-6 md:px-8 text-sm md:text-base hover:opacity-90 shadow-lg"
                  style={{ backgroundColor: NAVY_DARK }}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call Now
                </Button>
              </a>
              <Button
                size="lg"
                onClick={goLogin}
                variant="outline"
                className="font-semibold h-12 md:h-14 px-6 md:px-8 text-sm md:text-base border-2"
                style={{ borderColor: NAVY_DARK, color: NAVY_DARK }}
              >
                Access My Portal <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7 }}
            className="order-1 lg:order-2 relative"
          >
            <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-[4/5] max-w-md mx-auto lg:max-w-none">
              <img src={HERO_IMG} alt="Facial rejuvenation therapy" className="w-full h-full object-cover" />
            </div>
          </motion.div>
        </div>

        {/* Stats band */}
        <div className="bg-gradient-to-r from-[hsl(150,40%,90%)] via-[hsl(155,45%,82%)] to-[hsl(150,40%,90%)] py-8 md:py-12">
          <div className="mx-auto max-w-7xl grid grid-cols-3 gap-4 px-6 text-center">
            {[
              { value: "10000+", label: "Laser Treatments" },
              { value: "15000+", label: "Satisfied Patients" },
              { value: "6+", label: "Years of Establishment" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl md:text-5xl font-bold" style={{ ...heading, color: NAVY }}>
                  {s.value}
                </div>
                <div className="mt-1 text-xs md:text-base font-medium" style={{ color: NAVY }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Doctors ── */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold" style={{ ...heading, color: NAVY }}>
              Our Doctors
            </h2>
            <div className="mt-4 mx-auto h-px w-20 bg-gray-300" />
          </div>
          {/* Three across from md up: with three doctors the old two-column
              grid stranded the last one alone on its own row. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
            {[
              {
                img: DOCTOR_1,
                name: "Dr. Vindhya A. Pai",
                creds: "MBBS, MD Dermatologist",
                role: "Founder of The Skin Clinic",
                exp: "14+ Years of Experience",
              },
              {
                img: DOCTOR_2,
                name: "Dr. Punya Suvarna",
                creds: "MBBS, MD, FAGE, MRCP (SCE)",
                role: "Dermatologist",
                exp: "5+ Years of Experience",
              },
              {
                img: docAshwini,
                name: "Dr. Ashwini Ashokan",
                creds: "MBBS, MD (DVL)",
                role: "Consultant Dermatologist",
                /* No years-of-experience line: nothing in the app or on the
                   clinic's own page says how long she has practised, and the
                   clinic chose to leave it out rather than have a number
                   invented. Add one here when they have it. */
              },
            ].map((d: { img: string; name: string; creds: string; role: string; exp?: string }) => (
              <div key={d.name} className="text-center">
                <div className="rounded-3xl overflow-hidden shadow-lg aspect-square max-w-sm mx-auto bg-gray-100">
                  <img src={d.img} alt={d.name} loading="lazy" className="w-full h-full object-cover" />
                </div>
                <h3 className="mt-6 text-xl md:text-2xl font-bold" style={{ ...heading, color: NAVY }}>
                  {d.name}
                </h3>
                <p className="mt-2 text-sm md:text-base" style={{ color: NAVY }}>
                  {d.creds}
                </p>
                <p className="text-sm md:text-base" style={{ color: NAVY }}>
                  {d.role}
                </p>
                {d.exp && (
                  <p className="text-sm md:text-base" style={{ color: NAVY }}>
                    {d.exp}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WhatsApp band ── */}
      <section className="bg-white pb-12 md:pb-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2
            className="text-2xl md:text-4xl font-bold leading-tight"
            style={{ ...heading, color: NAVY }}
          >
            Have Questions? Chat With Our Expert Instantly on WhatsApp
          </h2>
          <div className="mt-4 mx-auto h-px w-32 bg-gray-300" />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={WA_URL} target="_blank" rel="noopener noreferrer">
              <Button
                size="lg"
                className="text-white font-semibold h-12 md:h-14 px-6 md:px-8 hover:opacity-90"
                style={{ backgroundColor: GREEN }}
              >
                Chat on WhatsApp Now
              </Button>
            </a>
            <a href={TEL_URL}>
              <Button
                size="lg"
                className="text-white font-semibold h-12 md:h-14 px-6 md:px-8 hover:opacity-90"
                style={{ backgroundColor: NAVY_DARK }}
              >
                Call Now
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="relative bg-gradient-to-b from-[hsl(150,40%,90%)] to-[hsl(155,45%,85%)] py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold" style={{ ...heading, color: NAVY }}>
              Services We Provide
            </h2>
            <div className="mt-4 mx-auto h-px w-20 bg-gray-400/50" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-[hsl(155,40%,55%)] bg-gradient-to-b from-[hsl(150,45%,88%)] to-[hsl(155,50%,82%)] p-6 hover:shadow-xl transition-shadow"
              >
                <div className="rounded-xl overflow-hidden aspect-[4/3] mb-5 shadow-md bg-white">
                  <img src={s.img} alt={s.title} loading="lazy" className="w-full h-full object-cover" />
                </div>
                <h3 className="text-center text-xl md:text-2xl font-bold" style={{ ...heading, color: NAVY }}>
                  {s.title}
                </h3>
                <p className="mt-3 text-center text-sm md:text-base leading-relaxed" style={{ color: NAVY }}>
                  {s.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Before & After / Gallery ── */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold" style={{ ...heading, color: NAVY }}>
              Before and After
            </h2>
            <div className="mt-4 mx-auto h-px w-20 bg-gray-300" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {beforeAfter.map((item, i) => (
              <div key={i} className="overflow-hidden bg-white">
                <img
                  src={item.src}
                  alt={item.alt}
                  loading="lazy"
                  width={1024}
                  height={768}
                  className="w-full h-auto object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Choose ── */}
      <section className="bg-gradient-to-b from-[hsl(150,40%,90%)] to-[hsl(155,45%,85%)] py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold" style={{ ...heading, color: NAVY }}>
              Why Choose The Skin Clinic
            </h2>
            <div className="mt-4 mx-auto h-px w-20 bg-gray-400/50" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {reasons.map((r) => (
              <div
                key={r.title}
                className="rounded-2xl border border-[hsl(155,40%,55%)] bg-gradient-to-b from-[hsl(150,45%,90%)] to-[hsl(155,50%,84%)] p-6 text-center"
              >
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <img src={r.icon} alt={r.title} loading="lazy" className="h-10 w-10 object-contain" />
                </div>
                <h3 className="text-lg font-bold" style={{ ...heading, color: NAVY }}>
                  {r.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: NAVY }}>
                  {r.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Achieve dream skin CTA band ── */}
      <section className="bg-white py-12 md:py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2
            className="text-2xl md:text-4xl font-bold leading-tight"
            style={{ ...heading, color: NAVY }}
          >
            Achieve the skin you've always dreamed of with The Skin Clinic
          </h2>
          <div className="mt-4 mx-auto h-px w-32 bg-gray-300" />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={TEL_URL}>
              <Button
                size="lg"
                className="text-white font-semibold h-12 md:h-14 px-6 md:px-8 hover:opacity-90"
                style={{ backgroundColor: NAVY_DARK }}
              >
                <Phone className="h-4 w-4 mr-2" />
                Call Now
              </Button>
            </a>
            <Button
              size="lg"
              onClick={goLogin}
              className="text-white font-semibold h-12 md:h-14 px-6 md:px-8 hover:opacity-90"
              style={{ backgroundColor: GREEN }}
            >
              Access My Portal <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="bg-gray-50 py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold" style={{ ...heading, color: NAVY }}>
              Hear What Our Patients Have To Say
            </h2>
            <div className="mt-4 mx-auto h-px w-20 bg-gray-300" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
                <div className="flex gap-1 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm md:text-base leading-relaxed text-gray-700 italic">"{t.quote}"</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[hsl(155,45%,70%)] to-[hsl(174,50%,55%)] flex items-center justify-center text-white font-bold text-sm">
                    {t.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: NAVY }}>{t.name}</p>
                    <p className="text-xs text-gray-500">Verified Patient</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Book via WhatsApp band ── */}
      <section className="bg-white py-12 md:py-16">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2
            className="text-2xl md:text-4xl font-bold leading-tight"
            style={{ ...heading, color: NAVY }}
          >
            Book Your Consultation in Seconds via WhatsApp
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={WA_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="text-white font-semibold h-12 md:h-14 px-6 md:px-8 hover:opacity-90" style={{ backgroundColor: GREEN }}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Enquiry on WhatsApp
              </Button>
            </a>
            <a href={TEL_URL}>
              <Button size="lg" className="text-white font-semibold h-12 md:h-14 px-6 md:px-8 hover:opacity-90" style={{ backgroundColor: NAVY_DARK }}>
                <Phone className="h-4 w-4 mr-2" />
                Call Now
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── About Us ── */}
      <section className="bg-gradient-to-b from-[hsl(150,40%,92%)] to-white py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-5xl font-bold" style={{ ...heading, color: NAVY }}>
              About Us
            </h2>
            <div className="mt-4 mx-auto h-px w-20 bg-gray-300" />
          </div>
          <p className="text-base md:text-lg text-gray-700 leading-relaxed">
            Discover the essence of skincare excellence at The Skin Clinic, Mangalore's premier destination for comprehensive skin care. Our commitment to holistic beauty extends beyond individual names, emphasising the collective expertise of our dedicated team.
          </p>
          <p className="mt-5 text-base md:text-lg text-gray-700 leading-relaxed">
            Our founder, Dr. Vindhya Pai, leads a qualified team dedicated to prioritizing comfort, trust, and open communication. We empower individuals to embrace healthy, beautiful skin through unhurried appointments, state-of-the-art facilities, and ethical practices. Step into a world where The Skin Clinic is the brand, and radiant confidence is the result.
          </p>
        </div>
      </section>

      {/* ── Portal CTA banner ── */}
      <section className="px-4 md:px-6 py-12 md:py-16 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-6xl rounded-3xl p-8 md:p-14 text-center shadow-2xl"
          style={{ backgroundColor: NAVY_DARK }}
        >
          <Sparkles className="h-10 w-10 text-[hsl(155,60%,70%)] mx-auto mb-4" />
          <h2 className="text-2xl md:text-4xl font-bold text-white" style={heading}>
            Access Your Patient Portal
          </h2>
          <p className="mt-4 text-base md:text-lg text-white/80 max-w-2xl mx-auto">
            Manage appointments, view prescriptions, reorder medicines, and track your skin journey — all in one place.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              onClick={goLogin}
              className="bg-white text-[hsl(220,30%,20%)] hover:bg-white/90 font-semibold h-12 md:h-14 px-6 md:px-8"
            >
              Access My Portal <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button
              size="lg"
              onClick={goLogin}
              className="text-white font-semibold h-12 md:h-14 px-6 md:px-8 hover:opacity-90"
              style={{ backgroundColor: GREEN }}
            >
              Get Started Free
            </Button>
          </div>
        </motion.div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-white py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold" style={{ ...heading, color: NAVY }}>
              Frequently Asked Questions
            </h2>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="rounded-xl border border-gray-200 bg-gray-50 px-5">
                <AccordionTrigger className="text-left text-base font-semibold hover:no-underline" style={{ color: NAVY }}>
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-gray-700 leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ── Footer ──
          Rebuilt to match the clinic's own website footer. The Explore column
          points at real sections of the /clinic page in this app: the public
          site also has Skin AI, Blog and Careers pages, but none exist here
          and /portal/:tab is a catch-all, so a link to a missing page would
          silently open the patient dashboard rather than say anything. */}
      <footer style={{ backgroundColor: NAVY_DARK }} className="text-white/70">
        {/* Extra bottom room on a phone: the floating call and WhatsApp
            buttons are fixed over the bottom-left of the viewport, and
            without this the last email address sits underneath the call
            button when you reach the end of the page. */}
        <div className="mx-auto max-w-7xl px-6 pt-14 pb-32 md:pb-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            {/* No white version of the logo exists, so it sits on a faint
                light chip - the same treatment the clinic page's dark footer
                uses - rather than disappearing into the navy. */}
            <div className="flex items-center gap-3">
              <img
                src={clinicLogo}
                alt="The Skin Clinic"
                className="h-14 w-auto object-contain bg-white/10 rounded-lg p-1.5"
              />
              <span className="text-lg font-bold text-white" style={heading}>
                The Skin Clinic
              </span>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: "#6EE7B7" }}>
              {CLINIC_TAGLINE}
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">{CLINIC_BLURB}</p>
            <div className="mt-6 flex gap-3">
              {[
                { Icon: Instagram, href: CLINIC_SOCIALS.instagram, label: "Instagram" },
                { Icon: Facebook, href: CLINIC_SOCIALS.facebook, label: "Facebook" },
                { Icon: Youtube, href: CLINIC_SOCIALS.youtube, label: "YouTube" },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-11 w-11 items-center justify-center rounded-md border border-white/20 text-white/80 transition-colors hover:border-white/50 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-white" style={heading}>
              Explore
            </h4>
            <ul className="mt-5 space-y-3 text-sm">
              {CLINIC_EXPLORE_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-white/70 transition-colors hover:text-white">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-white" style={heading}>
              Visit &amp; Contact
            </h4>
            <ul className="mt-5 space-y-5 text-sm">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                <div>
                  {CLINIC_ADDRESS_LINES.map((line) => (
                    <p key={line} className="text-white/70">{line}</p>
                  ))}
                  <a
                    href={CLINIC_DIRECTIONS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-semibold uppercase tracking-[0.15em] transition-opacity hover:opacity-80"
                    style={{ color: "#6EE7B7" }}
                  >
                    Get directions →
                  </a>
                </div>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                <div>
                  <p className="text-white/70">{CLINIC_HOURS.days}</p>
                  <p className="text-white/70">{CLINIC_HOURS.time}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                <div>
                  {CLINIC_PHONES.map((ph) => (
                    <p key={ph.tel}>
                      <a href={ph.tel} className="text-white/70 transition-colors hover:text-white">
                        {ph.label}
                      </a>
                    </p>
                  ))}
                </div>
              </li>
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                <div>
                  {CLINIC_EMAILS.map((email) => (
                    <p key={email}>
                      <a href={`mailto:${email}`} className="break-all text-white/70 transition-colors hover:text-white">
                        {email}
                      </a>
                    </p>
                  ))}
                </div>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-6 py-5 text-center text-xs text-white/40">
            © {new Date().getFullYear()} The Skin Clinic. All rights reserved.
          </div>
        </div>
      </footer>

      {/* ── Floating action buttons ── */}
      <div className="fixed left-4 bottom-6 z-50 flex flex-col gap-3">
        <a
          href={TEL_URL}
          aria-label="Call now"
          className="h-12 w-12 rounded-md flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
          style={{ backgroundColor: NAVY_DARK }}
        >
          <Phone className="h-5 w-5" style={{ color: "#1FCFA8" }} />
        </a>
        <a
          href={WA_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          className="h-12 w-12 rounded-md flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
          style={{ backgroundColor: GREEN }}
        >
          <MessageCircle className="h-5 w-5 text-white fill-white" />
        </a>
      </div>
    </div>
  );
};

export default PortalLanding;
