<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../lib/useAuth'

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const { login } = useAuth()
const router = useRouter()
const route = useRoute()
const logoUrl = `${import.meta.env.BASE_URL}logo.webp`

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await login(email.value, password.value)
    router.replace(route.query.redirect || '/alumnos')
  } catch (e) {
    // Supabase responde 429 cuando se superan los intentos permitidos.
    const bloqueado = e?.status === 429 || e?.code === 'over_request_rate_limit'
    error.value = bloqueado
      ? 'Demasiados intentos fallidos. Por seguridad, espera unos minutos antes de volver a intentarlo.'
      : 'Correo o contraseña incorrectos.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="row justify-content-center">
    <div class="col-12 col-sm-8 col-md-5 col-lg-4">
      <div class="card mt-5 shadow-sm">
        <div class="card-body">
          <img :src="logoUrl" alt="" class="d-block mx-auto mb-2" style="height: 64px" @error="$event.target.style.display = 'none'" />
          <h1 class="h4 mb-3 text-center">Centro de Psicoterapia Breve</h1>
          <form @submit.prevent="onSubmit">
            <div class="mb-3">
              <label class="form-label">Correo</label>
              <input v-model="email" type="email" class="form-control" required autofocus />
            </div>
            <div class="mb-3">
              <label class="form-label">Contraseña</label>
              <input v-model="password" type="password" class="form-control" required />
            </div>
            <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
            <button class="btn btn-primary w-100" type="submit" :disabled="loading">
              {{ loading ? 'Ingresando...' : 'Ingresar' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
