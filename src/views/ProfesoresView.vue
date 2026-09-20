<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'

const profesores = ref([])
const loading = ref(true)
const error = ref('')
const search = ref('')

const emptyForm = () => ({ id: null, nombre: '', correo: '', celular: '' })
const form = ref(emptyForm())
const showForm = ref(false)
const saving = ref(false)

async function cargarProfesores() {
  loading.value = true
  error.value = ''
  const { data, error: err } = await supabase.from('profesores').select('*').order('nombre')
  if (err) error.value = err.message
  else profesores.value = data
  loading.value = false
}

const profesoresFiltrados = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return profesores.value
  return profesores.value.filter((p) => p.nombre.toLowerCase().includes(q))
})

function nuevoProfesor() {
  form.value = emptyForm()
  showForm.value = true
}

function editarProfesor(profesor) {
  form.value = { ...profesor, correo: profesor.correo ?? '', celular: profesor.celular ?? '' }
  showForm.value = true
}

function cancelar() {
  showForm.value = false
  form.value = emptyForm()
}

async function guardar() {
  saving.value = true
  error.value = ''
  const { id, nombre } = form.value
  const payload = { nombre: nombre.trim(), correo: form.value.correo || null, celular: form.value.celular || null }
  const query = id
    ? supabase.from('profesores').update(payload).eq('id', id)
    : supabase.from('profesores').insert(payload)
  const { error: err } = await query
  if (err) {
    error.value = err.code === '23505' ? 'Ya existe un profesor con ese nombre.' : err.message
  } else {
    await cargarProfesores()
    cancelar()
  }
  saving.value = false
}

async function eliminarProfesor(profesor) {
  if (!confirm(`¿Eliminar a "${profesor.nombre}"? También se borrarán sus evaluaciones docentes.`)) return
  const { error: err } = await supabase.from('profesores').delete().eq('id', profesor.id)
  if (err) error.value = err.message
  else await cargarProfesores()
}

onMounted(cargarProfesores)
</script>

<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h1 class="h4 mb-0">Profesores</h1>
    <button class="btn btn-primary" @click="nuevoProfesor">+ Nuevo profesor</button>
  </div>

  <div v-if="error" class="alert alert-danger">{{ error }}</div>

  <div v-if="showForm" class="card mb-4">
    <div class="card-body">
      <h2 class="h6">{{ form.id ? 'Editar profesor' : 'Nuevo profesor' }}</h2>
      <form @submit.prevent="guardar" class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Nombre completo</label>
          <input v-model="form.nombre" class="form-control" required placeholder="Ej: Ricardo De la Cruz" />
        </div>
        <div class="col-md-3">
          <label class="form-label">Correo <span class="text-muted small">(opcional)</span></label>
          <input v-model="form.correo" type="email" class="form-control" />
        </div>
        <div class="col-md-3">
          <label class="form-label">Celular <span class="text-muted small">(opcional)</span></label>
          <input v-model="form.celular" class="form-control" />
        </div>
        <div class="col-12 d-flex gap-2">
          <button class="btn btn-primary" type="submit" :disabled="saving">Guardar</button>
          <button class="btn btn-outline-secondary" type="button" @click="cancelar">Cancelar</button>
        </div>
      </form>
    </div>
  </div>

  <input v-model="search" class="form-control mb-3" placeholder="Buscar profesor..." />

  <div v-if="loading">Cargando...</div>
  <table v-else class="table table-striped bg-white">
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Correo</th>
        <th>Celular</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="p in profesoresFiltrados" :key="p.id">
        <td>{{ p.nombre }}</td>
        <td>{{ p.correo }}</td>
        <td>{{ p.celular }}</td>
        <td class="table-actions">
          <button class="btn btn-sm btn-outline-primary me-1" @click="editarProfesor(p)">Editar</button>
          <button class="btn btn-sm btn-outline-danger" @click="eliminarProfesor(p)">Eliminar</button>
        </td>
      </tr>
      <tr v-if="!profesoresFiltrados.length">
        <td colspan="4" class="text-center text-muted">Sin profesores aún</td>
      </tr>
    </tbody>
  </table>
</template>
