'use client';
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface PermissionGateProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  require: keyof ReturnType<typeof useCurrentUser>["user"] extends never
    ? never
    : "canEditUtah" | "canEditGeorgia" | "canViewUtah" | "canViewGeorgia"
    | "canViewCPO" | "canManageUsers" | "canEditSchedule" | "canEditHistoricals";
}

// Wraps any UI section and hides or disables it based on permissions
export function PermissionGate({ children, fallback = null, require }: PermissionGateProps) {
  const { user, loading } = useCurrentUser();
  if (loading) return null;
  if (!user) return null;
  if (!user.permissions[require]) return <>{fallback}</>;
  return <>{children}</>;
}

// Returns true/false for inline permission checks
export function usePermission(key: PermissionGateProps["require"]): boolean {
  const { user } = useCurrentUser();
  return user?.permissions[key] ?? false;
}

// Read-only wrapper — shows content but disables all inputs inside
export function ReadOnlyGate({
  children,
  isReadOnly,
}: {
  children: React.ReactNode;
  isReadOnly: boolean;
}) {
  if (!isReadOnly) return <>{children}</>;
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-60 select-none">
        {children}
      </div>
      <div className="absolute top-2 right-2">
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
          View only
        </span>
      </div>
    </div>
  );
}
