import { z } from "zod";

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
});

export type CompanyFormValues = z.infer<typeof companySchema>;
