import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { companySchema, type CompanyFormValues } from "@/lib/company-schema";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Loader2, Users, Trash2, UserPlus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { CompanyLogoUploader } from "@/components/admin/CompanyLogoUploader";

export const Route = createFileRoute("/_authenticated/admin/companies")({
  head: () => ({ meta: [{ title: "公司管理 — 源倍力 ERP" }] }),
  component: AdminCompaniesPage,
});

function AdminCompaniesPage() {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const [memberDialogCompany, setMemberDialogCompany] = useState<{ id: string; name: string } | null>(null);
  const [editCompany, setEditCompany] = useState<any | null>(null);

  const companiesQ = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name, tax_id, email, phone, address, status, logo_url, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin,
  });

  const memberCountQ = useQuery({
    queryKey: ["admin-companies-member-count"],
    queryFn: async () => {
      const { data } = await supabase.from("company_members").select("company_id");
      const map: Record<string, number> = {};
      (data ?? []).forEach((r) => { map[r.company_id] = (map[r.company_id] ?? 0) + 1; });
      return map;
    },
    enabled: isSuperAdmin,
  });

  if (!isSuperAdmin) return <ForbiddenScreen requiredRoles={["super_admin"]} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            公司管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            建立租戶公司、指派成員。每家公司的業務資料相互隔離。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/companies/new"><Plus className="h-4 w-4 mr-1" />開啟新增頁</Link>
          </Button>
          <CreateCompanyDialog />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">公司列表</CardTitle>
        </CardHeader>
        <CardContent>
          {companiesQ.isLoading ? (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : !companiesQ.data?.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">尚無公司</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Logo</TableHead>
                  <TableHead>公司名稱</TableHead>
                  <TableHead>統編</TableHead>
                  <TableHead>聯絡</TableHead>
                  <TableHead>成員數</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companiesQ.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="h-10 w-10 rounded-md bg-white ring-1 ring-border flex items-center justify-center overflow-hidden">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt={c.company_name} className="h-full w-full object-contain" />
                        ) : (
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{c.company_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.tax_id ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <div>{c.email ?? "—"}</div>
                      <div className="text-muted-foreground">{c.phone ?? ""}</div>
                    </TableCell>
                    <TableCell>{memberCountQ.data?.[c.id] ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        c.status === "active"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-muted text-muted-foreground"
                      }>
                        {c.status === "active" ? "啟用" : c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setEditCompany(c)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" /> 編輯
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setMemberDialogCompany({ id: c.id, name: c.company_name })}
                      >
                        <Users className="h-3.5 w-3.5 mr-1" /> 成員
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {memberDialogCompany && (
        <CompanyMembersDialog
          company={memberDialogCompany}
          onClose={() => setMemberDialogCompany(null)}
        />
      )}

      {editCompany && (
        <EditCompanyDialog
          company={editCompany}
          onClose={() => setEditCompany(null)}
        />
      )}
    </div>
  );
}

// =================== Create Company ===================
function CreateCompanyDialog() {
  const qc = useQueryClient();
  const { user, refreshRoles } = useAuth();
  const { refresh, setCurrent } = useCurrentCompany();
  const [open, setOpen] = useState(false);


  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    mode: "onChange",
    defaultValues: {
      company_name: "",
      tax_id: "",
      email: "",
      phone: "",
      address: "",
      logo_url: "",
    },
  });

  const logoUrl = form.watch("logo_url") ?? "";

  const m = useMutation({
    mutationFn: async (values: CompanyFormValues) => {
      const { data, error } = await supabase
        .from("companies")
        .insert({
          company_name: values.company_name,
          tax_id: values.tax_id || null,
          email: values.email || null,
          phone: values.phone || null,
          address: values.address || null,
          logo_url: values.logo_url || null,
          status: "active",
        })
        .select()
        .single();
      if (error) throw new Error(`公司建立失敗：${error.message}（${error.code || "unknown"}）`);

      // Auto-add current user as admin member
      if (user) {
        const { error: memErr } = await supabase
          .from("company_members")
          .insert({ company_id: data.id, user_id: user.id, role: "admin" });
        if (memErr && !memErr.message.toLowerCase().includes("duplicate")) {
          throw new Error(`成員加入失敗：${memErr.message}（${memErr.code || "unknown"}）`);
        }
      }
      return data;
    },
    onSuccess: async (data) => {
      await refresh();
      if (data?.id) {
        try { await setCurrent(data.id); } catch {}
      }
      try { await refreshRoles(); } catch {}
      await qc.invalidateQueries({ queryKey: ["admin-companies"] });
      await qc.invalidateQueries({ queryKey: ["admin-companies-member-count"] });
      await qc.invalidateQueries();
      toast.success(`已建立並切換至「${data.company_name}」`);
      setOpen(false);
      form.reset();
    },

    onError: (e: any) => {
      toast.error("建立失敗", { description: e?.message ?? "發生未知錯誤" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) form.reset(); setOpen(v); }}>
      <DialogTrigger asChild>
        <Button
          size="lg"
          className="bg-gradient-primary gap-2 shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] transition-all font-semibold ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
        >
          <Plus className="h-5 w-5" /> 新增公司
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新增公司</DialogTitle></DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(
              (v) => m.mutate(v),
              (errors) => {
                const first = Object.values(errors)[0] as any;
                toast.error("表單驗證失敗", {
                  description: first?.message ?? "請檢查欄位內容",
                });
              },
            )}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>公司名稱 <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tax_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>統一編號</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={8} inputMode="numeric" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>電話</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={30} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>地址</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setOpen(false); form.reset(); }}>取消</Button>
              <Button type="submit" disabled={m.isPending} className="bg-gradient-primary">
                {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                建立
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// =================== Members Dialog ===================
function CompanyMembersDialog({
  company, onClose,
}: { company: { id: string; name: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");

  const membersQ = useQuery({
    queryKey: ["company-members", company.id],
    queryFn: async () => {
      const { data: mems, error } = await supabase
        .from("company_members")
        .select("id, user_id, role, created_at")
        .eq("company_id", company.id);
      if (error) throw error;
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return (mems ?? []).map((m) => ({
        ...m,
        email: map.get(m.user_id)?.email ?? "—",
        name: map.get(m.user_id)?.name ?? "—",
      }));
    },
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const e = email.trim().toLowerCase();
      if (!e) throw new Error("請輸入 Email");
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", e)
        .maybeSingle();
      if (!prof) throw new Error("找不到此 Email 的使用者（需先註冊）");
      const { error } = await supabase
        .from("company_members")
        .insert({ company_id: company.id, user_id: prof.id, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("已加入公司");
      qc.invalidateQueries({ queryKey: ["company-members", company.id] });
      qc.invalidateQueries({ queryKey: ["admin-companies-member-count"] });
      setEmail("");
    },
    onError: (e: any) => toast.error("加入失敗", { description: e.message }),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("已移除");
      qc.invalidateQueries({ queryKey: ["company-members", company.id] });
      qc.invalidateQueries({ queryKey: ["admin-companies-member-count"] });
    },
    onError: (e: any) => toast.error("移除失敗", { description: e.message }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {company.name} — 成員
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-2 p-3 rounded-lg bg-muted/30 border">
          <div className="flex-1">
            <Label className="text-xs">使用者 Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="w-32">
            <Label className="text-xs">角色</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">管理員</SelectItem>
                <SelectItem value="member">成員</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => addMember.mutate()}
            disabled={addMember.isPending}
            className="bg-gradient-primary gap-2"
          >
            {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            加入
          </Button>
        </div>

        <div className="max-h-[400px] overflow-auto">
          {membersQ.isLoading ? (
            <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : !membersQ.data?.length ? (
            <div className="py-8 text-center text-sm text-muted-foreground">尚無成員</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membersQ.data.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{m.name}</TableCell>
                    <TableCell className="text-xs">{m.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.role === "admin" ? "管理員" : "成員"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="ghost"
                        className="text-destructive"
                        onClick={() => removeMember.mutate(m.id)}
                        disabled={removeMember.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =================== Edit Company ===================
function EditCompanyDialog({
  company, onClose,
}: { company: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { refresh } = useCurrentCompany();
  const [status, setStatus] = useState<string>(company.status ?? "active");

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    mode: "onChange",
    defaultValues: {
      company_name: company.company_name ?? "",
      tax_id: company.tax_id ?? "",
      email: company.email ?? "",
      phone: company.phone ?? "",
      address: company.address ?? "",
    },
  });

  const m = useMutation({
    mutationFn: async (values: CompanyFormValues) => {
      const patch = {
        company_name: values.company_name.trim(),
        tax_id: values.tax_id || null,
        email: values.email || null,
        phone: values.phone || null,
        address: values.address || null,
        status,
      };
      const { error } = await supabase
        .from("companies")
        .update(patch)
        .eq("id", company.id);
      if (error) throw new Error(`更新失敗：${error.message}（${error.code || "unknown"}）`);

      // Audit log（失敗不阻擋更新）
      try {
        const before: Record<string, any> = {
          company_name: company.company_name,
          tax_id: company.tax_id,
          email: company.email,
          phone: company.phone,
          address: company.address,
          status: company.status,
        };
        const changed: Record<string, { from: any; to: any }> = {};
        for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
          if (before[k] !== (patch as any)[k]) {
            changed[k] = { from: before[k] ?? null, to: (patch as any)[k] };
          }
        }
        if (user && Object.keys(changed).length > 0) {
          await supabase.from("audit_logs").insert({
            user_id: user.id,
            action: "company.update",
            entity: "companies",
            entity_id: company.id,
            metadata: {
              company_name: patch.company_name,
              changed,
              updated_at: new Date().toISOString(),
            },
          });
        }
      } catch (e) {
        console.warn("[edit-company] audit log failed:", e);
      }
    },
    onSuccess: async () => {
      toast.success("已更新公司資料");
      await qc.invalidateQueries({ queryKey: ["admin-companies"] });
      await refresh();
      onClose();
    },
    onError: (e: any) => toast.error("更新失敗", { description: e?.message ?? "發生未知錯誤" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>編輯公司</DialogTitle></DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(
              (v) => m.mutate(v),
              (errors) => {
                const first = Object.values(errors)[0] as any;
                toast.error("表單驗證失敗", {
                  description: first?.message ?? "請檢查欄位內容",
                });
              },
            )}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>公司名稱 <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tax_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>統一編號</FormLabel>
                    <FormControl><Input {...field} maxLength={8} inputMode="numeric" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>電話</FormLabel>
                    <FormControl><Input {...field} maxLength={30} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input {...field} type="email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>地址</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <Label>狀態</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">啟用</SelectItem>
                  <SelectItem value="inactive">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="submit" disabled={m.isPending} className="bg-gradient-primary">
                {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                儲存
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
