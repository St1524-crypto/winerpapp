# Architecture rules

- Build purchase-intake product inserts through `src/lib/purchase-product.ts` so catalog creation stays separate from storefront publication and its defaults remain regression-tested.
- Store member dividend exclusions separately from positive eligibility grants; write through the authenticated super-admin RPC and enforce them before dividend candidate counting and release so grants cannot override exclusions or affect referral rewards.