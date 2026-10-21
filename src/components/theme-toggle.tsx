"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem("incoc-south-theme", nextTheme);
    setDark(nextTheme === "dark");
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={dark === null ? "Toggle color theme" : dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark === null ? "Toggle color theme" : dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
    >
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
