/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite ships WASM/data files; load it from node_modules at runtime instead of bundling.
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
};

export default nextConfig;
