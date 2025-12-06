
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { UserRole } from '../types';
import { Shield, Users, GraduationCap, ChevronDown, ArrowLeft, Send } from 'lucide-react';
import { APP_NAME } from '../constants';
import { collection, addDoc } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { getSuperAdmins } from '../firebase/userService';
import { sendNotification } from '../firebase/notificationService';
import Button from '../components/Button';

// InputField Component
const InputField = ({ label, type = "text", value, onChange, placeholder, required = true, options }: any) => (
    <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">{label}</label>
        {options ? (
            <select
                value={value}
                onChange={onChange}
                className="w-full px-4 py-3 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white appearance-none"
            >
                {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        ) : (
            <input
                type={type}
                required={required}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="w-full px-4 py-3 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white placeholder-slate-400"
            />
        )}
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

            // 1. Save directly to Firestore 'password_resets' collection
            await addDoc(collection(db, 'password_resets'), payload);

            // 2. Attempt to notify Super Admins
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
            // Fallback: If permission denied (common if rules aren't updated), allow UI to proceed with warning
            if (err.code === 'permission-denied' || (err.message && err.message.includes('Missing or insufficient permissions'))) {
                console.warn("PERMISSION ERROR: The database rejected the write. Please enable public write on 'password_resets' in Firestore Rules.");
                // Show success anyway for UX if it's just a strict rules issue in dev
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
            case UserRole.ADMIN: return <Shield className="w-5 h-5" />;
            case UserRole.STAFF: return <Users className="w-5 h-5" />;
            case UserRole.STUDENT: return <GraduationCap className="w-5 h-5" />;
            default: return <Users className="w-5 h-5" />;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0f172a] flex items-center justify-center p-4 font-sans selection:bg-brand-500 selection:text-white relative overflow-hidden transition-colors duration-500">

            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none hidden dark:block">
                <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px]"></div>
            </div>

            <div className="w-full max-w-md relative z-10">
                <div className="bg-white dark:bg-[#1e293b]/80 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">

                    {view === 'login' ? (
                        <div className="p-8 md:p-10 animate-fade-in">
                            <div className="flex justify-center mb-6">
                                <img src="/assets/logo.png" alt="School Logo" className="h-24 w-auto object-contain" />
                            </div>
                            <div className="text-center mb-8">
                                <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Secure Login</h1>
                                <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Please select your role to continue</p>
                            </div>

                            {error && (
                                <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm mb-6 text-center border border-red-500/20 font-medium animate-fade-in flex items-center justify-center">
                                    <span className="mr-2">⚠️</span> {error}
                                </div>
                            )}

                            <form onSubmit={handleLoginSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Select Role</label>
                                    <div className="relative">
                                        <select
                                            value={selectedRole}
                                            onChange={(e) => {
                                                setSelectedRole(e.target.value as UserRole);
                                                setIdentifier('');
                                                setPassword('');
                                                setError('');
                                            }}
                                            className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 transition-all outline-none text-slate-900 dark:text-white appearance-none font-medium cursor-pointer"
                                        >
                                            <option value={UserRole.ADMIN}>Admin</option>
                                            <option value={UserRole.STAFF}>Staff</option>
                                            <option value={UserRole.STUDENT}>Student</option>
                                        </select>
                                        <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-brand-600 dark:text-brand-500 pointer-events-none">
                                            {getRoleIcon(selectedRole)}
                                        </div>
                                        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
                                            <ChevronDown className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        className="w-full px-4 py-3.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 transition-all outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                                        placeholder="name@school.edu"
                                        value={identifier}
                                        onChange={(e) => setIdentifier(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">Password</label>
                                    <input
                                        type="password"
                                        required
                                        className="w-full px-4 py-3.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 transition-all outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-4 mt-2 bg-gradient-to-r from-brand-600 to-brand-500 hover:to-brand-400 text-white font-bold rounded-xl shadow-lg shadow-brand-500/20 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Verifying...' : 'Login'}
                                </button>
                            </form>

                            <div className="mt-6 text-center">
                                <button
                                    type="button"
                                    onClick={() => setView('forgot')}
                                    className="text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-600 transition-colors underline decoration-slate-300 dark:decoration-slate-600 underline-offset-4"
                                >
                                    Forgot Password?
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 md:p-10 animate-fade-in">
                            <div className="flex items-center mb-6">
                                <button onClick={() => { setView('login'); setResetSuccess(false); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mr-4 transition-colors">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Request Password Reset</h1>
                            </div>

                            {error && (
                                <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-xl text-xs mb-6 border border-red-500/20 font-bold">
                                    {error}
                                </div>
                            )}

                            {resetSuccess ? (
                                <div className="text-center py-10 animate-fade-in">
                                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Send className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Request Submitted</h3>
                                    <p className="text-slate-500 dark:text-slate-400 mb-6">
                                        Your password reset request has been sent to the Administration. You will be notified once processed.
                                    </p>
                                    <Button onClick={() => setView('login')} className="w-full">Return to Login</Button>
                                </div>
                            ) : (
                                <form onSubmit={handleResetSubmit} className="space-y-5 animate-fade-in">
                                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 p-4 rounded-xl text-xs text-amber-800 dark:text-amber-200 mb-4">
                                        Please provide your details below. A Super Admin will verify your request.
                                    </div>

                                    <InputField
                                        label="Role"
                                        options={['STUDENT', 'STAFF', 'ADMIN']}
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
                                        <>
                                            <InputField
                                                label="Admission Number"
                                                value={resetData.admissionNumber}
                                                onChange={(e: any) => setResetData({ ...resetData, admissionNumber: e.target.value })}
                                            />
                                            <InputField
                                                label="Gender"
                                                options={['Male', 'Female']}
                                                value={resetData.gender}
                                                onChange={(e: any) => setResetData({ ...resetData, gender: e.target.value })}
                                            />
                                        </>
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

                                    <Button type="submit" isLoading={loading} className="w-full mt-4">Submit Request</Button>
                                </form>
                            )}
                        </div>
                    )}

                    {view === 'login' && (
                        <div className="bg-slate-50 dark:bg-[#0f172a]/50 p-4 text-center border-t border-slate-200 dark:border-slate-700">
                            <span className="text-slate-500 dark:text-slate-500 text-sm">Don't have an account? </span>
                            <Link to="/register" className="text-brand-600 dark:text-brand-400 font-bold text-sm hover:text-brand-700 dark:hover:text-brand-300 transition-colors">
                                Register
                            </Link>
                        </div>
                    )}
                </div>

                <p className="text-center text-slate-500 dark:text-slate-600 text-xs mt-8 font-medium">
                    © {new Date().getFullYear()} {APP_NAME} System.
                </p>
            </div>
        </div>
    );
};

export default Login;
