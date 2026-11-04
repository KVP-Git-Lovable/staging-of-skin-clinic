import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Loader2, ArrowRight, Lock, KeyRound, ArrowLeft, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import clinicLogo from "@/assets/skin-clinic-logo.png";

type Step = "phone" | "choose_patient" | "enter_pin" | "create_pin" | "forgot_request" | "forgot_verify";

/** One person on a shared number. */
interface Candidate { id: string; name: string }

const SESSION_DAYS = 30;

const PortalLogin = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  /**
   * Who is logging in, when one number reaches several patients.
   *
   * A fifth of this clinic's patients share a phone with somebody else -
   * families, up to fourteen on a number - and the PIN belongs to the
   * person, not the phone. Empty for a number that reaches one patient, so
   * nothing changes for most people.
   */
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [patientId, setPatientId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const completeLogin = (patientId: string, patientName: string, sessionToken?: string) => {
    if (!sessionToken) {
      toast.error("Could not start your session. Please try signing in again.");
      return;
    }
    const session = {
      patientId,
      sessionToken,
      patientName,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };
    localStorage.setItem("portal_session", JSON.stringify(session));
    toast.success(`Welcome, ${patientName}!`);
    navigate("/portal/dashboard");
  };

  /**
   * The two answers every portal call can now give before anything else.
   *
   * Returns true when it has dealt with the response, so each handler can
   * stop. "incomplete_number" exists because a half-typed number used to
   * come back as "not registered", which sent people to the clinic to check
   * a number that was fine.
   */
  const handledCommonStatus = (data: { status?: string; patients?: Candidate[] }): boolean => {
    if (data?.status === "incomplete_number") {
      toast.error("That number looks incomplete. Please enter all 10 digits.");
      return true;
    }
    if (data?.status === "not_registered") {
      toast.error("Not registered. Please contact the clinic.");
      return true;
    }
    if (data?.status === "choose_patient") {
      setCandidates(data.patients ?? []);
      setStep("choose_patient");
      return true;
    }
    return false;
  };

  const handlePhoneNext = async () => {
    if (!phone.trim()) return toast.error("Please enter your phone number");
    setLoading(true);
    setPatientId(undefined);
    try {
      const { data, error } = await supabase.functions.invoke("portal-auth", {
        body: { action: "check", phone },
      });
      if (error) throw error;
      if (handledCommonStatus(data)) return;
      if (data?.status === "set_pin") setStep("create_pin");
      else if (data?.status === "pin_required") setStep("enter_pin");
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  /**
   * A person picked from a shared number.
   *
   * The same "check" call is made again carrying the id, so the decision of
   * whether they need to create a PIN or enter one is made in exactly one
   * place - and so the server re-validates that the id really is on this
   * number rather than taking the browser's word for it.
   */
  const choosePatient = async (id: string) => {
    setPatientId(id);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("portal-auth", {
        body: { action: "check", phone, patientId: id },
      });
      if (error) throw error;
      if (data?.status === "set_pin") setStep("create_pin");
      else if (data?.status === "pin_required") setStep("enter_pin");
      else toast.error(data?.error || "Could not continue. Please try again.");
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePin = async () => {
    if (!/^\d{4}$/.test(pin)) return toast.error("PIN must be 4 digits");
    if (pin !== confirmPin) return toast.error("PINs do not match");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("portal-auth", {
        body: { action: "set_pin", phone, pin, patientId },
      });
      if (error) throw error;
      if (data?.status === "ok") completeLogin(data.patientId, data.patientName, data.sessionToken);
      else toast.error(data?.error || "Failed to set PIN");
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPin = async () => {
    if (!/^\d{4}$/.test(pin)) return toast.error("Enter your 4-digit PIN");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("portal-auth", {
        body: { action: "verify", phone, pin, patientId },
      });
      if (error) throw error;
      if (data?.status === "ok") {
        completeLogin(data.patientId, data.patientName, data.sessionToken);
      } else if (data?.status === "locked") {
        setLockedUntil(data.lockedUntil);
        toast.error("Too many wrong attempts. Locked for 15 minutes.");
      } else if (data?.status === "wrong_pin") {
        toast.error(`Wrong PIN. ${data.attemptsLeft} attempt${data.attemptsLeft === 1 ? "" : "s"} left.`);
        setPin("");
      } else if (data?.status === "set_pin") {
        setStep("create_pin");
      } else {
        toast.error(data?.error || "Login failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    if (!phone.trim()) return toast.error("Please enter your phone number");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("portal-otp-send", {
        body: { phone, patientId },
      });
      if (error) throw error;
      if (handledCommonStatus(data)) return;
      if (data?.status === "throttled") {
        toast.error(`Please wait ${data.retryAfter}s before requesting another code.`);
        setResendIn(data.retryAfter);
        return;
      }
      toast.success("OTP sent via WhatsApp");
      setResendIn(30);
      setStep("forgot_verify");
    } catch (e: any) {
      toast.error(e?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) return toast.error("Enter the 6-digit OTP");
    if (!/^\d{4}$/.test(newPin)) return toast.error("New PIN must be 4 digits");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("portal-otp-verify", {
        body: { phone, otp, newPin, patientId },
      });
      if (error) throw error;
      if (data?.status === "ok") completeLogin(data.patientId, data.patientName, data.sessionToken);
      else toast.error(data?.error || "Invalid OTP");
    } catch (e: any) {
      toast.error(e?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const lockedRemaining = lockedUntil
    ? Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000))
    : 0;

  const back = (to: Step) => () => {
    setPin(""); setConfirmPin(""); setOtp(""); setNewPin("");
    // Going back to the number clears who was chosen on the old one, or the
    // next number entered would carry the previous family member's id and
    // be rejected by the server as not belonging to it.
    if (to === "phone") { setPatientId(undefined); setCandidates([]); }
    setStep(to);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(174,62%,95%)] via-[hsl(210,20%,98%)] to-[hsl(174,40%,92%)] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={clinicLogo} alt="The Skin Clinic" className="h-16 w-16 mx-auto rounded-2xl object-contain shadow-lg mb-4" />
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            The Skin Clinic
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Access your health records securely
          </p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl border p-6 space-y-5">
          {step === "phone" && (
            <>
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-primary" /> Phone Number
                </Label>
                <Input
                  className="mt-2 h-12 text-base"
                  placeholder="Enter your registered phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  inputMode="tel"
                />
              </div>
              <Button className="w-full h-12 text-base gap-2" onClick={handlePhoneNext} disabled={loading || !phone}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </>
          )}

          {/* One number, several patients - a family. The PIN belongs to the
              person, so the portal has to know which of them is signing in.
              Most numbers reach one patient and never see this step. */}
          {step === "choose_patient" && (
            <>
              <div className="text-center">
                <Users className="h-8 w-8 text-primary mx-auto" />
                <h2 className="text-lg font-semibold mt-2">Who is signing in?</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  This number is registered for more than one person.
                </p>
              </div>
              <div className="space-y-2">
                {candidates.map((c) => (
                  <Button
                    key={c.id}
                    variant="outline"
                    className="w-full h-12 justify-between text-base"
                    disabled={loading}
                    onClick={() => choosePatient(c.id)}
                  >
                    {c.name || "Unnamed patient"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ))}
              </div>
              <Button variant="ghost" className="w-full h-11" onClick={back("phone")}>
                Use a different number
              </Button>
            </>
          )}

          {step === "create_pin" && (
            <>
              <div className="text-center">
                <Lock className="h-8 w-8 text-primary mx-auto" />
                <h2 className="text-lg font-semibold mt-2">Create your 4-digit PIN</h2>
                <p className="text-xs text-muted-foreground mt-1">You'll use this to log in next time.</p>
              </div>
              <div>
                <Label className="text-sm font-medium">New PIN</Label>
                <Input
                  className="mt-2 h-12 text-base text-center tracking-[0.6em] font-mono"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Confirm PIN</Label>
                <Input
                  className="mt-2 h-12 text-base text-center tracking-[0.6em] font-mono"
                  placeholder="••••"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
              <Button className="w-full h-12 text-base gap-2" onClick={handleCreatePin} disabled={loading || pin.length !== 4 || confirmPin.length !== 4}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create PIN & Continue <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <button type="button" onClick={back("phone")} className="text-xs text-muted-foreground hover:underline w-full text-center inline-flex items-center justify-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Use a different number
              </button>
            </>
          )}

          {step === "enter_pin" && (
            <>
              <div className="text-center">
                <Lock className="h-8 w-8 text-primary mx-auto" />
                <h2 className="text-lg font-semibold mt-2">Enter your PIN</h2>
                <p className="text-xs text-muted-foreground mt-1">{phone}</p>
              </div>
              {lockedRemaining > 0 ? (
                <div className="text-center text-sm bg-destructive/10 text-destructive rounded-lg p-3">
                  Locked. Try again in {lockedRemaining} minute{lockedRemaining === 1 ? "" : "s"}.
                </div>
              ) : (
                <Input
                  className="h-12 text-base text-center tracking-[0.6em] font-mono"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                />
              )}
              <Button className="w-full h-12 text-base gap-2" onClick={handleVerifyPin} disabled={loading || pin.length !== 4 || lockedRemaining > 0}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Login <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={back("phone")} className="text-muted-foreground hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Change number
                </button>
                <button type="button" onClick={() => setStep("forgot_request")} className="text-primary font-medium hover:underline inline-flex items-center gap-1">
                  <KeyRound className="h-3 w-3" /> Forgot PIN?
                </button>
              </div>
            </>
          )}

          {step === "forgot_request" && (
            <>
              <div className="text-center">
                <KeyRound className="h-8 w-8 text-primary mx-auto" />
                <h2 className="text-lg font-semibold mt-2">Reset your PIN</h2>
                <p className="text-xs text-muted-foreground mt-1">We'll send a 6-digit code to your registered WhatsApp.</p>
              </div>
              <div>
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-primary" /> Phone Number
                </Label>
                <Input
                  className="mt-2 h-12 text-base"
                  placeholder="Registered phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  inputMode="tel"
                />
              </div>
              <Button className="w-full h-12 text-base gap-2" onClick={sendOtp} disabled={loading || !phone}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send OTP <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <button type="button" onClick={back("enter_pin")} className="text-xs text-muted-foreground hover:underline w-full text-center inline-flex items-center justify-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Back to login
              </button>
            </>
          )}

          {step === "forgot_verify" && (
            <>
              <div className="text-center">
                <KeyRound className="h-8 w-8 text-primary mx-auto" />
                <h2 className="text-lg font-semibold mt-2">Enter OTP & set new PIN</h2>
                <p className="text-xs text-muted-foreground mt-1">OTP sent to your WhatsApp. Expires in 10 minutes.</p>
              </div>
              <div>
                <Label className="text-sm font-medium">6-digit OTP</Label>
                <Input
                  className="mt-2 h-12 text-base text-center tracking-[0.4em] font-mono"
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">New 4-digit PIN</Label>
                <Input
                  className="mt-2 h-12 text-base text-center tracking-[0.6em] font-mono"
                  placeholder="••••"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
              <Button className="w-full h-12 text-base gap-2" onClick={handleVerifyOtp} disabled={loading || otp.length !== 6 || newPin.length !== 4}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Verify & Login <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={back("forgot_request")} className="text-muted-foreground hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
                <button
                  type="button"
                  disabled={resendIn > 0 || loading}
                  onClick={sendOtp}
                  className="text-primary font-medium hover:underline disabled:text-muted-foreground disabled:no-underline"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                </button>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate("/portal")}
          className="mt-3 block w-full text-center text-sm text-primary hover:underline"
        >
          ← Back to Portal
        </button>
      </motion.div>
    </div>
  );
};

export default PortalLogin;
