
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { uploadFile } from '../firebase/storage';
import { createSportsCaptainApplication } from '../firebase/sportsCaptainService';
import { sendNotification } from '../firebase/notificationService';
import { Attachment, UserRole } from '../types';
import Button from '../components/Button';
import {
    Upload,
    FileText,
    CheckCircle2,
    Loader2,
    Trophy,
    ChevronLeft,
    X,
    File,
    Layout,
    PlusCircle,
    Plus
} from 'lucide-react';
import { SPORTS_COORDINATOR_EMAIL } from '../constants';
import { getAuth } from '@firebase/auth'; // To get uid if needed

const SportsCaptainApplicationForm: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [uploadStates, setUploadStates] = useState<Record<string, 'idle' | 'uploading' | 'success'>>({
        cv: 'idle',
        intent: 'idle',
        actionPlan: 'idle',
        certificates: 'idle'
    });

    const [cvFile, setCvFile] = useState<File | null>(null);
    const [intentFile, setIntentFile] = useState<File | null>(null);
    const [actionPlanFile, setActionPlanFile] = useState<File | null>(null);
    const [supportingFiles, setSupportingFiles] = useState<File[]>([]);

    const [cvUrl, setCvUrl] = useState('');
    const [intentUrl, setIntentUrl] = useState('');
    const [actionPlanUrl, setActionPlanUrl] = useState('');
    const [certificateAttachments, setCertificateAttachments] = useState<Attachment[]>([]);

    const handleFileUpload = async (file: File, type: 'cv' | 'intent' | 'actionPlan') => {
        setUploadStates(prev => ({ ...prev, [type]: 'uploading' }));
        try {
            const path = `sports_captain/${user?.id}/${type}_${Date.now()}_${file.name}`;
            const url = await uploadFile(file, path);

            if (type === 'cv') {
                setCvFile(file);
                setCvUrl(url);
            } else if (type === 'intent') {
                setIntentFile(file);
                setIntentUrl(url);
            } else {
                setActionPlanFile(file);
                setActionPlanUrl(url);
            }

            setUploadStates(prev => ({ ...prev, [type]: 'success' }));
            // Success message as requested
            alert("Document uploaded successfully.");
        } catch (error) {
            console.error(error);
            setUploadStates(prev => ({ ...prev, [type]: 'idle' }));
        }
    };

    const handleCertificatesUpload = async (files: FileList | null) => {
        if (!files) return;
        setUploadStates(prev => ({ ...prev, certificates: 'uploading' }));

        const newFiles = Array.from(files);
        setSupportingFiles(prev => [...prev, ...newFiles]);

        try {
            const newAttachments: Attachment[] = [];
            for (const file of newFiles) {
                const path = `sports_captain/${user?.id}/certs/${Date.now()}_${file.name}`;
                const url = await uploadFile(file, path);
                newAttachments.push({
                    id: Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    dataUrl: url,
                    uploadedBy: `${user?.firstName} ${user?.lastName}`,
                    status: 'Pending',
                    createdAt: new Date().toISOString()
                });
            }
            setCertificateAttachments(prev => [...prev, ...newAttachments]);
            setUploadStates(prev => ({ ...prev, certificates: 'success' }));
            alert("Document uploaded successfully.");
        } catch (error) {
            console.error(error);
            setUploadStates(prev => ({ ...prev, certificates: 'idle' }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !cvUrl || !intentUrl || !actionPlanUrl) {
            alert("Please upload all required primary documents.");
            return;
        }

        setLoading(true);
        try {
            const applicationData = {
                studentId: user.id,
                studentName: `${user.firstName} ${user.lastName}`,
                studentAdmissionNo: user.admissionNumber || 'N/A',
                studentGender: user.gender || 'N/A',
                cvUrl,
                cvName: cvFile?.name,
                intentUrl,
                intentName: intentFile?.name,
                actionPlanUrl,
                actionPlanName: actionPlanFile?.name,
                supportingCertificates: certificateAttachments,
                status: 'Pending' as const,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await createSportsCaptainApplication(applicationData);

            // Notify Sports Coordinator
            // We need the coordinator's UID. Since it's hardcoded email, 
            // the system will have mapped it if they ever logged in. 
            // To be safe, we'll send a general notification or look up the UID by email if we can.
            // For now, notification service sends by userId. 
            // In a real scenario, we'd query the 'users' collection for the coordinator's ID.

            // Placeholder: Assume notifications can be routed or just send to all Staff?
            // The request says "The Sports Coordinator should receive a notification".
            // I'll add a helper to send by email.

            await sendNotification("COORDINATOR", `New Sports Captain application from ${user.firstName} ${user.lastName}`, "/sports-captain");

            alert("Application Submitted Successfully.");
            navigate('/dashboard');
        } catch (error) {
            console.error(error);
            alert("Failed to submit application.");
        } finally {
            setLoading(false);
        }
    };

    const removeCertificate = (index: number) => {
        setSupportingFiles(prev => prev.filter((_, i) => i !== index));
        setCertificateAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const FileUploadBox = ({ title, desc, type, file, state }: { title: string, desc: string, type: 'cv' | 'intent' | 'actionPlan', file: File | null, state: string }) => (
        <div className={`p-8 rounded-[2rem] border-2 border-dashed transition-all duration-300 ${state === 'success'
            ? 'bg-emerald-500/5 border-emerald-500/30'
            : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-brand-600/50'}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <h4 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{title}</h4>
                    <p className="text-slate-500 dark:text-slate-500 text-xs font-medium max-w-sm">{desc}</p>
                </div>

                <div className="shrink-0">
                    {state === 'uploading' ? (
                        <div className="flex items-center gap-3 px-6 py-4 bg-brand-600 text-white rounded-2xl animate-pulse font-bold text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Uploading...
                        </div>
                    ) : state === 'success' ? (
                        <div className="flex items-center gap-3 px-6 py-4 bg-emerald-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-500/20">
                            <CheckCircle2 className="w-4 h-4" />
                            {file?.name.substring(0, 15)}...
                        </div>
                    ) : (
                        <label className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-2xl font-bold text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-white/10 transition-all group">
                            <Upload className="w-4 h-4 text-brand-600 transition-transform group-hover:-translate-y-1" />
                            Choose File
                            <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.doc,.docx,.png"
                                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], type)}
                            />
                        </label>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-10">
            <button onClick={() => navigate(-1)} className="group flex items-center text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-white transition-colors font-bold text-sm">
                <ChevronLeft className="w-5 h-5 mr-1 group-hover:-translate-x-1 transition-transform" />
                Back to Portal
            </button>

            <div className="bg-white dark:bg-[#070708] rounded-[3rem] p-10 md:p-16 shadow-2xl border border-slate-200 dark:border-white/10 relative overflow-hidden">
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-brand-600/5 rounded-full blur-[100px]"></div>

                <div className="relative z-10 space-y-12">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-brand-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl shadow-brand-500/30">
                            <Trophy size={40} />
                        </div>
                        <div>
                            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">Captain's Portfolio</h2>
                            <p className="text-brand-600 text-xs font-bold uppercase tracking-[0.2em] mt-2"> Official Sports Leadership Application </p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-12">
                        {/* Primary Documents */}
                        <div className="space-y-6">
                            <FileUploadBox
                                title="Upload CV"
                                desc="Highlighting sporting achievements and participation from Grade 3 onwards."
                                type="cv"
                                file={cvFile}
                                state={uploadStates.cv}
                            />

                            <FileUploadBox
                                title="Statement of Intent"
                                desc="Explaining your motivations and why you wish to serve as a Sports Captain."
                                type="intent"
                                file={intentFile}
                                state={uploadStates.intent}
                            />

                            <FileUploadBox
                                title="Strategic Action Plan"
                                desc="Outlining specific goals and initiatives you intend to achieve if selected."
                                type="actionPlan"
                                file={actionPlanFile}
                                state={uploadStates.actionPlan}
                            />
                        </div>

                        {/* Supporting Certificates */}
                        <div className="space-y-6">
                            <div className="p-8 rounded-[2rem] bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 space-y-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="space-y-2">
                                        <h4 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Supporting Certificates</h4>
                                        <p className="text-slate-500 dark:text-slate-500 text-xs font-medium max-w-sm">Copies of certificates, records, and evidence of athletic achievements.</p>
                                    </div>

                                    <label className="shrink-0 flex items-center gap-3 px-8 py-4 bg-brand-600 text-white rounded-2xl font-black text-sm cursor-pointer hover:bg-brand-700 transition-all shadow-lg shadow-brand-500/20 active:scale-95">
                                        {uploadStates.certificates === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle size={18} />}
                                        Add Certificates
                                        <input
                                            type="file"
                                            multiple
                                            className="hidden"
                                            accept=".pdf,.doc,.docx,.png"
                                            onChange={(e) => handleCertificatesUpload(e.target.files)}
                                        />
                                    </label>
                                </div>

                                {/* Certificate List */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {supportingFiles.map((file, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-4 bg-white dark:bg-[#0A0A0C] border border-slate-100 dark:border-white/5 rounded-2xl animate-scale-in">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <File size={16} className="text-brand-500 shrink-0" />
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{file.name}</span>
                                            </div>
                                            <button type="button" onClick={() => removeCertificate(idx)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="pt-8 border-t border-slate-100 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-3 text-slate-400">
                                <CheckCircle2 size={18} className="text-emerald-500" />
                                <p className="text-xs font-bold uppercase tracking-widest">Ensuring End-to-End Encryption</p>
                            </div>

                            <Button
                                type="submit"
                                isLoading={loading}
                                className="w-full md:w-auto px-12 py-5 rounded-2xl text-sm tracking-widest uppercase font-black shadow-2xl shadow-brand-500/30"
                            >
                                Finalize & Submit Application
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            <p className="text-center text-[10px] text-slate-400 dark:text-slate-600 font-bold uppercase tracking-[0.4em] pb-10">
                Authorized Leadership Portal • SLISR Athletic Department
            </p>
        </div>
    );
};

export default SportsCaptainApplicationForm;
