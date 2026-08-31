import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 페이지/컴포넌트의 any는 모두 걷어낸 상태다. 다시 새어 들어오지 않게 막는다.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // 포맷 관련 규칙은 Prettier에 맡기므로 충돌하는 규칙을 끈다. 반드시 마지막에 와야 한다.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // next-pwa가 빌드마다 생성하는 산출물
    'public/sw.js',
    'public/workbox-*.js',
    'public/worker-*.js',
    'public/swe-worker-*.js',
  ]),
])

export default eslintConfig
