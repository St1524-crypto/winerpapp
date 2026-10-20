import { z } from "zod";

export const referralCodeSchema = z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const registrationSchema = z.object({
  name: z.string().trim().min(1, "姓名不可空白").max(60),
  password: z.string().min(6, "密碼至少需6個字").max(200),
  phone: z.string().regex(/^\d{10}$/, "請輸入10碼電話號碼"),
});

export function canCreateReferredAccount(code: string, confirmedCode: string | undefined) {
  return referralCodeSchema.safeParse(code).success && code === confirmedCode;
}

export function referralSignupPath(code: string) {
  return `/u/${encodeURIComponent(referralCodeSchema.parse(code))}`;
}