import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  images: {
    unoptimized: true,
  },
  output: 'standalone',
  outputFileTracingExcludes: {
    '*': ['**/node_modules/@img/**', '**/node_modules/sharp/**'],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    '@delivery-os/application',
    '@delivery-os/contracts',
    '@delivery-os/database',
    '@delivery-os/domain',
    '@delivery-os/observability',
    '@delivery-os/ui',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
