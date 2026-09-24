import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".freebuff", "scripts", "supabase/legacy-migrations"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // UI component library files export components alongside variant functions/types.
  // This is standard shadcn/ui pattern and not a hot-reload concern.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Dashboard data provider exports a hook + component — standard React pattern.
  {
    files: ["src/components/dashboard/dashboard-data-provider.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Page editors export components + utility functions — standard pattern.
  {
    files: ["src/components/page-editors.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Brand SVG icon components + a shared icon resolver — icons are inert SVGs.
  {
    files: ["src/components/social-icons.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  eslintPluginPrettier,
);
