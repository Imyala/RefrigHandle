import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.claude` holds tool worktrees (full repo copies) — linting them
  // double-reports everything and trips the multi-tsconfig parser check.
  globalIgnores(['dist', '.claude']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Context modules deliberately export a provider component and its
    // use* hook from the same file — the hook IS the public API, and
    // splitting it out would split every context in two for no reader
    // benefit. The only cost of keeping them together is that editing
    // these files triggers a full reload instead of a hot fast-refresh.
    files: ['src/lib/confirm.tsx', 'src/lib/store.tsx', 'src/lib/toast.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
