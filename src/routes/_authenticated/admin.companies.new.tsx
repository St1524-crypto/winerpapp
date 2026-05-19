import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";

export const Route = createFileRoute("/_authenticated/admin/companies/new")({
  head: () => ({ meta: [{ title: "新增公司 — 源倍力 ERP" }] }),
  component: NewCompanyPage,
});

function NewCompanyPage() {
  const { roles, user } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { refresh, setCurrent } = useCurrentCompany();
  const [form, setForm] = useState({
    company_name: "",
    tax_id: "",
    email: "",
    phone: "",
    address: "",
  });

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
      if (error) throw new Error(`公司建立失敗：${error.message}（${error.code || "unknown"}）`);

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
      toast.success("公司已建立，已切換至此公司");
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-companies-member-count"] });
      await refresh();
      if (data?.id) {
        try { await setCurrent(data.id); } catch {}
      }
      navigate({ to: "/admin/companies" });
    },
    onError: (e: any) => {
      toast.error("建立失敗", { description: e?.message ?? "發生未知錯誤" });
    },
  });

  if (!isSuperAdmin) return <ForbiddenScreen requiredRoles={["super_admin"]} />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            新增公司
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            建立新的租戶公司，建立後會自動將您加入為管理員並切換。
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/admin/companies"><ArrowLeft className="h-4 w-4 mr-1" />返回列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">公司資料</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
          >
            <div>
              <Label>公司名稱 *</Label>
              <Input
                autoFocus
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="例：源倍力科技股份有限公司"
              />
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

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/admin/companies" })}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={m.isPending}
                className="bg-gradient-primary gap-2 shadow-lg shadow-primary/30"
              >
                {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                建立公司
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
