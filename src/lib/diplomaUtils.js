import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { downloadBlob } from './exportUtils'

const INSTITUCION = 'Centro de Psicoterapia Breve'
const BRAND_RED = rgb(0x7a / 255, 0x1e / 255, 0x1e / 255)
const BRAND_GRAY = rgb(0x3a / 255, 0x3a / 255, 0x3a / 255)
const BLACK = rgb(0, 0, 0)

function wrapText(text, font, size, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

function drawCentered(page, text, y, { font, size, color = BLACK }) {
  const width = page.getSize().width
  const textWidth = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color })
}

function drawCenteredParagraph(page, text, startY, { font, size, color = BLACK, lineHeight = 22, maxWidth }) {
  const lines = wrapText(text, font, size, maxWidth)
  let y = startY
  for (const line of lines) {
    drawCentered(page, line, y, { font, size, color })
    y -= lineHeight
  }
  return y
}

// Intenta cargar public/logo.webp. pdf-lib solo puede insertar PNG/JPG,
// así que el .webp se decodifica y se redibuja en un canvas como PNG.
async function cargarLogo(pdfDoc) {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}logo.webp`)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)

    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)

    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const pngBytes = await pngBlob.arrayBuffer()
    return await pdfDoc.embedPng(pngBytes)
  } catch {
    return null
  }
}

async function crearDocumentoBase(titulo) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([842, 595]) // A4 apaisado
  const { width, height } = page.getSize()

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  page.drawRectangle({
    x: 18,
    y: 18,
    width: width - 36,
    height: height - 36,
    borderColor: BRAND_RED,
    borderWidth: 3,
  })

  let y = height - 70
  const logo = await cargarLogo(pdfDoc)
  if (logo) {
    const logoSize = 64
    page.drawImage(logo, { x: width / 2 - logoSize / 2, y: y - logoSize + 20, width: logoSize, height: logoSize })
    y -= logoSize + 10
  }

  drawCentered(page, INSTITUCION.toUpperCase(), y, { font: fontBold, size: 16, color: BRAND_GRAY })
  y -= 40

  drawCentered(page, titulo, y, { font: fontBold, size: 26, color: BRAND_RED })
  y -= 50

  return { pdfDoc, page, font, fontBold, width, height, y }
}

function pieDeDocumento(page, font, width) {
  const hoy = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })
  drawCentered(page, `Emitido el ${hoy}`, 90, { font, size: 10, color: BRAND_GRAY })
  page.drawLine({ start: { x: width / 2 - 90, y: 130 }, end: { x: width / 2 + 90, y: 130 }, thickness: 1, color: BLACK })
  drawCentered(page, 'Firma autorizada', 115, { font, size: 10, color: BRAND_GRAY })
}

export async function generarDiplomaPdf(alumno, matricula) {
  const { pdfDoc, page, font, fontBold, width, y } = await crearDocumentoBase('DIPLOMA')

  const nombreCompleto = `${alumno.nombres} ${alumno.apellidos}`.toUpperCase()
  drawCentered(page, 'Se otorga el presente diploma a:', y, { font, size: 13 })
  drawCentered(page, nombreCompleto, y - 32, { font: fontBold, size: 22, color: BRAND_RED })
  drawCentered(page, `${alumno.tipo_documento} ${alumno.documento}`, y - 56, { font, size: 11, color: BRAND_GRAY })

  const cuerpo = `Por haber culminado satisfactoriamente el curso "${matricula.edicion.curso.nombre} - ${matricula.edicion.nombre_edicion}"${
    matricula.edicion.docente ? `, a cargo de ${matricula.edicion.docente}` : ''
  }${matricula.nota?.calificacion != null ? `, con una calificación de ${matricula.nota.calificacion}` : ''}.`

  drawCenteredParagraph(page, cuerpo, y - 95, { font, size: 13, lineHeight: 20, maxWidth: width - 160 })

  pieDeDocumento(page, font, width)

  const bytes = await pdfDoc.save()
  const filename = `diploma_${alumno.apellidos}_${matricula.edicion.nombre_edicion}.pdf`.toLowerCase().replace(/\s+/g, '_')
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename)
}

export async function generarConstanciaPdf(alumno, matricula) {
  const { pdfDoc, page, font, fontBold, width, y } = await crearDocumentoBase('CONSTANCIA DE MATRÍCULA')

  const nombreCompleto = `${alumno.nombres} ${alumno.apellidos}`

  const cuerpo = `Por medio de la presente, ${INSTITUCION} deja constancia de que ${nombreCompleto}, identificado(a) con ${alumno.tipo_documento} ${alumno.documento}, se encuentra matriculado(a) en el curso "${matricula.edicion.curso.nombre} - ${matricula.edicion.nombre_edicion}", con fecha de matrícula ${matricula.fecha_matricula}.`

  drawCenteredParagraph(page, cuerpo, y, { font, size: 13, lineHeight: 22, maxWidth: width - 160 })

  pieDeDocumento(page, font, width)

  const bytes = await pdfDoc.save()
  const filename = `constancia_${alumno.apellidos}_${matricula.edicion.nombre_edicion}.pdf`.toLowerCase().replace(/\s+/g, '_')
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename)
}
