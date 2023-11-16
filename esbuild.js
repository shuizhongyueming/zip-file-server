const esbuild = require('esbuild');

const isProduction = process.env.NODE_ENV === 'production';

esbuild.build({
  entryPoints: ['./src/main.ts'],
  bundle: true,
  outfile: `dist/main.js`,
  logLevel: 'info',
  minify: isProduction,
  format: 'iife',
  treeShaking: true,
  target: 'es2018',
  plugins: []
})