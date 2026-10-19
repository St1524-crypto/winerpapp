# Architecture rules

- Build purchase-intake product inserts through `src/lib/purchase-product.ts` so catalog creation stays separate from storefront publication and its defaults remain regression-tested.