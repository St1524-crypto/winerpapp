// 唯一被授權可以「新增公司」的帳號
export const AUTHORIZED_COMPANY_CREATOR_EMAIL = "admin-test@winerp.app";

export function canCreateCompany(email?: string | null): boolean {
  return (email ?? "").toLowerCase() === AUTHORIZED_COMPANY_CREATOR_EMAIL;
}
