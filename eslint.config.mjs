import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Рабочие копии фоновых агентов: там свой node_modules и своя сборка,
    // и линтер уходил в них на десятки тысяч замечаний о чужом коде.
    ".claude/worktrees/**",
    // Рантайм ONNX лежит в public/ готовым файлом (см. docs/food-hint.md):
    // это чужая сборка, минифицированная, и править её мы не будем.
    "public/models/**",
  ]),
]);

export default eslintConfig;
