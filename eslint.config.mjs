import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // renewal에는 아직 any가 다수 남아 있어 refactoring 브랜치처럼 error로 바로 올리면
      // 빌드가 막힌다. 우선 warn으로 노출해 새로 추가되는 any를 눈에 띄게 하고,
      // 기존 any는 후속 작업으로 점진적으로 제거한다.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // 포맷 관련 규칙은 Prettier에 맡기므로 충돌하는 규칙을 끈다. 반드시 마지막에 와야 한다.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'public/sw.js',
    'public/workbox-*.js',
    'public/worker-*.js',
    'public/swe-worker-*.js',
  ]),
])

export default eslintConfig
