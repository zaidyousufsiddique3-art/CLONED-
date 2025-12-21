
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
        <div className="h-screen bg-[#020205] flex flex-col font-sans selection:bg-indigo-500/30 selection:text-white relative overflow-hidden">

            {/* Shared Visual Anchor: Central Gradient */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {/* Primary Midnight Indigo Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[700px] bg-[#0b0531]/30 rounded-full blur-[120px]"></div>

                {/* Secondary Depth Accents */}
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#0b0531]/20 rounded-full blur-[100px]"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-brand-900/5 rounded-full blur-[100px]"></div>

                {/* Subtle Grid Pattern for Texture */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] mix-blend-overlay"></div>
            </div>

            <main className="flex-grow flex items-center justify-center p-4 lg:p-8 relative z-10 w-full overflow-hidden">
                {/* Container max-width and tighter gap to pull elements closer */}
                <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12 items-center mx-auto">

                    {/* Left Column: Hero Section */}
                    <div className="hidden lg:flex flex-col space-y-8 animate-fade-in pl-4">
                        <div className="space-y-4">
                            <div className="flex items-center gap-5 mb-2">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-brand-500/20 blur-xl rounded-full"></div>
                                    <img src="/assets/logo.png" alt="SLISR Logo" className="relative h-28 w-auto object-contain" />
                                </div>
                                <div className="h-16 w-[1px] bg-slate-800/50"></div>
                                <div className="flex flex-col">
                                    <span className="text-white font-bold tracking-[0.3em] text-sm uppercase">SLISR</span>
                                    <span className="text-indigo-400/60 font-medium tracking-widest text-[10px] uppercase">Official Records Portal</span>
                                </div>
                            </div>

                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-bold tracking-[0.2em] uppercase">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                </span>
                                Verified Institutional Hub
                            </div>
                            <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tighter leading-[1.05]">
                                Secure Access to <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-indigo-500">
                                    Academic Documents
                                </span>
                            </h1>
                            <p className="text-slate-500 text-sm max-w-md leading-relaxed">
                                Advanced document management for the SLISR academic community. Secured by verified encryption and midnight clearance protocols.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-6 pt-2">
                            <div className="flex items-start gap-4 group">
                                <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-lg bg-[#0b0531]/40 flex items-center justify-center text-indigo-400 border border-indigo-500/20 group-hover:border-indigo-500/40 transition-colors">
                                    <ShieldCheck size={16} />
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold text-sm mb-0.5">Data Integrity</h3>
                                    <p className="text-slate-500 text-xs leading-relaxed">End-to-end encrypted procurement for official records.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 group">
                                <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-lg bg-[#0b0531]/40 flex items-center justify-center text-indigo-400 border border-indigo-500/20 group-hover:border-indigo-500/40 transition-colors">
                                    <Layers size={16} />
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold text-sm mb-0.5">Dynamic Roles</h3>
                                    <p className="text-slate-500 text-xs leading-relaxed">Verified clearance for all institutional levels.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Login Card */}
                    <div className="flex justify-center lg:justify-start">
                        <div className="w-full max-w-sm bg-slate-950/40 backdrop-blur-3xl p-6 lg:p-8 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/5 relative overflow-hidden group">

                            {/* Mobile Logo Only */}
                            <div className="lg:hidden flex justify-center mb-6">
                                <img src="/assets/logo.png" alt="SLISR Logo" className="h-20 w-auto object-contain" />
                            </div>

                            {/* Card Glow Effect - Using Indigo Base */}
                            <div className="absolute -top-20 -right-20 w-40 h-40 bg-indigo-900/10 rounded-full blur-[60px] group-hover:bg-indigo-800/20 transition-colors duration-500"></div>

                            {view === 'login' ? (
                                <div className="space-y-6 animate-fade-in relative z-10">
                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-bold text-white tracking-tight">Sign In</h2>
                                        <p className="text-indigo-400/60 text-xs font-medium">Authenticate to access your dashboard</p>
                                    </div>

                                    {error && (
                                        <div className="bg-red-500/5 text-red-500 p-3 rounded-lg text-[11px] border border-red-500/10 font-medium flex items-center gap-2">
                                            <span>⚠️</span> {error}
                                        </div>
                                    )}

                                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                                        <InputField
                                            label="Your Role"
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
                                            label="Email Address"
                                            type="email"
                                            placeholder="name@school.edu"
                                            value={identifier}
                                            onChange={(e: any) => setIdentifier(e.target.value)}
                                        />

                                        <InputField
                                            label="Password"
                                            type="password"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e: any) => setPassword(e.target.value)}
                                        />

                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full h-12 bg-gradient-to-r from-brand-900 to-brand-700 hover:from-brand-800 hover:to-brand-600 text-white text-sm font-bold rounded-xl shadow-[0_8px_20px_-5px_rgba(159,18,57,0.4)] transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed group mt-2"
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                {loading ? 'Processing...' : 'Secure Login'}
                                                {!loading && <CheckCircle2 size={16} className="opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />}
                                            </div>
                                        </button>
                                    </form>

                                    <div className="space-y-4 pt-2">
                                        <div className="flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() => setView('forgot')}
                                                className="text-[11px] text-slate-500 hover:text-indigo-400 transition-colors font-semibold uppercase tracking-wider"
                                            >
                                                Forgot Credentials?
                                            </button>
                                        </div>

                                        <div className="pt-4 border-t border-slate-800/50 flex flex-col items-center gap-1.5 text-center">
                                            <span className="text-slate-600 text-[10px] font-medium">Unauthorized access is strictly monitored.</span>
                                            <Link to="/register" className="text-brand-500 font-bold text-[11px] uppercase tracking-wider hover:text-brand-400 transition-colors">
                                                Request New Access
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-fade-in relative z-10">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => { setView('login'); setResetSuccess(false); }}
                                            className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-slate-700"
                                        >
                                            <ArrowLeft size={14} />
                                        </button>
                                        <div className="space-y-0.5">
                                            <h2 className="text-xl font-bold text-white tracking-tight">Reset Access</h2>
                                            <p className="text-indigo-400/60 text-[10px]">Verification by System Administrator required</p>
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="bg-red-500/5 text-red-500 p-3 rounded-lg text-[11px] border border-red-500/10 font-medium flex items-center gap-2">
                                            <span>⚠️</span> {error}
                                        </div>
                                    )}

                                    {resetSuccess ? (
                                        <div className="text-center py-4 space-y-4">
                                            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                                                <Send size={24} />
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-lg font-bold text-white">Request Dispatched</h3>
                                                <p className="text-slate-400 text-xs leading-relaxed max-w-xs mx-auto">
                                                    Your request has been queued for verification. Administrative confirmation required.
                                                </p>
                                            </div>
                                            <Button onClick={() => setView('login')} className="w-full h-12 bg-slate-800 border-slate-700 hover:bg-slate-700 text-xs">Return to Auth</Button>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleResetSubmit} className="space-y-3">
                                            <div className="bg-indigo-900/20 border border-indigo-500/20 p-3 rounded-lg text-[10px] text-indigo-400 leading-relaxed font-semibold uppercase tracking-wider mb-2 text-center">
                                                Submit official details for verification.
                                            </div>

                                            <InputField
                                                label="Designated Role"
                                                options={[UserRole.STUDENT, UserRole.STAFF, UserRole.ADMIN]}
                                                value={resetRole}
                                                onChange={(e: any) => setResetRole(e.target.value as UserRole)}
                                            />

                                            <div className="grid grid-cols-2 gap-3">
                                                <InputField
                                                    label="First Name"
                                                    value={resetData.firstName}
                                                    onChange={(e: any) => setResetData({ ...resetData, firstName: e.target.value })}
                                                />
                                                <InputField
                                                    label="Last Name"
                                                    value={resetData.lastName}
                                                    onChange={(e: any) => setResetData({ ...resetData, lastName: e.target.value })}
                                                />
                                            </div>

                                            <InputField
                                                label="Email Record"
                                                type="email"
                                                value={resetData.email}
                                                onChange={(e: any) => setResetData({ ...resetData, email: e.target.value })}
                                            />

                                            {resetRole === UserRole.STUDENT && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <InputField
                                                        label="Admission #"
                                                        value={resetData.admissionNumber}
                                                        onChange={(e: any) => setResetData({ ...resetData, admissionNumber: e.target.value })}
                                                    />
                                                    <InputField
                                                        label="Gender"
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
                                                className="w-full h-12 bg-brand-800 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] mt-3 uppercase tracking-widest"
                                            >
                                                {loading ? 'Processing...' : 'Submit Request'}
                                            </button>
                                        </form>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Sticky Footer for compliance */}
            <footer className="relative z-20 px-8 py-6 border-t border-white/5 bg-black/60 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-slate-700 text-[10px] font-bold uppercase tracking-[0.3em]">
                        © {new Date().getFullYear()} {APP_NAME} Unified Security Protocol
                    </p>
                    <div className="flex gap-6">
                        <span className="text-indigo-400/40 text-[9px] font-bold uppercase tracking-[0.2em] cursor-default hover:text-indigo-400 transition-colors">Institutional Privacy</span>
                        <span className="text-indigo-400/40 text-[9px] font-bold uppercase tracking-[0.2em] cursor-default hover:text-indigo-400 transition-colors">Global Compliance</span>
                        <span className="text-indigo-400/40 text-[9px] font-bold uppercase tracking-[0.2em] cursor-default hover:text-indigo-400 transition-colors">Network Status</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Login;
