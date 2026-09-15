import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, Mail, Lock, User, Phone, Loader2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";

const Signup = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);

  const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.firstName) {
      toast.error("Please fill in required fields");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          first_name: form.firstName,
          last_name: form.lastName,
          phone: form.phone,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Account created! You can now sign in.");
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(174,62%,95%)] via-background to-accent flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <Heart className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-display">Create Account</h1>
          <p className="text-muted-foreground text-sm mt-1">Join The Skin Clinic</p>
        </div>

        <form onSubmit={handleSignup} className="bg-card rounded-2xl shadow-xl border p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium flex items-center gap-1"><User className="h-3.5 w-3.5 text-primary" /> First Name *</Label>
              <Input className="mt-1.5 h-11" placeholder="First" value={form.firstName} onChange={e => update("firstName", e.target.value)} />
            </div>
            <div>
              <Label className="text-sm font-medium">Last Name</Label>
              <Input className="mt-1.5 h-11" placeholder="Last" value={form.lastName} onChange={e => update("lastName", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-primary" /> Email *</Label>
            <Input className="mt-1.5 h-11" placeholder="you@example.com" value={form.email} onChange={e => update("email", e.target.value)} type="email" />
          </div>
          <div>
            <Label className="text-sm font-medium flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-primary" /> Phone</Label>
            <Input className="mt-1.5 h-11" placeholder="Phone number" value={form.phone} onChange={e => update("phone", e.target.value)} type="tel" />
          </div>
          <div>
            <Label className="text-sm font-medium flex items-center gap-1"><Lock className="h-3.5 w-3.5 text-primary" /> Password *</Label>
            <Input className="mt-1.5 h-11" placeholder="Min 6 characters" value={form.password} onChange={e => update("password", e.target.value)} type="password" />
          </div>
          <Button className="w-full h-12 text-base gap-2" type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create Account <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">Sign In</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default Signup;
