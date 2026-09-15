import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ShieldCheck, Plus, Save, Search, UserPlus, KeyRound, Trash2, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import CreateUserDialog from "@/components/users/CreateUserDialog";
import EditUserDialog from "@/components/users/EditUserDialog";
import { ThemePicker } from "@/components/theme/ThemePicker";

const ALL_MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "patients", label: "Patients" },
  { key: "appointments", label: "Appointments" },
  { key: "procedures", label: "Procedures" },
  { key: "photos", label: "Photos" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "billing", label: "Billing" },
  { key: "leave", label: "Leave" },
  { key: "assets", label: "Assets" },
  { key: "portal_orders", label: "Portal Orders" },
  { key: "campaigns", label: "Campaigns" },
  { key: "expenses", label: "Expenses" },
  { key: "staff", label: "Staff" },
  { key: "problem_areas", label: "Primary Concern" },
  { key: "reports", label: "Reports" },
  { key: "dashboards", label: "Dashboards" },
  { key: "report_builder", label: "Report Builder" },
  { key: "surveys", label: "Surveys" },
  { key: "services", label: "Services" },
  { key: "vendors", label: "Vendors" },
  { key: "unit_master", label: "Unit Master" },
  { key: "category_master", label: "Category Master" },
  { key: "settings", label: "Settings" },
  { key: "user_management", label: "User Management" },
];

type PermMap = Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }>;

export default function UserManagement() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [dirtyPerms, setDirtyPerms] = useState<PermMap | null>(null);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [createUserOpen, setCreateUserOpen] = useState(false);

  // Reset password state
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [resetPwStaff, setResetPwStaff] = useState<any>(null);
  const [resetPwMode, setResetPwMode] = useState<"auto" | "manual">("auto");
  const [resetPwValue, setResetPwValue] = useState("");
  const [resetPwConfirm, setResetPwConfirm] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteStaff, setDeleteStaff] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<any>(null);

  // Fetch roles
  const { data: roles = [] } = useQuery({
    queryKey: ["user-roles-config"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles_config").select("*").order("created_at");
      return data || [];
    },
  });

  // Fetch staff with role
  const { data: staff = [] } = useQuery({
    queryKey: ["staff-with-roles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name, email, phone, is_active, role_id, auth_user_id, user_roles_config(id, name)")
        .order("first_name");
      return (data || []).map((s: any) => ({
        ...s,
        name: `${s.first_name} ${s.last_name}`.trim(),
        status: s.is_active ? "Active" : "Inactive",
      }));
    },
  });

  // Fetch permissions for selected role
  const { data: permissions = [] } = useQuery({
    queryKey: ["role-permissions", selectedRoleId],
    queryFn: async () => {
      if (!selectedRoleId) return [];
      const { data } = await supabase
        .from("role_module_permissions")
        .select("*")
        .eq("role_id", selectedRoleId);
      return data || [];
    },
    enabled: !!selectedRoleId,
  });

  if (roles.length > 0 && !selectedRoleId) {
    setSelectedRoleId(roles[0].id);
  }

  const permMap: PermMap = dirtyPerms ?? Object.fromEntries(
    ALL_MODULES.map((m) => {
      const p = permissions.find((p: any) => p.module_key === m.key);
      return [m.key, { can_view: p?.can_view ?? false, can_create: p?.can_create ?? false, can_edit: p?.can_edit ?? false, can_delete: p?.can_delete ?? false }];
    })
  );

  const assignRole = useMutation({
    mutationFn: async ({ staffId, roleId }: { staffId: string; roleId: string | null }) => {
      const { error } = await supabase.from("staff").update({ role_id: roleId } as any).eq("id", staffId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-with-roles"] });
      toast({ title: "Role assigned successfully" });
    },
  });

  const saveDataScope = useMutation({
    mutationFn: async ({ roleId, scope }: { roleId: string; scope: "all" | "own" }) => {
      const { error } = await supabase
        .from("user_roles_config")
        .update({ data_scope: scope })
        .eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-roles-config"] });
      toast({ title: "Data access updated" });
    },
    onError: (e: Error) => toast({ title: "Could not update data access", description: e.message, variant: "destructive" }),
  });

  const savePerms = useMutation({
    mutationFn: async () => {
      if (!dirtyPerms || !selectedRoleId) return;
      await supabase.from("role_module_permissions").delete().eq("role_id", selectedRoleId);
      const rows = ALL_MODULES.map((m) => ({
        role_id: selectedRoleId,
        module_key: m.key,
        can_view: dirtyPerms[m.key]?.can_view ?? false,
        can_create: dirtyPerms[m.key]?.can_create ?? false,
        can_edit: dirtyPerms[m.key]?.can_edit ?? false,
        can_delete: dirtyPerms[m.key]?.can_delete ?? false,
      }));
      const { error } = await supabase.from("role_module_permissions").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      setDirtyPerms(null);
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      toast({ title: "Permissions saved" });
    },
  });

  const addRole = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("user_roles_config")
        .insert({ name: newRoleName, description: newRoleDesc || null, is_system: false })
        .select()
        .single();
      if (error) throw error;
      const rows = ALL_MODULES.map((m) => ({
        role_id: data.id,
        module_key: m.key,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
      }));
      await supabase.from("role_module_permissions").insert(rows);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["user-roles-config"] });
      setSelectedRoleId(data.id);
      setAddRoleOpen(false);
      setNewRoleName("");
      setNewRoleDesc("");
      toast({ title: "Role created" });
    },
  });

  const resetPassword = useMutation({
    mutationFn: async () => {
      if (!resetPwStaff) throw new Error("No user selected");
      if (resetPwMode === "manual") {
        if (resetPwValue !== resetPwConfirm) throw new Error("Passwords don't match");
        if (resetPwValue.length < 6) throw new Error("Password must be at least 6 characters");
      }

      // Staff with no login yet (e.g. doctors added to the roster who were
      // never issued an app account) - create one instead of erroring out.
      if (!resetPwStaff.auth_user_id) {
        if (!resetPwStaff.email) {
          throw new Error(`${resetPwStaff.name} has no email on file - add one on the Edit User form first, then create their login.`);
        }
        const { data, error } = await supabase.functions.invoke("create-user-account", {
          body: {
            staff_id: resetPwStaff.id,
            email: resetPwStaff.email,
            full_name: resetPwStaff.name,
            phone: resetPwStaff.phone,
            role_id: resetPwStaff.role_id,
            password: resetPwMode === "manual" ? resetPwValue : undefined,
            force_password_change: true,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-user-account", {
        body: {
          action: "reset_password",
          auth_user_id: resetPwStaff.auth_user_id,
          password: resetPwMode === "manual" ? resetPwValue : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast({ title: resetPwStaff?.auth_user_id ? "Password reset successfully" : "Login account created" });
      queryClient.invalidateQueries({ queryKey: ["staff-with-roles"] });
      setResetPwOpen(false);
      setResetPwStaff(null);
      setResetPwValue("");
      setResetPwConfirm("");
      setResetPwMode("auto");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async () => {
      if (!deleteStaff) throw new Error("No user selected");
      const { data, error } = await supabase.functions.invoke("create-user-account", {
        body: {
          action: "delete_user",
          staff_id: deleteStaff.id,
          auth_user_id: deleteStaff.auth_user_id || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-with-roles"] });
      toast({ title: "User deleted successfully" });
      setDeleteConfirmOpen(false);
      setDeleteStaff(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const togglePerm = (moduleKey: string, field: "can_view" | "can_create" | "can_edit" | "can_delete" | "all") => {
    const current = dirtyPerms ?? { ...permMap };
    const mod = current[moduleKey] ?? { can_view: false, can_create: false, can_edit: false, can_delete: false };
    if (field === "all") {
      const allChecked = mod.can_view && mod.can_create && mod.can_edit && mod.can_delete;
      const val = !allChecked;
      setDirtyPerms({ ...current, [moduleKey]: { can_view: val, can_create: val, can_edit: val, can_delete: val } });
      return;
    }
    const updated = { ...mod, [field]: !mod[field] };
    if (field === "can_view" && !updated.can_view) {
      updated.can_create = false;
      updated.can_edit = false;
      updated.can_delete = false;
    }
    if ((field === "can_create" || field === "can_edit" || field === "can_delete") && updated[field]) {
      updated.can_view = true;
    }
    setDirtyPerms({ ...current, [moduleKey]: updated });
  };

  const filteredStaff = staff.filter((s: any) =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedRole = roles.find((r: any) => r.id === selectedRoleId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold font-display">User Management</h1>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Staff Users</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search staff..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Button size="sm" onClick={() => setCreateUserOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-1" />Create User
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Role</TableHead>
                    {isAdmin && <TableHead className="w-20">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStaff.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.email || "—"}</TableCell>
                      <TableCell>{s.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "Active" ? "default" : "secondary"}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={s.role_id || "none"}
                          onValueChange={(v) =>
                            assignRole.mutate({ staffId: s.id, roleId: v === "none" ? null : v })
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Assign role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Role</SelectItem>
                            {roles.map((r: any) => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit User"
                            onClick={() => {
                              setEditStaff(s);
                              setEditOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reset Password"
                            onClick={() => {
                              setResetPwStaff(s);
                              setResetPwMode("auto");
                              setResetPwValue("");
                              setResetPwConfirm("");
                              setResetPwOpen(true);
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete User"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeleteStaff(s);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {filteredStaff.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                        No staff found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Select value={selectedRoleId} onValueChange={(v) => { setSelectedRoleId(v); setDirtyPerms(null); }}>
                    <SelectTrigger className="w-52">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedRole?.is_system && (
                    <Badge variant="outline" className="text-xs">System Role</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" />Add Role</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add New Role</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label>Role Name</Label>
                          <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Nurse" />
                        </div>
                        <div>
                          <Label>Description</Label>
                          <Textarea value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} placeholder="Optional description" />
                        </div>
                        <Button onClick={() => addRole.mutate()} disabled={!newRoleName.trim()}>
                          Create Role
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  {dirtyPerms && (
                    <Button size="sm" onClick={() => savePerms.mutate()}>
                      <Save className="h-4 w-4 mr-1" />Save Permissions
                    </Button>
                  )}
                </div>
              </div>
              {selectedRole?.description && (
                <p className="text-sm text-muted-foreground mt-1">{selectedRole.description}</p>
              )}
            </CardHeader>
            <CardContent>
              {selectedRole?.name?.toLowerCase() === "admin" && (
                <div className="mb-4 p-3 bg-muted rounded-md text-sm text-muted-foreground">
                  System Administrator has all permissions granted automatically and cannot be modified.
                </div>
              )}
              {selectedRole && (
                <div className="mb-4 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <Label className="text-sm font-medium">Data access</Label>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                        The permissions below decide which modules this role can open. This decides
                        which records they see inside them. Patients are always visible to everyone.
                      </p>
                    </div>
                    <Select
                      value={selectedRole.data_scope === "own" ? "own" : "all"}
                      onValueChange={(v) => saveDataScope.mutate({ roleId: selectedRole.id, scope: v as "all" | "own" })}
                      disabled={selectedRole?.name?.toLowerCase() === "admin" || saveDataScope.isPending}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All records</SelectItem>
                        <SelectItem value="own">Own records only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedRole.data_scope === "own" && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Sees only the appointments, procedures and invoices they performed or assisted
                      on - including in Reports and Dashboards.
                    </p>
                  )}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead className="text-center w-20">View</TableHead>
                    <TableHead className="text-center w-20">Create</TableHead>
                    <TableHead className="text-center w-20">Edit</TableHead>
                    <TableHead className="text-center w-20">Delete</TableHead>
                    <TableHead className="text-center w-20">All</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_MODULES.map((m) => {
                    const isAdminRole = selectedRole?.name?.toLowerCase() === "admin";
                    const mod = permMap[m.key] ?? { can_view: false, can_create: false, can_edit: false, can_delete: false };
                    const allChecked = mod.can_view && mod.can_create && mod.can_edit && mod.can_delete;
                    return (
                      <TableRow key={m.key}>
                        <TableCell>{m.label}</TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={isAdminRole || mod.can_view} disabled={isAdminRole} onCheckedChange={() => togglePerm(m.key, "can_view")} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={isAdminRole || mod.can_create} disabled={isAdminRole} onCheckedChange={() => togglePerm(m.key, "can_create")} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={isAdminRole || mod.can_edit} disabled={isAdminRole} onCheckedChange={() => togglePerm(m.key, "can_edit")} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={isAdminRole || mod.can_delete} disabled={isAdminRole} onCheckedChange={() => togglePerm(m.key, "can_delete")} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={isAdminRole || allChecked} disabled={isAdminRole} onCheckedChange={() => togglePerm(m.key, "all")} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <ThemePicker />
        </TabsContent>
      </Tabs>

      <CreateUserDialog
        open={createUserOpen}
        onOpenChange={setCreateUserOpen}
        staffList={staff}
        roles={roles}
      />

      <EditUserDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        staff={editStaff}
        roles={roles}
      />

      {/* Reset Password Dialog */}
      <Dialog open={resetPwOpen} onOpenChange={setResetPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resetPwStaff?.auth_user_id ? "Reset Password for " : "Create Login for "}{resetPwStaff?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!resetPwStaff?.auth_user_id && (
              <p className="text-sm text-muted-foreground">
                {resetPwStaff?.name} doesn't have an app login yet{resetPwStaff?.email ? ` - one will be created using ${resetPwStaff.email}.` : "."}
              </p>
            )}
            <RadioGroup value={resetPwMode} onValueChange={(v) => setResetPwMode(v as "auto" | "manual")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="auto" id="reset-auto" />
                <Label htmlFor="reset-auto">Auto-generate {resetPwStaff?.auth_user_id ? "new " : ""}password</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="reset-manual" />
                <Label htmlFor="reset-manual">Set password manually</Label>
              </div>
            </RadioGroup>

            {resetPwMode === "manual" && (
              <div className="space-y-3">
                <div>
                  <Label>New Password</Label>
                  <Input type="password" value={resetPwValue} onChange={(e) => setResetPwValue(e.target.value)} />
                </div>
                <div>
                  <Label>Confirm Password</Label>
                  <Input type="password" value={resetPwConfirm} onChange={(e) => setResetPwConfirm(e.target.value)} />
                </div>
              </div>
            )}

            <Button
              onClick={() => resetPassword.mutate()}
              disabled={resetPassword.isPending}
              className="w-full"
            >
              {resetPassword.isPending
                ? (resetPwStaff?.auth_user_id ? "Resetting..." : "Creating...")
                : (resetPwStaff?.auth_user_id ? "Reset Password" : "Create Login")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteStaff?.name}</strong>? This will remove their staff record and authentication account permanently. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUser.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
