
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { UserRole } from '../types';
import { Shield, Users, GraduationCap, ChevronDown, ArrowLeft, Send, ShieldCheck, Layers, Lock, Zap, CheckCircle2 } from 'lucide-react';
import { APP_NAME } from '../constants';
import { collection, addDoc } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { getSuperAdmins } from '../firebase/userService';
import { sendNotification } from '../firebase/notificationService';
import Button from '../components/Button';

// Refined InputField Component for Premium Look
const InputField = ({ label, type = "text", value, onChange, placeholder, required = true, options, icon: Icon }: any) => (
    <div className="space-y-1.5 group">
        <label className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] ml-1 transition-colors group-focus-within:text-brand-600">
            {label}
        </label>
        <div className="relative">
            {Icon && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-brand-600">
                    <Icon size={16} />
                </div>
            )}
            {options ? (
                <div className="relative">
                    <select
                        value={value}
                        onChange={onChange}
                        className={`w-full ${Icon ? 'pl-11' : 'px-4'} py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white appearance-none transition-all cursor-pointer hover:bg-slate-900/80 text-sm`}
                    >
                        {options.map((opt: string) => <option key={opt} value={opt} className="bg-slate-900">{opt}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                        <ChevronDown size={14} />
                    </div>
                </div>
            ) : (
                <input
                    type={type}
                    required={required}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    className={`w-full ${Icon ? 'pl-11' : 'px-4'} py-3 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-600/50 focus:border-brand-600/50 outline-none text-white placeholder-slate-600 transition-all hover:bg-slate-900/80 text-sm`}
                />
            )}
        </div>
    </div>
);

const FeatureItem = ({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-brand-700/10 flex items-center justify-center text-brand-700">
                <Icon size={12} />
            </div>
            <h3 className="text-white font-bold text-[11px] uppercase tracking-wider">{title}</h3>
        </div>
        <p className="text-slate-500 text-[10px] leading-relaxed max-w-[140px] font-medium">{desc}</p>
    </div>
);

const Login: React.FC = () => {
    const [view, setView] = useState<'login' | 'forgot'>('login');

    // Login State
    const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.STUDENT);
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Forgot Password State
    const [resetRole, setResetRole] = useState<UserRole>(UserRole.STUDENT);
    const [resetData, setResetData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        admissionNumber: '',
        gender: 'Male',
        phone: '',
        designation: ''
    });
    const [resetSuccess, setResetSuccess] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const success = await login(identifier, password, selectedRole);
            if (success) {
                navigate('/dashboard');
            }
        } catch (err: any) {
            console.error(err);
            if (err.code === 'permission-denied' || (err.message && err.message.includes('insufficient permissions'))) {
                setError('Database permission denied. Admin: Please update Firestore Security Rules.');
            } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError('Incorrect email or password.');
            } else {
                setError(err.message || 'Login failed. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const payload: any = {
                role: resetRole,
                firstName: resetData.firstName,
                lastName: resetData.lastName,
                email: resetData.email.trim(),
                status: 'Pending',
                createdAt: new Date().toISOString()
            };

            if (resetRole === UserRole.STUDENT) {
                payload.admissionNumber = resetData.admissionNumber;
                payload.gender = resetData.gender;
            } else {
                payload.phone = resetData.phone;
                if (resetRole === UserRole.STAFF) {
                    payload.designation = resetData.designation;
                }
            }

            await addDoc(collection(db, 'password_resets'), payload);

            try {
                const superAdmins = await getSuperAdmins();
                for (const admin of superAdmins) {
                    await sendNotification(admin.id, `New Password Reset Request from ${payload.firstName}`, `/users`);
                }
            } catch (notifyErr) {
                console.warn("Notification error:", notifyErr);
            }

            setResetSuccess(true);
        } catch (err: any) {
            setError("Failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const getRoleIcon = (role: UserRole) => {
        switch (role) {
            case UserRole.ADMIN: return Shield;
            case UserRole.STAFF: return Users;
            case UserRole.PARENT: return Users;
            case UserRole.STUDENT: return GraduationCap;
            default: return Users;
        }
    };

    return (
        <div className="h-screen bg-[#070708] flex flex-col font-sans selection:bg-brand-500/30 selection:text-white relative overflow-hidden">

            {/* Premium Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[800px] bg-brand-600/5 rounded-full blur-[140px]"></div>
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02] mix-blend-overlay"></div>
            </div>

            <main className="flex-grow flex items-center justify-center relative z-10 w-full px-6 lg:px-24">
                <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-32 items-center mx-auto">

                    {/* Left Column: Replicated Spacing Hierarchy */}
                    <div className="hidden lg:flex flex-col h-full justify-between py-12 animate-fade-in">
                        <div className="space-y-10">
                            {/* Branding Badge-style Header */}
                            <div className="flex items-center gap-6">
                                <img src="/assets/logo.png" alt="SLISR Logo" className="h-20 w-auto object-contain" />
                                <div className="h-12 w-[1px] bg-slate-800"></div>
                                <div className="flex flex-col">
                                    <span className="text-white font-black tracking-[0.3em] text-sm uppercase">SLISR Portal</span>
                                    <div className="flex items-center gap-2.5 mt-1.5">
                                        <div className="w-2 h-2 rounded-full bg-brand-600 animate-pulse"></div>
                                        <span className="text-brand-500 font-bold tracking-[0.15em] text-[11px] uppercase">Institutional Hub</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h1 className="text-[76px] font-black text-white tracking-tighter leading-[1.05]">
                                    Secure Access To <br />
                                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-brand-200 to-brand-500">Academic Docs</span>
                                </h1>
                                <p className="text-slate-400 text-lg max-w-lg leading-relaxed font-medium">
                                    Access verified institutional records through a centralized and high-security student registry for SLISR authorized personnel.
                                </p>
                            </div>
                        </div>

                        {/* Features Row - Replicated from reference footer-col */}
                        <div className="grid grid-cols-3 gap-8 pt-12 border-t border-white/5">
                            <FeatureItem
                                icon={ShieldCheck}
                                title="Secure Records"
                                desc="Official academic documents stored and protected under SLISR institutional policies."
                            />
                            <FeatureItem
                                icon={Layers}
                                title="Verified Identity"
                                desc="Access restricted to authorized students, staff, and administrators only."
                            />
                            <FeatureItem
                                icon={Zap}
                                title="Up-to-Date Records"
                                desc="Real-time access to the latest approved academic information and updates."
                            />
                        </div>
                    </div>

                    {/* Right Column: Replicated Card Density */}
                    <div className="flex justify-center lg:justify-end w-full">
                        <div className="w-full max-w-md bg-[#0A0A0C]/90 backdrop-blur-2xl p-10 lg:p-12 rounded-[2.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.8)] border border-white/5 relative overflow-hidden group">

                            {/* Card Glow */}
                            <div className="absolute -top-32 -right-32 w-64 h-64 bg-brand-600/5 rounded-full blur-[100px] transition-colors duration-500"></div>

                            {view === 'login' ? (
                                <div className="space-y-8 animate-fade-in relative z-10">
                                    <div className="text-center space-y-2">
                                        <h2 className="text-4xl font-black text-white tracking-tighter">Sign In</h2>
                                        <p className="text-slate-500 text-sm font-semibold">Authenticate to access your dashboard</p>
                                    </div>

                                    <form onSubmit={handleLoginSubmit} className="space-y-5">
                                        <InputField
                                            label="ACCESS ROLE"
                                            options={[UserRole.STUDENT, UserRole.PARENT, UserRole.STAFF, UserRole.ADMIN]}
                                            value={selectedRole}
                                            onChange={(e: any) => {
                                                setSelectedRole(e.target.value as UserRole);
                                                setIdentifier('');
                                                setPassword('');
                                                setError('');
                                            }}
                                            icon={getRoleIcon(selectedRole)}
                                        />

                                        <InputField
                                            label="PORTAL EMAIL"
                                            type="email"
                                            placeholder="name@slisr.org"
                                            value={identifier}
                                            onChange={(e: any) => setIdentifier(e.target.value)}
                                        />

                                        <InputField
                                            label="PASSWORD"
                                            type="password"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e: any) => setPassword(e.target.value)}
                                        />

                                        {error && (
                                            <p className="text-[10px] text-red-500 font-bold text-center uppercase tracking-widest">{error}</p>
                                        )}

                                        <button type="submit" disabled={loading} className="w-full py-4 px-6 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-black text-sm tracking-wider shadow-lg shadow-brand-500/20 transition-all duration-300 transform active:scale-[0.98] disabled:opacity-50">
                                            {loading ? 'AUTHENTICATING...' : 'SECURE LOGIN →'}
                                        </button>
                                    </form>

                                    <div className="text-center space-y-6">
                                        <div className="space-y-1">
                                            <button onClick={() => setView('forgot')} className="text-xs text-brand-500 hover:text-brand-400 font-bold transition-colors">
                                                Forgot your password?
                                            </button>
                                            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-tight">Access restricted to authorized personnel</p>
                                        </div>
                                        <div className="pt-6 border-t border-white/5">
                                            <Link to="/register" className="text-brand-500 font-black text-[11px] uppercase tracking-[0.2em] hover:text-brand-400 transition-colors">
                                                Request New Access
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8 animate-fade-in relative z-10">
                                    <div className="flex items-center gap-4 justify-center">
                                        <button
                                            onClick={() => { setView('login'); setResetSuccess(false); }}
                                            className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                                        >
                                            <ArrowLeft size={18} />
                                        </button>
                                        <h2 className="text-2xl font-black text-white tracking-tight">Reset Portal</h2>
                                    </div>

                                    {resetSuccess ? (
                                        <div className="text-center py-6 space-y-6">
                                            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                                                <Send size={32} />
                                            </div>
                                            <p className="text-slate-400 text-xs font-medium">Verification request dispatched to administrators.</p>
                                            <Button onClick={() => setView('login')} className="w-full">Return Hub</Button>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleResetSubmit} className="space-y-3.5">
                                            <InputField
                                                label="RESTORATION ROLE"
                                                options={[UserRole.STUDENT, UserRole.PARENT, UserRole.STAFF, UserRole.ADMIN]}
                                                value={resetRole}
                                                onChange={(e: any) => setResetRole(e.target.value as UserRole)}
                                            />
                                            <div className="grid grid-cols-2 gap-3">
                                                <InputField label="FIRST NAME" value={resetData.firstName} onChange={(e: any) => setResetData({ ...resetData, firstName: e.target.value })} />
                                                <InputField label="LAST NAME" value={resetData.lastName} onChange={(e: any) => setResetData({ ...resetData, lastName: e.target.value })} />
                                            </div>
                                            <InputField label="EMAIL" type="email" value={resetData.email} onChange={(e: any) => setResetData({ ...resetData, email: e.target.value })} />
                                            <button type="submit" disabled={loading} className="w-full py-4 bg-brand-600 text-white text-xs font-black rounded-xl mt-4">
                                                {loading ? 'SUBMITTING...' : 'REQUEST RESET'}
                                            </button>
                                        </form>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Global Footer */}
            <footer className="relative z-20 px-8 py-6 border-t border-white/5 text-[9px] text-slate-600 font-bold uppercase tracking-widest bg-[#070708]">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center">
                    <span>© {new Date().getFullYear()} SLISR Student Registry</span>
                    <div className="flex gap-6">
                        <span>Digital Privacy</span>
                        <span>Compliance</span>
                        <span>Status</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Login;
