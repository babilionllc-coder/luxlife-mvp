module.exports = {
  root: true,
  env: {
    node: true,
  },
  ignorePatterns: ["lib"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/typescript",
    "prettier"
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["./tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
  plugins: ["@typescript-eslint", "import"],
  rules: {
    "@typescript-eslint/explicit-function-return-type": "off",
    "import/order": ["warn", { "newlines-between": "always" }],
  },
};
