<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'

const cursos = ref([])
const ediciones = ref([])
const loading = ref(true)
const error = ref('')
const expandido = ref(new Set())

const cursoForm = ref({ id: null, nombre: '' })
const showCursoForm = ref(false)
const savingCurso = ref(false)

const emptyEdicion = (cursoId) => ({
  id: null,
  curso_id: cursoId,
  nombre_edicion: '',
  docente: '',
  fecha_inicio: '',
  fecha_fin: '',
})
const edicionForm = ref(null)
const savingEdicion = ref(false)

async function cargarTodo() {
  loading.value = true
  error.value = ''
  const [cursosRes, edicionesRes] = await Promise.all([
    supabase.from('cursos').select('*').order('nombre'),
    supabase.from('ediciones').select('*').order('nombre_edicion'),
  ])
  if (cursosRes.error) error.value = cursosRes.error.message
  else cursos.value = cursosRes.data
  if (edicionesRes.error) error.value = edicionesRes.error.message
  else ediciones.value = edicionesRes.data
  loading.value = false
}

function edicionesDe(cursoId) {
  return ediciones.value.filter((e) => e.curso_id === cursoId)
}

function toggleExpandir(cursoId) {
  const s = new Set(expandido.value)
  s.has(cursoId) ? s.delete(cursoId) : s.add(cursoId)
  expandido.value = s
}

function nuevoCurso() {
  cursoForm.value = { id: null, nombre: '' }
  showCursoForm.value = true
}

function editarCurso(curso) {
  cursoForm.value = { ...curso }
  showCursoForm.value = true
}

async function guardarCurso() {
  savingCurso.value = true
  error.value = ''
  const { id, nombre } = cursoForm.value
  const query = id
    ? supabase.from('cursos').update({ nombre }).eq('id', id)
    : supabase.from('cursos').insert({ nombre })
  const { error: err } = await query
  if (err) {
    error.value = err.code === '23505' ? 'Ya existe un curso con ese nombre.' : err.message
  } else {
    await cargarTodo()
    showCursoForm.value = false
  }
  savingCurso.value = false
}

async function eliminarCurso(curso) {
  if (!confirm(`¿Eliminar el curso "${curso.nombre}" y todas sus ediciones, matrículas y notas?`)) return
  const { error: err } = await supabase.from('cursos').delete().eq('id', curso.id)
  if (err) error.value = err.message
  else await cargarTodo()
}

function nuevaEdicion(cursoId) {
  edicionForm.value = emptyEdicion(cursoId)
}

function editarEdicion(edicion) {
  edicionForm.value = { ...edicion }
}

function cancelarEdicion() {
  edicionForm.value = null
}

async function guardarEdicion() {
  savingEdicion.value = true
  error.value = ''
  const payload = { ...edicionForm.value }
  const id = payload.id
  delete payload.id
  if (!payload.fecha_inicio) payload.fecha_inicio = null
  if (!payload.fecha_fin) payload.fecha_fin = null

  const query = id
    ? supabase.from('ediciones').update(payload).eq('id', id)
    : supabase.from('ediciones').insert(payload)
  const { error: err } = await query
  if (err) {
    error.value = err.code === '23505' ? 'Ese curso ya tiene una edición con ese nombre.' : err.message
  } else {
    await cargarTodo()
    edicionForm.value = null
  }
  savingEdicion.value = false
}

async function eliminarEdicion(edicion) {
  if (!confirm(`¿Eliminar la edición "${edicion.nombre_edicion}"? Esto borra sus matrículas y notas.`)) return
  const { error: err } = await supabase.from('ediciones').delete().eq('id', edicion.id)
  if (err) error.value = err.message
  else await cargarTodo()
}

onMounted(cargarTodo)
</script>

<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h1 class="h4 mb-0">Cursos y ediciones</h1>
    <button class="btn btn-primary" @click="nuevoCurso">+ Nuevo curso</button>
  </div>

  <div v-if="error" class="alert alert-danger">{{ error }}</div>

  <div v-if="showCursoForm" class="card mb-4">
    <div class="card-body">
      <h2 class="h6">{{ cursoForm.id ? 'Editar curso' : 'Nuevo curso' }}</h2>
      <form @submit.prevent="guardarCurso" class="row g-3">
        <div class="col-md-8">
          <label class="form-label">Nombre del curso</label>
          <input v-model="cursoForm.nombre" class="form-control" required placeholder="Ej: Formación en Psicoterapia Breve" />
        </div>
        <div class="col-12 d-flex gap-2">
          <button class="btn btn-primary" type="submit" :disabled="savingCurso">Guardar</button>
          <button class="btn btn-outline-secondary" type="button" @click="showCursoForm = false">Cancelar</button>
        </div>
      </form>
    </div>
  </div>

  <div v-if="loading">Cargando...</div>

  <div v-else class="d-flex flex-column gap-3">
    <div v-for="curso in cursos" :key="curso.id" class="card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <button class="btn btn-sm btn-link text-decoration-none" @click="toggleExpandir(curso.id)">
              {{ expandido.has(curso.id) ? '▾' : '▸' }} <strong>{{ curso.nombre }}</strong>
            </button>
            <span class="text-muted small ms-2">{{ edicionesDe(curso.id).length }} edición(es)</span>
          </div>
          <div class="table-actions">
            <button class="btn btn-sm btn-outline-primary me-1" @click="editarCurso(curso)">Editar</button>
            <button class="btn btn-sm btn-outline-danger" @click="eliminarCurso(curso)">Eliminar</button>
          </div>
        </div>

        <div v-if="expandido.has(curso.id)" class="mt-3">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Edición</th>
                <th>Docente</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in edicionesDe(curso.id)" :key="e.id">
                <td>{{ e.nombre_edicion }}</td>
                <td>{{ e.docente }}</td>
                <td>{{ e.fecha_inicio }}</td>
                <td>{{ e.fecha_fin }}</td>
                <td class="table-actions">
                  <button class="btn btn-sm btn-outline-primary me-1" @click="editarEdicion(e)">Editar</button>
                  <button class="btn btn-sm btn-outline-danger" @click="eliminarEdicion(e)">Eliminar</button>
                </td>
              </tr>
              <tr v-if="!edicionesDe(curso.id).length">
                <td colspan="5" class="text-center text-muted">Sin ediciones aún</td>
              </tr>
            </tbody>
          </table>
          <button class="btn btn-sm btn-outline-secondary" @click="nuevaEdicion(curso.id)">+ Nueva edición</button>

          <form
            v-if="edicionForm && edicionForm.curso_id === curso.id"
            @submit.prevent="guardarEdicion"
            class="row g-2 mt-2 border-top pt-3"
          >
            <div class="col-md-3">
              <label class="form-label">Nombre de edición</label>
              <input v-model="edicionForm.nombre_edicion" class="form-control" required placeholder="Edición I" />
            </div>
            <div class="col-md-3">
              <label class="form-label">Docente</label>
              <input v-model="edicionForm.docente" class="form-control" />
            </div>
            <div class="col-md-2">
              <label class="form-label">Fecha inicio</label>
              <input v-model="edicionForm.fecha_inicio" type="date" class="form-control" />
            </div>
            <div class="col-md-2">
              <label class="form-label">Fecha fin</label>
              <input v-model="edicionForm.fecha_fin" type="date" class="form-control" />
            </div>
            <div class="col-md-2 d-flex align-items-end gap-2">
              <button class="btn btn-primary" type="submit" :disabled="savingEdicion">Guardar</button>
              <button class="btn btn-outline-secondary" type="button" @click="cancelarEdicion">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <div v-if="!cursos.length" class="text-center text-muted">Aún no hay cursos registrados.</div>
  </div>
</template>
