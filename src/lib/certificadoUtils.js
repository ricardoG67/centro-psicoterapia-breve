import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { downloadBlob } from './exportUtils'

// Página A4 vertical, en puntos.
const PAGE_W = 595.28
const PAGE_H = 841.89
const BLACK = rgb(0, 0, 0)

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function formatFechaLarga(fecha) {
  if (!fecha) return null
  const [y, m, d] = fecha.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} del ${y}`
}

function drawCentered(page, text, y, { font, size, color = BLACK }) {
  const textWidth = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: (PAGE_W - textWidth) / 2, y, size, font, color })
}

// Envuelve un párrafo compuesto por tramos {text, font} en líneas centradas,
// preservando qué palabras van en negrita (para el nombre del curso).
function drawParrafoConEstilos(page, tramos, startY, { size, maxWidth, lineHeight }) {
  const palabras = []
  for (const tramo of tramos) {
    for (const palabra of tramo.text.split(' ')) {
      if (palabra) palabras.push({ texto: palabra, font: tramo.font })
    }
  }

  const espacio = tramos[0].font.widthOfTextAtSize(' ', size)
  const lineas = []
  let lineaActual = []
  let anchoActual = 0
  for (const palabra of palabras) {
    const anchoPalabra = palabra.font.widthOfTextAtSize(palabra.texto, size)
    const anchoConEspacio = lineaActual.length ? anchoActual + espacio + anchoPalabra : anchoPalabra
    if (lineaActual.length && anchoConEspacio > maxWidth) {
      lineas.push(lineaActual)
      lineaActual = [palabra]
      anchoActual = anchoPalabra
    } else {
      lineaActual.push(palabra)
      anchoActual = anchoConEspacio
    }
  }
  if (lineaActual.length) lineas.push(lineaActual)

  let y = startY
  for (const linea of lineas) {
    const anchoLinea =
      linea.reduce((acc, p) => acc + p.font.widthOfTextAtSize(p.texto, size), 0) + espacio * (linea.length - 1)
    let x = (PAGE_W - anchoLinea) / 2
    for (const palabra of linea) {
      page.drawText(palabra.texto, { x, y, size, font: palabra.font, color: BLACK })
      x += palabra.font.widthOfTextAtSize(palabra.texto, size) + espacio
    }
    y -= lineHeight
  }
  return y
}

async function cargarImagen(pdfDoc, nombreArchivo) {
  const res = await fetch(`${import.meta.env.BASE_URL}certificado/${nombreArchivo}`)
  if (!res.ok) return null
  const bytes = await res.arrayBuffer()
  return pdfDoc.embedPng(bytes)
}

export async function generarCertificadoPdf(alumno, matricula) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([PAGE_W, PAGE_H])
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const times = await pdfDoc.embedFont(StandardFonts.TimesRoman)

  const fondo = await cargarImagen(pdfDoc, 'fondo.png')
  if (fondo) page.drawImage(fondo, { x: 0, y: 0, width: PAGE_W, height: PAGE_H })

  const encabezado = await cargarImagen(pdfDoc, 'encabezado.png')
  if (encabezado) {
    const w = 301
    const h = w * (encabezado.height / encabezado.width)
    page.drawImage(encabezado, { x: (PAGE_W - w) / 2, y: 605.5, width: w, height: h })
  }

  drawCentered(page, 'DIPLOMA', 571, { font: helvBold, size: 30 })
  drawCentered(page, 'Otorgado a', 543.3, { font: helv, size: 14 })

  const nombreCompleto = `${alumno.nombres} ${alumno.apellidos}`.toUpperCase()
  drawCentered(page, nombreCompleto, 476.3, { font: helvBold, size: 26 })
  drawCentered(page, `${alumno.tipo_documento}: ${alumno.documento}`, 442.7, { font: times, size: 16 })

  const formacion = matricula.formacion
  // Prioriza las fechas de la formación (una vez por formación); si no las
  // tiene cargadas, usa las de la matrícula/nota como respaldo (formaciones
  // migradas del excel viejo, donde sí variaban por alumno).
  const fechaInicio = formatFechaLarga(formacion.fecha_inicio) ?? formatFechaLarga(matricula.fecha_matricula)
  const fechaFin = formatFechaLarga(formacion.fecha_fin) ?? formatFechaLarga(matricula.nota?.fecha_evaluacion)

  let rangoTexto = ''
  if (fechaInicio && fechaFin) rangoTexto = `, desarrollado del ${fechaInicio} al ${fechaFin}`
  else if (fechaInicio) rangoTexto = `, desarrollado a partir del ${fechaInicio}`

  const horas = formacion.horas ? `Con una duración de ${formacion.horas} horas teórico – prácticas${rangoTexto}. ` : rangoTexto ? `Desarrollado${rangoTexto.slice(1)}. ` : ''

  drawParrafoConEstilos(
    page,
    [
      { text: 'Por haber aprobado la formación en ', font: helv },
      { text: `${formacion.nombre.toUpperCase()}.`, font: helvBold },
      { text: horas, font: helv },
    ],
    376.7,
    { size: 13, maxWidth: 484, lineHeight: 19 }
  )

  const hoy = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })
  page.drawText(`Lima, ${hoy}`, { x: 56.2, y: 289.5, size: 12, font: helv, color: BLACK })

  const firma = await cargarImagen(pdfDoc, 'firma.png')
  const grpTop = 227.9
  const lineW = 150
  let lineY = grpTop - 60
  if (firma) {
    const firmaW = 125
    const firmaH = firmaW * (firma.height / firma.width)
    const firmaY = grpTop - firmaH
    page.drawImage(firma, { x: (PAGE_W - firmaW) / 2, y: firmaY, width: firmaW, height: firmaH })
    lineY = firmaY - 4
    page.drawLine({
      start: { x: (PAGE_W - lineW) / 2, y: lineY },
      end: { x: (PAGE_W + lineW) / 2, y: lineY },
      thickness: 1,
      color: BLACK,
    })
  }
  drawCentered(page, 'Ricardo De la Cruz Gil PhD', lineY - 16, { font: helv, size: 10 })
  drawCentered(page, 'Director Académico', lineY - 30, { font: helv, size: 10 })

  const bytes = await pdfDoc.save()
  const filename = `certificado_${alumno.apellidos}_${formacion.nombre}.pdf`.toLowerCase().replace(/\s+/g, '_')
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename)
}
