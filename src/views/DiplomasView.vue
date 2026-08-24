<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'
import { generarDiplomaPdf, generarConstanciaPdf } from '../lib/diplomaUtils'

const alumnos = ref([])
const busqueda = ref('')
const alumnoSeleccionado = ref(null)
const matriculas = ref([])
const loading = ref(false)
const error = ref('')
const generando = ref('') // id de la matrícula que se está generando, para deshabilitar el botón

async function cargarAlumnos() {
  const { data, error: err } = await supabase
    .from('alumnos')
    .select('id, nombres, apellidos, tipo_documento, documento')
    .order('apellidos')
  if (err) error.value = err.message
  else alumnos.value = data
}

const alumnosFiltrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return alumnos.value
  return alumnos.value.filter((a) =>
    [a.nombres, a.apellidos, a.documento].join(' ').toLowerCase().includes(q)
  )
})

async function seleccionarAlumno(alumno) {
  alumnoSeleccionado.value = alumno
  loading.value = true
  error.value = ''
  const { data, error: err } = await supabase
    .from('matriculas')
    .select(
      `id, fecha_matricula,
       curso:cursos ( id, nombre ),
       nota:notas ( calificacion, docente, fecha_evaluacion )`
    )
    .eq('alumno_id', alumno.id)
    .order('fecha_matricula', { ascending: false })
  if (err) error.value = err.message
  else matriculas.value = data
  loading.value = false
}

async function onGenerarDiploma(matricula) {
  generando.value = matricula.id + '-diploma'
  try {
    await generarDiplomaPdf(alumnoSeleccionado.value, matricula)
  } catch (e) {
    error.value = 'No se pudo generar el diploma: ' + e.message
  } finally {
    generando.value = ''
  }
}

async function onGenerarConstancia(matricula) {
  generando.value = matricula.id + '-constancia'
  try {
    await generarConstanciaPdf(alumnoSeleccionado.value, matricula)
  } catch (e) {
    error.value = 'No se pudo generar la constancia: ' + e.message
  } finally {
    generando.value = ''
  }
}

onMounted(cargarAlumnos)
</script>

<template>
  <h1 class="h4 mb-3">Diplomas y constancias</h1>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <p class="text-muted small">
    Mientras no tengamos el diseño oficial del diploma, se genera un documento simple con el
    logo y los datos del curso. Cuando tengan el diseño definitivo lo reemplazamos sin afectar el resto de la app.
  </p>

  <div class="row">
    <div class="col-md-4">
      <input v-model="busqueda" class="form-control mb-2" placeholder="Buscar alumno..." />
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
      <div v-if="!alumnoSeleccionado" class="text-muted">Selecciona un alumno para generar sus documentos.</div>

      <template v-else>
        <h2 class="h5">{{ alumnoSeleccionado.nombres }} {{ alumnoSeleccionado.apellidos }}</h2>

        <div v-if="loading">Cargando...</div>
        <table v-else class="table bg-white">
          <thead>
            <tr>
              <th>Curso</th>
              <th>Calificación</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in matriculas" :key="m.id">
              <td>{{ m.curso.nombre }}</td>
              <td>{{ m.nota?.calificacion ?? '—' }}</td>
              <td class="table-actions">
                <button
                  class="btn btn-sm btn-primary me-1"
                  :disabled="!m.nota?.calificacion || generando === m.id + '-diploma'"
                  :title="!m.nota?.calificacion ? 'Aún no tiene nota registrada' : ''"
                  @click="onGenerarDiploma(m)"
                >
                  Generar diploma
                </button>
                <button
                  class="btn btn-sm btn-outline-primary"
                  :disabled="generando === m.id + '-constancia'"
                  @click="onGenerarConstancia(m)"
                >
                  Generar constancia
                </button>
              </td>
            </tr>
            <tr v-if="!matriculas.length">
              <td colspan="3" class="text-center text-muted">Este alumno aún no tiene matrículas</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>
