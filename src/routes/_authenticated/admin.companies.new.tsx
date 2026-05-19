import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
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
import { companySchema, type CompanyFormValues } from "@/lib/company-schema";
import { Building2, Plus, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";

export const Route = createFileRoute("/_authenticated/admin/companies/new")({
  head: () => ({ meta: [{ title: "新增公司 — 源倍力 ERP" }] }),
  component: NewCompanyPage,
});

function NewCompanyPage() {
  const { roles, user, refreshRoles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { refresh, setCurrent } = useCurrentCompany();


  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    mode: "onChange",
    defaultValues: {
      company_name: "",
      tax_id: "",
      email: "",
      phone: "",
      address: "",
    },
  });

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
      // 1) 重新載入公司清單，確保新公司在 options 內
      await refresh();
      // 2) 切換到新公司（會寫入 profiles.current_company_id 並 invalidate 所有 query）
      if (data?.id) {
        try { await setCurrent(data.id); } catch {}
      }
      // 3) 同步重新載入使用者角色，讓側邊選單即時反映權限
      try { await refreshRoles(); } catch {}
      // 4) 顯式重新整理本頁所需的 query
      await qc.invalidateQueries({ queryKey: ["admin-companies"] });
      await qc.invalidateQueries({ queryKey: ["admin-companies-member-count"] });
      // 5) 全域 invalidate 確保所有頁面資料以新公司為準
      await qc.invalidateQueries();
      toast.success(`已建立並切換至「${data.company_name}」`);
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
          <Form {...form}>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((values) => m.mutate(values))}
            >
              <FormField
                control={form.control}
                name="company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>公司名稱 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        autoFocus
                        placeholder="例：源倍力科技股份有限公司"
                        {...field}
                      />
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
                        <Input
                          placeholder="例：12345678"
                          maxLength={8}
                          inputMode="numeric"
                          {...field}
                        />
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
                        <Input
                          placeholder="例：02-2345-6789"
                          maxLength={30}
                          {...field}
                        />
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
                      <Input
                        placeholder="例：contact@company.com"
                        type="email"
                        {...field}
                      />
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
                      <Input
                        placeholder="例：台北市信義區..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
