import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { VacationRequest, UserProfile } from '../types';

export const generateRequestPDF = (request: VacationRequest, user: UserProfile) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.text('SOLICITUD DE VACACIONES / PERMISO', 105, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.text(`Fecha de Solicitud: ${new Date(request.createdAt).toLocaleDateString()}`, 20, 40);
  
  // User Info
  doc.setFontSize(14);
  doc.text('Datos del Empleado', 20, 55);
  doc.line(20, 57, 190, 57);
  
  doc.setFontSize(12);
  doc.text(`Nombre: ${user.displayName}`, 20, 65);
  doc.text(`Cargo: ${user.position}`, 20, 72);
  doc.text(`Correo: ${user.email}`, 20, 79);
  doc.text(`Fecha de Ingreso: ${new Date(user.entryDate).toLocaleDateString()}`, 20, 86);
  
  // Request Info
  doc.setFontSize(14);
  doc.text('Detalles de la Solicitud', 20, 105);
  doc.line(20, 107, 190, 107);
  
  doc.setFontSize(12);
  doc.text(`Tipo: ${request.type === 'vacation' ? 'Vacaciones' : 'Permiso'}`, 20, 115);
  doc.text(`Estado: ${request.status.toUpperCase()}`, 20, 122);
  doc.text(`Desde: ${new Date(request.startDate).toLocaleDateString()}`, 20, 129);
  doc.text(`Hasta: ${new Date(request.endDate).toLocaleDateString()}`, 20, 136);
  doc.text(`Motivo: ${request.reason}`, 20, 143);
  
  // Signatures
  doc.text('__________________________', 40, 200);
  doc.text('Firma del Empleado', 45, 207);
  
  doc.text('__________________________', 130, 200);
  doc.text('Firma Jefe / RRHH', 140, 207);
  
  doc.save(`Solicitud_${request.type}_${user.displayName.replace(/\s+/g, '_')}.pdf`);
};
