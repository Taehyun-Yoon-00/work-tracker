import type { NextConfig } from 'next'
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  // worker/index.js(push, notificationclick 처리)를 자동 생성되는
  // public/sw.js 안으로 함께 번들링함. 이게 없으면 next-pwa가 빌드마다
  // public/sw.js를 워크박스 전용 코드로 통째로 덮어써서 push 핸들러가 사라짐.
  customWorkerSrc: 'worker',
})
const nextConfig: NextConfig = {
  turbopack: {},
}
module.exports = withPWA(nextConfig)
