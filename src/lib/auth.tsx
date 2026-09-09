import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";

export type Role = "socio" | "admin" | "caixa";

type AuthValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: Role | null;
  displayName: string;
  isManager: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirm: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const normalizeRole = (value: unknown): Role | null => {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("socio") || v.includes("sócio") || v.includes("partner")) return "socio";
  if (v.includes("admin")) return "admin";
  if (v.includes("caixa") || v.includes("cashier") || v.includes("colab")) return "caixa";
  return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState("");

  const loadProfile = async (uid: string | undefined, email: string | undefined) => {
    if (!uid) {
      setRole(null);
      setDisplayName("");
      return;
    }
    const [{ data: roles }, { data: profile }, { data: access }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      email
        ? supabase.from("access_list").select("*").ilike("email", email).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const candidates: unknown[] = [
      ...(roles ?? []).map((r: Record<string, unknown>) => r["role"]),
      (profile as Record<string, unknown> | null)?.["role"],
      (access as Record<string, unknown> | null)?.["role"],
    ];
    const found = candidates.map(normalizeRole).find(Boolean) ?? null;
    setRole(found);
    const p = profile as Record<string, unknown> | null;
    setDisplayName(
      String(p?.["full_name"] ?? p?.["name"] ?? p?.["display_name"] ?? email ?? ""),
    );
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user?.id, data.session?.user?.email ?? undefined);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSession(next);
      void loadProfile(next?.user?.id, next?.user?.email ?? undefined);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      displayName,
      isManager: role === "socio" || role === "admin",
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        await loadProfile(data.session?.user?.id, data.session?.user?.email ?? undefined);
      },
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        return { needsConfirm: !data.session };
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setRole(null);
      },
    }),
    [loading, session, role, displayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
