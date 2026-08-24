<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '../lib/supabaseClient'

const alumnos = ref([])
const cursos = ref([])
const ediciones = ref([])
const error = ref('')

const busquedaAlumno = ref('')
const alumnoSeleccionado = ref(null)
const matriculas = ref([])
const loadingMatriculas = ref(false)

const cursoNuevaMatriculaId = ref('')
const edicionNuevaMatriculaId = ref('')
const matriculando = ref(false)

const notaEnEdicion = ref(null) // { matricula_id, calificacion, observacion, fecha_evaluacion }
const savingNota = ref(false)

async function cargarCatalogos() {
  const [aRes, cRes, eRes] = await Promise.all([
    supabase.from('alumnos').select('id, nombres, apellidos, documento').order('apellidos'),
    supabase.from('cursos').select('id, nombre').order('nombre'),
    supabase.from('ediciones').select('id, curso_id, nombre_edicion').order('nombre_edicion'),
  ])
  if (aRes.error) error.value = aRes.error.message
  else alumnos.value = aRes.data
  if (cRes.error) error.value = cRes.error.message
  else cursos.value = cRes.data
  if (eRes.error) error.value = eRes.error.message
  else ediciones.value = eRes.data
}

const alumnosFiltrados = computed(() => {
  const q = busquedaAlumno.value.trim().toLowerCase()
  if (!q) return alumnos.value
  return alumnos.value.filter((a) =>
    [a.nombres, a.apellidos, a.documento].join(' ').toLowerCase().includes(q)
  )
})

const edicionesDelCursoNuevaMatricula = computed(() =>
  ediciones.value.filter((e) => e.curso_id === cursoNuevaMatriculaId.value)
)

async function seleccionarAlumno(alumno) {
  alumnoSeleccionado.value = alumno
  notaEnEdicion.value = null
  await cargarMatriculas()
}

async function cargarMatriculas() {
  if (!alumnoSeleccionado.value) return
  loadingMatriculas.value = true
  error.value = ''
  const { data, error: err } = await supabase
    .from('matriculas')
    .select(
      `id, fecha_matricula,
       edicion:ediciones ( id, nombre_edicion, docente, fecha_inicio, fecha_fin, curso:cursos ( nombre ) ),
       nota:notas ( id, calificacion, observacion, fecha_evaluacion )`
    )
    .eq('alumno_id', alumnoSeleccionado.value.id)
    .order('fecha_matricula', { ascending: false })
  if (err) error.value = err.message
  else matriculas.value = data
  loadingMatriculas.value = false
}

async function matricular() {
  if (!edicionNuevaMatriculaId.value) return
  matriculando.value = true
  error.value = ''
  const { error: err } = await supabase.from('matriculas').insert({
    alumno_id: alumnoSeleccionado.value.id,
    edicion_id: edicionNuevaMatriculaId.value,
  })
  if (err) {
    error.value = err.code === '23505' ? 'El alumno ya está matriculado en esa edición.' : err.message
  } else {
    cursoNuevaMatriculaId.value = ''
    edicionNuevaMatriculaId.value = ''
    await cargarMatriculas()
  }
  matriculando.value = false
}

async function eliminarMatricula(matricula) {
  if (!confirm(`¿Quitar la matrícula en "${matricula.edicion.curso.nombre} - ${matricula.edicion.nombre_edicion}"? Se borrará también su nota.`)) return
  const { error: err } = await supabase.from('matriculas').delete().eq('id', matricula.id)
  if (err) error.value = err.message
  else await cargarMatriculas()
}

function editarNota(matricula) {
  notaEnEdicion.value = {
    matricula_id: matricula.id,
    calificacion: matricula.nota?.calificacion ?? '',
    observacion: matricula.nota?.observacion ?? '',
    fecha_evaluacion: matricula.nota?.fecha_evaluacion ?? '',
  }
}

async function guardarNota() {
  savingNota.value = true
  error.value = ''
  const payload = {
    matricula_id: notaEnEdicion.value.matricula_id,
    calificacion: notaEnEdicion.value.calificacion === '' ? null : notaEnEdicion.value.calificacion,
    observacion: notaEnEdicion.value.observacion || null,
    fecha_evaluacion: notaEnEdicion.value.fecha_evaluacion || null,
  }
  const { error: err } = await supabase.from('notas').upsert(payload, { onConflict: 'matricula_id' })
  if (err) error.value = err.message
  else {
    notaEnEdicion.value = null
    await cargarMatriculas()
  }
  savingNota.value = false
}

watch(cursoNuevaMatriculaId, () => {
  edicionNuevaMatriculaId.value = ''
})

onMounted(cargarCatalogos)
</script>

<template>
  <h1 class="h4 mb-3">Matrícula y notas</h1>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>

  <div class="row">
    <div class="col-md-4">
      <input v-model="busquedaAlumno" class="form-control mb-2" placeholder="Buscar alumno..." />
      <div class="list-group" style="max-height: 60vh; overflow-y: auto">
        <button
          v-for="a in alumnosFiltrados"
          :key="a.id"
          class="list-group-item list-group-item-action"
          :class="{ active: alumnoSeleccionado?.id === a.id }"
          @click="seleccionarAlumno(a)"
        >
          {{ a.apellidos }}, {{ a.nombres }}
          <div class="small text-muted">{{ a.documento }}</div>
        </button>
        <div v-if="!alumnosFiltrados.length" class="text-muted p-2">Sin resultados</div>
      </div>
    </div>

    <div class="col-md-8">
      <div v-if="!alumnoSeleccionado" class="text-muted">Selecciona un alumno para ver sus cursos y notas.</div>

      <template v-else>
        <h2 class="h5">{{ alumnoSeleccionado.nombres }} {{ alumnoSeleccionado.apellidos }}</h2>

        <div class="card mb-3">
          <div class="card-body">
            <h3 class="h6">Matricular en una edición</h3>
            <div class="row g-2">
              <div class="col-md-5">
                <select v-model="cursoNuevaMatriculaId" class="form-select">
                  <option value="" disabled>Selecciona un curso</option>
                  <option v-for="c in cursos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
                </select>
              </div>
              <div class="col-md-5">
                <select v-model="edicionNuevaMatriculaId" class="form-select" :disabled="!cursoNuevaMatriculaId">
                  <option value="" disabled>Selecciona una edición</option>
                  <option v-for="e in edicionesDelCursoNuevaMatricula" :key="e.id" :value="e.id">
                    {{ e.nombre_edicion }}
                  </option>
                </select>
              </div>
              <div class="col-md-2">
                <button class="btn btn-primary w-100" :disabled="!edicionNuevaMatriculaId || matriculando" @click="matricular">
                  Matricular
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="loadingMatriculas">Cargando...</div>
        <table v-else class="table bg-white">
          <thead>
            <tr>
              <th>Curso / Edición</th>
              <th>Docente</th>
              <th>Calificación</th>
              <th>Fecha evaluación</th>
              <th>Observación</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="m in matriculas" :key="m.id">
              <tr>
                <td>{{ m.edicion.curso.nombre }} — {{ m.edicion.nombre_edicion }}</td>
                <td>{{ m.edicion.docente }}</td>
                <td>{{ m.nota?.calificacion ?? '—' }}</td>
                <td>{{ m.nota?.fecha_evaluacion ?? '—' }}</td>
                <td>{{ m.nota?.observacion ?? '—' }}</td>
                <td class="table-actions">
                  <button class="btn btn-sm btn-outline-primary me-1" @click="editarNota(m)">
                    {{ m.nota ? 'Editar nota' : 'Registrar nota' }}
                  </button>
                  <button class="btn btn-sm btn-outline-danger" @click="eliminarMatricula(m)">Quitar</button>
                </td>
              </tr>
              <tr v-if="notaEnEdicion && notaEnEdicion.matricula_id === m.id">
                <td colspan="6">
                  <form @submit.prevent="guardarNota" class="row g-2">
                    <div class="col-md-2">
                      <label class="form-label small">Calificación</label>
                      <input v-model="notaEnEdicion.calificacion" type="number" step="0.01" class="form-control form-control-sm" />
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small">Fecha de evaluación</label>
                      <input v-model="notaEnEdicion.fecha_evaluacion" type="date" class="form-control form-control-sm" />
                    </div>
                    <div class="col-md-5">
                      <label class="form-label small">Observación del docente</label>
                      <input v-model="notaEnEdicion.observacion" class="form-control form-control-sm" />
                    </div>
                    <div class="col-md-2 d-flex align-items-end gap-1">
                      <button class="btn btn-sm btn-primary" type="submit" :disabled="savingNota">Guardar</button>
                      <button class="btn btn-sm btn-outline-secondary" type="button" @click="notaEnEdicion = null">Cancelar</button>
                    </div>
                  </form>
                </td>
              </tr>
            </template>
            <tr v-if="!matriculas.length">
              <td colspan="6" class="text-center text-muted">Aún no tiene matrículas</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>
