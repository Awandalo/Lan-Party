import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {execFileSync} from 'node:child_process';

// GitHub supplies the checked-out commit in CI; local builds read that checkout.
function buildSha(){
 const sha=process.env.GITHUB_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('A valid source revision is required for the build identifier');
 return sha.slice(0,7);
}

export default defineConfig({
  plugins: [react()],
  define: {__LAN_BUILD_SHA__:JSON.stringify(buildSha())},
  server: {
    host: '127.0.0.1',
    strictPort: true,
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
});

