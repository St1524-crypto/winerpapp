# Architecture rules

- Build purchase-intake product inserts through `src/lib/purchase-product.ts` so catalog creation stays separate from storefront publication and its defaults remain regression-tested.
- Store member dividend exclusions separately from positive eligibility grants; write through the authenticated super-admin RPC and enforce them before dividend candidate counting and release so grants cannot override exclusions or affect referral rewards.
- Dividend exclusion company checks use explicit company memberships first; only legacy profiles with no memberships may fall back to their assigned current_company_id, preventing imported members from being rejected without widening cross-company access.
- Audit insert guards must use SECURITY INVOKER and validate current_user against trusted server roles so authorized SECURITY DEFINER business transactions can atomically save their audit rows without allowing direct client inserts.
- Referral shares use the dedicated resolver entry and company telephone signup; require same-code referrer-name confirmation before invoking account creation so cancellation has no signup side effects.