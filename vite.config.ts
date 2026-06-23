import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Apache の UserDir 配下（http://peanutsjamjam.jp/~sugawara/nenpyo/）で配信するため、
  // 生成されるアセットの参照パスをこのサブパス基準にする。
  // ※ 将来ディレクトリを nenpyo に変えたら、ここと .htaccess の RewriteBase も変更する。
  base: '/~sugawara/nenpyo/',
  plugins: [react()],
})
