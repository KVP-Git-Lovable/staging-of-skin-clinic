import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  Menu, X, Star, MapPin, Phone, Mail, Clock, MessageCircle, Instagram, Facebook, Youtube,
  Sparkles, Award, Users, HeartPulse, ArrowRight, Play, ChevronLeft, ChevronRight,
  Droplet, Zap, Scissors, Flower2, Sun, Activity, ShieldCheck, Quote, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import hero from "@/assets/clinic/hero.jpg";
import about from "@/assets/clinic/about.jpg";
import logo from "@/assets/skin-clinic-logo.png";
import docVindhya from "@/assets/clinic/real/dr-vindhya.jpg";
import docPunya from "@/assets/clinic/real/dr-punya.png";
import docSuraksha from "@/assets/clinic/real/dr-suraksha.jpg";
import docAshwini from "@/assets/clinic/real/dr-ashwini.jpg";
import tHairLoss from "@/assets/clinic/real/t-hair-loss.png";
import tLaser from "@/assets/clinic/real/t-laser.png";
import tTattoo from "@/assets/clinic/real/t-tattoo.png";
import tFatLoss from "@/assets/clinic/real/t-fatloss.jpg";
import tBrightening from "@/assets/clinic/real/t-brightening.jpg";
import tTightening from "@/assets/clinic/real/t-tightening.png";
import tClinical from "@/assets/clinic/real/t-clinical.jpg";
import blogAges from "@/assets/clinic/real/blog-ages.jpg";
import blogDiet from "@/assets/clinic/real/blog-diet.jpg";
import blogAcne from "@/assets/clinic/real/blog-acne.jpg";

/* ─────────── data (easy to swap) ─────────── */

const NAV = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Treatments", href: "#treatments" },
  { label: "Doctors", href: "#doctors" },
  { label: "Results", href: "#results" },
  { label: "Stories", href: "#stories" },
  { label: "Videos", href: "#videos" },
  { label: "FAQs", href: "#faqs" },
  { label: "Contact", href: "#contact" },
];

const STATS = [
  { value: 25000, suffix: "+", label: "Happy Patients" },
  { value: 7, suffix: "+", label: "Years at Mallikatte" },
  { value: 481, suffix: "+", label: "Google Reviews" },
  { value: 4.6, suffix: "★", label: "Google Rating", decimals: 1 },
];

const TREATMENTS = [
  { icon: Zap, title: "Laser Hair Reduction", desc: "Painless, precise laser hair reduction for face and body.", img: tLaser },
  { icon: Scissors, title: "Hair Loss Treatments", desc: "PRP, GFC and medical management for hair fall and thinning.", img: tHairLoss },
  { icon: Droplet, title: "Clinical Dermatology", desc: "Diagnosis and treatment of acne, eczema, psoriasis and more.", img: tClinical },
  { icon: Sparkles, title: "Skin Brightening", desc: "Medi-facials, peels and lasers for radiant, even-toned skin.", img: tBrightening },
  { icon: Sun, title: "Skin Tightening", desc: "HIFU, RF and Legend Pro for firm, lifted, youthful skin.", img: tTightening },
  { icon: Activity, title: "Tattoo Removal", desc: "Q-switched laser tattoo removal — safe, effective, gradual.", img: tTattoo },
  { icon: Flower2, title: "Pre-Wedding Skin Care", desc: "Personalised bridal & groom glow-up plans months ahead.", img: tBrightening },
  { icon: HeartPulse, title: "Fat Loss & Body Contouring", desc: "Non-surgical inch loss and body sculpting treatments.", img: tFatLoss },
];

const DOCTORS = [
  { name: "Dr. Vindhya A. Pai", title: "Founder & Chief Dermatologist", qual: "MD Dermatology, Venereology & Leprology (KMC Mangalore)", bio: "Fellowship-trained in aesthetic dermatology, with observerships in New York and Italy. Founded The Skin Clinic in 2018. IADVL-recognised centre for aesthetic dermatology observerships.", img: docVindhya },
  { name: "Dr. Punya Suvarna", title: "Consultant Dermatologist", qual: "MBBS, MD Dermatology, Venereology & Leprosy", bio: "Special interest in laser, hair reduction and cosmetic dermatology.", img: docPunya },
  { name: "Dr. P. Suraksha", title: "Consultant Dermatologist", qual: "MBBS, MD Dermatology, Venereology & Leprosy (RGUHS)", bio: "Focused on clinical dermatology and evidence-based skin care.", img: docSuraksha },
  { name: "Dr. Ashwini Ashokan", title: "Consultant Dermatologist", qual: "MBBS, MD Dermatology, Venereology & Leprosy", bio: "Skilled in medical and aesthetic dermatology procedures.", img: docAshwini },
];

// Before/after — placeholders until real cases are uploaded
const BEFORE_AFTER = [
  { label: "Acne & Scar Revival", before: tClinical, after: tBrightening },
  { label: "Laser Hair Reduction", before: tHairLoss, after: tLaser },
  { label: "Pigmentation Care", before: tClinical, after: tBrightening },
];

// Real testimonials from the reference site
const TESTIMONIALS = [
  { name: "Megha Shetty", role: "Verified patient", rating: 5, quote: "The doctors here are incredibly knowledgeable, listened carefully to my concerns and explained every option. The procedure was done with utmost care and my skin has improved significantly." },
  { name: "Esha Suresh", role: "Verified patient", rating: 5, quote: "I have been a regular at The Skin Clinic for 10 months and the experience gets better every visit. Dr. Punya is skilled and takes that extra effort to keep clients comfortable. Highly recommend it!" },
  { name: "Sheryl D'souza", role: "Verified patient", rating: 5, quote: "My skin has improved drastically under Dr. Vindhya Pai. The staff is friendly and guides you through every step. Always grateful." },
  { name: "Sahana A.", role: "Verified patient", rating: 5, quote: "I consulted this clinic for my acne scars. After a few sessions of treatment I can see a real difference in my skin — thanks to Dr. Vindhya Pai and team." },
  { name: "Harshitha Rao", role: "Verified patient", rating: 5, quote: "Dr. Punya helped a lot with my skin concern and recommended the glow-up treatment. My skin has improved a lot and the staff are very kind." },
];

const REVIEWS = [
  { name: "Srihari K", rating: 5, text: "The doctors took time to understand my rare skin condition (cholinergic urticaria) instead of just prescribing painkillers. Great place for any skin issues." },
  { name: "N R Arundhathi", rating: 5, text: "Laser hair reduction sessions were smooth, comfortable and professionally handled. Significant improvement — highly recommend." },
  { name: "Srisha Nayak", rating: 5, text: "Attentive team from the first consultation. My acne is much more controlled and my complexion is clearing up beautifully." },
  { name: "Varsha Rani", rating: 5, text: "Dr. Vindhya knows the exact antidote for any skin problem. Latest equipment, real results — worth every rupee." },
  { name: "Sharvari Shetty", rating: 5, text: "Dr. Vindhya is passionate and remembers her patients' details. She even guides you on diet. The place and people are a delight." },
  { name: "Prithvi K", rating: 5, text: "Doing facial hair reduction with Dr. Punya Suvarna for a year. She's gentle and kind, staff are understanding. Trust the process to see the progress." },
];

const IG_TILES = [tLaser, tHairLoss, tClinical, tBrightening, tTightening, tTattoo, tFatLoss, about];

// Real Skin Talks + user-provided YouTube content
const YT_SHORTS = [
  { id: "0Nk93IayGzs", title: "Vindhya Pai — Success Story", ratio: "16/9" as const },
  { id: "UkSKe3p2KE4", title: "Skin Talks by Dr Vindhya Pai", ratio: "16/9" as const },
  { id: "3uRFY00obxg", title: "Skin Talks Ep 1 — Melasma", ratio: "16/9" as const },
  { id: "oETsUP9D7Ig", title: "Skin Talk by Dr Vindhya Pai", ratio: "16/9" as const },
  { id: "PP2r5LTJm9M", title: "Skin Talks by Dr Vindhya Pai", ratio: "16/9" as const },
  { id: "BOHwC9WgrRk", title: "The Skin Clinic — Short", ratio: "9/16" as const },
  { id: "CiCE_ZQEOB8", title: "Inside The Skin Clinic", ratio: "9/16" as const },
];

const BLOG = [
  { title: "Skincare for all ages", excerpt: "Skin-care routines for your 20s, 30s and beyond.", read: "4 min", img: blogAges, href: "https://www.theskinclinic.org.in/skincare-for-all-ages/" },
  { title: "How your diet affects your skin", excerpt: "The truth about fad diets and their impact on skin health.", read: "5 min", img: blogDiet, href: "https://www.theskinclinic.org.in/how-your-diet-affects-your-skin/" },
  { title: "Medical Acne Treatments", excerpt: "Understanding acne and evidence-based treatment options.", read: "6 min", img: blogAcne, href: "https://www.theskinclinic.org.in/medical-acne-treatments/" },
];

const FAQS = [
  { q: "Are consultations by appointment only?", a: "Yes — we practice no-rush appointments so your time with the dermatologist is truly yours. Please book in advance." },
  { q: "Where is The Skin Clinic located?", a: "Vyasa Rao Road, Kadri Kambla Rd, Mallikatte, Kadri, Mangaluru, Karnataka 575003." },
  { q: "Is laser hair reduction painful?", a: "Our USFDA-approved lasers are virtually painless — most patients describe a mild warm sensation." },
  { q: "How many sessions will I need?", a: "It depends on the concern and your skin type — your dermatologist will craft a personalised plan on your first visit." },
  { q: "Do you treat children?", a: "Yes — Dr. Vindhya has a special interest in paediatric dermatology alongside adult care." },
];

const PHONES = [
  { label: "+91 96201 23030", href: "tel:+919620123030" },
  { label: "+91 63607 53030", href: "tel:+916360753030" },
];
const WHATSAPP = "https://wa.me/919620123030";
const ADDRESS = "Vyasa Rao Road, Kadri Kambla Rd, Mallikatte, Kadri, Mangaluru, Karnataka 575003";
const MAPS_EMBED = "https://www.google.com/maps?q=The+Skin+Clinic+Kadri+Kambla+Mangaluru&output=embed";
const SOCIALS = {
  instagram: "https://www.instagram.com/theskinclinic_mangalore/",
  facebook: "https://www.facebook.com/theskinclinicmangalore/",
  twitter: "https://twitter.com/theskinclinic17/",
  youtube: "https://www.youtube.com/channel/UCi9XPgx3UhtimTMLFmeC69A",
};

/* ─────────── helpers ─────────── */

function useAnimatedCount(target: number, decimals = 0, duration = 1600) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration]);
  return { ref, display: decimals ? val.toFixed(decimals) : Math.round(val).toLocaleString() };
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }),
};

/* ─────────── sections ─────────── */

function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/80 backdrop-blur-xl border-b border-border/60 shadow-sm" : "bg-transparent"}`}>
      <div className="container mx-auto flex items-center justify-between h-16 md:h-20 px-4">
        <a href="#home" className="flex items-center gap-2.5 font-display font-bold text-lg md:text-xl">
          <img src={logo} alt="The Skin Clinic" className={`h-10 md:h-11 w-auto object-contain transition-all ${scrolled ? "" : "drop-shadow-lg"}`} />
          <span className={`hidden sm:inline ${scrolled ? "text-foreground" : "text-white drop-shadow"}`}>The Skin Clinic</span>
        </a>
        <nav className="hidden lg:flex items-center gap-7">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={`text-sm font-medium transition-colors ${scrolled ? "text-foreground/80 hover:text-primary" : "text-white/90 hover:text-white"}`}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <Button asChild variant="ghost" className={scrolled ? "" : "text-white hover:bg-white/10 hover:text-white"}>
            <Link to="/login">Login</Link>
          </Button>
          <Button asChild className="bg-gradient-to-r from-primary to-emerald text-white shadow-lg hover:shadow-xl">
            <Link to="/portal/login?next=/portal/appointments">Book Appointment</Link>
          </Button>
        </div>
        <button className={`lg:hidden p-2 rounded-lg ${scrolled ? "text-foreground" : "text-white"}`} onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-border shadow-lg">
            <div className="container mx-auto px-4 py-4 flex flex-col gap-1">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="py-2.5 text-foreground/80 hover:text-primary font-medium">
                  {n.label}
                </a>
              ))}
              <div className="flex gap-2 pt-3 border-t border-border mt-2">
                <Button asChild variant="outline" className="flex-1"><Link to="/login">Login</Link></Button>
                <Button asChild className="flex-1 bg-gradient-to-r from-primary to-emerald text-white">
                  <Link to="/portal/login?next=/portal/appointments">Book</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Hero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 120]);
  return (
    <section id="home" className="relative min-h-[100svh] flex items-center overflow-hidden">
      <motion.div style={{ y }} className="absolute inset-0">
        <img src={hero} alt="The Skin Clinic — luxury dermatology" className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent" />
      </motion.div>

      {/* floating orbs */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald/30 blur-3xl animate-pulse" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-gold/20 blur-3xl animate-pulse" />

      <div className="relative container mx-auto px-4 pt-24 pb-16 text-white">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}
          className="max-w-3xl">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-sm font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5 text-gold" /> Award-winning dermatology & aesthetics
          </span>
          <h1 className="font-display font-extrabold text-5xl md:text-7xl leading-[1.05] tracking-tight">
            Radiant skin.<br />
            <span className="bg-gradient-to-r from-white via-gold to-white bg-clip-text text-transparent">Effortless confidence.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-white/85 max-w-2xl">
            World-class dermatology, laser and aesthetic care — delivered with the warmth of a boutique clinic and the precision of leading specialists.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 h-14 px-8 text-base shadow-2xl">
              <Link to="/portal/login?next=/portal/appointments">Book an Appointment <ArrowRight className="ml-2 w-4 h-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 px-8 text-base border-white/40 text-white bg-white/5 hover:bg-white/15 backdrop-blur-md">
              <a href="#treatments">Explore Treatments</a>
            </Button>
          </div>

          <div className="mt-12 flex flex-wrap gap-3">
            {[
              { icon: Award, label: "15+ Years" },
              { icon: ShieldCheck, label: "Board-certified" },
              { icon: Users, label: "25k+ Patients" },
              { icon: Star, label: "4.9 Google" },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-sm">
                <b.icon className="w-4 h-4 text-gold" /> {b.label}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.a href="#about" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
          className="hidden md:flex absolute left-1/2 -translate-x-1/2 bottom-8 flex-col items-center gap-2 text-white/80 text-xs">
          <span>Scroll</span>
          <span className="w-[1px] h-10 bg-white/40 relative overflow-hidden">
            <span className="absolute inset-0 bg-gold animate-[fade-in_2s_ease-in-out_infinite]" />
          </span>
        </motion.a>
      </div>
    </section>
  );
}

function TrustBar() {
  const items = ["Google 4.9 ★", "Practo Verified", "JustDial Trust", "ISO Certified", "10+ Awards"];
  return (
    <div className="border-y border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-5 flex flex-wrap items-center justify-around gap-x-8 gap-y-3 text-muted-foreground text-sm">
        {items.map((t) => (
          <div key={t} className="flex items-center gap-2 font-medium">
            <Star className="w-4 h-4 text-gold fill-gold" /> {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ id, eyebrow, title, subtitle, children, className = "" }: any) {
  return (
    <section id={id} className={`py-20 md:py-28 ${className}`}>
      <div className="container mx-auto px-4">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} className="max-w-3xl mx-auto text-center mb-14">
          {eyebrow && (
            <motion.span variants={fadeUp} className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest text-primary bg-accent">
              {eyebrow}
            </motion.span>
          )}
          <motion.h2 variants={fadeUp} custom={1} className="mt-4 font-display font-bold text-3xl md:text-5xl tracking-tight">{title}</motion.h2>
          {subtitle && <motion.p variants={fadeUp} custom={2} className="mt-4 text-muted-foreground text-lg">{subtitle}</motion.p>}
        </motion.div>
        {children}
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="py-20 md:py-28 bg-card">
      <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}
          className="relative">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 to-emerald/20 blur-2xl" />
          <img src={about} alt="Inside The Skin Clinic" className="relative rounded-3xl w-full object-cover shadow-[var(--shadow-luxe)]" loading="lazy" />
          <div className="absolute -bottom-6 -right-6 bg-white rounded-2xl p-4 shadow-xl hidden md:flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-emerald flex items-center justify-center text-white">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-lg leading-none">15+ Years</div>
              <div className="text-xs text-muted-foreground mt-1">of clinical excellence</div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest text-primary bg-accent">About Us</span>
          <h2 className="mt-4 font-display font-bold text-3xl md:text-5xl tracking-tight">Where science meets serenity.</h2>
          <p className="mt-5 text-muted-foreground text-lg leading-relaxed">
            The Skin Clinic is a premier destination for dermatology and aesthetic care. We combine evidence-based medicine, cutting-edge technology and an unwavering focus on you — delivering results that feel as good as they look.
          </p>
          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            {[
              { icon: ShieldCheck, title: "Board-certified experts", desc: "Trusted dermatologists with decades of combined experience." },
              { icon: Sparkles, title: "Premium technology", desc: "USFDA-approved lasers and devices in every treatment room." },
              { icon: HeartPulse, title: "Personalised care", desc: "Every plan tailored to your unique skin & goals." },
              { icon: Award, title: "Award-winning results", desc: "Recognised by patients and peers alike." },
            ].map((f) => (
              <div key={f.title} className="flex gap-3 p-4 rounded-2xl bg-background border border-border hover:border-primary/40 hover:shadow-md transition-all">
                <f.icon className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">{f.title}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Stat({ s, i }: { s: (typeof STATS)[number]; i: number }) {
  const { ref, display } = useAnimatedCount(s.value, (s as any).decimals ?? 0);
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
      className="text-center px-4">
      <div className="font-display font-extrabold text-4xl md:text-6xl bg-gradient-to-r from-primary to-emerald bg-clip-text text-transparent">
        <span ref={ref}>{display}</span><span className="text-gold">{s.suffix}</span>
      </div>
      <div className="mt-2 text-sm md:text-base text-muted-foreground font-medium">{s.label}</div>
    </motion.div>
  );
}

function Stats() {
  return (
    <section className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/40 via-background to-accent/40" />
      <div className="relative container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
        {STATS.map((s, i) => <Stat key={s.label} s={s} i={i} />)}
      </div>
    </section>
  );
}

function Treatments() {
  return (
    <Section id="treatments" eyebrow="Treatments" title="Signature services, exceptional outcomes." subtitle="From advanced skincare to precision aesthetics — designed around you.">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {TREATMENTS.map((t, i) => (
          <motion.div key={t.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07, duration: 0.6 }}
            whileHover={{ y: -6 }}
            className="group relative overflow-hidden rounded-3xl bg-card border border-border hover:border-primary/40 shadow-sm hover:shadow-[var(--shadow-luxe)] transition-all">
            <div className="relative h-56 overflow-hidden">
              <img src={t.img} alt={t.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute top-4 left-4 w-12 h-12 rounded-2xl bg-white/95 backdrop-blur flex items-center justify-center shadow-lg">
                <t.icon className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="p-6">
              <h3 className="font-display font-bold text-xl">{t.title}</h3>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{t.desc}</p>
              <a href="#contact" className="mt-4 inline-flex items-center text-primary font-semibold text-sm group/link">
                Learn more <ArrowRight className="ml-1 w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
              </a>
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

function Doctors() {
  return (
    <Section id="doctors" eyebrow="Our Team" title="Meet our dermatologists." subtitle="Board-certified specialists dedicated to your skin, hair and confidence." className="bg-card">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {DOCTORS.map((d, i) => (
          <motion.div key={d.name} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
            className="group relative rounded-3xl overflow-hidden bg-background shadow-sm hover:shadow-[var(--shadow-luxe)] transition-all">
            <div className="aspect-[4/5] overflow-hidden bg-gradient-to-br from-accent to-card">
              <img src={d.img} alt={d.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700" loading="lazy" />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-white">
              <div className="text-[10px] uppercase tracking-widest text-gold font-semibold">{d.title}</div>
              <h3 className="font-display font-bold text-lg md:text-xl mt-1 leading-tight">{d.name}</h3>
              <p className="mt-1 text-[11px] text-white/80 leading-snug">{d.qual}</p>
              <p className="mt-2 text-xs text-white/85 max-h-0 group-hover:max-h-32 overflow-hidden transition-all duration-500">{d.bio}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

function BeforeAfterSlider({ before, after, label }: { before: string; after: string; label: string }) {
  const [pos, setPos] = useState(50);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = (clientX: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(2, Math.min(98, p)));
  };
  return (
    <div className="relative rounded-3xl overflow-hidden shadow-[var(--shadow-luxe)] bg-card">
      <div ref={boxRef} className="relative aspect-[4/3] select-none cursor-ew-resize"
        onMouseMove={(e) => e.buttons === 1 && drag(e.clientX)}
        onTouchMove={(e) => drag(e.touches[0].clientX)}>
        <img src={after} alt={`${label} after`} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img src={before} alt={`${label} before`} className="absolute inset-0 w-full h-full object-cover" style={{ width: `${100 / (pos / 100)}%`, maxWidth: "none" }} />
        </div>
        <div className="absolute inset-y-0" style={{ left: `${pos}%` }}>
          <div className="w-0.5 h-full bg-white shadow-lg" />
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-xl flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 text-primary" /><ChevronRight className="w-4 h-4 text-primary" />
          </div>
        </div>
        <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/50 backdrop-blur text-white text-xs font-semibold">Before</div>
        <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-primary/90 backdrop-blur text-white text-xs font-semibold">After</div>
        <input aria-label="Compare before and after" type="range" min={2} max={98} value={pos} onChange={(e) => setPos(+e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" />
      </div>
      <div className="p-4 text-center font-semibold">{label}</div>
    </div>
  );
}

function BeforeAfter() {
  const [idx, setIdx] = useState(0);
  return (
    <Section id="results" eyebrow="Real Results" title="Before & after — see the difference.">
      <div className="max-w-3xl mx-auto">
        <BeforeAfterSlider {...BEFORE_AFTER[idx]} />
        <div className="flex justify-center gap-2 mt-6 flex-wrap">
          {BEFORE_AFTER.map((b, i) => (
            <button key={b.label} onClick={() => setIdx(i)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${i === idx ? "bg-primary text-primary-foreground shadow-md" : "bg-card border border-border hover:border-primary/40"}`}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Testimonials() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <Section id="stories" eyebrow="Patient Stories" title="Loved by thousands." className="bg-card">
      <div className="max-w-3xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5 }}
            className="text-center p-8 md:p-12 rounded-3xl bg-background shadow-[var(--shadow-luxe)] border border-border">
            <Quote className="w-12 h-12 text-primary/20 mx-auto" />
            <p className="mt-4 text-xl md:text-2xl font-display italic leading-relaxed">"{TESTIMONIALS[idx].quote}"</p>
            <div className="mt-6 flex justify-center gap-1">
              {Array.from({ length: TESTIMONIALS[idx].rating }).map((_, i) => <Star key={i} className="w-5 h-5 text-gold fill-gold" />)}
            </div>
            <div className="mt-4 font-bold">{TESTIMONIALS[idx].name}</div>
            <div className="text-sm text-muted-foreground">{TESTIMONIALS[idx].role}</div>
          </motion.div>
        </AnimatePresence>
        <div className="flex justify-center gap-2 mt-6">
          {TESTIMONIALS.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`Testimonial ${i + 1}`}
              className={`h-2 rounded-full transition-all ${i === idx ? "w-8 bg-primary" : "w-2 bg-border"}`} />
          ))}
        </div>
      </div>
    </Section>
  );
}

function GoogleReviews() {
  return (
    <Section eyebrow="Google Reviews" title="4.6 ★ from 481+ verified reviews."
      subtitle="Real feedback from real patients on Google.">
      <div className="grid md:grid-cols-3 gap-6">
        {REVIEWS.map((r, i) => (
          <motion.div key={r.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
            className="p-6 rounded-3xl bg-card border border-border shadow-sm hover:shadow-lg transition-all">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-emerald text-white font-bold flex items-center justify-center">
                {r.name[0]}
              </div>
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="flex gap-0.5">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 text-gold fill-gold" />)}</div>
              </div>
            </div>
            <p className="mt-4 text-muted-foreground text-sm leading-relaxed">"{r.text}"</p>
          </motion.div>
        ))}
      </div>
      <div className="text-center mt-10">
        <Button variant="outline" asChild className="rounded-full">
          <a href="https://maps.google.com/?cid=5768419635675091400" target="_blank" rel="noreferrer">View all on Google <ArrowRight className="ml-2 w-4 h-4" /></a>
        </Button>
      </div>
    </Section>
  );
}

function InstagramGallery() {
  return (
    <Section eyebrow="Instagram" title="@theskinclinic_mangalore" subtitle="A window into our world — treatments, transformations, team." className="bg-card">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {IG_TILES.map((src, i) => (
          <motion.a key={i} href={SOCIALS.instagram} target="_blank" rel="noreferrer" initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
            className="group relative aspect-square overflow-hidden rounded-2xl">
            <img src={src} alt="Instagram" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-emerald/0 group-hover:from-primary/60 group-hover:to-emerald/60 transition-all flex items-center justify-center">
              <Instagram className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </motion.a>
        ))}
      </div>
    </Section>
  );
}

function VideoReels() {
  const [active, setActive] = useState<string | null>(null);
  const activeVideo = YT_SHORTS.find((v) => v.id === active);
  return (
    <Section id="videos" eyebrow="Videos & Shorts" title="Skin Talks by Dr Vindhya Pai." subtitle="Watch our clinic in action — expert talks, real stories and reels.">
      <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory scrollbar-thin">
        {YT_SHORTS.map((v, i) => (
          <motion.button key={v.id} onClick={() => setActive(v.id)} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
            className={`shrink-0 rounded-3xl overflow-hidden relative group snap-start shadow-[var(--shadow-luxe)] ${v.ratio === "9/16" ? "w-[240px] md:w-[280px] aspect-[9/16]" : "w-[340px] md:w-[440px] aspect-video"}`}>
            <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white/95 backdrop-blur flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                <Play className="w-6 h-6 text-primary fill-primary ml-1" />
              </div>
            </div>
            <div className="absolute bottom-3 left-4 right-4 text-white font-semibold text-sm text-left drop-shadow">{v.title}</div>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {active && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setActive(null)}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur flex items-center justify-center p-4">
            <button className="absolute top-6 right-6 text-white p-2" onClick={() => setActive(null)}><X className="w-8 h-8" /></button>
            <div className={`relative w-full rounded-2xl overflow-hidden shadow-2xl ${activeVideo?.ratio === "9/16" ? "max-w-md aspect-[9/16]" : "max-w-4xl aspect-video"}`} onClick={(e) => e.stopPropagation()}>
              <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${active}?autoplay=1`}
                title={activeVideo?.title ?? "YouTube video"} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );
}

function Blog() {
  return (
    <Section eyebrow="Health Tips" title="Dermatologist-approved insights." className="bg-card">
      <div className="grid md:grid-cols-3 gap-6">
        {BLOG.map((b, i) => (
          <motion.article key={b.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
            className="group rounded-3xl overflow-hidden bg-background border border-border hover:shadow-[var(--shadow-luxe)] transition-all">
            <div className="aspect-[16/10] overflow-hidden">
              <img src={b.img} alt={b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
            </div>
            <div className="p-6">
              <div className="text-xs text-muted-foreground font-medium">{b.read} read</div>
              <h3 className="mt-2 font-display font-bold text-xl leading-snug">{b.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{b.excerpt}</p>
              <a href={b.href} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center text-primary font-semibold text-sm">Read article <ArrowRight className="ml-1 w-4 h-4" /></a>
            </div>
          </motion.article>
        ))}
      </div>
    </Section>
  );
}

function FAQs() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faqs" eyebrow="FAQs" title="Answers to what patients ask us most.">
      <div className="max-w-3xl mx-auto space-y-3">
        {FAQS.map((f, i) => (
          <div key={f.q} className="rounded-2xl border border-border bg-card overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left font-semibold">
              {f.q}
              <ChevronRight className={`w-5 h-5 text-primary transition-transform ${open === i ? "rotate-90" : ""}`} />
            </button>
            <AnimatePresence>
              {open === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-5 pb-5 text-muted-foreground">{f.a}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Contact() {
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast.success("Thank you! We'll be in touch shortly.");
    (e.currentTarget as HTMLFormElement).reset();
  };
  return (
    <Section id="contact" eyebrow="Contact" title="Visit us or say hello." subtitle="Book online, WhatsApp us, or drop by — we'd love to meet you." className="bg-card">
      <div className="grid lg:grid-cols-2 gap-8">
        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="p-8 rounded-3xl bg-background border border-border shadow-sm space-y-4">
          <h3 className="font-display font-bold text-2xl">Send an enquiry</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input required name="name" placeholder="Full name" />
            <Input required name="phone" placeholder="Phone" />
          </div>
          <Input type="email" name="email" placeholder="Email" />
          <Input name="concern" placeholder="Concern (e.g. acne, hair loss)" />
          <Textarea required name="message" placeholder="How can we help you?" rows={4} />
          <Button type="submit" size="lg" className="w-full bg-gradient-to-r from-primary to-emerald text-white">
            <Send className="w-4 h-4 mr-2" /> Send Enquiry
          </Button>
        </motion.form>

        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="space-y-4">
          <div className="rounded-3xl overflow-hidden border border-border h-64 shadow-sm">
            <iframe title="The Skin Clinic — Mangaluru" src={MAPS_EMBED} className="w-full h-full" loading="lazy" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: Phone, label: "Call us", value: "+91 96201 23030", href: "tel:+919620123030" },
              { icon: Phone, label: "Alt. line", value: "+91 63607 53030", href: "tel:+916360753030" },
              { icon: MessageCircle, label: "WhatsApp", value: "Chat instantly", href: WHATSAPP },
              { icon: MapPin, label: "Visit", value: "Kadri Kambla, Mangaluru", href: "https://maps.google.com/?cid=5768419635675091400" },
            ].map((c) => {
              const inner = (
                <>
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-emerald text-white flex items-center justify-center">
                    <c.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{c.label}</div>
                    <div className="font-semibold">{c.value}</div>
                  </div>
                </>
              );
              return c.href ? (
                <a key={c.label} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
                  className="flex items-center gap-3 p-4 rounded-2xl bg-background border border-border hover:border-primary/40 hover:shadow-md transition-all">{inner}</a>
              ) : (
                <div key={c.label} className="flex items-center gap-3 p-4 rounded-2xl bg-background border border-border">{inner}</div>
              );
            })}
          </div>
          <a href={WHATSAPP} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-emerald to-primary text-white font-semibold shadow-lg hover:shadow-xl transition-shadow">
            <MessageCircle className="w-5 h-5" /> Chat on WhatsApp — instant reply
            <ArrowRight className="ml-auto w-5 h-5" />
          </a>
        </motion.div>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="bg-sidebar text-sidebar-foreground pt-16 pb-8">
      <div className="container mx-auto px-4 grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5 font-display font-bold text-xl text-white">
            <img src={logo} alt="The Skin Clinic" className="h-11 w-auto object-contain bg-white/10 rounded-lg p-1" />
            The Skin Clinic
          </div>
          <p className="mt-4 text-sm text-sidebar-foreground/70 max-w-md">
            Full-spectrum family dermatology in Mangaluru — clinical care, aesthetics and laser, delivered by board-certified specialists.
          </p>
          <div className="mt-5 flex gap-3">
            {[
              { icon: Instagram, href: SOCIALS.instagram },
              { icon: Facebook, href: SOCIALS.facebook },
              { icon: Youtube, href: SOCIALS.youtube },
            ].map((s, i) => (
              <a key={i} href={s.href} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-sidebar-accent hover:bg-primary text-white flex items-center justify-center transition-colors">
                <s.icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>
        <div>
          <div className="text-white font-semibold mb-4">Quick Links</div>
          <ul className="space-y-2 text-sm">
            {NAV.slice(0, 6).map((n) => (
              <li key={n.href}><a href={n.href} className="hover:text-white transition-colors">{n.label}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-4">Reach us</div>
          <ul className="space-y-2 text-sm text-sidebar-foreground/80">
            <li className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0" /> {ADDRESS}</li>
            {PHONES.map((p) => (
              <li key={p.href} className="flex items-center gap-2"><Phone className="w-4 h-4" /> <a href={p.href} className="hover:text-white">{p.label}</a></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="container mx-auto px-4 mt-10 pt-6 border-t border-sidebar-border flex flex-col md:flex-row justify-between gap-3 text-xs text-sidebar-foreground/60">
        <div>© {new Date().getFullYear()} The Skin Clinic. All rights reserved.</div>
        <div className="flex gap-4">
          <a href="#" className="hover:text-white">Privacy</a>
          <a href="#" className="hover:text-white">Terms</a>
        </div>
      </div>
    </footer>
  );
}

/* ─────────── page ─────────── */

export default function Landing() {
  useEffect(() => {
    const prev = document.title;
    document.title = "The Skin Clinic — Premier Dermatology & Aesthetics";
    const desc = document.querySelector('meta[name="description"]');
    const prevDesc = desc?.getAttribute("content") ?? null;
    desc?.setAttribute("content", "Award-winning dermatology, laser and aesthetic care. Book your consultation at The Skin Clinic.");
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.title = prev;
      if (prevDesc !== null) desc?.setAttribute("content", prevDesc);
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  return (
    <div className="bg-background text-foreground overflow-x-hidden">
      <TopNav />
      <Hero />
      <TrustBar />
      <About />
      <Stats />
      <Treatments />
      <Doctors />
      <BeforeAfter />
      <Testimonials />
      <GoogleReviews />
      <InstagramGallery />
      <VideoReels />
      <Blog />
      <FAQs />
      <Contact />
      <Footer />

      {/* Floating WhatsApp CTA */}
      <a href={WHATSAPP} target="_blank" rel="noreferrer"
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-emerald to-primary text-white flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
        <MessageCircle className="w-6 h-6" />
      </a>
    </div>
  );
}