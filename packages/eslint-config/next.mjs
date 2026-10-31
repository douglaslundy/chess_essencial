import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

import baseConfig from './base.mjs';

// Interações usam componentes da página (ConfirmDialog, avisos inline); diálogos nativos são proibidos.
export default [
  ...baseConfig,
  ...nextVitals,
  ...nextTypeScript,
  { rules: { 'no-alert': 'error' } },
];
