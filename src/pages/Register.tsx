import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, Briefcase, Calendar, AlertCircle, ChevronRight, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { UserRole, UserProfile } from '../types';
import { calculateAnnualVacationDays } from '../lib/vacation';

export default function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: '',
    position: '',
    entryDate: '',
    role: 'employee' as UserRole,
    managerUid: '',
  });
  const [managers, setManagers] = useState<UserProfile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    const fetchManagers = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', 'in', ['manager', 'hr', 'gerencia']));
        const querySnapshot = await getDocs(q);
        const managerList = querySnapshot.docs.map(doc => doc.data() as UserProfile);
        setManagers(managerList);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'users');
      }
    };
    fetchManagers();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      const annualDays = calculateAnnualVacationDays(formData.entryDate);

          try {
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: formData.email,
              displayName: formData.displayName,
              position: formData.position,
              entryDate: formData.entryDate,
              role: formData.role,
              managerUid: formData.role === 'employee' ? formData.managerUid : '',
              totalVacationDays: annualDays,
              usedVacationDays: 0,
              pendingVacationDays: 0,
            });
          } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }

      navigate('/');
    } catch (err: any) {
      console.error('Registration Error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Este correo ya tiene una cuenta de acceso. Por favor, inicia sesión. Si borraste tus datos antes, podrás completarlos después de entrar.');
      } else {
        setError(`Error al registrarse: ${err.message || 'Verifica los datos e intenta de nuevo.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl border border-slate-100"
      >
        <div className="text-center mb-8">
          <div className="bg-blue-600 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 text-white shadow-lg shadow-blue-200">
            <UserPlus size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Crea tu cuenta</h1>
          <p className="text-slate-500 mt-2">Completa el formulario para unirte al sistema</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-3 mb-6 text-sm border border-red-100">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre y Apellido</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Juan Pérez"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Correo Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="juan.perez@empresa.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cargo Actual</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
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
                  value={formData.entryDate}
                  onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo de Cuenta</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
              >
                <option value="employee">Empleado</option>
                <option value="manager">Jefe Inmediato</option>
                <option value="gerencia">Gerencia</option>
                <option value="hr">Talento Humano</option>
              </select>
            </div>

            {formData.role === 'employee' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Jefe Inmediato</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <select
                    value={formData.managerUid}
                    onChange={(e) => setFormData({ ...formData, managerUid: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  >
                    <option value="">Selecciona tu jefe</option>
                    {managers.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.displayName} ({m.position})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'Registrando...' : 'Crear Cuenta'}
              <ChevronRight size={20} />
            </button>
          </div>
        </form>

        <p className="text-center mt-8 text-slate-600 text-sm">
          ¿Ya tienes una cuenta?{' '}
          <Link to="/login" className="text-blue-600 font-bold hover:underline">
            Inicia sesión aquí
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
