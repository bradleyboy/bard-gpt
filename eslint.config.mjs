import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginReactConfig from 'eslint-plugin-react/configs/jsx-runtime.js';
import ruleOfHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'dist/',
      'server/bundle-*',
      'schema.js',
      'server/',
      '*.config.js',
    ],
  },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReactConfig,
  {
    rules: {
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    plugins: {
      'react-hooks': ruleOfHooksPlugin,
    },
    rules: ruleOfHooksPlugin.configs.recommended.rules,
  },
];
