export function memberBelongsToCompany(companyId: string | null, assignedCompanyId: string | null, memberships: readonly string[]) {
  return !!companyId && (memberships.length > 0 ? memberships.includes(companyId) : assignedCompanyId === companyId);
}

export function assertMemberCompany(companyId: string | null, assignedCompanyId: string | null, memberships: readonly string[]) {
  if (!memberBelongsToCompany(companyId, assignedCompanyId, memberships)) throw new Error("會員不屬於目前公司");
}