'use client';
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function ImpersonationBanner() {
  const { isImpersonating, user, realUser, stopImpersonating } = useCurrentUser();

  if (!isImpersonating || !user) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-500 text-white px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <span className="text-lg">👁</span>
        <div>
          <span className="font-semibold">Viewing as {user.profile.full_name}</span>
          <span className="text-amber-100 text-sm ml-2">
            {user.profile.role} · {user.profile.location ?? "No location"} · {user.profile.department ?? "No department"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-amber-100 text-sm">
          Signed in as {realUser?.profile.full_name}
        </span>
        <button
          onClick={stopImpersonating}
          className="px-4 py-1.5 bg-white text-amber-600 text-sm font-semibold rounded-lg hover:bg-amber-50 transition-colors"
        >
          Exit View
        </button>
      </div>
    </div>
  );
}
