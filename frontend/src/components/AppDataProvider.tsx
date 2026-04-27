'use client';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserStore } from '@/store/userStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { fetchUserProfile } from '@/lib/userService';
import { fetchSubscriptionDetails } from '@/lib/subscriptionService';
import { fetchAllWorkspaces } from '@/lib/workspaceService';

/**
 * Invisible component that loads user profile, subscription, and workspace data
 * once on mount. Place inside the /app layout so all child pages share the data.
 */
export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { setProfile, setSubscription, setLoaded, loaded } = useUserStore();
  const { setWorkspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceStore();

  useEffect(() => {
    if (!ready || !user?.user_id || loaded) return;

    (async () => {
      try {
        const [profile, sub, workspaces] = await Promise.all([
          fetchUserProfile(user.user_id).catch(() => null),
          fetchSubscriptionDetails(user.user_id).catch(() => null),
          fetchAllWorkspaces(user.user_id).catch((err) => {
            console.error('Failed to fetch workspaces:', err);
            return [];
          }),
        ]);

        if (profile) setProfile(profile);
        if (sub) setSubscription(sub);

        if (workspaces && workspaces.length) {
          const mapped = workspaces.map((w, i) => ({
            id: w.workspace_name,
            name: w.workspace_name,
            docs_count: w.file_count ?? 0,
          }));
          setWorkspaces(mapped);
          
          // Auto-select first workspace if none active
          if (!activeWorkspace) {
            setActiveWorkspace(mapped[0]);
          }
        }
      } catch (e) {
        console.error('AppDataProvider load failed:', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, [ready, user?.user_id, loaded]);

  return <>{children}</>;
}
