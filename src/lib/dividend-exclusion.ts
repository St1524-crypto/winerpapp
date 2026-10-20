import { z } from "zod";

export const dividendExclusionSchema = z.object({
  userId: z.string().uuid(),
  excluded: z.boolean(),
  reason: z.string().trim().max(200),
}).refine((value) => !value.excluded || value.reason.length > 0, {
  message: "請填寫停止分紅原因",
  path: ["reason"],
});

export function assertDividendEditor(roles: readonly string[]) {
  if (!roles.includes("super_admin")) throw new Error("只有超級管理員可設定不參與分紅");
}

export function canParticipateInDividends(excluded: boolean) {
  return !excluded;
}

/** Legacy profiles without memberships retain their assigned company only. */
export function belongsToDividendCompany(companyId: string | null, profileCompanyId: string | null, membershipCompanyIds: readonly string[]) {
  if (!companyId) return false;
  return membershipCompanyIds.length > 0
    ? membershipCompanyIds.includes(companyId)
    : profileCompanyId === companyId;
}