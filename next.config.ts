import type { NextConfig } from 'next'
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
})
const nextConfig: NextConfig = {
  turbopack: {},
}
module.exports = withPWA(nextConfig)
