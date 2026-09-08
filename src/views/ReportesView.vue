<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'
import { exportRowsToPdf, exportRowsToExcel } from '../lib/exportUtils'

const registros = ref([]) // filas de v_record_notas
const notasCurso = ref([]) // filas de v_notas_curso
const alumnos = ref([])
const formaciones = ref([])
const loading = ref(true)
const error = ref('')

const tab = ref('alumno') // alumno | formacion | record
const alumnoIdReporte = ref('')
const alumnoIdRecord = ref('')
const formacionIdReporte = ref('')
const expandido = ref(new Set())

async function cargar() {
  loading.value = true
  error.value = ''
  const [regRes, ncRes, aRes, fRes] = await Promise.all([
    supabase.from('v_record_notas').select('*'),
    supabase.from('v_notas_curso').select('*'),
    supabase.from('alumnos').select('id, nombres, apellidos, documento').order('apellidos'),
    supabase.from('formaciones').select('id, nombre').order('nombre'),
  ])
  if (regRes.error) error.value = regRes.error.message
  else registros.value = regRes.data
  if (ncRes.error) error.value = ncRes.error.message
  else notasCurso.value = ncRes.data
  if (aRes.error) error.value = aRes.error.message
  else alumnos.value = aRes.data
  if (fRes.error) error.value = fRes.error.message
  else formaciones.value = fRes.data
  loading.value = false
}

function cursosDe(matriculaId) {
  return notasCurso.value.filter((n) => n.matricula_id === matriculaId)
}

function toggleExpandir(matriculaId) {
  const s = new Set(expandido.value)
  s.has(matriculaId) ? s.delete(matriculaId) : s.add(matriculaId)
  expandido.value = s
}

const notasPorAlumno = computed(() =>
  registros.value.filter((r) => r.alumno_id === alumnoIdReporte.value)
)

const notasPorFormacion = computed(() =>
  registros.value.filter((r) => r.formacion_id === formacionIdReporte.value)
)

const recordDeAlumno = computed(() =>
  registros.value.filter((r) => r.alumno_id === alumnoIdRecord.value)
)

function exportarActual(formato) {
  let title, columns, rows, filenameBase

  if (tab.value === 'alumno') {
    const a = alumnos.value.find((x) => x.id === alumnoIdReporte.value)
    title = `Notas de ${a?.nombres ?? ''} ${a?.apellidos ?? ''}`
    columns = ['Formación', 'Docente', 'Nota final', 'Fecha evaluación', 'Observación']
    rows = notasPorAlumno.value.map((r) => [
      r.formacion, r.docente, r.calificacion, r.fecha_evaluacion, r.observacion,
    ])
    filenameBase = `notas_${a?.apellidos ?? 'alumno'}`
  } else if (tab.value === 'formacion') {
    const f = formaciones.value.find((x) => x.id === formacionIdReporte.value)
    title = `Notas de la formación ${f?.nombre ?? ''}`
    columns = ['Documento', 'Alumno', 'Nota final', 'Fecha evaluación']
    rows = notasPorFormacion.value.map((r) => [
      r.documento, `${r.nombres} ${r.apellidos}`, r.calificacion, r.fecha_evaluacion,
    ])
    filenameBase = `notas_formacion_${f?.nombre ?? ''}`
  } else {
    const a = alumnos.value.find((x) => x.id === alumnoIdRecord.value)
    title = `Record de notas de ${a?.nombres ?? ''} ${a?.apellidos ?? ''}`
    columns = ['Documento', 'Nombres', 'Apellidos', 'Formación', 'Nota final']
    rows = recordDeAlumno.value.map((r) => [
      r.documento, r.nombres, r.apellidos, r.formacion, r.calificacion,
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
      <button class="nav-link" :class="{ active: tab === 'formacion' }" @click="tab = 'formacion'">Notas por formación</button>
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
              <th></th><th>Formación</th><th>Docente</th><th>Nota final</th><th>Fecha evaluación</th><th>Observación</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="r in notasPorAlumno" :key="r.matricula_id">
              <tr>
                <td>
                  <button
                    v-if="cursosDe(r.matricula_id).length"
                    class="btn btn-sm btn-link p-0"
                    @click="toggleExpandir(r.matricula_id)"
                  >
                    {{ expandido.has(r.matricula_id) ? '▾' : '▸' }}
                  </button>
                </td>
                <td>{{ r.formacion }}</td><td>{{ r.docente }}</td>
                <td>{{ r.calificacion ?? '—' }}</td><td>{{ r.fecha_evaluacion ?? '—' }}</td><td>{{ r.observacion ?? '—' }}</td>
              </tr>
              <tr v-if="expandido.has(r.matricula_id)">
                <td></td>
                <td colspan="5">
                  <table class="table table-sm mb-0">
                    <tbody>
                      <tr v-for="c in cursosDe(r.matricula_id)" :key="c.curso_id">
                        <td class="text-muted">{{ c.curso }}</td>
                        <td>{{ c.calificacion ?? '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
            <tr v-if="!notasPorAlumno.length"><td colspan="6" class="text-center text-muted">Sin registros</td></tr>
          </tbody>
        </table>
      </template>
    </div>

    <div v-else-if="tab === 'formacion'">
      <select v-model="formacionIdReporte" class="form-select mb-3" style="max-width: 400px">
        <option value="" disabled>Selecciona una formación</option>
        <option v-for="f in formaciones" :key="f.id" :value="f.id">{{ f.nombre }}</option>
      </select>

      <template v-if="formacionIdReporte">
        <div class="mb-2 d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('pdf')">Exportar PDF</button>
          <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('excel')">Exportar Excel</button>
        </div>
        <table class="table bg-white">
          <thead>
            <tr><th>Documento</th><th>Alumno</th><th>Nota final</th><th>Fecha evaluación</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in notasPorFormacion" :key="r.matricula_id">
              <td>{{ r.documento }}</td><td>{{ r.nombres }} {{ r.apellidos }}</td>
              <td>{{ r.calificacion ?? '—' }}</td><td>{{ r.fecha_evaluacion ?? '—' }}</td>
            </tr>
            <tr v-if="!notasPorFormacion.length"><td colspan="4" class="text-center text-muted">Sin registros</td></tr>
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
            <tr><th></th><th>Documento</th><th>Nombres</th><th>Apellidos</th><th>Formación</th><th>Nota final</th></tr>
          </thead>
          <tbody>
            <template v-for="r in recordDeAlumno" :key="r.matricula_id">
              <tr>
                <td>
                  <button
                    v-if="cursosDe(r.matricula_id).length"
                    class="btn btn-sm btn-link p-0"
                    @click="toggleExpandir(r.matricula_id)"
                  >
                    {{ expandido.has(r.matricula_id) ? '▾' : '▸' }}
                  </button>
                </td>
                <td>{{ r.documento }}</td><td>{{ r.nombres }}</td><td>{{ r.apellidos }}</td>
                <td>{{ r.formacion }}</td><td>{{ r.calificacion ?? '—' }}</td>
              </tr>
              <tr v-if="expandido.has(r.matricula_id)">
                <td></td>
                <td colspan="5">
                  <table class="table table-sm mb-0">
                    <tbody>
                      <tr v-for="c in cursosDe(r.matricula_id)" :key="c.curso_id">
                        <td class="text-muted">{{ c.curso }}</td>
                        <td>{{ c.calificacion ?? '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
            <tr v-if="!recordDeAlumno.length"><td colspan="6" class="text-center text-muted">Sin registros</td></tr>
          </tbody>
        </table>
      </template>
    </div>
  </template>
</template>
