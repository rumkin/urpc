import nodeResolve from '@rollup/plugin-node-resolve'
import commonJs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import builtins from 'rollup-plugin-node-builtins'

const plugins = [
  nodeResolve(),
  commonJs(),
  json(),
  builtins(),
]

export default [
  {
    input: 'src/index.js',
    output: [
      {
        format: 'es',
        file: 'build/urpc.esm.js',
        sourcemap: true,
        sourcemapExcludeSources: true,
      },
      {
        format: 'cjs',
        file: 'build/urpc.cjs.js',
        sourcemap: true,
        sourcemapExcludeSources: true,
      },
    ],
    plugins,
  },
  {
    input: 'workbench/var/index.js',
    output: [
      {
        format: 'iife',
        file: 'build/urpc.umd.js',
        sourcemap: true,
        sourcemapExcludeSources: true,
        name: 'Urpc'
      },
    ],
    plugins,
  },
]
