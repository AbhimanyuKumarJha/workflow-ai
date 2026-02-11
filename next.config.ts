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
    experimental: {
        serverComponentsExternalPackages: ['@trigger.dev/sdk'],
    },
};

export default nextConfig;
