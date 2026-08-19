import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

function devLanUrls(port: number): string[] {
  const seen = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      seen.add(`https://${entry.address}:${port}`);
    }
  }
  return [...seen];
}

const devPort = 4173;
const lanUrls = devLanUrls(devPort);

// GitHub Pages подставляет сайт по пути `/<repo>/`.
// В dev/prod без окружения используем `/`.
const githubRepoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const pageBase = githubRepoName ? `/${githubRepoName}/` : '/';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __DEV_LAN_URLS__: JSON.stringify(lanUrls),
  },
  base: pageBase,
  plugins: [basicSsl()],
  server: {
    host: true,
    port: devPort,
    strictPort: true,
    https: {},
    proxy: {
      '/__max_docs/bridge': {
        target: 'https://dev.max.ru',
        changeOrigin: true,
        rewrite: () => '/docs/webapps/bridge',
      },
    },
  },
});
