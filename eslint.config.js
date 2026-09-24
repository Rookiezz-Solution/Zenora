// @ts-check
const base = require("./packages/config/eslint.base.js");

module.exports = [
  ...base,
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/node_modules/**",
      "**/generated/**",
      "**/prisma/seed.ts"
    ]
  }
];
