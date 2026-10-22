import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // caminhos relativos: funciona em qualquer endereço/subpasta
  plugins: [react()],
  build: { chunkSizeWarningLimit: 700 },
})
