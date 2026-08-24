import { ref } from 'vue'
import { supabase } from './supabaseClient'

const user = ref(null)
const ready = ref(false)

supabase.auth.getSession().then(({ data }) => {
  user.value = data.session?.user ?? null
  ready.value = true
})

supabase.auth.onAuthStateChange((_event, session) => {
  user.value = session?.user ?? null
})

export function useAuth() {
  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    user.value = data.user
  }

  async function logout() {
    await supabase.auth.signOut()
    user.value = null
  }

  return { user, ready, login, logout }
}
