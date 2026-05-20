import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { companySchema, type CompanyFormValues } from "@/lib/company-schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import { Building2, Pencil, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { CompanyLogoUploader } from "@/components/admin/CompanyLogoUploader";

export function CurrentCompanyProfileCard() {
  const { currentCompanyId, refresh } = useCurrentCompany();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const companyQ = useQuery({
    queryKey: ["settings-current-company", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name, tax_id, email, phone, address, logo_url, status")
        .eq("id", currentCompanyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    mode: "onChange",
    defaultValues: {
      company_name: "", tax_id: "", email: "", phone: "", address: "", logo_url: "",
    },
  });

  useEffect(() => {
    if (companyQ.data) {
      form.reset({
        company_name: companyQ.data.company_name ?? "",
        tax_id: companyQ.data.tax_id ?? "",
        email: companyQ.data.email ?? "",
        phone: companyQ.data.phone ?? "",
        address: companyQ.data.address ?? "",
        logo_url: companyQ.data.logo_url ?? "",
      });
    }
  }, [companyQ.data, form]);

  const logoUrl = form.watch("logo_url") ?? "";

  const m = useMutation({
    mutationFn: async (values: CompanyFormValues) => {
      if (!currentCompanyId) throw new Error("尚未選擇公司");
      // 重複檢查（排除自身）
      const taxId = (values.tax_id ?? "").trim();
      const email = (values.email ?? "").trim().toLowerCase();
      if (taxId || email) {
        let q = supabase.from("companies").select("id, tax_id, email").neq("id", currentCompanyId);
        const ors: string[] = [];
        if (taxId) ors.push(`tax_id.eq.${taxId}`);
        if (email) ors.push(`email.ilike.${email}`);
        if (ors.length) q = q.or(ors.join(","));
        const { data: dup } = await q.limit(5);
        for (const r of dup ?? []) {
          if (taxId && r.tax_id?.trim() === taxId) {
            form.setError("tax_id", { type: "duplicate", message: "此統一編號已被其他公司使用" });
            throw new Error("此統一編號已被其他公司使用");
          }
          if (email && r.email?.trim().toLowerCase() === email) {
            form.setError("email", { type: "duplicate", message: "此 Email 已被其他公司使用" });
            throw new Error("此 Email 已被其他公司使用");
          }
        }
      }

      const { error } = await supabase
        .from("companies")
        .update({
          company_name: values.company_name.trim(),
          tax_id: taxId || null,
          email: email || null,
          phone: (values.phone ?? "").trim() || null,
          address: (values.address ?? "").trim() || null,
          logo_url: (values.logo_url ?? "") || null,
        })
        .eq("id", currentCompanyId);
      if (error) {
        if (error.code === "23505") {
          const msg = (error.message ?? "").toLowerCase();
          if (msg.includes("tax_id")) {
            form.setError("tax_id", { type: "duplicate", message: "此統一編號已被其他公司使用" });
            throw new Error("此統一編號已被其他公司使用");
          }
          if (msg.includes("email")) {
            form.setError("email", { type: "duplicate", message: "此 Email 已被其他公司使用" });
            throw new Error("此 Email 已被其他公司使用");
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("公司資料已更新");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["settings-current-company", currentCompanyId] });
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      refresh();
    },
    onError: (e: any) => toast.error("更新失敗", { description: e?.message ?? "未知錯誤" }),
  });

  if (!currentCompanyId) {
    return (
      <Card className="bg-card/60 backdrop-blur border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> 公司資料
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">尚未選擇公司。</p>
        </CardContent>
      </Card>
    );
  }

  const c = companyQ.data;

  return (
    <Card className="bg-card/60 backdrop-blur border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> 公司資料
        </CardTitle>
        {!editing && c && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> 編輯
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {companyQ.isLoading || !c ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : !editing ? (
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="h-24 w-24 shrink-0 rounded-xl bg-white ring-1 ring-border flex items-center justify-center overflow-hidden">
              {c.logo_url ? (
                <img src={c.logo_url} alt={c.company_name} className="h-full w-full object-contain" />
              ) : (
                <Building2 className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-y-2 gap-x-4 text-sm flex-1">
              <dt className="text-muted-foreground">公司名稱</dt>
              <dd className="font-medium">{c.company_name}</dd>
              <dt className="text-muted-foreground">統一編號</dt>
              <dd>{c.tax_id || "—"}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{c.email || "—"}</dd>
              <dt className="text-muted-foreground">電話</dt>
              <dd>{c.phone || "—"}</dd>
              <dt className="text-muted-foreground">地址</dt>
              <dd className="break-all">{c.address || "—"}</dd>
              <dt className="text-muted-foreground">狀態</dt>
              <dd>{c.status === "active" ? "啟用" : "停用"}</dd>
            </dl>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4">
              <FormField name="logo_url" control={form.control} render={() => (
                <FormItem>
                  <FormLabel>公司 Logo</FormLabel>
                  <FormControl>
                    <CompanyLogoUploader
                      value={logoUrl}
                      onChange={(url) => form.setValue("logo_url", url ?? "", { shouldDirty: true })}
                      disabled={m.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="company_name" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>公司名稱 *</FormLabel>
                  <FormControl><Input {...field} disabled={m.isPending} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField name="tax_id" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>統一編號</FormLabel>
                    <FormControl><Input {...field} disabled={m.isPending} placeholder="8 位數字" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="phone" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>電話</FormLabel>
                    <FormControl><Input {...field} disabled={m.isPending} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField name="email" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" {...field} disabled={m.isPending} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField name="address" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>地址</FormLabel>
                  <FormControl><Input {...field} disabled={m.isPending} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setEditing(false); form.reset(); }} disabled={m.isPending}>
                  <X className="h-4 w-4 mr-1" /> 取消
                </Button>
                <Button type="submit" disabled={m.isPending || !form.formState.isDirty} className="bg-gradient-primary">
                  {m.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  儲存
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
