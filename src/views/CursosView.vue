<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'

const cursos = ref([])
const loading = ref(true)
const error = ref('')
const search = ref('')

const emptyForm = () => ({ id: null, nombre: '', descripcion: '', horas: '' })
const form = ref(emptyForm())
const showForm = ref(false)
const saving = ref(false)

async function cargarCursos() {
  loading.value = true
  error.value = ''
  const { data, error: err } = await supabase.from('cursos').select('*').order('nombre')
  if (err) error.value = err.message
  else cursos.value = data
  loading.value = false
}

const cursosFiltrados = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return cursos.value
  return cursos.value.filter((c) => c.nombre.toLowerCase().includes(q))
})

function nuevoCurso() {
  form.value = emptyForm()
  showForm.value = true
}

function editarCurso(curso) {
  form.value = { ...curso, horas: curso.horas ?? '' }
  showForm.value = true
}

function cancelar() {
  showForm.value = false
  form.value = emptyForm()
}

async function guardar() {
  saving.value = true
  error.value = ''
  const { id, nombre, descripcion } = form.value
  const horas = form.value.horas === '' ? null : form.value.horas
  const query = id
    ? supabase.from('cursos').update({ nombre, descripcion, horas }).eq('id', id)
    : supabase.from('cursos').insert({ nombre, descripcion, horas })
  const { error: err } = await query
  if (err) {
    error.value = err.code === '23505' ? 'Ya existe un curso con ese nombre.' : err.message
  } else {
    await cargarCursos()
    cancelar()
  }
  saving.value = false
}

async function eliminarCurso(curso) {
  if (!confirm(`¿Eliminar el curso "${curso.nombre}"? Esto también borra sus matrículas y notas.`)) return
  const { error: err } = await supabase.from('cursos').delete().eq('id', curso.id)
  if (err) error.value = err.message
  else await cargarCursos()
}

onMounted(cargarCursos)
</script>

<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h1 class="h4 mb-0">Cursos</h1>
    <button class="btn btn-primary" @click="nuevoCurso">+ Nuevo curso</button>
  </div>

  <div v-if="error" class="alert alert-danger">{{ error }}</div>

  <div v-if="showForm" class="card mb-4">
    <div class="card-body">
      <h2 class="h6">{{ form.id ? 'Editar curso' : 'Nuevo curso' }}</h2>
      <form @submit.prevent="guardar" class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Nombre del curso</label>
          <input v-model="form.nombre" class="form-control" required placeholder="Ej: Formación en Psicoterapia Breve" />
        </div>
        <div class="col-md-4">
          <label class="form-label">Descripción</label>
          <input v-model="form.descripcion" class="form-control" />
        </div>
        <div class="col-md-2">
          <label class="form-label">Horas</label>
          <input v-model="form.horas" type="number" min="0" class="form-control" />
        </div>
        <div class="col-12 d-flex gap-2">
          <button class="btn btn-primary" type="submit" :disabled="saving">Guardar</button>
          <button class="btn btn-outline-secondary" type="button" @click="cancelar">Cancelar</button>
        </div>
      </form>
    </div>
  </div>

  <input v-model="search" class="form-control mb-3" placeholder="Buscar curso..." />

  <div v-if="loading">Cargando...</div>
  <table v-else class="table table-striped bg-white">
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Descripción</th>
        <th>Horas</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="c in cursosFiltrados" :key="c.id">
        <td>{{ c.nombre }}</td>
        <td>{{ c.descripcion }}</td>
        <td>{{ c.horas }}</td>
        <td class="table-actions">
          <button class="btn btn-sm btn-outline-primary me-1" @click="editarCurso(c)">Editar</button>
          <button class="btn btn-sm btn-outline-danger" @click="eliminarCurso(c)">Eliminar</button>
        </td>
      </tr>
      <tr v-if="!cursosFiltrados.length">
        <td colspan="4" class="text-center text-muted">Sin cursos aún</td>
      </tr>
    </tbody>
  </table>
</template>
