import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, Lock, Save } from "lucide-react";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { useQuery } from "@tanstack/react-query";
import { StaffPhotoCard } from "@/components/staff/StaffPhotoCard";

export default function Profile() {
  const { staffProfile, user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // Read from the staff row rather than widening useAuth's StaffProfile:
  // every screen in the app depends on that hook, and this is the only page
  // that needs the photo.
  const { data: photoUrl = null } = useQuery({
    queryKey: ["staff", "photo", staffProfile?.id],
    enabled: !!staffProfile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff").select("photo_url").eq("id", staffProfile!.id).maybeSingle();
      if (error) throw error;
      return data?.photo_url ?? null;
    },
  });

  useEffect(() => {
    if (staffProfile) {
      setFirstName(staffProfile.firstName);
      setLastName(staffProfile.lastName);
      setEmail(staffProfile.email || "");
      setPhone(staffProfile.phone || "");
    } else if (user) {
      setEmail(user.email || "");
      const meta = user.user_metadata || {};
      setFirstName(meta.first_name || "");
      setLastName(meta.last_name || "");
    }
  }, [staffProfile, user]);

  const handleSaveProfile = async () => {
    if (!staffProfile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("staff")
        .update({ first_name: firstName, last_name: lastName, email, phone } as any)
        .eq("id", staffProfile.id);
      if (error) throw error;
      toast({ title: "Profile updated successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <User className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold font-display">My Profile</h1>
        {staffProfile?.roleName && (
          <Badge variant="secondary">{staffProfile.roleName}</Badge>
        )}
      </div>

      {staffProfile && (
        <StaffPhotoCard
          staffId={staffProfile.id}
          photoUrl={photoUrl}
          name={`${staffProfile.firstName} ${staffProfile.lastName}`.trim()}
        />
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Personal Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Button onClick={handleSaveProfile} disabled={saving || !staffProfile}>
            <Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Lock className="h-4 w-4" />Change Password</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <Label>Confirm New Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPw || !newPassword}>
            {changingPw ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>

      <ThemePicker />
    </div>
  );
}
