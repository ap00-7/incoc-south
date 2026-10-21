import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabasePublicConfig } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabasePublicConfig", () => {
  it("uses the publishable key when configured", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "legacy-anon-test");

    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      key: "sb_publishable_test",
    });
  });

  it("falls back to the legacy anon-key variable", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "legacy-anon-test");

    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      key: "legacy-anon-test",
    });
  });
});
