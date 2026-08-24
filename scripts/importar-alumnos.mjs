// Script de importación única: migra el Excel viejo (Certificados.xlsx) a Supabase.
//
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//     node scripts/importar-alumnos.mjs "C:/Users/Ricardo/Downloads/Certificados.xlsx"
//
// Usa la service_role key (NO la anon key) porque este script corre local,
// una sola vez, y necesita saltarse RLS para hacer la carga masiva. Nunca
// pegues esa key en ningún archivo del proyecto ni la subas a git — pásala
// solo como variable de entorno en el comando, como arriba.
//
// Es seguro volver a correrlo: usa upsert, así que no duplica datos si algo
// falla a medio camino y lo vuelves a ejecutar.

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const filePath = process.argv[2]
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!filePath) {
  console.error('Uso: node scripts/importar-alumnos.mjs "ruta/al/Certificados.xlsx"')
  process.exit(1)
}
if (!url || !serviceKey) {
  console.error('Faltan las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)

// DNIs a excluir de la importación automática (casos ambiguos detectados).
const DNIS_EXCLUIDOS = new Set([
  '12345678', // registro de prueba del sistema viejo ("Ada Escudero")
  '06240461', // un mismo DNI usado por dos personas distintas en el excel
])

function normalizarClave(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function buscarColumna(row, nombreBuscado) {
  const objetivo = normalizarClave(nombreBuscado)
  const clave = Object.keys(row).find((k) => normalizarClave(k) === objetivo)
  return clave ? row[clave] : null
}

function parseFecha(valor) {
  if (!valor) return null
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  const s = String(valor).trim()
  if (!s || s === '0000-00-00') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  console.warn(`  ! Fecha no reconocida, se omite: "${s}"`)
  return null
}

function parseNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

// --- 1. Leer el Excel -------------------------------------------------
const workbook = XLSX.readFile(filePath, { cellDates: true })
const sheet = workbook.Sheets[workbook.SheetNames[0]]
// La fila 0 es un título ("Certificados"), la fila 1 son los encabezados reales.
const filas = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: null })

console.log(`Leídas ${filas.length} filas del Excel.`)

const filasValidas = filas.filter((r) => {
  const dni = String(buscarColumna(r, 'DNI') ?? '').trim()
  return dni && !DNIS_EXCLUIDOS.has(dni)
})
console.log(`${filas.length - filasValidas.length} filas excluidas (prueba o DNI ambiguo).`)
console.log(`${filasValidas.length} filas a importar.\n`)

// --- 2. Cursos (deduplicados por nombre, con sus horas) ----------------
const cursosMap = new Map() // nombre -> horas
for (const r of filasValidas) {
  const nombre = String(buscarColumna(r, 'Curso') ?? '').trim()
  if (!nombre) continue
  const horas = parseNumero(buscarColumna(r, 'Horas'))
  if (!cursosMap.has(nombre)) cursosMap.set(nombre, horas)
}

console.log(`Subiendo ${cursosMap.size} cursos...`)
const { data: cursosInsertados, error: errCursos } = await supabase
  .from('cursos')
  .upsert(
    [...cursosMap.entries()].map(([nombre, horas]) => ({ nombre, horas })),
    { onConflict: 'nombre' }
  )
  .select('id, nombre')
if (errCursos) throw errCursos
const cursoIdPorNombre = new Map(cursosInsertados.map((c) => [c.nombre, c.id]))

// --- 3. Alumnos (deduplicados por DNI, primera aparición gana) ---------
const alumnosMap = new Map() // dni -> alumno
const dnisRevisar = []
for (const r of filasValidas) {
  const dni = String(buscarColumna(r, 'DNI') ?? '').trim()
  if (!dni || alumnosMap.has(dni)) continue
  if (!/^\d{8}$/.test(dni)) dnisRevisar.push(dni)
  alumnosMap.set(dni, {
    nombres: String(buscarColumna(r, 'Nombres') ?? '').trim(),
    apellidos: String(buscarColumna(r, 'Apellidos') ?? '').trim(),
    tipo_documento: 'DNI',
    documento: dni,
    fecha_nacimiento: parseFecha(buscarColumna(r, 'Fecha Nacimiento')),
    celular: String(buscarColumna(r, 'Celular') ?? '').trim() || null,
  })
}

console.log(`Subiendo ${alumnosMap.size} alumnos...`)
const { data: alumnosInsertados, error: errAlumnos } = await supabase
  .from('alumnos')
  .upsert([...alumnosMap.values()], { onConflict: 'tipo_documento,documento' })
  .select('id, documento')
if (errAlumnos) throw errAlumnos
const alumnoIdPorDni = new Map(alumnosInsertados.map((a) => [a.documento, a.id]))

// --- 4. Matrículas (una por fila, alumno + curso) ----------------------
const matriculasPayload = []
for (const r of filasValidas) {
  const dni = String(buscarColumna(r, 'DNI') ?? '').trim()
  const curso = String(buscarColumna(r, 'Curso') ?? '').trim()
  const alumno_id = alumnoIdPorDni.get(dni)
  const curso_id = cursoIdPorNombre.get(curso)
  if (!alumno_id || !curso_id) continue
  matriculasPayload.push({
    alumno_id,
    curso_id,
    fecha_matricula: parseFecha(buscarColumna(r, 'Fecha Inicio')) ?? new Date().toISOString().slice(0, 10),
    _fecha_evaluacion: parseFecha(buscarColumna(r, 'Fecha Fin')),
    _calificacion: parseNumero(buscarColumna(r, 'Calificación')),
  })
}

console.log(`Subiendo ${matriculasPayload.length} matrículas...`)
const { data: matriculasInsertadas, error: errMatriculas } = await supabase
  .from('matriculas')
  .upsert(
    matriculasPayload.map(({ alumno_id, curso_id, fecha_matricula }) => ({ alumno_id, curso_id, fecha_matricula })),
    { onConflict: 'alumno_id,curso_id' }
  )
  .select('id, alumno_id, curso_id')
if (errMatriculas) throw errMatriculas

const matriculaIdPorAlumnoCurso = new Map(
  matriculasInsertadas.map((m) => [`${m.alumno_id}_${m.curso_id}`, m.id])
)

// --- 5. Notas (calificación + fecha de evaluación por matrícula) -------
const notasPayload = matriculasPayload
  .map((m) => {
    const matricula_id = matriculaIdPorAlumnoCurso.get(`${m.alumno_id}_${m.curso_id}`)
    if (!matricula_id) return null
    return {
      matricula_id,
      calificacion: m._calificacion,
      fecha_evaluacion: m._fecha_evaluacion,
    }
  })
  .filter(Boolean)

console.log(`Subiendo ${notasPayload.length} notas...`)
const { error: errNotas } = await supabase.from('notas').upsert(notasPayload, { onConflict: 'matricula_id' })
if (errNotas) throw errNotas

// --- Resumen ------------------------------------------------------------
console.log('\n✅ Importación completa.')
console.log(`   Cursos: ${cursosInsertados.length}`)
console.log(`   Alumnos: ${alumnosInsertados.length}`)
console.log(`   Matrículas: ${matriculasInsertadas.length}`)
console.log(`   Notas: ${notasPayload.length}`)

if (dnisRevisar.length) {
  console.log(`\n⚠ ${dnisRevisar.length} documentos con formato distinto al DNI estándar (revisar si son Pasaporte):`)
  dnisRevisar.forEach((d) => console.log(`   - ${d}`))
}

console.log(`\n⚠ Quedaron fuera por DNI ambiguo (agrégalos manualmente si corresponde): ${[...DNIS_EXCLUIDOS].filter((d) => d !== '12345678').join(', ')}`)
