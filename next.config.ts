import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // libsql 带有可选原生绑定，交给 Node 运行时直接加载，避免打包器介入
  serverExternalPackages: ['@libsql/client', 'libsql'],
};

export default nextConfig;
