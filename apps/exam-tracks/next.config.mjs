/** @type {import('next').NextConfig} */
const nextConfig = {
  // Content files are read from disk at build/render time on the server.
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
};
export default nextConfig;
