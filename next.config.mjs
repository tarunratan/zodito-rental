/** @type {import('next').NextConfig} */
const nextConfig = {
  // Guardrail 1: Ignore TypeScript errors during Vercel builds
  typescript: {
    ignoreBuildErrors: true,
  },
  // Guardrail 2: Ignore ESLint errors during Vercel builds
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig; // Use module.exports = nextConfig; if using .js
