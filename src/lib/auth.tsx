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
  refresh: () => Promise<Role | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ needsConfirm: boolean }>;
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
      return null;
    }

    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("full_name,email").eq("id", uid).maybeSingle(),
    ]);

    const found = (roles ?? []).map((r: Record<string, unknown>) => normalizeRole(r["role"])).find(Boolean) ?? null;
    setRole(found);
    const p = profile as Record<string, unknown> | null;
    setDisplayName(String(p?.["full_name"] || email || ""));
    return found;
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
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED" && event !== "TOKEN_REFRESHED") return;
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
        return loadProfile(data.session?.user?.id, data.session?.user?.email ?? undefined);
      },
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
        const resolvedRole = await loadProfile(data.user?.id, data.user?.email ?? undefined);
        if (!resolvedRole) {
          await supabase.auth.signOut();
          setSession(null);
          throw new Error("Este e-mail não está autorizado a acessar o sistema.");
        }
        setSession(data.session);
      },
      signUp: async (email, password, fullName) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName?.trim() || "" },
          },
        });
        if (error) throw error;

        if (data.session) {
          setSession(data.session);
          const resolvedRole = await loadProfile(data.user?.id, data.user?.email ?? undefined);
          if (!resolvedRole) {
            await supabase.auth.signOut();
            setSession(null);
            throw new Error("Conta criada, mas este e-mail ainda não foi autorizado por um administrador.");
          }
        }
        return { needsConfirm: !data.session };
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setRole(null);
        setDisplayName("");
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
