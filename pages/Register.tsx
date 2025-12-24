
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, ChevronDown } from 'lucide-react';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { registerUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [regType, setRegType] = useState<UserRole>(UserRole.STUDENT);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    admissionNumber: '',
    dateOfBirth: '',
    gender: 'Male',
    phone: '',
    password: '',
    confirmPassword: '',
    designation: '',
    numberOfChildren: '' // New field for Parent
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    setLoading(true);

    try {
      const newUser: User = {
        id: '', // ID set by Firebase
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: regType,
        phone: formData.phone,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      if (regType === UserRole.STUDENT) {
        if (!formData.admissionNumber) throw new Error("Admission Number Required");
        newUser.admissionNumber = formData.admissionNumber;
        newUser.gender = formData.gender;
      } else {
        if (regType === UserRole.PARENT) {
          newUser.numberOfChildren = formData.numberOfChildren;
        } else {
          newUser.designation = formData.designation;
        }
      }

      await registerUser(newUser, formData.password);

      alert("Account registered successfully");
      navigate('/'); // Auto redirect to Login
    } catch (err: any) {
      alert("Registration Failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-[#070708] flex flex-col font-sans selection:bg-brand-500/30 selection:text-white relative overflow-hidden">

      {/* Premium Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[800px] bg-brand-600/5 rounded-full blur-[140px]"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02] mix-blend-overlay"></div>
      </div>

      <main className="flex-grow flex items-center justify-center relative z-10 w-full px-6 py-12">
        <div className="w-full max-w-2xl bg-[#0A0A0C]/90 backdrop-blur-2xl p-8 md:p-12 rounded-[2.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.8)] border border-white/5 relative overflow-hidden group">

          <div className="absolute -top-32 -right-32 w-64 h-64 bg-brand-600/5 rounded-full blur-[100px]"></div>

          <div className="relative z-10 space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-3xl font-black text-white tracking-tighter">Create Account</h1>
                <p className="text-slate-500 text-sm font-semibold">Join the SLISR institutional registry</p>
              </div>
              <Link to="/" className="inline-flex items-center text-brand-500 hover:text-brand-400 font-bold text-xs uppercase tracking-widest transition-colors">
                <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to Login
              </Link>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5 group">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Account Type</label>
                <div className="relative">
                  <select
                    value={regType}
                    onChange={(e) => setRegType(e.target.value as UserRole)}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm appearance-none transition-all cursor-pointer hover:bg-slate-900/80"
                  >
                    <option value={UserRole.STUDENT}>Student</option>
                    <option value={UserRole.PARENT}>Parent</option>
                    <option value={UserRole.STAFF}>Staff</option>
                    <option value={UserRole.ADMIN}>Admin</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5 group">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">First Name</label>
                  <input name="firstName" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm transition-all hover:bg-slate-900/80" />
                </div>
                <div className="space-y-1.5 group">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Last Name</label>
                  <input name="lastName" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm transition-all hover:bg-slate-900/80" />
                </div>
              </div>

              <div className="space-y-1.5 group">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Email Address</label>
                <input type="email" name="email" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm transition-all hover:bg-slate-900/80" />
              </div>

              <div className="space-y-1.5 group">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Phone Number</label>
                <input name="phone" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm transition-all hover:bg-slate-900/80" />
              </div>

              {regType === UserRole.STUDENT ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5 group">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Admission Number</label>
                    <input name="admissionNumber" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm transition-all hover:bg-slate-900/80" />
                  </div>
                  <div className="space-y-1.5 group">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Gender</label>
                    <select name="gender" onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm appearance-none transition-all cursor-pointer hover:bg-slate-900/80">
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>
              ) : regType === UserRole.PARENT ? (
                <div className="space-y-1.5 group">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Number of Children Currently Studying</label>
                  <input name="numberOfChildren" type="number" min="0" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm transition-all hover:bg-slate-900/80" />
                </div>
              ) : (
                <div className="space-y-1.5 group">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Designation / Title</label>
                  <input name="designation" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm transition-all hover:bg-slate-900/80" />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5 group">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Password</label>
                  <input type="password" name="password" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm transition-all hover:bg-slate-900/80" />
                </div>
                <div className="space-y-1.5 group">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 transition-colors group-focus-within:text-brand-500">Confirm Password</label>
                  <input type="password" name="confirmPassword" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white text-sm transition-all hover:bg-slate-900/80" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 mt-6 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-black text-sm tracking-wider shadow-lg shadow-brand-500/20 transition-all duration-300 transform active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'INITIALIZING ACCOUNT...' : 'REGISTER SECURE PROFILE →'}
              </button>
            </form>
          </div>
        </div>
      </main>

      <footer className="relative z-20 px-8 py-4 border-t border-white/5 text-[9px] text-slate-600 font-bold uppercase tracking-widest bg-[#070708]">
        <div className="max-w-7xl mx-auto text-center">
          <span>© {new Date().getFullYear()} SLISR Student Registry • Authorized Personnel Only</span>
        </div>
      </footer>
    </div>
  );
};

export default Register;
