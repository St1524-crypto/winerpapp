import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

const KEY = "admin-fabs-hidden";
const EVENT = "admin-fabs-toggle";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function useIsAdminRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return /^\/(admin|vendor)(\/|$)/.test(pathname);
}

export function useAdminFabsHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(read());
    const on = () => setHidden(read());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return hidden;
}

export function setAdminFabsHidden(hidden: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, hidden ? "1" : "0");
  window.dispatchEvent(new Event(EVENT));
}
