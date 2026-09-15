import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import skinClinicLogo from "@/assets/skin-clinic-logo.png";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Welcome back!");
      navigate("/");
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
          <img src={skinClinicLogo} alt="The Skin Clinic" className="h-[70px] w-auto mb-4 object-contain mx-auto" style={{ marginTop: 24, marginBottom: 16 }} />
          <h1 className="text-2xl font-bold text-foreground font-display">The Skin Clinic</h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="bg-card rounded-2xl shadow-xl border p-6 space-y-4">
          <div>
            <Label className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-primary" /> Email
            </Label>
            <Input className="mt-2 h-12" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <Label className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-primary" /> Password
            </Label>
            <Input className="mt-2 h-12" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} type="password" />
          </div>
          <Button className="w-full h-12 text-base gap-2" type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign In <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary font-medium hover:underline">Sign Up</Link>
        </p>
        <p className="text-center text-xs text-muted-foreground mt-2">
          <Link to="/shop" className="hover:underline">Continue browsing as guest →</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
