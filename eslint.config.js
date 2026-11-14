import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// Correctness-only lint: @eslint/js recommended plus the two classic React
// hooks rules. No style rules, no React Compiler preset, no Prettier.
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-e2e/**',
      'test-results/**',
      'playwright-report/**',
      'public/**',
      '.live/**',
      '.vercel/**',
      // Script fragment inlined into a page by build.mjs; its globals are intentionally undeclared.
      'tools/live/artifact/adapter.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Known unused vars stay warnings so no other lane's files are touched.
      'no-unused-vars': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
