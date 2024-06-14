import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import pkg from './package.json' assert {type: 'json'};
import {defineConfig} from "rollup";

const production = process.env.NODE_ENV === 'production';


export default defineConfig({
  input: 'src/main.ts',
  output: [
    {
      file: pkg.module,
      format: 'esm'
    },
    {
      file: pkg.unpkg,
      name: 'ZipFileServer',
      format: 'iife',
      footer: 'window.ZipFileServer = ZipFileServer.ZipFileServer;'
    }
  ],
  plugins: [
    resolve(),
    typescript(),
    production && terser()
  ]
})