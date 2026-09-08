<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'

const alumnos = ref([])
const formaciones = ref([])
const error = ref('')

const busquedaAlumno = ref('')
const alumnoSeleccionado = ref(null)
const matriculas = ref([])
const loadingMatriculas = ref(false)

const formacionNuevaMatriculaId = ref('')
const matriculando = ref(false)

const notaEnEdicion = ref(null) // { matricula_id, calificacion, observacion, docente, fecha_evaluacion }
const componentesFormacion = ref([]) // [{ curso_id, nombre }] de la formación de la matrícula en edición
const notasCursoForm = ref({}) // curso_id -> string
const cargandoEdicion = ref(false)
const savingNota = ref(false)

async function cargarCatalogos() {
  const [aRes, fRes] = await Promise.all([
    supabase.from('alumnos').select('id, nombres, apellidos, documento').order('apellidos'),
    supabase.from('formaciones').select('id, nombre').order('nombre'),
  ])
  if (aRes.error) error.value = aRes.error.message
  else alumnos.value = aRes.data
  if (fRes.error) error.value = fRes.error.message
  else formaciones.value = fRes.data
}

const alumnosFiltrados = computed(() => {
  const q = busquedaAlumno.value.trim().toLowerCase()
  if (!q) return alumnos.value
  return alumnos.value.filter((a) =>
    [a.nombres, a.apellidos, a.documento].join(' ').toLowerCase().includes(q)
  )
})

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
       formacion:formaciones ( id, nombre, descripcion ),
       nota:notas ( id, calificacion, observacion, docente, fecha_evaluacion )`
    )
    .eq('alumno_id', alumnoSeleccionado.value.id)
    .order('fecha_matricula', { ascending: false })
  if (err) error.value = err.message
  else matriculas.value = data
  loadingMatriculas.value = false
}

async function matricular() {
  if (!formacionNuevaMatriculaId.value) return
  matriculando.value = true
  error.value = ''
  const { error: err } = await supabase.from('matriculas').insert({
    alumno_id: alumnoSeleccionado.value.id,
    formacion_id: formacionNuevaMatriculaId.value,
  })
  if (err) {
    error.value = err.code === '23505' ? 'El alumno ya está matriculado en esa formación.' : err.message
  } else {
    formacionNuevaMatriculaId.value = ''
    await cargarMatriculas()
  }
  matriculando.value = false
}

async function eliminarMatricula(matricula) {
  if (!confirm(`¿Quitar la matrícula en "${matricula.formacion.nombre}"? Se borrará también su nota.`)) return
  const { error: err } = await supabase.from('matriculas').delete().eq('id', matricula.id)
  if (err) error.value = err.message
  else await cargarMatriculas()
}

const promedioCalculado = computed(() => {
  if (!componentesFormacion.value.length) return null
  const suma = componentesFormacion.value.reduce((acc, c) => acc + (Number(notasCursoForm.value[c.curso_id]) || 0), 0)
  return Math.round((suma / componentesFormacion.value.length) * 100) / 100
})

function usarPromedio() {
  if (promedioCalculado.value != null) notaEnEdicion.value.calificacion = promedioCalculado.value
}

async function editarNota(matricula) {
  cargandoEdicion.value = true
  error.value = ''
  notaEnEdicion.value = {
    matricula_id: matricula.id,
    calificacion: matricula.nota?.calificacion ?? '',
    observacion: matricula.nota?.observacion ?? '',
    docente: matricula.nota?.docente ?? '',
    fecha_evaluacion: matricula.nota?.fecha_evaluacion ?? '',
  }

  const { data: fc, error: errFc } = await supabase
    .from('formacion_cursos')
    .select('curso_id, orden, curso:cursos(nombre)')
    .eq('formacion_id', matricula.formacion.id)
    .order('orden')
  if (errFc) {
    error.value = errFc.message
    cargandoEdicion.value = false
    return
  }
  componentesFormacion.value = fc.map((f) => ({ curso_id: f.curso_id, nombre: f.curso.nombre }))

  if (componentesFormacion.value.length) {
    const { data: nc, error: errNc } = await supabase
      .from('notas_curso')
      .select('curso_id, calificacion')
      .eq('matricula_id', matricula.id)
    if (errNc) {
      error.value = errNc.message
    } else {
      const form = {}
      for (const c of componentesFormacion.value) form[c.curso_id] = ''
      for (const row of nc) form[row.curso_id] = row.calificacion ?? ''
      notasCursoForm.value = form
    }
  } else {
    notasCursoForm.value = {}
  }
  cargandoEdicion.value = false
}

function cancelarEdicion() {
  notaEnEdicion.value = null
  componentesFormacion.value = []
  notasCursoForm.value = {}
}

async function guardarNota() {
  savingNota.value = true
  error.value = ''

  if (componentesFormacion.value.length) {
    const payloadCursos = componentesFormacion.value.map((c) => ({
      matricula_id: notaEnEdicion.value.matricula_id,
      curso_id: c.curso_id,
      calificacion: notasCursoForm.value[c.curso_id] === '' ? null : notasCursoForm.value[c.curso_id],
    }))
    const { error: errNc } = await supabase.from('notas_curso').upsert(payloadCursos, { onConflict: 'matricula_id,curso_id' })
    if (errNc) {
      error.value = errNc.message
      savingNota.value = false
      return
    }
  }

  const payload = {
    matricula_id: notaEnEdicion.value.matricula_id,
    calificacion: notaEnEdicion.value.calificacion === '' ? null : notaEnEdicion.value.calificacion,
    observacion: notaEnEdicion.value.observacion || null,
    docente: notaEnEdicion.value.docente || null,
    fecha_evaluacion: notaEnEdicion.value.fecha_evaluacion || null,
  }
  const { error: err } = await supabase.from('notas').upsert(payload, { onConflict: 'matricula_id' })
  if (err) error.value = err.message
  else {
    cancelarEdicion()
    await cargarMatriculas()
  }
  savingNota.value = false
}

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
      <div v-if="!alumnoSeleccionado" class="text-muted">Selecciona un alumno para ver sus formaciones y notas.</div>

      <template v-else>
        <h2 class="h5">{{ alumnoSeleccionado.nombres }} {{ alumnoSeleccionado.apellidos }}</h2>

        <div class="card mb-3">
          <div class="card-body">
            <h3 class="h6">Matricular en una formación</h3>
            <div class="row g-2">
              <div class="col-md-8">
                <select v-model="formacionNuevaMatriculaId" class="form-select">
                  <option value="" disabled>Selecciona una formación</option>
                  <option v-for="f in formaciones" :key="f.id" :value="f.id">{{ f.nombre }}</option>
                </select>
              </div>
              <div class="col-md-4">
                <button class="btn btn-primary w-100" :disabled="!formacionNuevaMatriculaId || matriculando" @click="matricular">
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
              <th>Formación</th>
              <th>Docente</th>
              <th>Nota final</th>
              <th>Fecha evaluación</th>
              <th>Observación</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="m in matriculas" :key="m.id">
              <tr>
                <td>{{ m.formacion.nombre }}</td>
                <td>{{ m.nota?.docente ?? '—' }}</td>
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
                  <div v-if="cargandoEdicion" class="text-muted small">Cargando...</div>
                  <form v-else @submit.prevent="guardarNota">
                    <template v-if="componentesFormacion.length">
                      <p class="small text-muted mb-2">
                        Esta formación tiene cursos propios. Ingresa la nota de cada uno; la nota
                        final se sugiere como el promedio (los cursos sin nota cuentan como 0).
                      </p>
                      <table class="table table-sm mb-2">
                        <thead>
                          <tr><th>Curso</th><th style="width: 140px">Nota</th></tr>
                        </thead>
                        <tbody>
                          <tr v-for="c in componentesFormacion" :key="c.curso_id">
                            <td>{{ c.nombre }}</td>
                            <td>
                              <input
                                v-model="notasCursoForm[c.curso_id]"
                                type="number"
                                step="0.01"
                                class="form-control form-control-sm"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p class="small mb-2">
                        Promedio calculado: <strong>{{ promedioCalculado }}</strong>
                        <button type="button" class="btn btn-link btn-sm p-0 ms-2" @click="usarPromedio">Usar este valor</button>
                      </p>
                    </template>

                    <div class="row g-2">
                      <div class="col-md-2">
                        <label class="form-label small">Nota final</label>
                        <input v-model="notaEnEdicion.calificacion" type="number" step="0.01" class="form-control form-control-sm" />
                      </div>
                      <div class="col-md-2">
                        <label class="form-label small">Docente</label>
                        <input v-model="notaEnEdicion.docente" class="form-control form-control-sm" />
                      </div>
                      <div class="col-md-3">
                        <label class="form-label small">Fecha de evaluación</label>
                        <input v-model="notaEnEdicion.fecha_evaluacion" type="date" class="form-control form-control-sm" />
                      </div>
                      <div class="col-md-3">
                        <label class="form-label small">Observación del docente</label>
                        <input v-model="notaEnEdicion.observacion" class="form-control form-control-sm" />
                      </div>
                      <div class="col-md-2 d-flex align-items-end gap-1">
                        <button class="btn btn-sm btn-primary" type="submit" :disabled="savingNota">Guardar</button>
                        <button class="btn btn-sm btn-outline-secondary" type="button" @click="cancelarEdicion">Cancelar</button>
                      </div>
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
