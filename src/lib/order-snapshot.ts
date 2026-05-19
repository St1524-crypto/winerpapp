import type { CustomerAddress } from "@/types/shop";

export interface ShippingSnapshot {
  receiver_name: string;
  receiver_phone: string;
  shipping_address: string;
}

/**
 * Build an immutable shipping snapshot from a customer address.
 *
 * The returned object is a frozen, plain-data copy — once an order is
 * created with this snapshot, later mutations to the source address (or
 * switching which address is the user's default) MUST NOT affect the
 * order's stored receiver info.
 */
export function buildShippingSnapshot(
  address: Pick<CustomerAddress, "receiver_name" | "phone" | "address" | "city" | "postal_code">,
): ShippingSnapshot {
  const composed = [address.postal_code, address.city, address.address]
    .filter(Boolean)
    .join(" ")
    .trim();
  return Object.freeze({
    receiver_name: address.receiver_name,
    receiver_phone: address.phone,
    shipping_address: composed,
  });
}
