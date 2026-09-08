<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'

const formaciones = ref([])
const cursosDisponibles = ref([])
const composicion = ref([]) // filas de formacion_cursos, con el curso embebido
const loading = ref(true)
const error = ref('')
const search = ref('')
const expandido = ref(new Set())

const emptyForm = () => ({ id: null, nombre: '', descripcion: '', horas: '' })
const form = ref(emptyForm())
const showForm = ref(false)
const saving = ref(false)

const cursoParaAgregar = ref({}) // formacion_id -> curso_id seleccionado
const agregandoCurso = ref('')

async function cargarTodo() {
  loading.value = true
  error.value = ''
  const [fRes, cRes, fcRes] = await Promise.all([
    supabase.from('formaciones').select('*').order('nombre'),
    supabase.from('cursos').select('id, nombre').order('nombre'),
    supabase.from('formacion_cursos').select('id, formacion_id, curso_id, orden, curso:cursos(id, nombre)').order('orden'),
  ])
  if (fRes.error) error.value = fRes.error.message
  else formaciones.value = fRes.data
  if (cRes.error) error.value = cRes.error.message
  else cursosDisponibles.value = cRes.data
  if (fcRes.error) error.value = fcRes.error.message
  else composicion.value = fcRes.data
  loading.value = false
}

const formacionesFiltradas = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return formaciones.value
  return formaciones.value.filter((f) => f.nombre.toLowerCase().includes(q))
})

function cursosDe(formacionId) {
  return composicion.value.filter((c) => c.formacion_id === formacionId)
}

function cursosNoAsignados(formacionId) {
  const asignadosIds = new Set(cursosDe(formacionId).map((c) => c.curso_id))
  return cursosDisponibles.value.filter((c) => !asignadosIds.has(c.id))
}

function toggleExpandir(formacionId) {
  const s = new Set(expandido.value)
  s.has(formacionId) ? s.delete(formacionId) : s.add(formacionId)
  expandido.value = s
}

function nuevaFormacion() {
  form.value = emptyForm()
  showForm.value = true
}

function editarFormacion(formacion) {
  form.value = { ...formacion, horas: formacion.horas ?? '' }
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
    ? supabase.from('formaciones').update({ nombre, descripcion, horas }).eq('id', id)
    : supabase.from('formaciones').insert({ nombre, descripcion, horas })
  const { error: err } = await query
  if (err) {
    error.value = err.code === '23505' ? 'Ya existe una formación con ese nombre.' : err.message
  } else {
    await cargarTodo()
    cancelar()
  }
  saving.value = false
}

async function eliminarFormacion(formacion) {
  if (!confirm(`¿Eliminar la formación "${formacion.nombre}"? Esto también borra sus matrículas y notas.`)) return
  const { error: err } = await supabase.from('formaciones').delete().eq('id', formacion.id)
  if (err) error.value = err.message
  else await cargarTodo()
}

async function agregarCurso(formacionId) {
  const cursoId = cursoParaAgregar.value[formacionId]
  if (!cursoId) return
  agregandoCurso.value = formacionId
  error.value = ''
  const orden = cursosDe(formacionId).length
  const { error: err } = await supabase.from('formacion_cursos').insert({ formacion_id: formacionId, curso_id: cursoId, orden })
  if (err) error.value = err.message
  else {
    cursoParaAgregar.value = { ...cursoParaAgregar.value, [formacionId]: '' }
    await cargarTodo()
  }
  agregandoCurso.value = ''
}

async function quitarCurso(fila) {
  if (!confirm(`¿Quitar "${fila.curso.nombre}" de esta formación? Las notas ya registradas en ese curso no se borran, pero dejará de aparecer como curso pendiente de calificar.`)) return
  const { error: err } = await supabase.from('formacion_cursos').delete().eq('id', fila.id)
  if (err) error.value = err.message
  else await cargarTodo()
}

onMounted(cargarTodo)
</script>

<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h1 class="h4 mb-0">Formaciones</h1>
    <button class="btn btn-primary" @click="nuevaFormacion">+ Nueva formación</button>
  </div>

  <div v-if="error" class="alert alert-danger">{{ error }}</div>

  <div v-if="showForm" class="card mb-4">
    <div class="card-body">
      <h2 class="h6">{{ form.id ? 'Editar formación' : 'Nueva formación' }}</h2>
      <form @submit.prevent="guardar" class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Nombre de la formación</label>
          <input v-model="form.nombre" class="form-control" required placeholder="Ej: Formación Psicoterapia Edición III" />
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

  <input v-model="search" class="form-control mb-3" placeholder="Buscar formación..." />

  <div v-if="loading">Cargando...</div>

  <div v-else class="d-flex flex-column gap-3">
    <div v-for="f in formacionesFiltradas" :key="f.id" class="card">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <button class="btn btn-sm btn-link text-decoration-none" @click="toggleExpandir(f.id)">
              {{ expandido.has(f.id) ? '▾' : '▸' }} <strong>{{ f.nombre }}</strong>
            </button>
            <span class="text-muted small ms-2">{{ cursosDe(f.id).length }} curso(s) · {{ f.horas ?? '—' }} horas</span>
          </div>
          <div class="table-actions">
            <button class="btn btn-sm btn-outline-primary me-1" @click="editarFormacion(f)">Editar</button>
            <button class="btn btn-sm btn-outline-danger" @click="eliminarFormacion(f)">Eliminar</button>
          </div>
        </div>

        <div v-if="expandido.has(f.id)" class="mt-3">
          <p class="text-muted small mb-2">
            Cursos que componen esta formación. Si no agregas ninguno, la nota se ingresa
            directamente en la formación (como antes). Si agregas varios, cada uno tiene su
            propia nota y la nota final se sugiere como el promedio.
          </p>
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Curso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="fc in cursosDe(f.id)" :key="fc.id">
                <td>{{ fc.curso.nombre }}</td>
                <td class="table-actions">
                  <button class="btn btn-sm btn-outline-danger" @click="quitarCurso(fc)">Quitar</button>
                </td>
              </tr>
              <tr v-if="!cursosDe(f.id).length">
                <td colspan="2" class="text-center text-muted">Sin cursos asignados (nota directa)</td>
              </tr>
            </tbody>
          </table>

          <div class="row g-2 align-items-end">
            <div class="col-md-8">
              <select v-model="cursoParaAgregar[f.id]" class="form-select form-select-sm">
                <option value="" disabled>Selecciona un curso del catálogo</option>
                <option v-for="c in cursosNoAsignados(f.id)" :key="c.id" :value="c.id">{{ c.nombre }}</option>
              </select>
            </div>
            <div class="col-md-4">
              <button
                class="btn btn-sm btn-outline-secondary w-100"
                :disabled="!cursoParaAgregar[f.id] || agregandoCurso === f.id"
                @click="agregarCurso(f.id)"
              >
                + Agregar a la formación
              </button>
            </div>
          </div>
          <p v-if="!cursosDisponibles.length" class="text-muted small mt-2 mb-0">
            Aún no hay cursos en el catálogo — créalos en la sección "Cursos".
          </p>
        </div>
      </div>
    </div>

    <div v-if="!formaciones.length" class="text-center text-muted">Aún no hay formaciones registradas.</div>
  </div>
</template>
