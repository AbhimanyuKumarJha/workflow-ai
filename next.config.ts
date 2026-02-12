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
        ],
    },
    serverExternalPackages: ['@trigger.dev/sdk'],
};

export default nextConfig;
