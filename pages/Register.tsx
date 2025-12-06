
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
    designation: ''
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
        newUser.designation = formData.designation;
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
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a] flex items-center justify-center p-4 py-12 relative overflow-hidden font-sans">
      <div className="w-full max-w-3xl bg-white dark:bg-[#1e293b]/80 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden relative z-10">
        <div className="p-8 md:p-12">
            <Link to="/" className="inline-flex items-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-8 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
            </Link>
            
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Create Account</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-10">Join the portal to manage your academic documents.</p>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Account Type</label>
                    <div className="relative">
                        <select 
                            value={regType} 
                            onChange={(e) => setRegType(e.target.value as UserRole)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white appearance-none"
                        >
                            <option value={UserRole.STUDENT}>Student</option>
                            <option value={UserRole.STAFF}>Staff</option>
                            <option value={UserRole.ADMIN}>Admin</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">First Name</label>
                        <input name="firstName" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Last Name</label>
                        <input name="lastName" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                    </div>
                </div>

                <div className="space-y-2">
                     <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Email Address</label>
                     <input type="email" name="email" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>

                {regType === UserRole.STUDENT ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Admission Number</label>
                            <input name="admissionNumber" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Gender</label>
                            <select name="gender" onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white">
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                            </select>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Designation / Title</label>
                        <input name="designation" onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                    </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Password</label>
                        <input type="password" name="password" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Confirm Password</label>
                        <input type="password" name="confirmPassword" required onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                    </div>
                </div>

                <button 
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 mt-4 bg-gradient-to-r from-brand-600 to-brand-500 hover:to-brand-400 text-white font-bold rounded-xl shadow-lg shadow-brand-500/20 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {loading ? 'Creating Account...' : 'Register'}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default Register;
