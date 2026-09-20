<script setup>
import { useAuth } from './lib/useAuth'

const { user, logout } = useAuth()
const logoUrl = `${import.meta.env.BASE_URL}logo.webp`
</script>

<template>
  <nav v-if="user" class="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
    <div class="container">
      <span class="navbar-brand d-flex align-items-center">
        <img :src="logoUrl" alt="" @error="$event.target.style.display = 'none'" />
        Centro de Psicoterapia Breve
      </span>
      <div class="navbar-nav me-auto">
        <router-link class="nav-link" to="/alumnos">Alumnos</router-link>
        <router-link class="nav-link" to="/formaciones">Formaciones</router-link>
        <router-link class="nav-link" to="/cursos">Cursos</router-link>
        <router-link class="nav-link" to="/notas">Notas</router-link>
        <router-link class="nav-link" to="/certificados">Certificados</router-link>
        <router-link class="nav-link" to="/reportes">Reportes</router-link>
        <router-link class="nav-link" to="/profesores">Profesores</router-link>
        <router-link class="nav-link" to="/evaluaciones">Evaluaciones</router-link>
      </div>
      <span class="navbar-text me-3 d-none d-xxl-inline">{{ user.email }}</span>
      <button class="btn btn-outline-light btn-sm" :title="user.email" @click="logout">Salir</button>
    </div>
  </nav>

  <div class="container pb-5">
    <router-view />
  </div>
</template>
