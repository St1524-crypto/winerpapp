import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        .select("id, company_name, tax_id, email, phone, status, created_at")
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
        <CreateCompanyDialog />
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
    </div>
  );
}

// =================== Create Company ===================
function CreateCompanyDialog() {
  const qc = useQueryClient();
  const { refresh } = useCurrentCompany();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ company_name: "", tax_id: "", email: "", phone: "", address: "" });

  const m = useMutation({
    mutationFn: async () => {
      if (!form.company_name.trim()) throw new Error("請輸入公司名稱");
      const { data, error } = await supabase
        .from("companies")
        .insert({
          company_name: form.company_name.trim(),
          tax_id: form.tax_id || null,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          status: "active",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("公司已建立");
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      refresh();
      setOpen(false);
      setForm({ company_name: "", tax_id: "", email: "", phone: "", address: "" });
    },
    onError: (e: any) => toast.error("建立失敗", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-primary gap-2">
          <Plus className="h-4 w-4" /> 新增公司
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新增公司</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>公司名稱 *</Label>
            <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>統一編號</Label>
              <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
            </div>
            <div>
              <Label>電話</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>地址</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending} className="bg-gradient-primary">
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            建立
          </Button>
        </DialogFooter>
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
