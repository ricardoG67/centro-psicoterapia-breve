import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as XLSX from 'xlsx'

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportRowsToPdf(title, columns, rows, filename) {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pageSize = [842, 595] // A4 apaisado, más ancho para varias columnas
  const margin = 30
  const lineHeight = 16
  const colWidth = (pageSize[0] - margin * 2) / columns.length

  let page = pdfDoc.addPage(pageSize)
  let y = pageSize[1] - margin

  function drawHeader() {
    page.drawText(title, { x: margin, y, size: 13, font: fontBold })
    y -= lineHeight * 1.5
    columns.forEach((col, i) => {
      page.drawText(String(col), { x: margin + i * colWidth, y, size: 9, font: fontBold })
    })
    y -= lineHeight
  }

  drawHeader()

  for (const row of rows) {
    if (y < margin + lineHeight) {
      page = pdfDoc.addPage(pageSize)
      y = pageSize[1] - margin
      drawHeader()
    }
    row.forEach((value, i) => {
      page.drawText(String(value ?? '').slice(0, 40), { x: margin + i * colWidth, y, size: 8, font })
    })
    y -= lineHeight
  }

  const bytes = await pdfDoc.save()
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename)
}

export function exportRowsToExcel(sheetName, columns, rows, filename) {
  const data = [columns, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename)
}
