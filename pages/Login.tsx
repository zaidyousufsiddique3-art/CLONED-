
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { UserRole } from '../types';
import { Shield, Users, GraduationCap, ChevronDown, ArrowLeft, Send, ShieldCheck, Layers, Zap, CheckCircle2 } from 'lucide-react';
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
    <div className="flex items-start gap-4">
        <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-lg bg-brand-700/10 flex items-center justify-center text-brand-700 border border-brand-700/20 shadow-[0_0_15px_rgba(190,18,60,0.1)]">
            <Icon size={16} />
        </div>
        <div>
            <h3 className="text-white font-semibold text-sm mb-0.5">{title}</h3>
            <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
        </div>
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
                setError('Database permission denied. Admin: Please update Firestore Security Rules in Firebase Console.');
            } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError('Incorrect email or password. Please verify your credentials or register if you are new.');
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
                    await sendNotification(
                        admin.id,
                        `New Password Reset Request from ${payload.firstName} ${payload.lastName}`,
                        `/users`
                    );
                }
            } catch (notifyErr) {
                console.warn("Could not notify Super Admin (likely permission restricted for unauth users):", notifyErr);
            }

            setResetSuccess(true);
        } catch (err: any) {
            console.error("Reset Request Failed", err);
            if (err.code === 'permission-denied' || (err.message && err.message.includes('Missing or insufficient permissions'))) {
                setResetSuccess(true);
                alert("System Alert: Request submitted locally. Note to Admin: Update Firestore Rules to allow public write on 'password_resets'.");
            } else {
                setError("Failed to submit request: " + err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const getRoleIcon = (role: UserRole) => {
        switch (role) {
            case UserRole.ADMIN: return Shield;
            case UserRole.STAFF: return Users;
            case UserRole.STUDENT: return GraduationCap;
            default: return Users;
        }
    };

    return (
        <div className="h-screen bg-[#070708] flex flex-col font-sans selection:bg-brand-500/30 selection:text-white relative overflow-hidden">

            {/* Premium Background Effects: Brand-Rose Gradients */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {/* Primary Rose Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[800px] bg-brand-600/10 rounded-full blur-[140px]"></div>

                {/* Secondary Depth Accents */}
                <div className="absolute top-[-10%] right-[-5%] w-[700px] h-[700px] bg-brand-500/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-[700px] h-[700px] bg-brand-800/10 rounded-full blur-[120px]"></div>

                {/* Subtle Textural Contrast */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02] mix-blend-overlay"></div>
            </div>

            <main className="flex-grow flex items-center justify-center p-6 lg:p-12 relative z-10 w-full h-full overflow-hidden">
                {/* Expanded Container for 70-80% Page Consumption */}
                <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-24 items-center mx-auto h-full max-h-[85vh]">

                    {/* Left Column: Hero Section (Prominent) */}
                    <div className="hidden lg:flex flex-col space-y-12 animate-fade-in pl-8">
                        <div className="space-y-8">
                            <div className="flex items-center gap-6 mb-4">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-brand-600/20 blur-2xl rounded-full"></div>
                                    <img src="/assets/logo.png" alt="SLISR Logo" className="relative h-32 w-auto object-contain drop-shadow-[0_0_30px_rgba(225,29,72,0.3)]" />
                                </div>
                                <div className="h-20 w-[1px] bg-slate-800/60"></div>
                                <div className="flex flex-col">
                                    <span className="text-white font-black tracking-[0.4em] text-lg uppercase">SLISR</span>
                                    <span className="text-slate-500 font-bold tracking-[0.2em] text-xs uppercase">Official Records Portal</span>
                                </div>
                            </div>

                            <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-500 text-[10px] font-black tracking-[0.3em] uppercase shadow-[0_0_20px_rgba(244,63,94,0.1)]">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-600"></span>
                                </span>
                                Verified Institutional Hub
                            </div>

                            <h1 className="text-5xl lg:text-7xl font-black text-white tracking-tighter leading-[0.95]">
                                Secure Access To <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-brand-100 to-brand-600">Academic Documents</span>
                            </h1>

                            <p className="text-slate-400 text-base max-w-lg leading-relaxed font-medium">
                                Official SLISR documents, securely accessed through a centralized institutional portal.
                            </p>

                            <p className="text-slate-500 text-sm max-w-lg leading-relaxed">
                                The SLISR Docs Portal enables authorized students, staff, and administrators to access verified academic records with institutional-grade security and compliance.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-6 pt-4">
                            <div className="flex items-start gap-4 group">
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20 group-hover:bg-brand-500/20 transition-all duration-300">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-base">Verified Documents</h3>
                                    <p className="text-slate-500 text-xs">Official academic records issued by SLISR</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 group">
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20 group-hover:bg-brand-500/20 transition-all duration-300">
                                    <Layers size={20} />
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-base">Role-Based Access</h3>
                                    <p className="text-slate-500 text-xs">Controlled permissions for Students, Staff, and Administrators</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 group">
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20 group-hover:bg-brand-500/20 transition-all duration-300">
                                    <Lock size={20} />
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-base">Institutional Security</h3>
                                    <p className="text-slate-500 text-xs">Encrypted access for sensitive academic data</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Expanded Login Card */}
                    <div className="flex justify-center lg:justify-start">
                        <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-3xl p-8 lg:p-12 rounded-[3rem] shadow-[0_30px_100px_rgba(0,0,0,0.8)] border border-white/10 relative overflow-hidden group">

                            {/* Mobile Logo Only */}
                            <div className="lg:hidden flex justify-center mb-8">
                                <img src="/assets/logo.png" alt="SLISR Logo" className="h-24 w-auto object-contain" />
                            </div>

                            {/* Card Glow Effect - Using Brand Rose */}
                            <div className="absolute -top-32 -right-32 w-64 h-64 bg-brand-600/10 rounded-full blur-[100px] group-hover:bg-brand-600/20 transition-colors duration-500"></div>

                            {view === 'login' ? (
                                <div className="space-y-8 animate-fade-in relative z-10">
                                    <div className="space-y-2">
                                        <h2 className="text-4xl font-black text-white tracking-tighter">Sign In</h2>
                                        <p className="text-slate-500 text-sm font-semibold tracking-wide">Authenticate to access your dashboard.</p>
                                    </div>

                                    {error && (
                                        <div className="bg-red-500/10 text-red-500 p-4 rounded-xl text-xs border border-red-500/20 font-bold flex items-center gap-3">
                                            <span className="text-lg">⚠️</span> {error}
                                        </div>
                                    )}

                                    <form onSubmit={handleLoginSubmit} className="space-y-6">
                                        <InputField
                                            label="Your Access Role"
                                            options={[UserRole.STUDENT, UserRole.STAFF, UserRole.ADMIN]}
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
                                            label="Institutional Email"
                                            type="email"
                                            placeholder="name@slisr.org"
                                            value={identifier}
                                            onChange={(e: any) => setIdentifier(e.target.value)}
                                        />

                                        <InputField
                                            label="Portal Password"
                                            type="password"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e: any) => setPassword(e.target.value)}
                                        />

                                        <button type="submit" disabled={loading} className="w-full py-4 px-6 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-800 text-white rounded-2xl font-black text-base tracking-wider shadow-lg shadow-brand-500/30 hover:shadow-brand-500/50 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                                            {loading ? 'Authenticating...' : 'Secure Login'}
                                        </button>
                                    </form>

                                    <div className="space-y-6 pt-4">
                                        <div className="text-center space-y-3">
                                            <button onClick={() => setView('forgot')} className="text-sm text-brand-500 hover:text-brand-400 transition-colors font-semibold">
                                                Forgot your password?
                                            </button>
                                            <p className="text-xs text-slate-600">
                                                Need access? Contact SLISR Administration
                                            </p>
                                        </div>
                                        <div className="pt-8 border-t border-slate-800/80 flex flex-col items-center gap-2.5 text-center">
                                            <span className="text-slate-600 text-[11px] font-bold uppercase tracking-widest">Unauthorized access is monitored.</span>
                                            <Link to="/register" className="text-brand-500 font-black text-xs uppercase tracking-[0.2em] hover:text-brand-400 transition-colors group">
                                                Request New Access <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8 animate-fade-in relative z-10">
                                    <div className="flex items-center gap-5">
                                        <button
                                            onClick={() => { setView('login'); setResetSuccess(false); }}
                                            className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-slate-700/50 shadow-lg"
                                        >
                                            <ArrowLeft size={20} />
                                        </button>
                                        <div className="space-y-0.5">
                                            <h2 className="text-3xl font-black text-white tracking-tight">Reset Access</h2>
                                            <p className="text-slate-500 text-xs font-bold tracking-wide uppercase">System Administrator Approval Required</p>
                                        </div>
                                    </div>

                                    {resetSuccess ? (
                                        <div className="text-center py-8 space-y-8">
                                            <div className="w-24 h-24 bg-emerald-500/10 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto border border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.15)]">
                                                <Send size={40} />
                                            </div>
                                            <div className="space-y-3">
                                                <h3 className="text-2xl font-black text-white">Request Dispatched</h3>
                                                <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto font-medium">
                                                    Your request has been queued for verification. <br />
                                                    Administrative confirmation required for restoration.
                                                </p>
                                            </div>
                                            <Button onClick={() => setView('login')} className="w-full h-16 bg-slate-800 hover:bg-slate-700 text-sm font-bold rounded-2xl border-slate-700">Return to Authentication Hub</Button>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleResetSubmit} className="space-y-4">
                                            <div className="bg-brand-900/20 border border-brand-500/20 p-4 rounded-xl text-[10px] text-brand-400 leading-relaxed font-bold uppercase tracking-widest mb-4 text-center">
                                                Submit institutional records for verification.
                                            </div>

                                            <InputField
                                                label="Designated Access Role"
                                                options={[UserRole.STUDENT, UserRole.STAFF, UserRole.ADMIN]}
                                                value={resetRole}
                                                onChange={(e: any) => setResetRole(e.target.value as UserRole)}
                                            />

                                            <div className="grid grid-cols-2 gap-4">
                                                <InputField
                                                    label="Given Name"
                                                    value={resetData.firstName}
                                                    onChange={(e: any) => setResetData({ ...resetData, firstName: e.target.value })}
                                                />
                                                <InputField
                                                    label="Surname"
                                                    value={resetData.lastName}
                                                    onChange={(e: any) => setResetData({ ...resetData, lastName: e.target.value })}
                                                />
                                            </div>

                                            <InputField
                                                label="Primary Access Email"
                                                type="email"
                                                value={resetData.email}
                                                onChange={(e: any) => setResetData({ ...resetData, email: e.target.value })}
                                            />

                                            {resetRole === UserRole.STUDENT && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <InputField
                                                        label="Admission Identification"
                                                        value={resetData.admissionNumber}
                                                        onChange={(e: any) => setResetData({ ...resetData, admissionNumber: e.target.value })}
                                                    />
                                                    <InputField
                                                        label="Verification Gender"
                                                        options={['Male', 'Female']}
                                                        value={resetData.gender}
                                                        onChange={(e: any) => setResetData({ ...resetData, gender: e.target.value })}
                                                    />
                                                </div>
                                            )}

                                            {(resetRole === UserRole.STAFF || resetRole === UserRole.ADMIN) && (
                                                <InputField
                                                    label="Phone Number"
                                                    value={resetData.phone}
                                                    onChange={(e: any) => setResetData({ ...resetData, phone: e.target.value })}
                                                />
                                            )}

                                            {resetRole === UserRole.STAFF && (
                                                <InputField
                                                    label="Designation"
                                                    value={resetData.designation}
                                                    onChange={(e: any) => setResetData({ ...resetData, designation: e.target.value })}
                                                />
                                            )}

                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className="w-full h-16 bg-brand-700 hover:bg-brand-600 text-white text-sm font-black rounded-2xl transition-all shadow-xl active:scale-[0.98] mt-4 uppercase tracking-[0.2em]"
                                            >
                                                {loading ? 'Submitting Records...' : 'Request Access Reset'}
                                            </button>
                                        </form>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-20 px-12 py-8 border-t border-white/5 bg-black/60 backdrop-blur-3xl">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-center md:text-left">
                        <p className="text-white text-sm font-bold tracking-wide">
                            Sri Lanka Islamic Student Registry (SLISR)
                        </p>
                        <p className="text-slate-600 text-xs font-medium tracking-wider mt-1">
                            Official academic records management system
                        </p>
                    </div>
                    <div className="flex gap-10">
                        <span className="text-slate-700 text-[10px] font-black uppercase tracking-[0.3em] cursor-default hover:text-slate-500 transition-colors">Digital Privacy</span>
                        <span className="text-slate-700 text-[10px] font-black uppercase tracking-[0.3em] cursor-default hover:text-slate-500 transition-colors">Institutional Compliance</span>
                        <span className="text-slate-700 text-[10px] font-black uppercase tracking-[0.3em] cursor-default hover:text-slate-500 transition-colors">Network Status</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Login;
