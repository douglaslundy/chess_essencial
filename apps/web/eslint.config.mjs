import nextConfig from '@xadrez/eslint-config/next';

const config = [{ ignores: ['public/engine/**'] }, ...nextConfig];

export default config;
