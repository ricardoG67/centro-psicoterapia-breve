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

const tab = ref('alumno') // alumno | formacion | record | alumnos
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
    supabase
      .from('alumnos')
      .select('id, nombres, apellidos, tipo_documento, documento, fecha_nacimiento, correo, celular, nacionalidad')
      .order('apellidos'),
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

// No usar `new Date(iso)` aquí: un string "2024-03-21" se interpreta como
// UTC medianoche, y al mostrarlo en la hora local de Perú (UTC-5) se ve
// un día antes. Formateamos directo desde el texto, sin pasar por Date.
function formatFechaCorta(fecha) {
  const [y, m, d] = fecha.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

function formatRango(inicio, fin) {
  if (inicio && fin) return `del ${formatFechaCorta(inicio)} al ${formatFechaCorta(fin)}`
  if (inicio) return `desde ${formatFechaCorta(inicio)}`
  if (fin) return `hasta ${formatFechaCorta(fin)}`
  return '—'
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

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const mesCumple = ref('') // '' = todos los meses, '1'..'12' = solo ese mes

// Con un mes elegido: solo los que cumplen ese mes, ordenados por día.
// Sin mes: todos, en el orden de siempre (por apellido).
const alumnosListado = computed(() => {
  if (!mesCumple.value) return alumnos.value
  const mes = Number(mesCumple.value)
  return alumnos.value
    .filter((a) => a.fecha_nacimiento && Number(a.fecha_nacimiento.split('-')[1]) === mes)
    .sort((x, y) => Number(x.fecha_nacimiento.split('-')[2]) - Number(y.fecha_nacimiento.split('-')[2]))
})

function fechaNacimiento(a) {
  return a.fecha_nacimiento ? formatFechaCorta(a.fecha_nacimiento) : ''
}

// Agrega, después de cada fila, una fila por cada curso componente (para
// que el PDF/Excel muestre el mismo desglose que se ve en pantalla).
function conDesglose(filas, formatoFila, idxNota) {
  const rows = []
  for (const r of filas) {
    rows.push(formatoFila(r))
    for (const c of cursosDe(r.matricula_id)) {
      const fila = formatoFila(r).map(() => '')
      fila[0] = `    · ${c.curso}`
      fila[idxNota] = c.calificacion ?? '—'
      rows.push(fila)
    }
  }
  return rows
}

function formatoFilaAlumno(r) {
  return [r.formacion, r.periodo, r.calificacion, formatRango(r.formacion_fecha_inicio, r.formacion_fecha_fin), r.observacion]
}

function formatoFilaRecord(r) {
  return [r.documento, r.nombres, r.apellidos, r.formacion, r.calificacion]
}

function exportarActual(formato) {
  let title, columns, rows, filenameBase

  if (tab.value === 'alumno') {
    const a = alumnos.value.find((x) => x.id === alumnoIdReporte.value)
    title = `Notas de ${a?.nombres ?? ''} ${a?.apellidos ?? ''}`
    columns = ['Formación', 'Periodo', 'Nota final', 'Fechas inicio/fin', 'Observación']
    rows = conDesglose(notasPorAlumno.value, formatoFilaAlumno, 2)
    filenameBase = `notas_${a?.apellidos ?? 'alumno'}`
  } else if (tab.value === 'formacion') {
    const f = formaciones.value.find((x) => x.id === formacionIdReporte.value)
    title = `Notas de la formación ${f?.nombre ?? ''}`
    columns = ['Documento', 'Alumno', 'Nota final']
    rows = notasPorFormacion.value.map((r) => [r.documento, `${r.nombres} ${r.apellidos}`, r.calificacion])
    filenameBase = `notas_formacion_${f?.nombre ?? ''}`
  } else if (tab.value === 'record') {
    const a = alumnos.value.find((x) => x.id === alumnoIdRecord.value)
    title = `Record de notas de ${a?.nombres ?? ''} ${a?.apellidos ?? ''}`
    columns = ['Documento', 'Nombres', 'Apellidos', 'Formación', 'Nota final']
    rows = conDesglose(recordDeAlumno.value, formatoFilaRecord, 4)
    filenameBase = `record_${a?.apellidos ?? 'alumno'}`
  } else {
    const mes = mesCumple.value ? MESES[Number(mesCumple.value) - 1] : null
    title = mes ? `Cumpleaños de ${mes.toLowerCase()}` : 'Listado de alumnos'
    columns = ['Documento', 'Nombres', 'Apellidos', 'Fecha de nacimiento', 'Correo', 'Celular', 'Nacionalidad']
    rows = alumnosListado.value.map((a) => [
      `${a.tipo_documento} ${a.documento}`, a.nombres, a.apellidos, fechaNacimiento(a), a.correo, a.celular, a.nacionalidad,
    ])
    filenameBase = mes ? `cumpleanos_${mes}` : 'listado_alumnos'
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
    <li class="nav-item">
      <button class="nav-link" :class="{ active: tab === 'alumnos' }" @click="tab = 'alumnos'">Alumnos</button>
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
              <th></th><th>Formación</th><th>Periodo</th><th>Nota final</th><th>Fechas inicio/fin</th><th>Observación</th>
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
                <td>{{ r.formacion }}</td><td>{{ r.periodo ?? '—' }}</td>
                <td>{{ r.calificacion ?? '—' }}</td>
                <td>{{ formatRango(r.formacion_fecha_inicio, r.formacion_fecha_fin) }}</td>
                <td>{{ r.observacion ?? '—' }}</td>
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
            <tr><th>Documento</th><th>Alumno</th><th>Nota final</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in notasPorFormacion" :key="r.matricula_id">
              <td>{{ r.documento }}</td><td>{{ r.nombres }} {{ r.apellidos }}</td>
              <td>{{ r.calificacion ?? '—' }}</td>
            </tr>
            <tr v-if="!notasPorFormacion.length"><td colspan="3" class="text-center text-muted">Sin registros</td></tr>
          </tbody>
        </table>
      </template>
    </div>

    <div v-else-if="tab === 'record'">
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

    <div v-else>
      <p class="text-muted small">
        Listado de alumnos registrados. Elige un mes para ver solo los cumpleaños de ese mes
        (ordenados por día); el PDF y el Excel salen con lo que estés viendo.
      </p>
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <label class="mb-0 small" for="mes-cumple">Cumpleaños de:</label>
        <select id="mes-cumple" v-model="mesCumple" class="form-select form-select-sm" style="max-width: 200px">
          <option value="">Todos los meses</option>
          <option v-for="(m, i) in MESES" :key="m" :value="String(i + 1)">{{ m }}</option>
        </select>
        <button class="btn btn-sm btn-outline-secondary" @click="mesCumple = String(new Date().getMonth() + 1)">
          Este mes
        </button>
        <span class="text-muted small ms-2">{{ alumnosListado.length }} alumno(s)</span>
      </div>
      <div class="mb-2 d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('pdf')">Exportar PDF</button>
        <button class="btn btn-sm btn-outline-secondary" @click="exportarActual('excel')">Exportar Excel</button>
      </div>
      <table class="table bg-white">
        <thead>
          <tr>
            <th>Documento</th><th>Nombres</th><th>Apellidos</th><th>Fecha de nacimiento</th>
            <th>Correo</th><th>Celular</th><th>Nacionalidad</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in alumnosListado" :key="a.id">
            <td>{{ a.tipo_documento }} {{ a.documento }}</td><td>{{ a.nombres }}</td><td>{{ a.apellidos }}</td>
            <td>{{ fechaNacimiento(a) }}</td>
            <td>{{ a.correo }}</td><td>{{ a.celular }}</td><td>{{ a.nacionalidad }}</td>
          </tr>
          <tr v-if="!alumnosListado.length">
            <td colspan="7" class="text-center text-muted">
              {{ mesCumple ? 'Ningún alumno cumple años en ese mes' : 'Sin alumnos registrados' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
