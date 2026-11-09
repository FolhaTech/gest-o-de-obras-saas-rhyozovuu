import type { PlannerTask } from '@/types'
import { isTaskOverdue, overdueLabel, taskProgress } from '@/lib/planner-progress'
import { formatDate } from '@/lib/formatters'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  delayed: 'Em atraso',
  completed: 'Concluída',
}
const PRIORITY_LABEL: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta' }

const ORANGE: [number, number, number] = [249, 115, 22]
const RED: [number, number, number] = [220, 38, 38]
const GREEN: [number, number, number] = [22, 163, 74]
const GREY: [number, number, number] = [107, 114, 128]
const MAX_IMAGES = 8

interface LoadedImage {
  data: string
  w: number
  h: number
}

/** Baixa a imagem e a reduz (JPEG, lado maior 1000 px) para o PDF não ficar gigante. */
async function loadImage(url: string, maxPx = 1000): Promise<LoadedImage | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bmp = await createImageBitmap(await res.blob())
    const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bmp, 0, 0, w, h)
    return { data: canvas.toDataURL('image/jpeg', 0.82), w, h }
  } catch {
    return null
  }
}

const fmtDateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR') : '-')
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'tarefa'

/** Gera e baixa o relatório em PDF de uma tarefa do Planner. */
export async function exportPlannerTaskPdf(task: PlannerTask): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 15
  const CW = W - 2 * M
  let y = 0

  const ensure = (need: number) => {
    if (y + need > H - 18) {
      doc.addPage()
      y = M + 4
    }
  }
  const heading = (text: string) => {
    ensure(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...ORANGE)
    doc.text(text.toUpperCase(), M, y)
    doc.setDrawColor(...ORANGE)
    doc.setLineWidth(0.3)
    doc.line(M, y + 1.5, W - M, y + 1.5)
    y += 7
    doc.setTextColor(30, 30, 30)
  }

  // Cabeçalho
  doc.setFillColor(...ORANGE)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text('Relatório da Tarefa', M, 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Gestão de Obras · Planner', W - M, 15, { align: 'right' })

  // Título
  y = 36
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  const titleLines = doc.splitTextToSize(task.title.trim(), CW) as string[]
  doc.text(titleLines, M, y)
  y += titleLines.length * 6.5 + 1

  // Situação
  const overdue = isTaskOverdue(task)
  const situation = overdue
    ? { text: overdueLabel(task), color: RED }
    : task.status === 'completed'
      ? { text: 'Concluída', color: GREEN }
      : { text: 'No prazo', color: GREEN }
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  const meta = `Status: ${STATUS_LABEL[task.status] ?? task.status}     Prioridade: ${PRIORITY_LABEL[task.priority] ?? task.priority}     Situação: `
  doc.text(meta, M, y)
  const metaW = doc.getTextWidth(meta)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...situation.color)
  doc.text(situation.text, M + metaW + 1.5, y)
  y += 8

  // Barra de progresso
  const pct = taskProgress(task)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  doc.text('Progresso', M, y)
  doc.text(`${pct}%`, W - M, y, { align: 'right' })
  y += 2.5
  doc.setFillColor(229, 231, 235)
  doc.roundedRect(M, y, CW, 4, 1.5, 1.5, 'F')
  if (pct > 0) {
    doc.setFillColor(...(overdue ? RED : ORANGE))
    doc.roundedRect(M, y, Math.max(3, (CW * pct) / 100), 4, 1.5, 1.5, 'F')
  }
  y += 11

  // Informações
  heading('Informações')
  const assignee = task.team_members
  const rows: [string, string][] = [
    ['Obra', task.works?.name?.trim() || 'Geral (sem obra)'],
    [
      'Responsável',
      assignee?.name ? `${assignee.name.trim()}${assignee.role?.trim() ? ` (${assignee.role.trim()})` : ''}` : 'Não atribuído',
    ],
    ['Início', task.start_date ? formatDate(task.start_date) : 'Não definido'],
    ['Prazo final', task.due_date ? formatDate(task.due_date) : 'Sem prazo'],
    ['Origem', task.stage_id ? 'Cronograma da obra' : 'Planner'],
    ['Telefone do responsável', assignee?.phone || '-'],
    ['Criada em', fmtDateTime(task.created_at)],
    ['Atualizada em', fmtDateTime(task.updated_at)],
  ]
  const colW = CW / 2
  for (let i = 0; i < rows.length; i += 2) {
    ensure(12)
    for (let j = 0; j < 2 && i + j < rows.length; j++) {
      const [label, value] = rows[i + j]
      const x = M + j * colW
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...GREY)
      doc.text(label.toUpperCase(), x, y)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(30, 30, 30)
      const v = (doc.splitTextToSize(value, colW - 4) as string[])[0]
      doc.text(v, x, y + 5)
    }
    y += 11
  }
  y += 2

  // Descrição
  heading('Descrição')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(40, 40, 40)
  const desc = task.description?.trim() || 'Sem descrição detalhada.'
  for (const line of doc.splitTextToSize(desc, CW) as string[]) {
    ensure(6)
    doc.text(line, M, y)
    y += 5
  }
  y += 5

  // Anexos
  const attachments = task.attachments ?? []
  heading(`Anexos (${attachments.length})`)
  if (attachments.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...GREY)
    doc.text('Nenhuma foto ou vídeo anexado a esta tarefa.', M, y)
    y += 8
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60, 60, 60)
    for (const a of attachments) {
      ensure(5)
      doc.text(`• ${a.file_type === 'video' ? 'Vídeo' : 'Foto'}: ${a.file_name}`, M, y)
      y += 4.8
    }
    y += 3

    const images = attachments.filter((a) => a.file_type === 'image')
    for (const a of images.slice(0, MAX_IMAGES)) {
      const img = await loadImage(a.file_url)
      if (!img) continue
      const maxH = 85
      let w = CW
      let h = (img.h * w) / img.w
      if (h > maxH) {
        h = maxH
        w = (img.w * h) / img.h
      }
      ensure(h + 10)
      doc.addImage(img.data, 'JPEG', M, y, w, h)
      y += h + 4
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...GREY)
      doc.text(a.file_name, M, y)
      y += 7
    }
    if (images.length > MAX_IMAGES) {
      ensure(6)
      doc.setFontSize(9)
      doc.setTextColor(...GREY)
      doc.text(`+ ${images.length - MAX_IMAGES} foto(s) não incluída(s) neste relatório.`, M, y)
      y += 6
    }
  }

  // Rodapé em todas as páginas
  const pages = doc.getNumberOfPages()
  const generated = new Date().toLocaleString('pt-BR')
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(209, 213, 219)
    doc.setLineWidth(0.2)
    doc.line(M, H - 12, W - M, H - 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GREY)
    doc.text(`Gerado em ${generated}`, M, H - 7)
    doc.text(`Página ${p} de ${pages}`, W - M, H - 7, { align: 'right' })
  }

  doc.save(`tarefa-${slug(task.title)}.pdf`)
}
