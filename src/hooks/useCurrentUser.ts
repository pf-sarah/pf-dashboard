import { useEffect, useState } from "react";

export type UserRole = "admin" | "general_manager" | "manager" | "user";

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
  isUserRole: boolean;
}

interface CurrentUser {
  profile: UserProfile;
  permissions: UserPermissions;
}

interface UseCurrentUserResult {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
}

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load user profile");
        return res.json();
      })
      .then((data) => {
        setUser(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { user, loading, error };
}
