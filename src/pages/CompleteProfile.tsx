import React, { useState, useEffect } from 'react';
import { doc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { UserPlus, User as UserIcon, Briefcase, Calendar, Users, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { calculateAnnualVacationDays } from '../lib/vacation';
import { UserProfile } from '../types';
import { toast } from 'sonner';
import { useAuth } from '../App';

export default function CompleteProfile() {
  const { profile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [position, setPosition] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [role, setRole] = useState<UserProfile['role']>('employee');
  const [managerUid, setManagerUid] = useState('');
  const [managers, setManagers] = useState<{ uid: string; displayName: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const isSuperAdmin = auth.currentUser?.email === 'nmrm01@gmail.com' || auth.currentUser?.email === 'asis.tthh@compufacil.com.ec';

  useEffect(() => {
    if (profile) {
      navigate('/');
    }
  }, [profile, navigate]);

  useEffect(() => {
    // No longer forcing role to 'hr' for super admins
  }, [isSuperAdmin]);

  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', 'in', ['manager', 'hr', 'gerencia']));
        const querySnapshot = await getDocs(q);
        const managersList = querySnapshot.docs.map(doc => ({
          uid: doc.id,
          displayName: (doc.data() as UserProfile).displayName
        }));
        setManagers(managersList);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'users');
      }
    };
    fetchManagers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setLoading(true);
    setError('');

    try {
      const total = calculateAnnualVacationDays(entryDate);
      
      const newUser: UserProfile = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email!,
        displayName,
        position,
        entryDate,
        role: role,
        managerUid: (role !== 'employee') ? '' : managerUid,
        totalVacationDays: total,
        usedVacationDays: 0,
        pendingVacationDays: 0,
      };

      await setDoc(doc(db, 'users', auth.currentUser.uid), newUser);
      toast.success('Perfil completado con éxito');
      // No manual navigate here, the useEffect will handle it when the profile snapshot updates
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-100"
      >
        <div className="text-center mb-8">
          <div className="bg-blue-600 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 text-white shadow-lg shadow-blue-200">
            <UserPlus size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Completar Perfil</h1>
          <p className="text-slate-500 mt-2">Tus datos de acceso existen, pero necesitamos tu información laboral.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 mb-6 text-sm border border-red-100">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre Completo</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="Juan Pérez"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cargo / Posición</label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="Analista de Sistemas"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha de Ingreso</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo de Cuenta</label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none appearance-none"
                required
              >
                <option value="employee">Empleado</option>
                <option value="manager">Jefe Inmediato</option>
                <option value="gerencia">Gerencia</option>
                <option value="hr">Talento Humano (RRHH)</option>
              </select>
              {isSuperAdmin && (
                <p className="text-[10px] text-blue-600 mt-1 font-medium">Esta cuenta tiene privilegios de Talento Humano automáticos por correo.</p>
              )}
            </div>
          </div>

          {!isSuperAdmin && role === 'employee' && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Jefe Inmediato</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <select
                  value={managerUid}
                  onChange={(e) => setManagerUid(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none appearance-none"
                  required
                >
                  <option value="">Selecciona tu jefe</option>
                  {managers.map(m => (
                    <option key={m.uid} value={m.uid}>{m.displayName}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? 'Guardando...' : 'Completar Registro'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
