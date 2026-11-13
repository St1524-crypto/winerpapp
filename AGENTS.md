# Architecture rules

- Build purchase-intake product inserts through `src/lib/purchase-product.ts` so catalog creation stays separate from storefront publication and its defaults remain regression-tested.
- Store member dividend exclusions separately from positive eligibility grants; write through the authenticated super-admin RPC and enforce them before dividend candidate counting and release so grants cannot override exclusions or affect referral rewards.
- Dividend exclusion company checks use explicit company memberships first; only legacy profiles with no memberships may fall back to their assigned current_company_id, preventing imported members from being rejected without widening cross-company access.
- Audit insert guards must use SECURITY INVOKER and validate current_user against trusted server roles so authorized SECURITY DEFINER business transactions can atomically save their audit rows without allowing direct client inserts.
- Referral shares use the dedicated resolver entry and company telephone signup; require same-code referrer-name confirmation before invoking account creation so cancellation has no signup side effects.
- Member management directory, referral pickers, and privileged member actions enforce explicit company memberships first and legacy assigned-company fallback; company changes close dialogs and discard stale requests to prevent cross-company display or edits.
- Pool payouts use the existing skipped_capped status for zero-payable capped members; keep cap regression tests isolated from live data so one member cannot roll back other allocations.
- Monthly responsibility points record per-order contributions in order_points; sales_orders triggers deduct them on delete, cancellation, refund, or proportionally on completed partial returns so voided goods never inflate monthly bonuses.
- Sanitize admin-authored shop HTML with the sanitize-html allowlist on both save and public read so stored markup can never carry scripts or javascript: links.
- Bonus/earnings SECURITY DEFINER RPCs reject direct anon/authenticated callers unless they are the member or an admin/finance role, while nested definer calls stay allowed.
- Resolve parser dependencies through their package exports without global entities aliases so legacy email parsers and modern HTML sanitizers can use their own compatible versions.
