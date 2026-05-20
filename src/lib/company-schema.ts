import { z } from "zod";

export const INVOICE_TITLE_MODES = ["company", "custom", "buyer"] as const;
export const INVOICE_TAX_ID_FORMATS = ["plain", "prefixed", "bracketed", "hidden"] as const;

export type InvoiceTitleMode = (typeof INVOICE_TITLE_MODES)[number];
export type InvoiceTaxIdFormat = (typeof INVOICE_TAX_ID_FORMATS)[number];

export const INVOICE_TITLE_MODE_LABEL: Record<InvoiceTitleMode, string> = {
  company: "使用公司名稱",
  custom: "自訂抬頭",
  buyer: "依買方資料",
};

export const INVOICE_TAX_ID_FORMAT_LABEL: Record<InvoiceTaxIdFormat, string> = {
  plain: "純數字（12345678）",
  prefixed: "前綴（統一編號：12345678）",
  bracketed: "括號（(統編 12345678)）",
  hidden: "不顯示",
};

export function formatInvoiceTaxId(taxId: string | null | undefined, fmt: InvoiceTaxIdFormat): string {
  const t = (taxId ?? "").trim();
  if (!t || fmt === "hidden") return "";
  if (fmt === "plain") return t;
  if (fmt === "bracketed") return `(統編 ${t})`;
  return `統一編號：${t}`;
}

export function resolveInvoiceTitle(
  company: { company_name: string; invoice_title?: string | null; invoice_title_mode?: InvoiceTitleMode | null },
  buyerName?: string | null,
): string {
  const mode = company.invoice_title_mode ?? "company";
  if (mode === "custom") return (company.invoice_title ?? "").trim() || company.company_name;
  if (mode === "buyer") return (buyerName ?? "").trim() || company.company_name;
  return company.company_name;
}

export const companySchema = z.object({
  company_name: z.string()
    .trim()
    .min(1, "請輸入公司名稱")
    .max(100, "公司名稱最多 100 字"),
  tax_id: z.union([
    z.literal(""),
    z.string().trim().regex(/^\d{8}$/, "統一編號須為 8 位數字"),
  ]),
  email: z.union([
    z.literal(""),
    z.string().trim().email("Email 格式不正確").max(255, "Email 過長"),
  ]),
  phone: z.union([
    z.literal(""),
    z.string()
      .trim()
      .regex(/^[\d\s\-+()\.]{3,30}$/, "電話格式不正確")
      .max(30, "電話號碼過長"),
  ]),
  address: z.string().trim().max(255, "地址過長").optional(),
  logo_url: z.union([z.literal(""), z.string().url("Logo 連結格式不正確")]).optional().nullable(),
  invoice_title: z.string().trim().max(100, "抬頭最多 100 字").optional().nullable(),
  invoice_title_mode: z.enum(INVOICE_TITLE_MODES).default("company"),
  invoice_tax_id_format: z.enum(INVOICE_TAX_ID_FORMATS).default("prefixed"),
  invoice_show_tax_id: z.boolean().default(true),
});

export type CompanyFormValues = z.infer<typeof companySchema>;
