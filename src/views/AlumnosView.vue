<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'

const alumnos = ref([])
const loading = ref(true)
const error = ref('')
const search = ref('')

const emptyForm = () => ({
  id: null,
  nombres: '',
  apellidos: '',
  tipo_documento: 'DNI',
  documento: '',
  fecha_nacimiento: '',
  correo: '',
  celular: '',
  profesion: '',
  nacionalidad: '',
})

const form = ref(emptyForm())
const showForm = ref(false)
const saving = ref(false)

async function cargarAlumnos() {
  loading.value = true
  error.value = ''
  const { data, error: err } = await supabase
    .from('alumnos')
    .select('*')
    .order('apellidos', { ascending: true })
  if (err) error.value = err.message
  else alumnos.value = data
  loading.value = false
}

const alumnosFiltrados = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return alumnos.value
  return alumnos.value.filter((a) =>
    [a.nombres, a.apellidos, a.documento].join(' ').toLowerCase().includes(q)
  )
})

function nuevoAlumno() {
  form.value = emptyForm()
  showForm.value = true
}

function editarAlumno(alumno) {
  form.value = { ...alumno, fecha_nacimiento: alumno.fecha_nacimiento || '' }
  showForm.value = true
}

function cancelar() {
  showForm.value = false
  form.value = emptyForm()
}

async function guardar() {
  saving.value = true
  error.value = ''
  const payload = { ...form.value }
  const id = payload.id
  delete payload.id
  if (!payload.fecha_nacimiento) payload.fecha_nacimiento = null

  const query = id
    ? supabase.from('alumnos').update(payload).eq('id', id)
    : supabase.from('alumnos').insert(payload)

  const { error: err } = await query
  if (err) {
    error.value = err.code === '23505' ? 'Ya existe un alumno con ese documento.' : err.message
  } else {
    await cargarAlumnos()
    cancelar()
  }
  saving.value = false
}

async function eliminarAlumno(alumno) {
  if (!confirm(`¿Eliminar a ${alumno.nombres} ${alumno.apellidos}? Esto también borra sus matrículas y notas.`)) return
  const { error: err } = await supabase.from('alumnos').delete().eq('id', alumno.id)
  if (err) error.value = err.message
  else await cargarAlumnos()
}

onMounted(cargarAlumnos)
</script>

<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h1 class="h4 mb-0">Alumnos</h1>
    <button class="btn btn-primary" @click="nuevoAlumno">+ Nuevo alumno</button>
  </div>

  <div v-if="error" class="alert alert-danger">{{ error }}</div>

  <div v-if="showForm" class="card mb-4">
    <div class="card-body">
      <h2 class="h6">{{ form.id ? 'Editar alumno' : 'Nuevo alumno' }}</h2>
      <form @submit.prevent="guardar">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Nombres</label>
            <input v-model="form.nombres" class="form-control" required />
          </div>
          <div class="col-md-6">
            <label class="form-label">Apellidos</label>
            <input v-model="form.apellidos" class="form-control" required />
          </div>
          <div class="col-md-3">
            <label class="form-label">Tipo de documento</label>
            <select v-model="form.tipo_documento" class="form-select">
              <option value="DNI">DNI</option>
              <option value="Pasaporte">Pasaporte</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">N° de documento</label>
            <input v-model="form.documento" class="form-control" required />
          </div>
          <div class="col-md-3">
            <label class="form-label">Fecha de nacimiento</label>
            <input v-model="form.fecha_nacimiento" type="date" class="form-control" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Nacionalidad</label>
            <input v-model="form.nacionalidad" class="form-control" />
          </div>
          <div class="col-md-4">
            <label class="form-label">Correo</label>
            <input v-model="form.correo" type="email" class="form-control" />
          </div>
          <div class="col-md-4">
            <label class="form-label">Celular</label>
            <input v-model="form.celular" class="form-control" />
          </div>
          <div class="col-md-4">
            <label class="form-label">Profesión</label>
            <input v-model="form.profesion" class="form-control" />
          </div>
        </div>
        <div class="mt-3 d-flex gap-2">
          <button class="btn btn-primary" type="submit" :disabled="saving">
            {{ saving ? 'Guardando...' : 'Guardar' }}
          </button>
          <button class="btn btn-outline-secondary" type="button" @click="cancelar">Cancelar</button>
        </div>
      </form>
    </div>
  </div>

  <input
    v-model="search"
    class="form-control mb-3"
    placeholder="Buscar por nombre, apellido o documento..."
  />

  <div v-if="loading">Cargando...</div>
  <table v-else class="table table-striped bg-white">
    <thead>
      <tr>
        <th>Documento</th>
        <th>Nombres y apellidos</th>
        <th>Correo</th>
        <th>Celular</th>
        <th>Profesión</th>
        <th>Nacionalidad</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="a in alumnosFiltrados" :key="a.id">
        <td>{{ a.tipo_documento }} {{ a.documento }}</td>
        <td>{{ a.nombres }} {{ a.apellidos }}</td>
        <td>{{ a.correo }}</td>
        <td>{{ a.celular }}</td>
        <td>{{ a.profesion }}</td>
        <td>{{ a.nacionalidad }}</td>
        <td class="table-actions">
          <button class="btn btn-sm btn-outline-primary me-1" @click="editarAlumno(a)">Editar</button>
          <button class="btn btn-sm btn-outline-danger" @click="eliminarAlumno(a)">Eliminar</button>
        </td>
      </tr>
      <tr v-if="!alumnosFiltrados.length">
        <td colspan="7" class="text-center text-muted">Sin resultados</td>
      </tr>
    </tbody>
  </table>
</template>
