import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Heart, Users, Calendar, ClipboardList, Camera, Pill, Receipt, Stethoscope,
  Package, ShoppingBag, Wallet, UserCog, BarChart3, FileBarChart, CalendarDays,
  ArrowRight, Check, X, Star, Shield, Zap, Globe, Brain, Smartphone, Clock,
  TrendingUp, Lock, ChevronDown, ChevronRight, Menu, XIcon,
  MessageSquare, Bell, CreditCard, Truck, Activity, Layers, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

/* ─────────────── data ─────────────── */

const editions = [
  {
    name: "Starter",
    tagline: "For solo practitioners & small clinics",
    price: "₹4,999",
    period: "/month",
    highlight: false,
    features: [
      "Patient Management (up to 500)",
      "Appointment Scheduling",
      "Basic Billing & Invoicing",
      "Service Master",
      "Patient Photos",
      "Basic Reports",
      "Email Support",
    ],
    notIncluded: [
      "Pharmacy Management",
      "Staff & Leave Management",
      "Asset Tracking",
      "Advanced Reports & Builder",
      "Patient Portal & Shop",
      "AI-Powered Features",
      "Multi-location Support",
    ],
  },
  {
    name: "Professional",
    tagline: "For growing clinics & multi-doctor practices",
    price: "₹12,999",
    period: "/month",
    highlight: true,
    features: [
      "Unlimited Patients",
      "Appointment Scheduling",
      "Full Billing with Tax Management",
      "Service Master with Prescriptions",
      "Patient Photos & Before/After",
      "Pharmacy & Inventory Management",
      "Staff & Leave Management",
      "Expense Tracking",
      "Advanced Reports & Builder",
      "Patient Portal with Shop",
      "Priority Support",
    ],
    notIncluded: [
      "AI Skin Analysis",
      "AI Case Analysis",
      "Patient Engagement Scoring",
      "Multi-location Support",
    ],
  },
  {
    name: "Enterprise",
    tagline: "For clinic chains & institutions",
    price: "Custom",
    period: "",
    highlight: false,
    features: [
      "Everything in Professional",
      "AI Skin Analysis & Recommendations",
      "AI Case Analysis & 360° View",
      "Patient Engagement Scoring",
      "Portal Chatbot (AI-Powered)",
      "Multi-location Support",
      "Custom Report Builder",
      "Asset Management & AMC Tracking",
      "White-label Patient Portal",
      "Dedicated Account Manager",
      "SLA-backed Support",
      "Custom Integrations",
    ],
    notIncluded: [],
  },
];

const featureGroups = [
  {
    title: "Patient Care",
    icon: Users,
    color: "text-primary",
    features: [
      { name: "Patient Records & History", desc: "Complete patient profiles with medical history, allergies, skin type, and treatment records." },
      { name: "Family Linking", desc: "Link family members for holistic care and shared billing convenience." },
      { name: "Before & After Photos", desc: "Capture and compare treatment progress with organized clinical photography." },
      { name: "Patient 360° View", desc: "AI-powered comprehensive view of patient journey, treatments, and engagement." },
    ],
  },
  {
    title: "Clinical Operations",
    icon: Stethoscope,
    color: "text-info",
    features: [
      { name: "Appointment Scheduling", desc: "Smart scheduling with recurring appointments, staff assignment, and automated reminders." },
      { name: "Procedure Management", desc: "Document procedures with diagnosis, notes, prescriptions, and follow-up plans." },
      { name: "Service Master", desc: "Configure treatments with pricing, duration, linked medications, and clinical protocols." },
      { name: "Skin Analysis (AI)", desc: "AI-powered skin condition analysis from patient photos with recommendations." },
    ],
  },
  {
    title: "Revenue & Finance",
    icon: Receipt,
    color: "text-warning",
    features: [
      { name: "Billing & Invoicing", desc: "Generate GST-compliant invoices with tax management and multiple payment modes." },
      { name: "Pharmacy Sales", desc: "Integrated pharmacy billing with batch tracking and inventory deduction." },
      { name: "Expense Tracking", desc: "AI-assisted expense parsing from receipts with category management." },
      { name: "Financial Reports", desc: "Revenue analytics, collection reports, and profit tracking dashboards." },
    ],
  },
  {
    title: "Pharmacy & Inventory",
    icon: Pill,
    color: "text-success",
    features: [
      { name: "Product Catalog", desc: "Complete pharmaceutical product management with pricing, HSN codes, and GST." },
      { name: "Batch & Expiry Tracking", desc: "Track inventory by batch with expiry alerts and reorder notifications." },
      { name: "Price History", desc: "Maintain price change audit trail with effective date management." },
      { name: "Online Shop", desc: "Patient-facing product shop with cart sync and order management." },
    ],
  },
  {
    title: "Team Management",
    icon: UserCog,
    color: "text-destructive",
    features: [
      { name: "Staff Profiles & Performance", desc: "Track staff credentials, education, aspirations, and performance metrics." },
      { name: "Attendance & Check-in", desc: "Photo-verified check-in/out with GPS tracking and attendance reports." },
      { name: "Leave Management", desc: "Configure leave types, track balances, and manage approval workflows." },
      { name: "Staff Performance Charts", desc: "Visual dashboards showing appointment loads, revenue, and utilization." },
    ],
  },
  {
    title: "Patient Engagement",
    icon: MessageSquare,
    color: "text-primary",
    features: [
      { name: "Patient Portal", desc: "Self-service portal for booking, prescription refills, and treatment history." },
      { name: "Online Shop & Orders", desc: "E-commerce with synced cart, delivery tracking, and order management." },
      { name: "AI Chatbot", desc: "Intelligent assistant for patient queries about treatments and appointments." },
      { name: "Engagement Scoring", desc: "AI-driven patient engagement and retention scoring with actionable insights." },
    ],
  },
];

const comparisonFeatures = [
  { name: "Patient Records", starter: true, professional: true, enterprise: true },
  { name: "Appointment Scheduling", starter: true, professional: true, enterprise: true },
  { name: "Basic Billing", starter: true, professional: true, enterprise: true },
  { name: "Service Master", starter: true, professional: true, enterprise: true },
  { name: "Patient Photos", starter: true, professional: true, enterprise: true },
  { name: "Pharmacy Management", starter: false, professional: true, enterprise: true },
  { name: "Tax & GST Management", starter: false, professional: true, enterprise: true },
  { name: "Staff & Leave Management", starter: false, professional: true, enterprise: true },
  { name: "Expense Tracking", starter: false, professional: true, enterprise: true },
  { name: "Advanced Reports", starter: false, professional: true, enterprise: true },
  { name: "Report Builder", starter: false, professional: true, enterprise: true },
  { name: "Patient Portal & Shop", starter: false, professional: true, enterprise: true },
  { name: "Order Management", starter: false, professional: true, enterprise: true },
  { name: "Asset Management", starter: false, professional: false, enterprise: true },
  { name: "AI Skin Analysis", starter: false, professional: false, enterprise: true },
  { name: "AI Case Analysis", starter: false, professional: false, enterprise: true },
  { name: "Patient 360° (AI)", starter: false, professional: false, enterprise: true },
  { name: "AI Chatbot", starter: false, professional: false, enterprise: true },
  { name: "Engagement Scoring", starter: false, professional: false, enterprise: true },
  { name: "Multi-location", starter: false, professional: false, enterprise: true },
  { name: "White-label Portal", starter: false, professional: false, enterprise: true },
  { name: "Custom Integrations", starter: false, professional: false, enterprise: true },
];

const testimonials = [
  { name: "Dr. Priya Sharma", role: "Dermatologist, Mumbai", quote: "Quick Clinic transformed how we manage patient care. The AI skin analysis alone saves us hours each week.", rating: 5 },
  { name: "Dr. Arjun Mehta", role: "Clinic Chain Owner, Delhi", quote: "Managing 5 locations was a nightmare before Quick Clinic. Now everything is in one dashboard with real-time insights.", rating: 5 },
  { name: "Dr. Kavitha R.", role: "Cosmetic Surgeon, Bangalore", quote: "The patient portal and online shop have increased our retail revenue by 40%. Patients love the convenience.", rating: 5 },
];

const faqs = [
  { q: "Can I migrate my existing patient data?", a: "Yes! We provide free data migration assistance. Our team will help you import patient records, treatment history, and financial data from your existing system." },
  { q: "Is patient data secure and HIPAA compliant?", a: "Absolutely. All data is encrypted at rest and in transit. We follow healthcare data protection standards with role-based access control and audit logs." },
  { q: "Can I try before I buy?", a: "Yes, we offer a 14-day free trial of the Professional edition with full features. No credit card required." },
  { q: "Does it work offline?", a: "The core scheduling and patient management features work offline and sync when connectivity is restored." },
  { q: "Can patients book appointments online?", a: "Yes, the Patient Portal allows patients to view available slots and request appointments, which your staff can confirm." },
  { q: "How does the AI skin analysis work?", a: "Patients or clinicians upload photos, and our AI analyzes skin conditions, suggests possible diagnoses, and recommends treatments based on clinical patterns." },
];

/* ─────────────── fade helper ─────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } }),
};

/* ─────────────── component ─────────────── */
const Website = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      {/* ═══ NAVBAR ═══ */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Heart className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <span className="font-display text-lg font-bold text-foreground">Quick</span>
                <span className="font-display text-lg font-bold text-primary">Clinic</span>
                <p className="text-[10px] text-muted-foreground leading-none -mt-0.5 tracking-wider uppercase">by QuickApp.AI</p>
              </div>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#editions" className="text-muted-foreground hover:text-foreground transition-colors">Editions</a>
              <a href="#comparison" className="text-muted-foreground hover:text-foreground transition-colors">Compare</a>
              <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
              <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Button variant="outline" asChild>
                <Link to="/">Login</Link>
              </Button>
              <Button asChild>
                <a href="#editions">Get Started <ArrowRight className="h-4 w-4 ml-1" /></a>
              </Button>
            </div>

            {/* Mobile toggle */}
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-4 space-y-3">
            <a href="#features" className="block text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#editions" className="block text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>Editions</a>
            <a href="#comparison" className="block text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>Compare</a>
            <a href="#faq" className="block text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" asChild className="flex-1"><Link to="/">Login</Link></Button>
              <Button size="sm" asChild className="flex-1"><a href="#editions">Get Started</a></Button>
            </div>
          </div>
        )}
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(210,30%,8%)] via-[hsl(210,30%,12%)] to-[hsl(174,40%,10%)]" />
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(174 62% 38% / 0.25), transparent 70%)" }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 mb-6 text-xs tracking-wide">
              <Sparkles className="h-3 w-3 mr-1" /> AI-Powered Clinic Management • Built for Dermatology
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl lg:text-7xl font-display font-extrabold text-white leading-tight"
          >
            Run Your Clinic{" "}
            <span className="bg-gradient-to-r from-[hsl(174,62%,50%)] to-[hsl(174,80%,65%)] bg-clip-text text-transparent">
              Smarter
            </span>
            <br className="hidden sm:block" />
            Not Harder
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg md:text-xl text-[hsl(210,15%,65%)] max-w-3xl mx-auto"
          >
            Patients • Appointments • Procedures • Pharmacy • Billing • AI Diagnostics —{" "}
            <span className="text-white font-medium">everything your dermatology clinic needs</span> in one intelligent platform.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <a href="#editions">Start Free Trial <ArrowRight className="h-4 w-4 ml-2" /></a>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12 border-[hsl(210,25%,25%)] text-white hover:bg-[hsl(210,25%,15%)]">
              Request Demo
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-[hsl(210,15%,55%)]"
          >
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> 14-day free trial</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> No credit card required</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> HIPAA-ready security</span>
          </motion.div>
        </div>
      </section>

      {/* ═══ STATS BAR ═══ */}
      <section className="bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "500+", label: "Clinics Trust Us" },
            { value: "1M+", label: "Patients Managed" },
            { value: "99.9%", label: "Uptime" },
            { value: "4.8★", label: "Avg Rating" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-3xl md:text-4xl font-display font-extrabold text-primary">{s.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ VALUE PROPOSITIONS ═══ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 text-xs">Why Quick Clinic</Badge>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold">Not Just Software — An Intelligent Clinic Partner</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">Built specifically for dermatology and aesthetics clinics with AI at its core — guiding clinical decisions, not just recording them.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: Brain, title: "AI-First Architecture", desc: "Skin analysis, case insights, patient engagement scoring — AI that assists your clinical decisions." },
            { icon: Layers, title: "All-in-One Platform", desc: "Patients, appointments, procedures, pharmacy, billing, staff — no more juggling multiple tools." },
            { icon: ShoppingBag, title: "Built-in Patient Shop", desc: "Online product shop with synced cart, delivery tracking, and integrated pharmacy billing." },
            { icon: Shield, title: "Healthcare-Grade Security", desc: "End-to-end encryption, role-based access, and audit trails meeting healthcare compliance." },
            { icon: Smartphone, title: "Patient Portal", desc: "Self-service portal for patients to view history, request refills, and shop online." },
            { icon: TrendingUp, title: "Actionable Analytics", desc: "Custom report builder with visual dashboards tracking revenue, staff, and patient metrics." },
          ].map((item, i) => (
            <motion.div key={item.title} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <Card className="h-full hover:shadow-md transition-shadow border-border">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-display font-bold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 text-xs">Complete Feature Set</Badge>
            <h2 className="text-3xl md:text-4xl font-display font-extrabold">Everything Your Clinic Needs</h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">From patient walk-in to treatment completion, billing, and follow-up — Quick Clinic covers every touchpoint.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featureGroups.map((group, gi) => (
              <motion.div key={group.title} custom={gi} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <group.icon className={`h-5 w-5 ${group.color}`} />
                      </div>
                      <CardTitle className="text-lg">{group.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {group.features.map((f) => (
                      <div key={f.name}>
                        <div className="text-sm font-medium">{f.name}</div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ EDITIONS / PRICING ═══ */}
      <section id="editions" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 text-xs">Simple Pricing</Badge>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold">Choose Your Edition</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">Three editions designed around your clinic's size and needs. Start small, scale as you grow.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {editions.map((ed, i) => (
            <motion.div key={ed.name} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <Card className={`h-full relative ${ed.highlight ? "border-primary shadow-lg ring-1 ring-primary/20" : ""}`}>
                {ed.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground text-xs px-3">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl">{ed.name}</CardTitle>
                  <CardDescription>{ed.tagline}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-display font-extrabold text-foreground">{ed.price}</span>
                    <span className="text-muted-foreground text-sm">{ed.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <Button className={`w-full mb-6 ${ed.highlight ? "" : "variant-outline"}`} variant={ed.highlight ? "default" : "outline"}>
                    {ed.price === "Custom" ? "Contact Sales" : "Start Free Trial"}
                  </Button>

                  <div className="space-y-2.5">
                    {ed.features.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </div>
                    ))}
                    {ed.notIncluded.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <X className="h-4 w-4 shrink-0 mt-0.5 opacity-40" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ COMPARISON TABLE ═══ */}
      <section id="comparison" className="bg-muted/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-extrabold">Compare Editions</h2>
            <p className="mt-4 text-muted-foreground">Side-by-side feature comparison across all three editions.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 pr-4 font-display font-bold text-base">Feature</th>
                  <th className="text-center py-3 px-4 font-display font-bold">Starter</th>
                  <th className="text-center py-3 px-4 font-display font-bold text-primary">Professional</th>
                  <th className="text-center py-3 px-4 font-display font-bold">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((row) => (
                  <tr key={row.name} className="border-b border-border/50">
                    <td className="py-3 pr-4">{row.name}</td>
                    <td className="py-3 px-4 text-center">
                      {row.starter ? <Check className="h-4 w-4 text-primary mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                    </td>
                    <td className="py-3 px-4 text-center bg-primary/5">
                      {row.professional ? <Check className="h-4 w-4 text-primary mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.enterprise ? <Check className="h-4 w-4 text-primary mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section id="testimonials" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 text-xs">Trusted by Clinics</Badge>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold">What Doctors Say</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <motion.div key={t.name} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <Card className="h-full">
                <CardContent className="p-6">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: t.rating }).map((_, si) => (
                      <Star key={si} className="h-4 w-4 fill-warning text-warning" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed italic">"{t.quote}"</p>
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="font-display font-bold text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="bg-muted/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-extrabold">Frequently Asked Questions</h2>
          </div>

          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="text-sm font-medium text-left">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(210,30%,8%)] via-[hsl(210,30%,12%)] to-[hsl(174,40%,10%)]" />
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse at 50% 100%, hsl(174 62% 38% / 0.3), transparent 60%)" }} />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h2 className="text-3xl md:text-5xl font-display font-extrabold text-white leading-tight">
            Ready to Transform<br />Your Clinic?
          </h2>
          <p className="mt-6 text-lg text-[hsl(210,15%,65%)] max-w-2xl mx-auto">
            Join 500+ dermatology clinics that trust Quick Clinic to deliver better patient care and smarter operations.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <a href="#editions">Start Free Trial <ArrowRight className="h-4 w-4 ml-2" /></a>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12 border-[hsl(210,25%,25%)] text-white hover:bg-[hsl(210,25%,15%)]" asChild>
              <Link to="/">Login to DermaCare <Lock className="h-4 w-4 ml-2" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-card border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                  <Heart className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-display font-bold">QuickClinic</span>
              </div>
              <p className="text-sm text-muted-foreground">AI-powered clinic management built for dermatology and aesthetics.</p>
              <p className="text-xs text-muted-foreground mt-3">A product by QuickApp.AI</p>
            </div>

            <div>
              <h4 className="font-display font-bold text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#editions" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#comparison" className="hover:text-foreground transition-colors">Compare Editions</a></li>
                <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-display font-bold text-sm mb-3">Solutions</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Dermatology Clinics</li>
                <li>Aesthetic Centers</li>
                <li>Cosmetic Surgery</li>
                <li>Multi-location Chains</li>
              </ul>
            </div>

            <div>
              <h4 className="font-display font-bold text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="https://quickapp.ai" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">QuickApp.AI</a></li>
                <li><a href="https://www.theskinclinic.org.in" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">The Skin Clinic</a></li>
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} QuickApp.AI. All rights reserved.</p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>contact@quickapp.ai</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Website;
