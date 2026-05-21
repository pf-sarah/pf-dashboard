import { useEffect, useState, useCallback } from "react";

export type UserRole = "admin" | "general_manager" | "manager" | "user" | "viewer";

export interface UserProfile {
  clerk_user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  location: string | null;
  department: string | null;
  team_member_name: string | null;
  manager_id: string | null;
  invited_by: string | null;
  created_at: string;
}

export interface UserPermissions {
  canEditUtah: boolean;
  canEditGeorgia: boolean;
  canViewUtah: boolean;
  canViewGeorgia: boolean;
  canViewCPO: boolean;
  canManageUsers: boolean;
  canViewAllLocations: boolean;
  canEditSchedule: boolean;
  canEditHistoricals: boolean;
  canViewScheduling: boolean;
  canViewScorecards: boolean;
  isUserRole: boolean;
  isViewerRole: boolean;
}

interface CurrentUser {
  profile: UserProfile;
  permissions: UserPermissions;
}

interface UseCurrentUserResult {
  user: CurrentUser | null;
  realUser: CurrentUser | null;
  loading: boolean;
  error: string | null;
  isImpersonating: boolean;
  startImpersonating: (targetId: string) => Promise<void>;
  stopImpersonating: () => void;
}

const IMPERSONATION_KEY = "pf_impersonating_id";

export function useCurrentUser(): UseCurrentUserResult {
  const [realUser, setRealUser] = useState<CurrentUser | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load user profile");
        return res.json();
      })
      .then(async (data) => {
        setRealUser(data);
        // Check if there is an active impersonation session
        const impersonatingId = sessionStorage.getItem(IMPERSONATION_KEY);
        if (impersonatingId) {
          try {
            const res = await fetch(`/api/users/${impersonatingId}/profile`);
            if (res.ok) {
              const impData = await res.json();
              setImpersonatedUser(impData);
            } else {
              sessionStorage.removeItem(IMPERSONATION_KEY);
            }
          } catch {
            sessionStorage.removeItem(IMPERSONATION_KEY);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const startImpersonating = useCallback(async (targetId: string) => {
    const res = await fetch(`/api/users/${targetId}/profile`);
    if (!res.ok) throw new Error("Cannot impersonate this user");
    const data = await res.json();
    sessionStorage.setItem(IMPERSONATION_KEY, targetId);
    setImpersonatedUser(data);
  }, []);

  const stopImpersonating = useCallback(() => {
    sessionStorage.removeItem(IMPERSONATION_KEY);
    setImpersonatedUser(null);
  }, []);

  const isImpersonating = impersonatedUser !== null;
  const user = isImpersonating ? impersonatedUser : realUser;

  return {
    user,
    realUser,
    loading,
    error,
    isImpersonating,
    startImpersonating,
    stopImpersonating,
  };
}
