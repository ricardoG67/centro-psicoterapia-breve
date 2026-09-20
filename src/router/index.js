import { createRouter, createWebHashHistory } from 'vue-router'
import { supabase } from '../lib/supabaseClient'
import LoginView from '../views/LoginView.vue'
import AlumnosView from '../views/AlumnosView.vue'
import FormacionesView from '../views/FormacionesView.vue'
import CursosView from '../views/CursosView.vue'
import NotasView from '../views/NotasView.vue'
import CertificadosView from '../views/CertificadosView.vue'
import ReportesView from '../views/ReportesView.vue'
import ProfesoresView from '../views/ProfesoresView.vue'
import EvaluacionesView from '../views/EvaluacionesView.vue'

const routes = [
  { path: '/', redirect: '/alumnos' },
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/alumnos', name: 'alumnos', component: AlumnosView },
  { path: '/formaciones', name: 'formaciones', component: FormacionesView },
  { path: '/cursos', name: 'cursos', component: CursosView },
  { path: '/notas', name: 'notas', component: NotasView },
  { path: '/certificados', name: 'certificados', component: CertificadosView },
  { path: '/reportes', name: 'reportes', component: ReportesView },
  { path: '/profesores', name: 'profesores', component: ProfesoresView },
  { path: '/evaluaciones', name: 'evaluaciones', component: EvaluacionesView },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// Hash history: funciona en GitHub Pages sin configurar rewrites del servidor.
router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
