import { create } from 'zustand';
import { UserProfile } from '@/lib/userService';
import { UserSubscription } from '@/lib/subscriptionService';

interface UserStore {
  profile: UserProfile | null;
  subscription: UserSubscription | null;
  loaded: boolean;
  setProfile: (p: UserProfile | null) => void;
  setSubscription: (s: UserSubscription | null) => void;
  setLoaded: (v: boolean) => void;
  clear: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  profile: null,
  subscription: null,
  loaded: false,
  setProfile: (profile) => set({ profile }),
  setSubscription: (subscription) => set({ subscription }),
  setLoaded: (loaded) => set({ loaded }),
  clear: () => set({ profile: null, subscription: null, loaded: false }),
}));
