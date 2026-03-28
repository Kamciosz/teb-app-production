/**
 * Next.js configuration snippet for allowing Cloudflare R2 images in next/image
 * Add this to your Next.js project root `next.config.js` when migrating to Next.js
 */
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_R2_PUBLIC_URL ? new URL(process.env.NEXT_PUBLIC_R2_PUBLIC_URL).hostname : 'your-r2-domain.example',
        pathname: '/**',
      },
    ],
  },
};
