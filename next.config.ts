import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**.transloadit.com',
            },
            {
                protocol: 'https',
                hostname: '**.amazonaws.com',
            },
            {
                protocol: 'https',
                hostname: '**.r2.dev',
            },
        ],
    },
    serverExternalPackages: ['@trigger.dev/sdk'],
};

export default nextConfig;
