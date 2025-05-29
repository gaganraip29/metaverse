// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  // ... other settings ...
  server: {
    proxy: {
      // Is this key EXACTLY '/socket.io' (with single quotes, leading slash)?
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('PROXY ERROR:', err); // Changed log prefix
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('PROXY REQ:', req.method, req.url, '->', proxyReq.protocol + '//' + proxyReq.host + proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('PROXY RES:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  }
});