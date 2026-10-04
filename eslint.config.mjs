// One flat config for the whole workspace (#55).
//
// `eslint-config-next` is the web app's, but nothing in it is specific to Next
// beyond the `@next/next` rules, and the TypeScript rules and import checks are
// as useful in the api and the packages, which lint clean under it — so one
// config, one command, and no second set of rules to keep in step.
//
// Warnings fail CI (`--max-warnings 0` in the lint script): a rule that is
// allowed to warn forever is a rule nobody reads. Where the code does something
// a rule objects to on purpose, the line says why, next to the directive.
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '**/.next/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/generated/**',
      'apps/web/next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...nextVitals,
  ...nextTypescript,
  {
    settings: {
      // The web app is not at the repo root, and React is not a root dependency,
      // so neither can be detected; say where and which.
      next: { rootDir: 'apps/web' },
      react: { version: '19' },
    },
    rules: {
      // The hand-maintained dependency arrays in QuizRunner and friends are
      // exactly what this checks. The preset has it as a warning; here a missing
      // dependency is a stale closure, which is a bug, not a style note.
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];

export default config;
