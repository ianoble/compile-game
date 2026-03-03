// Simple ESLint configuration focusing on JavaScript files only
export default [
	{
		ignores: [
			'node_modules/**',
			'dist/**',
			'*.d.ts',
			'vite.config.ts',
			'noble-bg-engine/**', // Skip the engine for now
		],
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				console: 'readonly',
				window: 'readonly',
				document: 'readonly',
			},
		},
		rules: {
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'no-debugger': 'error',
			'no-alert': 'error',
			'prefer-const': 'error',
			'no-var': 'error',
			'no-undef': 'error',
			'no-unreachable': 'error',
		},
	},
];
