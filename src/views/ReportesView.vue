<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'
import { exportRowsToPdf, exportRowsToExcel } from '../lib/exportUtils'

const registros = ref([]) // filas de v_record_notas
const alumnos = ref([])
const cursos = ref([])
const loading = ref(true)
const error = ref('')

const tab = ref('alumno') // alumno | curso | record
const alumnoIdReporte = ref('')
const alumnoIdRecord = ref('')
const cursoIdReporte = ref('')

async function cargar() {
  loading.value = true
  error.value = ''
  const [regRes, aRes, cRes] = await Promise.all([
    supabase.from('v_record_notas').select('*'),
    supabase.from('alumnos').select('id, nombres, apellidos, documento').order('apellidos'),
    supabase.from('cursos').select('id, nombre').order('nombre'),
  ])
  if (regRes.error) error.value = regRes.error.message
  else registros.value = regRes.data
  if (aRes.error) error.value = aRes.error.message
  else alumnos.value = aRes.data
  if (cRes.error) error.value = cRes.error.message
  else cursos.value = cRes.data
  loading.value = false
}

const notasPorAlumno = computed(() =>
  registros.value.filter((r) => r.alumno_id === alumnoIdReporte.value)
)

const notasPorCurso = computed(() =>
  registros.value.filter((r) => r.curso_id === cursoIdReporte.value)
)

const recordDeAlumno = computed(() =>
  registros.value.filter((r) => r.alumno_id === alumnoIdRecord.value)
)

function exportarActual(formato) {
  let title, columns, rows, filenameBase

  if (tab.value === 'alumno') {
    const a = alumnos.value.find((x) => x.id === alumnoIdReporte.value)
    title = `Notas de ${a?.nombres ?? ''} ${a?.apellidos ?? ''}`
    columns = ['Curso', 'Edición', 'Docente', 'Calificación', 'Fecha evaluación', 'Observación']
    rows = notasPorAlumno.value.map((r) => [
      r.curso, r.nombre_edicion, r.docente, r.calificacion, r.fecha_evaluacion, r.observacion,
    ])
    filenameBase = `notas_${a?.apellidos ?? 'alumno'}`
  } else if (tab.value === 'curso') {
    const c = cursos.value.find((x) => x.id === cursoIdReporte.value)
    title = `Notas del curso ${c?.nombre ?? ''}`
    columns = ['Documento', 'Alumno', 'Edición', 'Calificación', 'Fecha evaluación']
    rows = notasPorCurso.value.map((r) => [
      r.documento, `${r.nombres} ${r.apellidos}`, r.nombre_edicion, r.calificacion, r.fecha_evaluacion,
    ])
    filenameBase = `notas_curso_${c?.nombre ?? ''}`
  } else {
    const a = alumnos.value.find((x) => x.id === alumnoIdRecord.value)
    title = `Record de notas de ${a?.nombres ?? ''} ${a?.apellidos ?? ''}`
    columns = ['Documento', 'Nombres', 'Apellidos', 'Curso', 'Edición', 'Calificación']
    rows = recordDeAlumno.value.map((r) => [
      r.documento, r.nombres, r.apellidos, r.curso, r.nombre_edicion, r.calificacion,
    ])
    filenameBase = `record_${a?.apellidos ?? 'alumno'}`
  }

  const filenameSafe = filenameBase.toLowerCase().replace(/\s+/g, '_')
  if (formato === 'pdf') exportRowsToPdf(title, columns, rows, `${filenameSafe}.pdf`)
  else exportRowsToExcel(title, columns, rows, `${filenameSafe}.xlsx`)
}

onMounted(cargar)
</script>

<template>
  <h1 class="h4 mb-3">Reportes</h1>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>

  <ul class="nav nav-tabs mb-3">
    <li class="nav-item">
      <button class="nav-link" :class="{ active: tab === 'alumno' }" @click="tab = 'alumno'">Notas por alumno</button>
    </li>
    <li class="nav-item">
      <button class="nav-link" :class="{ active: tab === 'curso' }" @click="tab = 'curso'">Notas por curso</button>
    </li>
    <li class="nav-item">
      <button class="nav-link" :class="{ active: tab === 'record' }" @click="tab = 'record'">Record de notas</button>
    </li>
  </ul>

  <div v-if="loading">Cargando...</div>

  <template v-else>
    <div v-if="tab === 'alumno'">
      <select v-model="alumnoIdReporte" class="form-select mb-3" style="max-width: 400px">
        <option value="" disabled>Selecciona un alumno</option>
        <option v-for="a in alumnos" :key="a.id" :value="a.id">{{ a.apellidos }}, {{ a.nombres }}</option>
      </select>

      <template v-if="alumnoIdReporte">
        <div class="mb-2 d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('pdf')">Exportar PDF</button>
          <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('excel')">Exportar Excel</button>
        </div>
        <table class="table bg-white">
          <thead>
            <tr>
              <th>Curso</th><th>Edición</th><th>Docente</th><th>Calificación</th><th>Fecha evaluación</th><th>Observación</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in notasPorAlumno" :key="r.edicion_id">
              <td>{{ r.curso }}</td><td>{{ r.nombre_edicion }}</td><td>{{ r.docente }}</td>
              <td>{{ r.calificacion ?? '—' }}</td><td>{{ r.fecha_evaluacion ?? '—' }}</td><td>{{ r.observacion ?? '—' }}</td>
            </tr>
            <tr v-if="!notasPorAlumno.length"><td colspan="6" class="text-center text-muted">Sin registros</td></tr>
          </tbody>
        </table>
      </template>
    </div>

    <div v-else-if="tab === 'curso'">
      <select v-model="cursoIdReporte" class="form-select mb-3" style="max-width: 400px">
        <option value="" disabled>Selecciona un curso</option>
        <option v-for="c in cursos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
      </select>

      <template v-if="cursoIdReporte">
        <div class="mb-2 d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('pdf')">Exportar PDF</button>
          <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('excel')">Exportar Excel</button>
        </div>
        <table class="table bg-white">
          <thead>
            <tr><th>Documento</th><th>Alumno</th><th>Edición</th><th>Calificación</th><th>Fecha evaluación</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in notasPorCurso" :key="r.alumno_id + r.edicion_id">
              <td>{{ r.documento }}</td><td>{{ r.nombres }} {{ r.apellidos }}</td><td>{{ r.nombre_edicion }}</td>
              <td>{{ r.calificacion ?? '—' }}</td><td>{{ r.fecha_evaluacion ?? '—' }}</td>
            </tr>
            <tr v-if="!notasPorCurso.length"><td colspan="5" class="text-center text-muted">Sin registros</td></tr>
          </tbody>
        </table>
      </template>
    </div>

    <div v-else>
      <select v-model="alumnoIdRecord" class="form-select mb-3" style="max-width: 400px">
        <option value="" disabled>Selecciona un alumno</option>
        <option v-for="a in alumnos" :key="a.id" :value="a.id">{{ a.apellidos }}, {{ a.nombres }}</option>
      </select>

      <template v-if="alumnoIdRecord">
        <div class="mb-2 d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('pdf')">Exportar PDF</button>
          <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('excel')">Exportar Excel</button>
        </div>
        <table class="table bg-white">
          <thead>
            <tr><th>Documento</th><th>Nombres</th><th>Apellidos</th><th>Curso</th><th>Edición</th><th>Calificación</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in recordDeAlumno" :key="r.edicion_id">
              <td>{{ r.documento }}</td><td>{{ r.nombres }}</td><td>{{ r.apellidos }}</td>
              <td>{{ r.curso }}</td><td>{{ r.nombre_edicion }}</td><td>{{ r.calificacion ?? '—' }}</td>
            </tr>
            <tr v-if="!recordDeAlumno.length"><td colspan="6" class="text-center text-muted">Sin registros</td></tr>
          </tbody>
        </table>
      </template>
    </div>
  </template>
</template>
