import { describe, expect, it } from "vitest";
import { buildShippingSnapshot } from "./order-snapshot";
import type { CustomerAddress } from "@/types/shop";

function makeAddress(over: Partial<CustomerAddress> = {}): CustomerAddress {
  return {
    id: "addr-1",
    user_id: "user-1",
    receiver_name: "王小明",
    phone: "0912345678",
    address: "信義路 100 號",
    city: "台北市",
    postal_code: "110",
    is_default: true,
    created_at: new Date().toISOString(),
    ...over,
  };
}

describe("buildShippingSnapshot", () => {
  it("composes postal_code + city + address into shipping_address", () => {
    const snap = buildShippingSnapshot(makeAddress());
    expect(snap).toEqual({
      receiver_name: "王小明",
      receiver_phone: "0912345678",
      shipping_address: "110 台北市 信義路 100 號",
    });
  });

  it("ignores null/empty city or postal_code segments", () => {
    const snap = buildShippingSnapshot(
      makeAddress({ city: null, postal_code: null, address: "桃園市中壢區中正路 1 號" }),
    );
    expect(snap.shipping_address).toBe("桃園市中壢區中正路 1 號");
  });

  it("is a frozen value object — order snapshot cannot be mutated in place", () => {
    const snap = buildShippingSnapshot(makeAddress());
    expect(Object.isFrozen(snap)).toBe(true);
    expect(() => {
      (snap as unknown as { receiver_name: string }).receiver_name = "駭客";
    }).toThrow(TypeError);
    expect(snap.receiver_name).toBe("王小明");
  });

  it("snapshot taken at order time is decoupled from later address edits", () => {
    // Simulate: user places an order with their current default address.
    const address = makeAddress();
    const orderSnapshot = buildShippingSnapshot(address);

    // Later the user edits the address (rename, move) and even switches
    // which address is the default — these are mutations on the source row.
    address.receiver_name = "新名字";
    address.phone = "0900000000";
    address.address = "新地址 999 號";
    address.city = "高雄市";
    address.postal_code = "800";
    address.is_default = false;

    // The previously captured order snapshot must remain unchanged.
    expect(orderSnapshot).toEqual({
      receiver_name: "王小明",
      receiver_phone: "0912345678",
      shipping_address: "110 台北市 信義路 100 號",
    });
  });

  it("switching default to another address does not retroactively change a past order's snapshot", () => {
    // Two addresses in the book.
    const home = makeAddress({ id: "home", receiver_name: "Home", address: "家裡 1 號", is_default: true });
    const office = makeAddress({
      id: "office",
      receiver_name: "Office",
      phone: "0277777777",
      address: "公司 2 號",
      city: "新北市",
      postal_code: "220",
      is_default: false,
    });

    // Order #1 placed while `home` is the default.
    const order1 = buildShippingSnapshot(home);

    // User flips the default to `office` afterwards (per set_default_address RPC semantics).
    home.is_default = false;
    office.is_default = true;

    // Order #2 placed later picks up the new default.
    const order2 = buildShippingSnapshot(office);

    // Order #1's snapshot is untouched by the default switch.
    expect(order1.receiver_name).toBe("Home");
    expect(order1.shipping_address).toBe("110 台北市 家裡 1 號");

    // Order #2 reflects the new default, but is its own independent snapshot.
    expect(order2.receiver_name).toBe("Office");
    expect(order2.shipping_address).toBe("220 新北市 公司 2 號");
    expect(order1).not.toBe(order2);
  });
});
