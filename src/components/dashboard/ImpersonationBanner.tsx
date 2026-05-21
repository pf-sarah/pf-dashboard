'use client';
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function ImpersonationBanner() {
  const { isImpersonating, user, realUser, stopImpersonating } = useCurrentUser();

  if (!isImpersonating || !user) return null;

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-white px-6 py-2.5 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-3">
        <span className="text-base">👁</span>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">Viewing as {user.profile.full_name}</span>
          <span className="text-amber-100 text-xs">
            · {user.profile.role} · {user.profile.location ?? "No location"} · {user.profile.department ?? "No department"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-amber-100 text-xs hidden sm:block">
          Signed in as {realUser?.profile.full_name}
        </span>
        <button
          onClick={stopImpersonating}
          className="px-3 py-1 bg-white text-amber-600 text-sm font-semibold rounded-lg hover:bg-amber-50 transition-colors whitespace-nowrap"
        >
          Exit View
        </button>
      </div>
    </div>
  );
}
