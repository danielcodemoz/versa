export function samplePdf() {
  const stream = 'BT /F1 24 Tf 72 720 Td (Versa - Ficha de exemplo) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let file = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = file.length
    file += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = file.length
  file += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new File([file], 'ficha-de-exemplo.pdf', { type: 'application/pdf' })
}
