import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Cache longo das imagens otimizadas (31 dias) para reduzir Transformations na Vercel.
    // Troca de foto gera URL nova (?v=timestamp), então não fica desatualizada.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "wgbzaopduydalxyciroy.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
