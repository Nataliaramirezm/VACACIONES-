import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, query, onSnapshot, doc, updateDoc, getDoc, increment, where, or } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { VacationRequest, UserProfile, RequestStatus } from '../types';
import { CheckCircle, XCircle, Calendar, User, FileText, AlertCircle, Clock, Download, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast, Toaster } from 'sonner';
import * as XLSX from 'xlsx';
import { formatDate, parseDate } from '../lib/vacation';

export default function ManageRequests() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = profile?.email === 'nmrm01@gmail.com' || profile?.email === 'asis.tthh@compufacil.com.ec' || profile?.email === 'tthh@compufacil.com.ec';
  const isHR = profile?.role === 'hr' || isSuperAdmin;
  const isGerencia = profile?.role === 'gerencia' || isSuperAdmin;
  const isManager = profile?.role === 'manager' || profile?.role === 'gerencia' || profile?.role === 'hr' || isSuperAdmin;

  const canManageHR = isHR;
  const canManageGerencia = isGerencia;
  const canManageManager = isManager;

  useEffect(() => {
    if (!profile) return;

    let q;
    if (canManageHR || canManageGerencia) {
      // HR, Gerencia and Super Admin see everything to have oversight
      q = query(collection(db, 'requests'));
    } else {
      // Managers see requests where they are the manager, replacement, or user
      q = query(
        collection(db, 'requests'),
        or(
          where('managerUid', '==', profile.uid),
          where('replacementUid', '==', profile.uid),
          where('userUid', '==', profile.uid)
        )
      );
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VacationRequest));
      setRequests(reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleExportExcel = () => {
    if (requests.length === 0) {
      toast.error('No hay solicitudes para exportar');
      return;
    }

    const exportData = requests.map(req => ({
      'ID': req.id,
      'Empleado': req.userName,
      'Tipo': req.type === 'vacation' ? 'Vacaciones' : 'Permiso',
      'Desde': formatDate(req.startDate),
      'Hasta': formatDate(req.endDate),
      'Estado': req.status.replace('pending_', 'Pendiente ').replace('approved', 'Aprobado').replace('rejected', 'Rechazado').replace('cancelled', 'Cancelado'),
      'Motivo': req.reason,
      'Reemplazo': req.replacementName || 'N/A',
      'Aprobador Jefe': req.managerApproverName || 'Pendiente',
      'Aprobador Gerencia': req.gerenciaApproverName || 'Pendiente',
      'Aprobador Reemplazo': req.replacementApproverName || 'Pendiente',
      'Aprobador RRHH': req.hrApproverName || 'Pendiente',
      'Fecha Creación': new Date(req.createdAt).toLocaleString(),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Solicitudes");
    XLSX.writeFile(wb, `Reporte_Solicitudes_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Reporte exportado correctamente');
  };

  const handleAction = async (request: VacationRequest, action: 'approve' | 'reject') => {
    const promise = async () => {
      const requestRef = doc(db, 'requests', request.id);
      let nextStatus: RequestStatus = request.status;

      if (action === 'reject') {
        nextStatus = 'rejected';
      } else {
        if (request.status === 'pending_manager') {
          nextStatus = 'pending_gerencia';
        } else if (request.status === 'pending_gerencia') {
          nextStatus = 'pending_replacement';
        } else if (request.status === 'pending_replacement') {
          nextStatus = 'pending_hr';
        } else if (request.status === 'pending_hr') {
          nextStatus = 'approved';
        }
      }

      const updateData: any = {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };

      // Determine which signature to add
      if (request.status === 'pending_manager' && profile?.uid === request.managerUid) {
        updateData.managerApproverUid = profile?.uid;
        updateData.managerApproverName = profile?.displayName;
      } else if (request.status === 'pending_gerencia' && canManageGerencia) {
        updateData.gerenciaApproverUid = profile?.uid;
        updateData.gerenciaApproverName = profile?.displayName;
      } else if (request.status === 'pending_replacement' && profile?.uid === request.replacementUid) {
        updateData.replacementApproverUid = profile?.uid;
        updateData.replacementApproverName = profile?.displayName;
      } else if (request.status === 'pending_hr' && canManageHR) {
        updateData.hrApproverUid = profile?.uid;
        updateData.hrApproverName = profile?.displayName;
      }

      try {
        await updateDoc(requestRef, updateData);

        // If it's a vacation, we need to update user's days
        if (request.type === 'vacation') {
          const userRef = doc(db, 'users', request.userUid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const start = parseDate(request.startDate);
            const end = parseDate(request.endDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            if (nextStatus === 'approved') {
              await updateDoc(userRef, {
                usedVacationDays: increment(diffDays),
                pendingVacationDays: increment(-diffDays),
              });
            } else if (nextStatus === 'rejected') {
              await updateDoc(userRef, {
                pendingVacationDays: increment(-diffDays),
              });
            }
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `requests/${request.id}`);
      }
    };

    toast.promise(promise(), {
      loading: 'Procesando solicitud...',
      success: `Solicitud ${action === 'approve' ? 'aprobada' : 'rechazada'} correctamente`,
      error: (err) => `Error: ${err.message || 'No tienes permisos para esta acción'}`,
    });
  };

  if (loading) return <div className="flex justify-center p-12">Cargando solicitudes...</div>;

  const pendingRequests = requests.filter(r => 
    (r.status === 'pending_manager' && r.managerUid === profile?.uid) ||
    (r.status === 'pending_gerencia' && canManageGerencia) ||
    (profile?.uid === r.replacementUid && r.status === 'pending_replacement') ||
    (canManageHR && r.status === 'pending_hr')
  );
  
  const processedRequests = requests.filter(r => 
    r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled' || 
    (canManageManager && r.status !== 'pending_manager' && r.managerApproverUid === profile?.uid) ||
    (canManageGerencia && r.status !== 'pending_gerencia' && r.gerenciaApproverUid === profile?.uid) ||
    (profile?.uid === r.replacementUid && r.status !== 'pending_replacement' && r.replacementApproverUid === profile?.uid) ||
    (canManageHR && r.status === 'approved' && r.hrApproverUid === profile?.uid) ||
    ((canManageHR || canManageGerencia) && (r.status === 'pending_manager' || r.status === 'pending_gerencia' || r.status === 'pending_replacement' || r.status === 'pending_hr')) // HR/Gerencia sees all in-progress in table
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_manager': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-orange-100 text-orange-700">Pendiente Jefe</span>;
      case 'pending_gerencia': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700">Pendiente Gerencia</span>;
      case 'pending_replacement': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-700">Pendiente Reemplazo</span>;
      case 'pending_hr': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700">Pendiente RRHH</span>;
      case 'approved': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700">Aprobado</span>;
      case 'rejected': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700">Rechazado</span>;
      case 'cancelled': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">Cancelado</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-8">
      <Toaster position="top-right" richColors />
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Gestión de Solicitudes {profile?.role === 'gerencia' ? '(Gerencia)' : profile?.role === 'hr' ? '(RRHH)' : '(Jefe)'}
          </h1>
          <p className="text-slate-500">Revisa y aprueba las solicitudes de vacaciones y permisos.</p>
        </div>
        
        {(isHR || isGerencia) && (
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl transition-all shadow-lg shadow-emerald-100 font-medium"
          >
            <Download size={20} />
            Exportar a Excel
          </button>
        )}
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Clock className="text-orange-500" size={20} />
          Pendientes ({pendingRequests.length})
        </h2>
        
        {pendingRequests.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center text-slate-500">
            No hay solicitudes pendientes por procesar.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {pendingRequests.map(req => (
              <motion.div
                key={req.id}
                layout
                className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl text-slate-400">
                    <User size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{req.userName}</h3>
                    <p className="text-sm text-slate-500 capitalize">{req.type === 'vacation' ? 'Vacaciones' : 'Permiso'}</p>
                    <p className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                      <Calendar size={14} />
                      {formatDate(req.startDate)} - {formatDate(req.endDate)}
                    </p>
                    {req.replacementName && (
                      <p className="text-xs text-blue-600 font-medium flex items-center gap-1.5 mt-1">
                        <Users size={12} />
                        Reemplazo: {req.replacementName}
                      </p>
                    )}
                    <p className="text-sm text-slate-700 mt-2 italic">"{req.reason}"</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleAction(req, 'reject')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold transition-all text-sm border border-red-100"
                  >
                    <XCircle size={18} />
                    Rechazar
                  </button>
                  <button 
                    onClick={() => handleAction(req, 'approve')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition-all text-sm shadow-lg shadow-green-100"
                  >
                    <CheckCircle size={18} />
                    {req.status === 'pending_manager' ? 'Aprobar (Pasar a Gerencia)' : 
                     req.status === 'pending_gerencia' ? 'Aprobar (Pasar a Reemplazo)' :
                     req.status === 'pending_replacement' ? 'Aprobar (Pasar a RRHH)' : 'Aprobar Final'}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <CheckCircle className="text-green-500" size={20} />
          Historial Reciente
        </h2>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Fechas</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Procesado por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {processedRequests.slice(0, 10).map(req => (
                <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <div>{req.userName}</div>
                    {req.replacementName && (
                      <div className="text-[10px] text-blue-600 flex items-center gap-1 mt-0.5">
                        <Users size={10} />
                        Reemplazo: {req.replacementName}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 capitalize">{req.type}</td>
                  <td className="px-6 py-4 text-slate-500">
                    {formatDate(req.startDate)} - {formatDate(req.endDate)}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(req.status)}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    <div className="flex flex-col text-[10px]">
                      {req.managerApproverName && <span>Jefe: {req.managerApproverName}</span>}
                      {req.gerenciaApproverName && <span>Gerencia: {req.gerenciaApproverName}</span>}
                      {req.replacementApproverName && <span>Reemplazo: {req.replacementApproverName}</span>}
                      {req.hrApproverName && <span>RRHH: {req.hrApproverName}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
