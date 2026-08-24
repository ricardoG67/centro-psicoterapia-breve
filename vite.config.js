import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Rutas relativas: funciona igual servido desde la raíz de un dominio
  // propio que desde una subcarpeta como usuario.github.io/repo/.
  base: './',
})
