import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Las Edge Functions corren en Deno (imports por URL, global `Deno`): otro runtime,
  // otra config. Se quedan fuera del lint del frontend.
  { ignores: ['dist', 'node_modules', 'supabase/functions', 'vite.config.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      // `unused-imports` reemplaza a no-unused-vars porque sabe autofixear
      // imports muertos, que es el grueso de lo que destapa noUnusedLocals.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
      'react-refresh/only-export-components': 'off',
      // El bus de CustomEvents (`patients:refresh`, `turnos:refresh`,
      // `profile:updated`) corría en paralelo a React Query: rompía la
      // trazabilidad y disparaba refetches duplicados. Se migró completo a
      // `queryClient.invalidateQueries` con las keys de src/lib/queryKeys.ts.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='window'][callee.property.name=/^(add|remove)EventListener$/] > Literal[value=/^(patients|turnos|profile):/]",
          message:
            'No usar eventos globales para invalidar caché: usá queryClient.invalidateQueries con las keys de src/lib/queryKeys.ts.',
        },
        {
          selector:
            "NewExpression[callee.name=/^(Custom)?Event$/] > Literal[value=/^(patients|turnos|profile):/]",
          message:
            'No despachar eventos globales para invalidar caché: usá queryClient.invalidateQueries con las keys de src/lib/queryKeys.ts.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);
