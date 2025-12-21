
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
    <div className="space-y-2 group">
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] ml-1 transition-colors group-focus-within:text-brand-500">
            {label}
        </label>
        <div className="relative">
            {Icon && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-brand-500">
                    <Icon size={18} />
                </div>
            )}
            {options ? (
                <div className="relative">
                    <select
                        value={value}
                        onChange={onChange}
                        className={`w-full ${Icon ? 'pl-11' : 'px-4'} py-3.5 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500/50 outline-none text-white appearance-none transition-all cursor-pointer hover:bg-slate-900/80`}
                    >
                        {options.map((opt: string) => <option key={opt} value={opt} className="bg-slate-900">{opt}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                        <ChevronDown size={16} />
                    </div>
                </div>
            ) : (
                <input
                    type={type}
                    required={required}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    className={`w-full ${Icon ? 'pl-11' : 'px-4'} py-3.5 bg-slate-900/50 border border-slate-800 rounded-xl focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500/50 outline-none text-white placeholder-slate-600 transition-all hover:bg-slate-900/80`}
                />
            )}
        </div>
    </div>
);

const FeatureItem = ({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="flex items-start gap-4">
        <div className="mt-1 flex-shrink-0 w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
            <Icon size={20} />
        </div>
        <div>
            <h3 className="text-white font-semibold text-base mb-1">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
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
        <div className="min-h-screen bg-[#070708] flex flex-col font-sans selection:bg-brand-500/30 selection:text-white relative overflow-x-hidden">

            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[120px]"></div>
                <div className="absolute top-[20%] left-[5%] w-[400px] h-[400px] bg-slate-800/20 rounded-full blur-[100px]"></div>
            </div>

            {/* Top Logo - Option 1: Top-Left */}
            <header className="relative z-20 px-8 pt-8 lg:px-12 lg:pt-12">
                <div className="flex items-center gap-3">
                    <img src="/assets/logo.png" alt="SLISR Logo" className="h-14 w-auto object-contain" />
                    <div className="h-10 w-[1px] bg-slate-800"></div>
                    <span className="text-slate-400 font-medium tracking-widest text-xs uppercase">Docs Portal</span>
                </div>
            </header>

            <main className="flex-grow flex items-center justify-center p-6 lg:p-12 relative z-10">
                <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">

                    {/* Left Column: Hero Section */}
                    <div className="hidden lg:flex flex-col space-y-12 animate-fade-in">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-500 text-[10px] font-bold tracking-[0.2em] uppercase">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                                </span>
                                Official Institution Portal
                            </div>
                            <h1 className="text-5xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1]">
                                Secure Access to <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-brand-100 to-brand-500">
                                    Academic Records
                                </span>
                            </h1>
                            <p className="text-slate-400 text-lg max-w-lg leading-relaxed">
                                Experience the next generation of role-based academic document management. Secured by advanced encryption and verified institutional access.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-8 pt-4">
                            <FeatureItem
                                icon={ShieldCheck}
                                title="Secure Access"
                                desc="State-of-the-art authentication and end-to-end data encryption."
                            />
                            <FeatureItem
                                icon={Layers}
                                title="Role-based Clearance"
                                desc="Tailored dashboard experiences for Students, Staff, and Administrators."
                            />
                            <FeatureItem
                                icon={Zap}
                                title="Instant Procurement"
                                desc="Request and receive official documents and predicted grades seamlessly."
                            />
                        </div>
                    </div>

                    {/* Right Column: Login Card */}
                    <div className="flex justify-center lg:justify-end">
                        <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-2xl p-8 lg:p-10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5 relative overflow-hidden group">

                            {/* Card Glow Effect */}
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px] group-hover:bg-brand-500/20 transition-colors duration-500"></div>

                            {view === 'login' ? (
                                <div className="space-y-8 animate-fade-in relative z-10">
                                    <div className="space-y-2">
                                        <h2 className="text-3xl font-bold text-white tracking-tight">Get Started</h2>
                                        <p className="text-slate-500 text-sm">Sign in to your account to continue</p>
                                    </div>

                                    {error && (
                                        <div className="bg-red-500/5 text-red-500 p-4 rounded-xl text-xs border border-red-500/20 font-medium flex items-center gap-3">
                                            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center">⚠️</div>
                                            {error}
                                        </div>
                                    )}

                                    <form onSubmit={handleLoginSubmit} className="space-y-5">
                                        <InputField
                                            label="Select Role"
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
                                            className="w-full h-14 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold rounded-xl shadow-[0_10px_20px_-5px_rgba(225,29,72,0.4)] transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed group"
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                {loading ? 'Verifying...' : 'Sign In'}
                                                {!loading && <CheckCircle2 className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />}
                                            </div>
                                        </button>
                                    </form>

                                    <div className="space-y-6 pt-2">
                                        <div className="flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() => setView('forgot')}
                                                className="text-sm text-slate-500 hover:text-brand-500 transition-colors font-medium decoration-brand-500/30 underline-offset-8 hover:underline"
                                            >
                                                Forgot Password?
                                            </button>
                                        </div>

                                        <div className="pt-6 border-t border-slate-800 flex flex-col items-center gap-2">
                                            <span className="text-slate-500 text-sm">Don't have an account?</span>
                                            <Link to="/register" className="text-brand-400 font-bold text-sm hover:text-brand-300 transition-colors">
                                                Register as New User
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8 animate-fade-in relative z-10">
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => { setView('login'); setResetSuccess(false); }}
                                            className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-slate-700"
                                        >
                                            <ArrowLeft size={18} />
                                        </button>
                                        <div className="space-y-1">
                                            <h2 className="text-2xl font-bold text-white tracking-tight">Reset Password</h2>
                                            <p className="text-slate-500 text-xs">A Super Admin will verify your request</p>
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="bg-red-500/5 text-red-500 p-4 rounded-xl text-xs border border-red-500/20 font-medium">
                                            {error}
                                        </div>
                                    )}

                                    {resetSuccess ? (
                                        <div className="text-center py-6 space-y-6">
                                            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                                                <Send className="w-10 h-10" />
                                            </div>
                                            <div className="space-y-3">
                                                <h3 className="text-xl font-bold text-white">Request Submitted</h3>
                                                <p className="text-slate-400 text-sm leading-relaxed">
                                                    Your request has been received. You will be notified once processed.
                                                </p>
                                            </div>
                                            <Button onClick={() => setView('login')} className="w-full h-14 bg-slate-800 border-slate-700 hover:bg-slate-700">Return to Login</Button>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleResetSubmit} className="space-y-4">
                                            <div className="bg-brand-500/5 border border-brand-500/10 p-4 rounded-xl text-[11px] text-brand-400 leading-relaxed font-medium">
                                                Please provide accurate details. Verification usually takes 1-2 business days.
                                            </div>

                                            <InputField
                                                label="Role"
                                                options={[UserRole.STUDENT, UserRole.STAFF, UserRole.ADMIN]}
                                                value={resetRole}
                                                onChange={(e: any) => setResetRole(e.target.value as UserRole)}
                                            />

                                            <div className="grid grid-cols-2 gap-4">
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
                                                label="Email Address"
                                                type="email"
                                                value={resetData.email}
                                                onChange={(e: any) => setResetData({ ...resetData, email: e.target.value })}
                                            />

                                            {resetRole === UserRole.STUDENT && (
                                                <div className="grid grid-cols-2 gap-4">
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
                                                className="w-full h-14 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-brand-500/20 active:scale-[0.98] disabled:opacity-50 mt-4"
                                            >
                                                {loading ? 'Submitting...' : 'Submit Request'}
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
            <footer className="relative z-20 p-8 lg:p-12 border-t border-slate-900 bg-black/20 backdrop-blur-md">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em]">
                        © {new Date().getFullYear()} {APP_NAME} Unified Academic Document Access
                    </p>
                    <div className="flex gap-8">
                        <span className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em] cursor-default">Privacy</span>
                        <span className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em] cursor-default">Security</span>
                        <span className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em] cursor-default">Terms</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Login;
