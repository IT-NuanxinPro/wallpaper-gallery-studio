import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts',
      eslintrc: {
        enabled: true,
        filepath: './.eslintrc-auto-import.json'
      }
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts'
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 Vue 核心库分离
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          // 将 Element Plus 分离
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
          // 将工具库分离
          utils: ['@vueuse/core', 'gsap']
        }
      }
    },
    // 提高 chunk 大小警告阈值（已经做了分割，可以适当提高）
    chunkSizeWarningLimit: 600
  }
})
