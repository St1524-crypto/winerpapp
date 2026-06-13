import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Building2, LogOut, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdminPortalRole, isVendorPortalRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/vendor")({
  component: VendorPortal,
});

function VendorPortal() {
  const { user, loading, roles, rolesLoaded, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !rolesLoaded) return;
    if (!user) {
      navigate({ to: "/vendor/login" as any });
      return;
    }
    if (isAdminPortalRole(roles)) {
      navigate({ to: "/admin" });
      return;
    }
    if (!isVendorPortalRole(roles)) {
      navigate({ to: "/login" });
    }
  }, [user, loading, roles, rolesLoaded, navigate]);

  if (loading || !rolesLoaded || !user || !isVendorPortalRole(roles)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Vendor Portal</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate({ to: "/vendor/login" as any });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Vendor Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vendor access is separated from the Admin Portal. Current vendor workflows remain on existing operational pages.
            </p>
            <Button asChild>
              <Link to="/purchases">
                <ShoppingBag className="mr-2 h-4 w-4" />
                Open purchase workflow
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
