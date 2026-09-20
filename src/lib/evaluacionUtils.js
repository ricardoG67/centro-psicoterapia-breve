import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as XLSX from 'xlsx'
import { downloadBlob } from './exportUtils'

const BLACK = rgb(0, 0, 0)

const promedioExacto = (valores) => valores.reduce((acc, n) => acc + n, 0) / valores.length
const redondear = (n) => Math.round(n * 100) / 100

// Nota final de una evaluación: promedio de los promedios por pregunta.
export function notaFinalDe(respuestas) {
  if (!respuestas?.length) return null
  return redondear(promedioExacto(respuestas.map((r) => Number(r.promedio))))
}

export function formatNota(n) {
  return n == null ? '—' : String(n)
}

function etiquetaFormacion(f) {
  return f.periodo ? `${f.nombre} (${f.periodo})` : f.nombre
}

// Resumen de un profesor: promedio simple de la nota final de cada curso
// evaluado (cada curso pesa igual). Se calcula con las notas sin redondear
// para no arrastrar el redondeo de cada evaluación.
export function resumenProfesor(evaluaciones) {
  if (!evaluaciones.length) return null
  const filas = evaluaciones
    .map((e) => ({
      curso: e.curso?.nombre ?? '—',
      formacion: etiquetaFormacion(e.formacion),
      nota: notaFinalDe(e.respuestas),
      exacta: e.respuestas.length ? promedioExacto(e.respuestas.map((r) => Number(r.promedio))) : null,
    }))
    .sort((a, b) => a.formacion.localeCompare(b.formacion, 'es') || a.curso.localeCompare(b.curso, 'es'))
  const exactas = filas.filter((f) => f.exacta != null).map((f) => f.exacta)
  return {
    docente: evaluaciones[0].profesor.nombre,
    filas,
    promedio: exactas.length ? redondear(promedioExacto(exactas)) : null,
  }
}

function datosReporte(ev) {
  const respuestas = [...ev.respuestas].sort((a, b) => a.orden - b.orden)
  return {
    curso: ev.curso?.nombre ?? '—',
    formacion: etiquetaFormacion(ev.formacion),
    docente: ev.profesor.nombre,
    nota: notaFinalDe(respuestas),
    encuestados: ev.encuestados,
    respuestas,
  }
}

function nombreArchivo(base, extension) {
  const limpio = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 110)
  return `${limpio}.${extension}`
}

function descargarExcel(filas, anchos, nombre) {
  const ws = XLSX.utils.aoa_to_sheet(filas)
  ws['!cols'] = anchos.map((wch) => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Evaluación docente')
  XLSX.writeFile(wb, nombre)
}

// Arma un PDF A4 de tablas con bordes. `dibujar` recibe { fila, w, espacio }:
// fila(celdas) dibuja una fila (la altura se ajusta al texto más largo),
// w(fraccion) da el ancho de una celda y espacio(n) deja un hueco vertical.
async function generarPdf(nombre, dibujar) {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const W = 595.28
  const H = 841.89
  const M = 40
  const tablaW = W - M * 2
  const SIZE = 10
  const PAD = 5
  const lineH = SIZE * 1.25

  let page = pdfDoc.addPage([W, H])
  let y = H - M

  // Los textos los escribe el usuario: se cambia lo que la fuente estándar
  // no puede dibujar (emojis, símbolos raros) para que el PDF no falle.
  const limpiar = (texto, f) => {
    let out = ''
    for (const ch of String(texto ?? '')) {
      try {
        f.encodeText(ch)
        out += ch
      } catch {
        out += '?'
      }
    }
    return out
  }

  const envolver = (texto, f, maxW) => {
    const lineas = []
    let actual = ''
    for (const palabra of texto.split(' ')) {
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (actual && f.widthOfTextAtSize(prueba, SIZE) > maxW) {
        lineas.push(actual)
        actual = palabra
      } else {
        actual = prueba
      }
    }
    lineas.push(actual)
    return lineas
  }

  const fila = (celdas) => {
    const preparadas = celdas.map((c) => {
      const f = c.bold ? bold : font
      return { ...c, f, lineas: envolver(limpiar(c.texto, f), f, c.w - PAD * 2) }
    })
    const alto = Math.max(...preparadas.map((c) => c.lineas.length)) * lineH + PAD * 2
    if (y - alto < M) {
      page = pdfDoc.addPage([W, H])
      y = H - M
    }
    let x = M
    for (const c of preparadas) {
      page.drawRectangle({ x, y: y - alto, width: c.w, height: alto, borderColor: BLACK, borderWidth: 0.75 })
      c.lineas.forEach((linea, k) => {
        const anchoLinea = c.f.widthOfTextAtSize(linea, SIZE)
        const tx = c.centrado ? x + (c.w - anchoLinea) / 2 : x + PAD
        page.drawText(linea, { x: tx, y: y - PAD - SIZE * 0.85 - k * lineH, size: SIZE, font: c.f, color: BLACK })
      })
      x += c.w
    }
    y -= alto
  }

  dibujar({ fila, w: (fraccion) => tablaW * fraccion, espacio: (n) => { y -= n } })

  const bytes = await pdfDoc.save()
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), nombre)
}

// --- Reporte de una evaluación (un curso) --------------------------------

export function exportarEvaluacionExcel(ev) {
  const d = datosReporte(ev)
  const filas = [
    ['EVALUACIÓN DOCENTE'],
    ['CURSO', 'FORMACIÓN', 'DOCENTE', 'NOTA FINAL'],
    [d.curso, d.formacion, d.docente, d.nota ?? ''],
  ]
  if (d.encuestados != null) filas.push(['N° de encuestados', d.encuestados])
  filas.push([], ['Preguntas', 'Calificación'])
  for (const r of d.respuestas) filas.push([r.pregunta, Number(r.promedio)])
  descargarExcel(filas, [60, 42, 28, 12], nombreArchivo(`evaluacion ${d.docente} ${d.curso} ${d.formacion}`, 'xlsx'))
}

export async function exportarEvaluacionPdf(ev) {
  const d = datosReporte(ev)
  await generarPdf(nombreArchivo(`evaluacion ${d.docente} ${d.curso} ${d.formacion}`, 'pdf'), ({ fila, w, espacio }) => {
    fila([{ texto: 'EVALUACIÓN DOCENTE', w: w(1), bold: true }])
    fila([
      { texto: 'CURSO', w: w(0.28), bold: true },
      { texto: 'FORMACIÓN', w: w(0.32), bold: true },
      { texto: 'DOCENTE', w: w(0.25), bold: true },
      { texto: 'NOTA FINAL', w: w(0.15), bold: true, centrado: true },
    ])
    fila([
      { texto: d.curso, w: w(0.28) },
      { texto: d.formacion, w: w(0.32) },
      { texto: d.docente, w: w(0.25) },
      { texto: formatNota(d.nota), w: w(0.15), centrado: true },
    ])
    if (d.encuestados != null) fila([{ texto: `N° de encuestados: ${d.encuestados}`, w: w(1) }])

    espacio(16)
    fila([
      { texto: 'Preguntas', w: w(0.82), bold: true },
      { texto: 'Calificación', w: w(0.18), bold: true, centrado: true },
    ])
    for (const r of d.respuestas) {
      fila([
        { texto: r.pregunta, w: w(0.82) },
        { texto: formatNota(Number(r.promedio)), w: w(0.18), centrado: true },
      ])
    }
  })
}

// --- Resumen de un profesor (promedio de todos sus cursos) ---------------

export function exportarResumenExcel(r) {
  const filas = [
    ['EVALUACIÓN DOCENTE - RESUMEN POR PROFESOR'],
    ['DOCENTE', 'CURSOS EVALUADOS', 'PROMEDIO GENERAL'],
    [r.docente, r.filas.length, r.promedio ?? ''],
    [],
    ['Curso', 'Formación', 'Nota final'],
    ...r.filas.map((f) => [f.curso, f.formacion, f.nota ?? '']),
  ]
  descargarExcel(filas, [40, 55, 18], nombreArchivo(`resumen ${r.docente}`, 'xlsx'))
}

export async function exportarResumenPdf(r) {
  await generarPdf(nombreArchivo(`resumen ${r.docente}`, 'pdf'), ({ fila, w, espacio }) => {
    fila([{ texto: 'EVALUACIÓN DOCENTE - RESUMEN POR PROFESOR', w: w(1), bold: true }])
    fila([
      { texto: 'DOCENTE', w: w(0.5), bold: true },
      { texto: 'CURSOS EVALUADOS', w: w(0.25), bold: true, centrado: true },
      { texto: 'PROMEDIO GENERAL', w: w(0.25), bold: true, centrado: true },
    ])
    fila([
      { texto: r.docente, w: w(0.5) },
      { texto: String(r.filas.length), w: w(0.25), centrado: true },
      { texto: formatNota(r.promedio), w: w(0.25), centrado: true },
    ])

    espacio(16)
    fila([
      { texto: 'Curso', w: w(0.35), bold: true },
      { texto: 'Formación', w: w(0.47), bold: true },
      { texto: 'Nota final', w: w(0.18), bold: true, centrado: true },
    ])
    for (const f of r.filas) {
      fila([
        { texto: f.curso, w: w(0.35) },
        { texto: f.formacion, w: w(0.47) },
        { texto: formatNota(f.nota), w: w(0.18), centrado: true },
      ])
    }
  })
}
