import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [...compat.extends("next/core-web-vitals")];

config.push({
  ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**"],
});

export default config;
