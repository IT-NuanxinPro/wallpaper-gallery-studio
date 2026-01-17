import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import '@/styles/index.scss'

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus)
app.use(router)

// 挂载应用
app.mount('#app')

// 应用挂载后隐藏加载动画
const loadingEl = document.getElementById('app-loading')
if (loadingEl) {
  loadingEl.classList.add('fade-out')
  setTimeout(() => {
    loadingEl.remove()
  }, 300)
}
