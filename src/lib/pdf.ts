import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { VacationRequest, UserProfile } from '../types';
import { formatDate, parseDate } from './vacation';

export const generateRequestPDF = (request: VacationRequest, user: UserProfile) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  // Outer Border
  doc.setLineWidth(0.5);
  doc.rect(margin, margin, contentWidth, 260);

  // Header Table
  doc.line(margin, margin + 20, margin + contentWidth, margin + 20); // Horizontal line 1
  doc.line(margin + 40, margin, margin + 40, margin + 20); // Vert line 1
  doc.line(margin + 90, margin, margin + 90, margin + 20); // Vert line 2

  // Header Content
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(200, 0, 0); // Reddish for logo feel
  doc.text('compufácil', margin + 20, margin + 12, { align: 'center' });
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.text('Gestión Documental', margin + 65, margin + 12, { align: 'center' });
  
  doc.setFontSize(11);
  doc.text('RECIBO DE VACACIONES', margin + 145, margin + 12, { align: 'center' });

  // Sub-header (DEPARTAMENTO, Version, Codigo)
  doc.line(margin, margin + 28, margin + contentWidth, margin + 28); // Horizontal line 2
  doc.line(margin + 45, margin + 20, margin + 45, margin + 28); // Vert line
  doc.line(margin + 90, margin + 20, margin + 90, margin + 28); // Vert line

  doc.setFontSize(7);
  doc.text('DEPARTAMENTO T.T.H.H', margin + 5, margin + 25);
  doc.text('Version: 2', margin + 60, margin + 25);
  doc.text('Codigo: T.T.H.H Reg.01', margin + 95, margin + 25);

  let y = margin + 38;

  // Cancellation Banner
  if (request.status === 'cancelled') {
    doc.setFillColor(255, 230, 230);
    doc.rect(margin, y - 6, contentWidth, 20, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 0, 0);
    doc.text('ESTA SOLICITUD HA SIDO CANCELADA', pageWidth / 2, y + 2, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Motivo: ${request.cancellationReason || 'No especificado'}`, pageWidth / 2, y + 8, { align: 'center' });
    doc.text(`Fecha de cancelación: ${request.cancelledAt ? new Date(request.cancelledAt).toLocaleString() : 'N/A'}`, pageWidth / 2, y + 12, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    y += 25;
  }

  // Main Info Section
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('NOMBRE:', margin + 5, y);
  
  doc.setFillColor(230, 240, 230); // Light green highlight
  doc.rect(margin + 40, y - 4, 100, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text(user.displayName.toUpperCase(), margin + 42, y);

  y += 8;
  doc.text('FECHA DE SOLICITUD', margin + 5, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(request.createdAt.split('T')[0]), margin + 42, y);

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL DIAS', margin + 5, y);
  doc.text('CORRESPONDIENTES', margin + 5, y + 4);
  
  doc.setFillColor(230, 240, 230);
  doc.rect(margin + 45, y - 2, 25, 8, 'F');
  doc.text(user.totalVacationDays.toString(), margin + 57.5, y + 4, { align: 'center' });

  doc.text('TOTAL DIAS', margin + 90, y);
  doc.text('TOMADOS', margin + 90, y + 4);
  
  doc.setFillColor(230, 240, 230);
  doc.rect(margin + 120, y - 2, 25, 8, 'F');
  doc.text(user.usedVacationDays.toString(), margin + 132.5, y + 4, { align: 'center' });

  // Table Section
  y += 15;
  const start = parseDate(request.startDate);
  const end = parseDate(request.endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  const returnDate = new Date(end);
  returnDate.setDate(returnDate.getDate() + 1);

  const balance = user.totalVacationDays - user.usedVacationDays - user.pendingVacationDays;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['PERIODO', 'DÍAS SOLICITADOS', 'DIÁS APROBADOS', 'DIAS DISFRUTADOS', 'DÍAS PENDIENTES POR DISFRUTAR', 'FECHA DE RETORNO', 'OBSERVACIONES']],
    body: [
      [
        `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`,
        diffDays.toString(),
        diffDays.toString(),
        diffDays.toString(),
        balance.toString(),
        formatDate(returnDate.toISOString().split('T')[0]),
        request.reason
      ],
      ['TOTAL DIAS CORRESPONDIENTES', '', '', '', balance.toString(), '', ''],
      ['TOTALES GENERALES', '', '', '', '', '', '']
    ],
    theme: 'grid',
    headStyles: { 
      fillColor: [255, 255, 255], 
      textColor: [0, 0, 0], 
      fontSize: 7, 
      fontStyle: 'bold',
      halign: 'center',
      lineWidth: 0.1,
      lineColor: [0, 0, 0]
    },
    styles: { 
      fontSize: 7, 
      cellPadding: 2,
      lineWidth: 0.1,
      lineColor: [0, 0, 0]
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center', fillColor: [230, 230, 230] },
      5: { halign: 'center' }
    }
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // Approval Text
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Se aprueba al Empleado', margin + 5, y);
  
  doc.setFillColor(230, 240, 230);
  doc.rect(margin + 45, y - 4, 80, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text(user.displayName.toUpperCase(), margin + 47, y);
  
  doc.setFont('helvetica', 'normal');
  doc.text('tomó', margin + 130, y);
  
  doc.setFillColor(230, 240, 230);
  doc.rect(margin + 140, y - 4, 20, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text(diffDays.toString(), margin + 150, y, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.text('días de vacaciones', margin + 165, y);

  y += 10;
  doc.text('quién firma el presente recibo como constancia de haber disfrutado los días antes indicados. Así mismo, se deja en constancia que el Empleado tiene', margin + 5, y, { maxWidth: contentWidth - 10 });
  
  y += 10;
  doc.setFillColor(230, 240, 230);
  doc.rect(margin + 5, y - 4, 40, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text(balance.toString(), margin + 25, y, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('días pendientes por disfrutar', margin + 50, y);

  // Signatures
  y += 40;
  doc.line(margin + 80, y, margin + 130, y);
  doc.setFont('helvetica', 'bold');
  doc.text('Gerente Administrativo', margin + 105, y + 5, { align: 'center' });
  doc.text('Maria Cristina Malo', margin + 105, y + 10, { align: 'center' });

  y += 20;
  doc.line(margin + 20, y, margin + 70, y);
  doc.text('Talento Humano', margin + 45, y + 5, { align: 'center' });

  doc.text('firma:', margin + 110, y - 5);
  doc.text(user.displayName.toUpperCase(), margin + 125, y - 5);
  doc.text('Recibi Conforme', margin + 145, y, { align: 'center' });
  
  doc.setFillColor(230, 240, 230);
  doc.rect(margin + 120, y + 2, 60, 6, 'F');
  doc.setFont('helvetica', 'normal');
  const today = new Date();
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  doc.text(today.toLocaleDateString('es-ES', options), margin + 150, y + 6, { align: 'center' });

  doc.save(`Recibo_Vacaciones_${user.displayName.replace(/\s+/g, '_')}.pdf`);
};
