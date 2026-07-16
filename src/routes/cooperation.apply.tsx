import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { submitCooperationApplication } from "@/lib/cooperation.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Building2, Users, Crown, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/cooperation/apply")({
  component: CooperationApplyPage,
  head: () => ({
    meta: [
      { title: "與源晶生技合作 — 合作申請" },
      { name: "description", content: "選擇適合您的合作方式：經銷商、個人代銷、VIP會員申請。" },
      { property: "og:title", content: "與源晶生技合作" },
      { property: "og:description", content: "選擇適合您的合作方式，讓我們協助您建立健康事業。" },
    ],
  }),
});

type AppType = "dealer" | "reseller" | "vip";

const SALES_PLATFORMS = ["Facebook", "Instagram", "TikTok", "YouTube", "LINE社群", "蝦皮", "其他"];
const VIP_TOPICS = ["VIP會員", "個人品牌頁", "團購", "批發", "產品體驗"];

function CooperationApplyPage() {
  const [type, setType] = useState<AppType | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-10 md:py-16">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="pt-10 pb-8 space-y-4">
            <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">申請已送出</h1>
            <p className="text-muted-foreground">源晶團隊將儘快與您聯繫。</p>
            <Button asChild variant="outline" size="lg" className="mt-4 w-full sm:w-auto">
              <Link to="/shop">返回首頁</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-16 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="text-center mb-6 md:mb-10">
        <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-3">與源晶生技合作</h1>
        <p className="text-muted-foreground text-sm md:text-lg px-2">
          選擇適合您的合作方式，讓我們協助您建立健康事業。
        </p>
      </header>

      {!type && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <TypeCard
            icon={Building2}
            title="經銷商合作"
            desc="適合有公司、商號、統編的合作夥伴"
            onClick={() => setType("dealer")}
          />
          <TypeCard
            icon={Users}
            title="個人代銷合作"
            desc="適合個人、團購主、社群經營者、直播主"
            onClick={() => setType("reseller")}
          />
          <TypeCard
            icon={Crown}
            title="VIP會員申請"
            desc="適合想成為VIP、建立個人品牌頁的夥伴"
            onClick={() => setType("vip")}
          />
        </div>
      )}

      {type && (
        <ApplicationForm
          type={type}
          onBack={() => setType(null)}
          onDone={() => setSubmitted(true)}
        />
      )}
    </div>
  );
}

function TypeCard({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: any;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left group border rounded-2xl p-5 md:p-6 hover:border-primary hover:shadow-lg active:scale-[0.98] transition-all bg-card touch-manipulation flex md:block items-center gap-4"
    >
      <Icon className="w-10 h-10 md:w-10 md:h-10 text-primary shrink-0 md:mb-4" />
      <div className="flex-1 min-w-0">
        <h3 className="text-lg md:text-xl font-semibold mb-1 md:mb-2 group-hover:text-primary">{title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">{desc}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 md:hidden" />
    </button>
  );
}

function ApplicationForm({
  type,
  onBack,
  onDone,
}: {
  type: AppType;
  onBack: () => void;
  onDone: () => void;
}) {
  const submit = useServerFn(submitCooperationApplication);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({
    application_type: type,
    sales_channels: [] as string[],
    interested_topics: [] as string[],
    has_referrer: false,
    website_url: "", // honeypot
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const toggleArr = (k: string, v: string) =>
    setForm((f) => {
      const arr: string[] = f[k] ?? [];
      return { ...f, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] };
    });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // basic validation
    const nameOk =
      type === "dealer"
        ? form.company_name && form.contact_name
        : form.contact_name;
    if (!nameOk) return toast.error("請填寫姓名 / 聯絡人");
    if (!form.phone) return toast.error("請填寫聯絡電話");
    if (!form.email) return toast.error("請填寫 Email");

    setLoading(true);
    try {
      await submit({ data: { ...form, application_type: type } });
      onDone();
    } catch (err: any) {
      toast.error(err?.message || "送出失敗");
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<AppType, string> = {
    dealer: "經銷商申請",
    reseller: "個人代銷申請",
    vip: "VIP會員申請",
  };

  return (
    <Card className="max-w-3xl mx-auto border-0 shadow-none sm:border sm:shadow-sm bg-transparent sm:bg-card">
      <CardHeader className="px-0 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 h-9 px-2 gap-1 text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
            重新選擇
          </Button>
          <CardTitle className="text-lg md:text-xl">{titles[type]}</CardTitle>
          <span className="w-16" aria-hidden />
        </div>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-4 pb-24 md:pb-4">
          {/* honeypot */}
          <input
            type="text"
            name="website_url"
            value={form.website_url}
            onChange={(e) => set("website_url", e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            style={{ position: "absolute", left: "-9999px", opacity: 0 }}
            aria-hidden="true"
          />

          {type === "dealer" && (
            <>
              <Field label="公司名稱" required>
                <Input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} />
              </Field>
              <Field label="統一編號">
                <Input value={form.tax_id ?? ""} onChange={(e) => set("tax_id", e.target.value)} />
              </Field>
              <Field label="負責人姓名">
                <Input value={form.owner_name ?? ""} onChange={(e) => set("owner_name", e.target.value)} />
              </Field>
              <Field label="聯絡人姓名" required>
                <Input value={form.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
              </Field>
            </>
          )}

          {(type === "reseller" || type === "vip") && (
            <Field label="姓名" required>
              <Input value={form.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
            </Field>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="聯絡電話" required>
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>

          {(type === "reseller" || type === "vip") && (
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="LINE ID">
                <Input value={form.line_id ?? ""} onChange={(e) => set("line_id", e.target.value)} />
              </Field>
              <Field label="所在縣市">
                <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
              </Field>
            </div>
          )}

          {type === "dealer" && (
            <>
              <Field label="公司地址">
                <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
              </Field>
              <Field label="目前銷售通路">
                <Input value={form.audience_size ?? ""} onChange={(e) => set("audience_size", e.target.value)} />
              </Field>
              <Field label="想合作產品">
                <Textarea value={form.interested_products ?? ""} onChange={(e) => set("interested_products", e.target.value)} />
              </Field>
              <Field label="預估月銷售量">
                <Input value={form.expected_monthly_volume ?? ""} onChange={(e) => set("expected_monthly_volume", e.target.value)} />
              </Field>
            </>
          )}

          {type === "reseller" && (
            <>
              <Field label="銷售平台">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {SALES_PLATFORMS.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.sales_channels?.includes(p)}
                        onCheckedChange={() => toggleArr("sales_channels", p)}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="平台連結">
                <Input value={form.sales_platform_url ?? ""} onChange={(e) => set("sales_platform_url", e.target.value)} />
              </Field>
              <Field label="目前粉絲數或社群人數">
                <Input value={form.audience_size ?? ""} onChange={(e) => set("audience_size", e.target.value)} />
              </Field>
              <Field label="想代銷產品">
                <Textarea value={form.interested_products ?? ""} onChange={(e) => set("interested_products", e.target.value)} />
              </Field>
            </>
          )}

          {type === "vip" && (
            <>
              <Field label="是否已有推薦人">
                <RadioGroup
                  value={form.has_referrer ? "yes" : "no"}
                  onValueChange={(v) => set("has_referrer", v === "yes")}
                  className="flex gap-6"
                >
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="yes" /> 有
                  </label>
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="no" /> 無
                  </label>
                </RadioGroup>
              </Field>
              {form.has_referrer && (
                <Field label="推薦人姓名或推薦碼">
                  <Input value={form.referrer_info ?? ""} onChange={(e) => set("referrer_info", e.target.value)} />
                </Field>
              )}
              <Field label="想了解項目">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {VIP_TOPICS.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.interested_topics?.includes(p)}
                        onCheckedChange={() => toggleArr("interested_topics", p)}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </Field>
            </>
          )}

          <Field label="備註">
            <Textarea value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} rows={4} />
          </Field>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading} size="lg">
              {loading ? "送出中…" : "送出申請"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}
