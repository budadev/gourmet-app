module.exports = {
  env: {
    browser: true,
    es2022: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: [
    'unused-imports'
  ],
  ignorePatterns: [
    'js/external/**',
    'node_modules/**'
  ],
  globals: {
    // Service Worker globals (for sw.js)
    self: 'readonly',
    caches: 'readonly',
    clients: 'readonly',
    skipWaiting: 'readonly',
    // External libraries
    JSZip: 'readonly',
    L: 'readonly', // Leaflet
    BarcodeDetector: 'readonly'
  },
  rules: {
    // Detect unused variables and imports
    'no-unused-vars': 'off', // Turn off base rule to use unused-imports version
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_'
      }
    ],

    // General best practices
    'no-undef': 'error',
    'no-console': 'off', // Allow console for debugging
    'semi': ['error', 'always'],
    'quotes': ['warn', 'single', { avoidEscape: true }],
    'no-unused-expressions': 'warn',
    'no-unreachable': 'error',
    'no-constant-condition': 'warn',
    'no-empty': 'warn',
    'no-debugger': 'warn'
  }
};

