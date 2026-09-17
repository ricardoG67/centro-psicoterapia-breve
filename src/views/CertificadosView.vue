<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'
import { generarCertificadoPdf } from '../lib/certificadoUtils'

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
       formacion:formaciones ( id, nombre, horas, fecha_inicio, fecha_fin ),
       nota:notas ( calificacion, fecha_evaluacion )`
    )
    .eq('alumno_id', alumno.id)
    .order('fecha_matricula', { ascending: false })
  if (err) error.value = err.message
  else matriculas.value = data
  loading.value = false
}

async function onGenerarCertificado(matricula) {
  generando.value = matricula.id
  try {
    await generarCertificadoPdf(alumnoSeleccionado.value, matricula)
  } catch (e) {
    error.value = 'No se pudo generar el certificado: ' + e.message
  } finally {
    generando.value = ''
  }
}

onMounted(cargarAlumnos)
</script>

<template>
  <h1 class="h4 mb-3">Certificados</h1>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>

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
      <div v-if="!alumnoSeleccionado" class="text-muted">Selecciona un alumno para generar su certificado.</div>

      <template v-else>
        <h2 class="h5">{{ alumnoSeleccionado.nombres }} {{ alumnoSeleccionado.apellidos }}</h2>

        <div v-if="loading">Cargando...</div>
        <table v-else class="table bg-white">
          <thead>
            <tr>
              <th>Formación</th>
              <th>Nota final</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in matriculas" :key="m.id">
              <td>{{ m.formacion.nombre }}</td>
              <td>{{ m.nota?.calificacion ?? '—' }}</td>
              <td class="table-actions">
                <button
                  class="btn btn-sm btn-primary"
                  :disabled="!m.nota?.calificacion || generando === m.id"
                  :title="!m.nota?.calificacion ? 'Aún no tiene nota registrada' : ''"
                  @click="onGenerarCertificado(m)"
                >
                  Generar certificado
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
