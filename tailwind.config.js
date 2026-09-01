/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic color tokens referencing CSS variables
        "obsidian-primary": "var(--background-primary)",
        "obsidian-secondary": "var(--background-secondary)",
        "obsidian-alt": "var(--background-secondary-alt)",
        "obsidian-hover": "var(--background-modifier-hover)",
        "obsidian-active": "var(--background-modifier-active)",
        "obsidian-border": "var(--background-modifier-border)",
        "obsidian-text": "var(--text-normal)",
        "obsidian-muted": "var(--text-muted)",
        "obsidian-faint": "var(--text-faint)",
        "obsidian-accent": "var(--text-accent)",
        "obsidian-accent-hover": "var(--text-accent-hover)",
        "obsidian-on-accent": "var(--text-on-accent)",
        "obsidian-interactive": "var(--interactive-normal)",
        "obsidian-interactive-hover": "var(--interactive-hover)",
      },
    },
  },
  plugins: [],
};
