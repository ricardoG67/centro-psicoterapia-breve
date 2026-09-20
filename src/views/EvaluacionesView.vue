<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'
import {
  notaFinalDe,
  formatNota,
  resumenProfesor,
  exportarEvaluacionPdf,
  exportarEvaluacionExcel,
  exportarResumenPdf,
  exportarResumenExcel,
} from '../lib/evaluacionUtils'

const evaluaciones = ref([])
const profesores = ref([])
const formaciones = ref([])
const composicion = ref([]) // formacion_cursos: qué cursos tiene cada formación
const preguntas = ref([]) // cuestionario por defecto
const loading = ref(true)
const error = ref('')

const filtroProfesor = ref('')
const filtroFormacion = ref('')
const reporteAbierto = ref(null)

const showForm = ref(false)
const form = ref(null) // { id, profesor_id, formacion_id, curso_id, encuestados, respuestas: [{ orden, pregunta, promedio }] }
const saving = ref(false)

const showCuestionario = ref(false)
const nuevaPregunta = ref('')
const preguntaEnEdicion = ref(null) // { id, texto }
const savingPregunta = ref(false)

let primeraCarga = true

async function cargar() {
  if (primeraCarga) loading.value = true
  error.value = ''
  const [eRes, pRes, fRes, fcRes, qRes] = await Promise.all([
    supabase
      .from('evaluaciones_docentes')
      .select(
        `id, profesor_id, formacion_id, curso_id, encuestados,
         profesor:profesores ( id, nombre ),
         formacion:formaciones ( id, nombre, periodo ),
         curso:cursos ( id, nombre ),
         respuestas:evaluacion_respuestas ( id, orden, pregunta, promedio )`
      )
      .order('created_at', { ascending: false }),
    supabase.from('profesores').select('id, nombre').order('nombre'),
    supabase.from('formaciones').select('id, nombre, periodo').order('nombre'),
    supabase.from('formacion_cursos').select('formacion_id, curso_id, orden, curso:cursos ( id, nombre )').order('orden'),
    supabase.from('evaluacion_preguntas').select('id, texto, orden').order('orden'),
  ])
  if (eRes.error) error.value = eRes.error.message
  else evaluaciones.value = eRes.data.map((e) => ({ ...e, respuestas: [...e.respuestas].sort((a, b) => a.orden - b.orden) }))
  if (pRes.error) error.value = pRes.error.message
  else profesores.value = pRes.data
  if (fRes.error) error.value = fRes.error.message
  else formaciones.value = fRes.data
  if (fcRes.error) error.value = fcRes.error.message
  else composicion.value = fcRes.data
  if (qRes.error) error.value = qRes.error.message
  else preguntas.value = qRes.data
  primeraCarga = false
  loading.value = false
}

function etiquetaFormacion(f) {
  return f.periodo ? `${f.nombre} (${f.periodo})` : f.nombre
}

const evaluacionesFiltradas = computed(() =>
  evaluaciones.value.filter(
    (e) =>
      (!filtroProfesor.value || e.profesor_id === filtroProfesor.value) &&
      (!filtroFormacion.value || e.formacion_id === filtroFormacion.value)
  )
)

// Con un profesor elegido: promedio de todos sus cursos (dentro de la
// formación elegida, si también se filtró por formación).
const resumen = computed(() => (filtroProfesor.value ? resumenProfesor(evaluacionesFiltradas.value) : null))

const cursosDeFormacion = computed(() => {
  if (!form.value?.formacion_id) return []
  return composicion.value.filter((c) => c.formacion_id === form.value.formacion_id)
})

const placeholderCurso = computed(() => {
  if (!form.value?.formacion_id) return 'Primero elige la formación'
  if (!cursosDeFormacion.value.length) return 'Sin cursos (se evalúa la formación completa)'
  return 'Selecciona un curso'
})

const notaFinalForm = computed(() => {
  const llenas = (form.value?.respuestas ?? []).filter((r) => r.promedio !== '' && r.promedio != null)
  return notaFinalDe(llenas)
})

function nuevaEvaluacion() {
  error.value = ''
  if (!preguntas.value.length) {
    error.value = 'Primero agrega las preguntas del cuestionario (botón "Cuestionario").'
    return
  }
  form.value = {
    id: null,
    profesor_id: '',
    formacion_id: '',
    curso_id: '',
    encuestados: '',
    respuestas: preguntas.value.map((p, i) => ({ orden: i + 1, pregunta: p.texto, promedio: '' })),
  }
  showForm.value = true
}

function editarEvaluacion(e) {
  error.value = ''
  form.value = {
    id: e.id,
    profesor_id: e.profesor_id,
    formacion_id: e.formacion_id,
    curso_id: e.curso_id ?? '',
    encuestados: e.encuestados ?? '',
    respuestas: e.respuestas.map((r) => ({ orden: r.orden, pregunta: r.pregunta, promedio: r.promedio })),
  }
  showForm.value = true
}

function cancelar() {
  showForm.value = false
  form.value = null
}

async function guardar() {
  error.value = ''
  const f = form.value

  const yaExiste = evaluaciones.value.some(
    (e) =>
      e.id !== f.id &&
      e.profesor_id === f.profesor_id &&
      e.formacion_id === f.formacion_id &&
      (e.curso_id ?? '') === (f.curso_id || '')
  )
  if (yaExiste && !confirm('Ya existe una evaluación de este profesor para ese curso y formación. ¿Registrar otra igual?')) return

  saving.value = true
  const cabecera = {
    profesor_id: f.profesor_id,
    formacion_id: f.formacion_id,
    curso_id: f.curso_id || null,
    encuestados: f.encuestados === '' ? null : Number(f.encuestados),
  }

  let evaluacionId = f.id
  if (evaluacionId) {
    const { error: err } = await supabase.from('evaluaciones_docentes').update(cabecera).eq('id', evaluacionId)
    if (err) {
      error.value = err.message
      saving.value = false
      return
    }
  } else {
    const { data, error: err } = await supabase.from('evaluaciones_docentes').insert(cabecera).select('id').single()
    if (err) {
      error.value = err.message
      saving.value = false
      return
    }
    evaluacionId = data.id
  }

  const respuestas = f.respuestas.map((r) => ({
    evaluacion_id: evaluacionId,
    orden: r.orden,
    pregunta: r.pregunta,
    promedio: Number(r.promedio),
  }))
  const { error: errR } = await supabase.from('evaluacion_respuestas').upsert(respuestas, { onConflict: 'evaluacion_id,orden' })
  if (errR) {
    // Evita dejar una evaluación nueva sin respuestas.
    if (!f.id) await supabase.from('evaluaciones_docentes').delete().eq('id', evaluacionId)
    error.value = errR.message
    saving.value = false
    return
  }

  await cargar()
  cancelar()
  saving.value = false
}

async function eliminarEvaluacion(e) {
  if (!confirm(`¿Eliminar la evaluación de ${e.profesor.nombre}${e.curso ? ` en ${e.curso.nombre}` : ''}?`)) return
  const { error: err } = await supabase.from('evaluaciones_docentes').delete().eq('id', e.id)
  if (err) error.value = err.message
  else {
    if (reporteAbierto.value === e.id) reporteAbierto.value = null
    await cargar()
  }
}

function toggleReporte(id) {
  reporteAbierto.value = reporteAbierto.value === id ? null : id
}

async function exportar(e, formato) {
  try {
    if (formato === 'pdf') await exportarEvaluacionPdf(e)
    else exportarEvaluacionExcel(e)
  } catch (err) {
    error.value = 'No se pudo exportar: ' + err.message
  }
}

async function exportarResumen(formato) {
  try {
    if (formato === 'pdf') await exportarResumenPdf(resumen.value)
    else exportarResumenExcel(resumen.value)
  } catch (err) {
    error.value = 'No se pudo exportar: ' + err.message
  }
}

// --- Cuestionario por defecto -------------------------------------------

async function agregarPregunta() {
  const texto = nuevaPregunta.value.trim()
  if (!texto) return
  savingPregunta.value = true
  error.value = ''
  const orden = preguntas.value.length ? Math.max(...preguntas.value.map((p) => p.orden)) + 1 : 1
  const { error: err } = await supabase.from('evaluacion_preguntas').insert({ texto, orden })
  if (err) error.value = err.message
  else {
    nuevaPregunta.value = ''
    await cargar()
  }
  savingPregunta.value = false
}

function editarPregunta(p) {
  preguntaEnEdicion.value = { id: p.id, texto: p.texto }
}

async function guardarPregunta() {
  const texto = preguntaEnEdicion.value.texto.trim()
  if (!texto) return
  savingPregunta.value = true
  error.value = ''
  const { error: err } = await supabase.from('evaluacion_preguntas').update({ texto }).eq('id', preguntaEnEdicion.value.id)
  if (err) error.value = err.message
  else {
    preguntaEnEdicion.value = null
    await cargar()
  }
  savingPregunta.value = false
}

async function eliminarPregunta(p) {
  if (!confirm(`¿Quitar esta pregunta del cuestionario?\n\n"${p.texto}"\n\nLas evaluaciones ya registradas no cambian.`)) return
  const { error: err } = await supabase.from('evaluacion_preguntas').delete().eq('id', p.id)
  if (err) error.value = err.message
  else await cargar()
}

onMounted(cargar)
</script>

<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h1 class="h4 mb-0">Evaluación docente</h1>
    <div class="d-flex gap-2">
      <button class="btn btn-outline-secondary" @click="showCuestionario = !showCuestionario">
        {{ showCuestionario ? 'Cerrar cuestionario' : 'Cuestionario' }}
      </button>
      <button class="btn btn-primary" @click="nuevaEvaluacion">+ Nueva evaluación</button>
    </div>
  </div>

  <div v-if="error" class="alert alert-danger">{{ error }}</div>

  <div v-if="showCuestionario" class="card mb-4">
    <div class="card-body">
      <h2 class="h6">Preguntas del cuestionario</h2>
      <p class="small text-muted">
        Son las preguntas que se cargan al crear una evaluación nueva (escala de 1 a 4). Si las cambias,
        las evaluaciones ya registradas conservan las preguntas con las que se hicieron.
      </p>
      <table class="table table-sm bg-white">
        <tbody>
          <tr v-for="(p, i) in preguntas" :key="p.id">
            <td style="width: 40px">{{ i + 1 }}</td>
            <td>
              <input
                v-if="preguntaEnEdicion && preguntaEnEdicion.id === p.id"
                v-model="preguntaEnEdicion.texto"
                class="form-control form-control-sm"
                @keyup.enter="guardarPregunta"
              />
              <span v-else>{{ p.texto }}</span>
            </td>
            <td class="table-actions">
              <template v-if="preguntaEnEdicion && preguntaEnEdicion.id === p.id">
                <button class="btn btn-sm btn-primary me-1" :disabled="savingPregunta" @click="guardarPregunta">Guardar</button>
                <button class="btn btn-sm btn-outline-secondary" @click="preguntaEnEdicion = null">Cancelar</button>
              </template>
              <template v-else>
                <button class="btn btn-sm btn-outline-primary me-1" @click="editarPregunta(p)">Editar</button>
                <button class="btn btn-sm btn-outline-danger" @click="eliminarPregunta(p)">Quitar</button>
              </template>
            </td>
          </tr>
          <tr v-if="!preguntas.length">
            <td colspan="3" class="text-center text-muted">Aún no hay preguntas</td>
          </tr>
        </tbody>
      </table>
      <form class="d-flex gap-2" @submit.prevent="agregarPregunta">
        <input v-model="nuevaPregunta" class="form-control" placeholder="Escribe una pregunta nueva..." />
        <button class="btn btn-outline-secondary text-nowrap" type="submit" :disabled="savingPregunta || !nuevaPregunta.trim()">
          + Agregar pregunta
        </button>
      </form>
    </div>
  </div>

  <div v-if="showForm" class="card mb-4">
    <div class="card-body">
      <h2 class="h6">{{ form.id ? 'Editar evaluación' : 'Nueva evaluación' }}</h2>
      <form @submit.prevent="guardar">
        <div class="row g-3 mb-3">
          <div class="col-md-4">
            <label class="form-label">Profesor</label>
            <select v-model="form.profesor_id" class="form-select" required>
              <option value="" disabled>{{ profesores.length ? 'Selecciona un profesor' : 'Primero crea profesores en la pestaña Profesores' }}</option>
              <option v-for="p in profesores" :key="p.id" :value="p.id">{{ p.nombre }}</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label">Formación</label>
            <select v-model="form.formacion_id" class="form-select" required @change="form.curso_id = ''">
              <option value="" disabled>Selecciona una formación</option>
              <option v-for="f in formaciones" :key="f.id" :value="f.id">{{ etiquetaFormacion(f) }}</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label">Curso</label>
            <select
              v-model="form.curso_id"
              class="form-select"
              :required="cursosDeFormacion.length > 0"
              :disabled="!cursosDeFormacion.length"
            >
              <option value="" disabled>{{ placeholderCurso }}</option>
              <option v-for="c in cursosDeFormacion" :key="c.curso_id" :value="c.curso_id">{{ c.curso.nombre }}</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">N° de encuestados <span class="text-muted small">(opcional)</span></label>
            <input v-model="form.encuestados" type="number" min="0" class="form-control" />
          </div>
        </div>

        <p class="small text-muted mb-2">
          Escribe el promedio de cada pregunta tal como sale en Moodle (de 1 a 4, puede tener decimales).
        </p>
        <table class="table table-sm bg-white">
          <thead>
            <tr><th>Pregunta</th><th style="width: 160px">Promedio (1 a 4)</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in form.respuestas" :key="r.orden">
              <td>{{ r.pregunta }}</td>
              <td>
                <input
                  v-model="r.promedio"
                  type="number"
                  step="0.01"
                  min="1"
                  max="4"
                  required
                  class="form-control form-control-sm"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mb-3">
          Nota final: <strong>{{ formatNota(notaFinalForm) }}</strong>
          <span class="text-muted small">(promedio de todas las preguntas)</span>
        </p>

        <div class="d-flex gap-2">
          <button class="btn btn-primary" type="submit" :disabled="saving">Guardar</button>
          <button class="btn btn-outline-secondary" type="button" @click="cancelar">Cancelar</button>
        </div>
      </form>
    </div>
  </div>

  <div class="row g-2 mb-3">
    <div class="col-md-4">
      <select v-model="filtroProfesor" class="form-select">
        <option value="">Todos los profesores</option>
        <option v-for="p in profesores" :key="p.id" :value="p.id">{{ p.nombre }}</option>
      </select>
    </div>
    <div class="col-md-5">
      <select v-model="filtroFormacion" class="form-select">
        <option value="">Todas las formaciones</option>
        <option v-for="f in formaciones" :key="f.id" :value="f.id">{{ etiquetaFormacion(f) }}</option>
      </select>
    </div>
  </div>

  <div v-if="resumen" class="card mb-3">
    <div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div>
        <h2 class="h6 mb-1">
          Promedio general de {{ resumen.docente }}<span v-if="filtroFormacion"> (solo en la formación elegida)</span>
        </h2>
        <div>
          <strong class="fs-4">{{ formatNota(resumen.promedio) }}</strong>
          <span class="text-muted small ms-2">
            promedio de la nota final de {{ resumen.filas.length }} curso(s) evaluado(s); cada curso pesa igual
          </span>
        </div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary" @click="exportarResumen('pdf')">Exportar resumen PDF</button>
        <button class="btn btn-sm btn-outline-secondary" @click="exportarResumen('excel')">Exportar resumen Excel</button>
      </div>
    </div>
  </div>
  <p v-else-if="!filtroProfesor && evaluaciones.length" class="text-muted small">
    Elige un profesor para ver el promedio de todos sus cursos.
  </p>

  <div v-if="loading">Cargando...</div>
  <table v-else class="table bg-white">
    <thead>
      <tr>
        <th>Profesor</th>
        <th>Curso</th>
        <th>Formación</th>
        <th>Encuestados</th>
        <th>Nota final</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <template v-for="e in evaluacionesFiltradas" :key="e.id">
        <tr>
          <td>{{ e.profesor.nombre }}</td>
          <td>{{ e.curso?.nombre ?? '—' }}</td>
          <td>{{ etiquetaFormacion(e.formacion) }}</td>
          <td>{{ e.encuestados ?? '—' }}</td>
          <td><strong>{{ formatNota(notaFinalDe(e.respuestas)) }}</strong></td>
          <td class="table-actions">
            <button class="btn btn-sm btn-outline-primary me-1" @click="toggleReporte(e.id)">
              {{ reporteAbierto === e.id ? 'Ocultar reporte' : 'Ver reporte' }}
            </button>
            <button class="btn btn-sm btn-outline-secondary me-1" @click="editarEvaluacion(e)">Editar</button>
            <button class="btn btn-sm btn-outline-danger" @click="eliminarEvaluacion(e)">Eliminar</button>
          </td>
        </tr>
        <tr v-if="reporteAbierto === e.id">
          <td colspan="6">
            <div class="d-flex gap-2 mb-2">
              <button class="btn btn-sm btn-outline-secondary" @click="exportar(e, 'pdf')">Exportar PDF</button>
              <button class="btn btn-sm btn-outline-secondary" @click="exportar(e, 'excel')">Exportar Excel</button>
            </div>
            <table class="table table-bordered table-sm mb-0">
              <thead>
                <tr><th colspan="4">EVALUACIÓN DOCENTE</th></tr>
                <tr><th>CURSO</th><th>FORMACIÓN</th><th>DOCENTE</th><th class="text-center">NOTA FINAL</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{{ e.curso?.nombre ?? '—' }}</td>
                  <td>{{ etiquetaFormacion(e.formacion) }}</td>
                  <td>{{ e.profesor.nombre }}</td>
                  <td class="text-center">{{ formatNota(notaFinalDe(e.respuestas)) }}</td>
                </tr>
                <tr v-if="e.encuestados != null"><td colspan="4">N° de encuestados: {{ e.encuestados }}</td></tr>
                <tr><th colspan="3">Preguntas</th><th class="text-center">Calificación</th></tr>
                <tr v-for="r in e.respuestas" :key="r.orden">
                  <td colspan="3">{{ r.pregunta }}</td>
                  <td class="text-center">{{ formatNota(Number(r.promedio)) }}</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </template>
      <tr v-if="!evaluacionesFiltradas.length">
        <td colspan="6" class="text-center text-muted">Aún no hay evaluaciones registradas</td>
      </tr>
    </tbody>
  </table>
</template>
