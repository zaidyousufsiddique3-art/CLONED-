import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { collection, addDoc, query, where, onSnapshot, orderBy, getDocs, updateDoc, doc } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { uploadFile } from '../firebase/storage';
import { DocumentType, UserRole, GeneratedDocument } from '../types';
import Button from '../components/Button';
import { FileText, Send, CheckCircle2, AlertCircle, Loader2, Pen, Clock, Download, Search, Plus, Minus, Trophy, Eye } from 'lucide-react';
import { sendNotification } from '../firebase/notificationService';
import { PRINCIPAL_EMAIL } from '../constants';

interface SportsAchievement {
    label: string;
    description: string;
    month: string;
    year: string;
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 16 }, (_, i) => (CURRENT_YEAR - i).toString());

const SPORTS_APPRECIATIVE_OPTIONS = [
    {
        id: 'athletic_achievement',
        title: 'Athletic Achievement',
        type: 'achievement_specific',
        text: '[First Name] has demonstrated strong athletic ability through [his/her] success in competitive school sports, reflecting dedication, discipline, and a high standard of performance.'
    },
    {
        id: 'competitive_excellence',
        title: 'Competitive Excellence',
        type: 'achievement_specific',
        text: '[Possessive] achievements across multiple sporting events highlight [his/her] ability to perform under pressure and consistently strive for sporting excellence.'
    },
    {
        id: 'leadership_sports',
        title: 'Leadership in Sports',
        type: 'sports_general',
        text: 'Beyond individual performance, [First Name] has shown leadership within the sports environment by setting a positive example, motivating peers, and taking responsibility when required.'
    },
    {
        id: 'training_discipline',
        title: 'Training Discipline',
        type: 'sports_general',
        text: '[Subject] approaches training and preparation with discipline and determination, maintaining consistency while balancing academic and sporting commitments.'
    },
    {
        id: 'teamwork_sportsmanship',
        title: 'Teamwork & Sportsmanship',
        type: 'sports_general',
        text: '[First Name] works effectively within team settings, demonstrating respect, cooperation, and strong sportsmanship during both training and competitions.'
    },
    {
        id: 'mental_strength',
        title: 'Mental Strength',
        type: 'sports_general',
        text: '[Possessive] resilience and positive mindset enable [him/her] to face challenges in competitive sports with maturity and confidence.'
    },
    {
        id: 'university_readiness',
        title: 'University Sports Readiness',
        type: 'sports_general',
        text: 'These qualities collectively position [First Name] as a well-rounded student-athlete who is well-prepared for the demands of university-level sports and extracurricular involvement.'
    }
];

const SportsRecommendationPortal: React.FC = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        gender: 'Male',
        grade: '',
        refereeName: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : '',
        refereeDesignation: user?.designation || 'Sports Coordinator',
        refereeEmail: user?.email || '',
        country: '',
    });

    const [sportsAchievements, setSportsAchievements] = useState<SportsAchievement[]>([
        { label: 'Achievement 1', description: '', month: '', year: '' }
    ]);

    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
    const [generatedAppreciative, setGeneratedAppreciative] = useState('');
    const [isEditingStatement, setIsEditingStatement] = useState(false);
    const [addSignature, setAddSignature] = useState(false);
    const [activeTab, setActiveTab] = useState<'generate' | 'approvals' | 'history'>('generate');
    const [historyRequests, setHistoryRequests] = useState<any[]>([]);
    const [approvalRequests, setApprovalRequests] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [loadingApprovals, setLoadingApprovals] = useState(true);

    // Preview States
    const [showPreview, setShowPreview] = useState(false);
    const [generatedPdfBlob, setGeneratedPdfBlob] = useState<Blob | null>(null);
    const [generatedPdfUrl, setGeneratedPdfUrl] = useState('');
    const [searchParams] = useSearchParams();
    const [isSendingApproval, setIsSendingApproval] = useState(false);

    // Initial Tab handling from query params
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'approvals' || tab === 'history') {
            setActiveTab(tab as any);
        }
    }, [searchParams]);

    // Unified data fetching for History and Approvals (Background Loading)
    useEffect(() => {
        if (!user) return;

        // 1. Fetch History
        const qHistory = query(
            collection(db, 'generated_documents'),
            where('documentType', '==', DocumentType.SPORTS_RECOMMENDATION),
            where('generatedById', '==', user.id)
        );
        const unsubHistory = onSnapshot(qHistory,
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
                // Sort in memory to avoid index requirement
                setHistoryRequests(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
                setLoadingHistory(false);
            },
            (error) => {
                console.error("History query failed:", error);
                setLoadingHistory(false);
            }
        );

        // 2. Fetch Approvals
        const qApprovals = query(
            collection(db, 'approval_requests'),
            where('documentType', '==', DocumentType.SPORTS_RECOMMENDATION),
            where('senderId', '==', user.id)
        );
        const unsubApprovals = onSnapshot(qApprovals,
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
                // Sort in memory to avoid index requirement
                setApprovalRequests(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
                setLoadingApprovals(false);
            },
            (error) => {
                console.error("Approvals query failed:", error);
                setLoadingApprovals(false);
            }
        );

        return () => {
            unsubHistory();
            unsubApprovals();
        };
    }, [user]);


    // Logic for auto-generating appreciative statement
    const formatAppreciativeText = (text: string) => {
        const isFemale = formData.gender === 'Female';
        const name = formData.firstName || 'The student';
        const subject = isFemale ? 'she' : 'he';
        const possessive = isFemale ? 'her' : 'his';
        const object = isFemale ? 'her' : 'him';

        return text
            .replace(/\[First Name\]/g, name)
            .replace(/\[Subject\]/g, subject.charAt(0).toUpperCase() + subject.slice(1))
            .replace(/\[subject\]/g, subject)
            .replace(/\[Possessive\]/g, possessive.charAt(0).toUpperCase() + possessive.slice(1))
            .replace(/\[possessive\]/g, possessive)
            .replace(/\[his\/her\]/g, possessive)
            .replace(/\[him\/her\]/g, object);
    };

    const handleOptionToggle = (id: string) => {
        const option = SPORTS_APPRECIATIVE_OPTIONS.find(o => o.id === id);
        if (!option) return;

        if (selectedOptions.includes(id)) {
            setSelectedOptions(selectedOptions.filter(o => o !== id));
        } else {
            // Cap Logic: N = number of sports achievements added
            const achievementCount = sportsAchievements.filter(a => a.description.trim()).length;
            const maxSpecific = achievementCount >= 3 ? 2 : 1;

            const currentSpecificCount = selectedOptions.filter(optId => {
                const opt = SPORTS_APPRECIATIVE_OPTIONS.find(o => o.id === optId);
                return opt?.type === 'achievement_specific';
            }).length;

            if (option.type === 'achievement_specific' && currentSpecificCount >= maxSpecific) {
                alert(`Based on having ${achievementCount} achievement(s), you can only select a maximum of ${maxSpecific} achievement-specific statement(s).`);
                return;
            }

            setSelectedOptions([...selectedOptions, id]);
        }
    };

    // Auto-update combined statement when selections change
    useEffect(() => {
        if (!isEditingStatement) {
            const combinedText = selectedOptions
                .map(id => {
                    const opt = SPORTS_APPRECIATIVE_OPTIONS.find(o => o.id === id);
                    return opt ? formatAppreciativeText(opt.text) : '';
                })
                .join(' ');
            setGeneratedAppreciative(combinedText);
        }
    }, [selectedOptions, formData.firstName, formData.gender, isEditingStatement]);

    const handleAddAchievement = () => {
        const nextId = sportsAchievements.length + 1;
        setSportsAchievements([
            ...sportsAchievements,
            { label: `Achievement ${nextId}`, description: '', month: '', year: '' }
        ]);
    };

    const handleRemoveAchievement = (index: number) => {
        if (sportsAchievements.length > 1) {
            const newList = sportsAchievements.filter((_, i) => i !== index);
            // Re-label
            const relabeled = newList.map((ach, i) => ({
                ...ach,
                label: `Achievement ${i + 1}`
            }));
            setSportsAchievements(relabeled);
        }
    };

    const handleAchievementChange = (index: number, field: keyof SportsAchievement, value: string) => {
        const newList = [...sportsAchievements];
        newList[index] = { ...newList[index], [field]: value };
        setSportsAchievements(newList);
    };

    const handleGenerate = async () => {
        const requiredFields = ['firstName', 'lastName', 'grade', 'refereeName', 'refereeDesignation', 'refereeEmail', 'country'];
        for (const field of requiredFields) {
            if (!(formData as any)[field]) {
                alert(`Please fill in the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`);
                return;
            }
        }

        const validAchievements = sportsAchievements.filter(a => a.description && a.month && a.year);
        if (validAchievements.length === 0) {
            alert("Please add at least one complete sports achievement.");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/generate-sports-recommendation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    sportsAchievements: validAchievements,
                    appreciativeStatement: generatedAppreciative,
                    signatureUrl: addSignature ? user?.signatureUrl : undefined
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate PDF');
            }

            const blob = await response.blob();
            setGeneratedPdfBlob(blob);
            const url = URL.createObjectURL(blob);
            setGeneratedPdfUrl(url);
            setShowPreview(true);

            // Save history record as "Generated"
            const fileName = `sports_recommendations/${Date.now()}_${formData.firstName}_${formData.lastName}.pdf`.replace(/\s+/g, '_');
            const pdfUrl = await uploadFile(blob, fileName);

            const historyDoc = {
                studentName: `${formData.firstName} ${formData.lastName}`,
                documentType: DocumentType.SPORTS_RECOMMENDATION,
                pdfUrl: pdfUrl,
                status: 'Sent for Approval', // Default state after send
                generatedById: user!.id,
                generatedByName: `${user!.firstName} ${user!.lastName}`,
                refereeName: formData.refereeName,
                sportsAchievements: validAchievements,
                appreciativeStatement: generatedAppreciative,
                formData,
                createdAt: new Date().toISOString()
            };

            // Note: We don't add to History yet, we wait for "Send for Approval" or "Download"? 
            // spec: "Every generated letter must appear in History". 
            // status before approval -> Draft PDF? No, spec says "Generated (not yet approved)". 
            // wait, Change 2: Download Status Unchanged. Send for Approval -> Status Sent for Approval.
            // Let's create a history record with status "Generated".
            await addDoc(collection(db, 'generated_documents'), {
                ...historyDoc,
                status: 'Generated'
            });

        } catch (error: any) {
            console.error(error);
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPreview = () => {
        if (!generatedPdfBlob) return;
        const a = document.createElement('a');
        a.href = generatedPdfUrl;
        a.download = `Draft_Sports_Recommendation_${formData.firstName}_${formData.lastName}.pdf`;
        a.click();
    };

    const handleSendForApproval = async () => {
        if (!generatedPdfBlob || !user) return;
        setIsSendingApproval(true);
        try {
            // Upload the draft PDF
            const fileName = `approval_drafts/${Date.now()}_SportsRec_${formData.firstName}.pdf`;
            const pdfUrl = await uploadFile(generatedPdfBlob, fileName);

            const approvalPayload = {
                ...formData,
                sportsAchievements: sportsAchievements.filter(a => a.description.trim()),
                appreciativeStatement: generatedAppreciative,
                signatureUrl: (addSignature && user.signatureUrl) ? user.signatureUrl : null,
                documentType: DocumentType.SPORTS_RECOMMENDATION
            };

            await addDoc(collection(db, 'approval_requests'), {
                senderId: user.id,
                senderName: `${user.firstName} ${user.lastName}`,
                recipientEmail: PRINCIPAL_EMAIL,
                studentName: `${formData.firstName} ${formData.lastName}`,
                documentType: DocumentType.SPORTS_RECOMMENDATION,
                pdfUrl: pdfUrl,
                status: 'Sent for Approval',
                payload: approvalPayload,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            // Update history record status to "Sent for Approval"
            const q = query(collection(db, 'generated_documents'),
                where('studentName', '==', `${formData.firstName} ${formData.lastName}`),
                where('documentType', '==', DocumentType.SPORTS_RECOMMENDATION),
                where('generatedById', '==', user.id));
            const snap = await getDocs(q);
            if (!snap.empty) {
                await updateDoc(doc(db, 'generated_documents', snap.docs[0].id), {
                    status: 'Sent for Approval'
                });
            }

            // Notify Principal ONLY
            const notifMsg = `Sports Recommendation Letter for ${formData.firstName} ${formData.lastName} has been sent for approval.`;
            await sendNotification("PRINCIPAL", notifMsg, "/approvals");

            alert("Letter sent to Principal for approval.");
            setShowPreview(false);
            setActiveTab('approvals');
        } catch (error: any) {
            alert("Failed to send for approval: " + error.message);
        } finally {
            setIsSendingApproval(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
            {/* Header / Tabs */}
            <div className="flex bg-white dark:bg-[#070708] p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 w-fit">
                <button
                    onClick={() => setActiveTab('generate')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'generate' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                    <Pen className="w-4 h-4" />
                    GENERATE LETTER
                </button>
                <button
                    onClick={() => setActiveTab('approvals')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'approvals' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                    <CheckCircle2 className="w-4 h-4" />
                    APPROVALS
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'history' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                    <Clock className="w-4 h-4" />
                    HISTORY
                </button>
            </div>

            {activeTab === 'generate' ? (
                <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                    <div className="bg-gradient-to-r from-brand-600 to-brand-800 p-8 text-white flex items-center justify-between">
                        <div>
                            <h2 className="text-3xl font-black tracking-tight">Sports Recommendation Portal</h2>
                            <p className="text-brand-100 font-medium">Achievement-driven recommendation letters for student athletes.</p>
                        </div>
                        <Trophy className="w-12 h-12 opacity-20" />
                    </div>

                    <div className="p-8 md:p-12 space-y-10">
                        {/* Student Information */}
                        <section className="space-y-6">
                            <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-white/5 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Student Information</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">First Name</label>
                                    <input
                                        type="text"
                                        value={formData.firstName}
                                        onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                        placeholder="e.g. John"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Last Name</label>
                                    <input
                                        type="text"
                                        value={formData.lastName}
                                        onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                        placeholder="e.g. Doe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Gender</label>
                                    <select
                                        value={formData.gender}
                                        onChange={e => setFormData({ ...formData, gender: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Current Grade</label>
                                    <input
                                        type="text"
                                        value={formData.grade}
                                        onChange={e => setFormData({ ...formData, grade: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                        placeholder="e.g. Grade 12"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Sports Achievements */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                                        <Trophy className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">Sports Achievements</h3>
                                </div>
                                <button
                                    onClick={handleAddAchievement}
                                    className="flex items-center gap-2 px-4 py-2 bg-brand-600/10 text-brand-600 dark:text-brand-400 rounded-xl text-xs font-black hover:bg-brand-600 hover:text-white transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                    ADD ACHIEVEMENT
                                </button>
                            </div>

                            <div className="space-y-4">
                                {sportsAchievements.map((ach, index) => (
                                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50 dark:bg-white/5 p-6 rounded-3xl border border-slate-200 dark:border-white/5 group animate-slide-in">
                                        <div className="md:col-span-2 space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Label</label>
                                            <input
                                                type="text"
                                                value={ach.label}
                                                readOnly
                                                className="w-full px-4 py-3 bg-slate-200/50 dark:bg-white/5 border-transparent rounded-xl font-bold text-slate-500 outline-none cursor-default"
                                            />
                                        </div>
                                        <div className="md:col-span-4 space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Achievement Description</label>
                                            <input
                                                type="text"
                                                value={ach.description}
                                                onChange={e => handleAchievementChange(index, 'description', e.target.value)}
                                                className="w-full px-4 py-3 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                                placeholder="e.g. Winner – Inter-School Badminton Championship"
                                            />
                                        </div>
                                        <div className="md:col-span-2 space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Month</label>
                                            <select
                                                value={ach.month}
                                                onChange={e => handleAchievementChange(index, 'month', e.target.value)}
                                                className="w-full px-4 py-3 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                            >
                                                <option value="">Month</option>
                                                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div className="md:col-span-2 space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Year</label>
                                            <select
                                                value={ach.year}
                                                onChange={e => handleAchievementChange(index, 'year', e.target.value)}
                                                className="w-full px-4 py-3 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                            >
                                                <option value="">Year</option>
                                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>
                                        <div className="md:col-span-2 flex justify-end">
                                            {sportsAchievements.length > 1 && (
                                                <button
                                                    onClick={() => handleRemoveAchievement(index)}
                                                    className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
                                                    title="Remove Achievement"
                                                >
                                                    <Minus className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Appreciative Statement */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">Appreciative Statement</h3>
                                </div>
                                <button
                                    onClick={() => setIsEditingStatement(!isEditingStatement)}
                                    className="text-xs font-black text-brand-600 hover:underline"
                                >
                                    {isEditingStatement ? 'SAVE VIEW' : 'EDIT MANUALLY'}
                                </button>
                            </div>

                            <p className="text-sm text-slate-500 font-medium italic">
                                Select at least 3 statements to build the appreciative paragraph.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {SPORTS_APPRECIATIVE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => handleOptionToggle(opt.id)}
                                        className={`flex flex-col text-left p-4 rounded-2xl border transition-all ${selectedOptions.includes(opt.id) ? 'bg-brand-600 border-brand-600 shadow-lg shadow-brand-500/20' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-brand-500/50'}`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${selectedOptions.includes(opt.id) ? 'text-brand-100' : 'text-slate-400'}`}>
                                                {opt.title}
                                            </span>
                                            {selectedOptions.includes(opt.id) && <CheckCircle2 className="w-4 h-4 text-white" />}
                                        </div>
                                        <p className={`text-xs leading-relaxed line-clamp-2 ${selectedOptions.includes(opt.id) ? 'text-white font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                                            {formatAppreciativeText(opt.text)}
                                        </p>
                                    </button>
                                ))}
                            </div>

                            <div className="relative mt-6">
                                {isEditingStatement ? (
                                    <textarea
                                        value={generatedAppreciative}
                                        onChange={e => setGeneratedAppreciative(e.target.value)}
                                        className="w-full px-6 py-6 bg-white dark:bg-white/5 border-2 border-brand-500/20 rounded-3xl focus:ring-4 focus:ring-brand-500/10 outline-none transition-all font-medium text-slate-900 dark:text-white min-h-[160px] leading-relaxed shadow-inner"
                                    />
                                ) : (
                                    <div className={`p-8 rounded-3xl border transition-all ${selectedOptions.length < 3 ? 'bg-orange-50 dark:bg-orange-900/5 border-orange-200 dark:border-orange-500/20' : 'bg-emerald-50 dark:bg-emerald-900/5 border-emerald-200 dark:border-emerald-500/20'}`}>
                                        <div className="flex items-center gap-2 mb-4">
                                            {selectedOptions.length < 3 ? (
                                                <>
                                                    <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                                    <span className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest">Incomplete: Select {3 - selectedOptions.length} more</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Ready to Generate</span>
                                                </>
                                            )}
                                        </div>
                                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                                            {generatedAppreciative || <span className="text-slate-400 italic">Select statements from the pool above...</span>}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Referee Information */}
                        <section className="space-y-6">
                            <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-white/5 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Referee & Destination</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Name of Referee</label>
                                    <input
                                        type="text"
                                        value={formData.refereeName}
                                        onChange={e => setFormData({ ...formData, refereeName: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Designation</label>
                                    <input
                                        type="text"
                                        value={formData.refereeDesignation}
                                        onChange={e => setFormData({ ...formData, refereeDesignation: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Destination Country</label>
                                    <input
                                        type="text"
                                        value={formData.country}
                                        onChange={e => setFormData({ ...formData, country: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                        placeholder="e.g. Australia"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Email of Referee</label>
                                    <input
                                        type="email"
                                        value={formData.refereeEmail}
                                        onChange={e => setFormData({ ...formData, refereeEmail: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Signature Toggle */}
                        {user?.signatureUrl && (
                            <div className="pt-8 pb-8 flex justify-center">
                                <div className={`w-full max-w-md flex items-center justify-between p-4 rounded-xl border transition-all ${addSignature ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${addSignature ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'}`}>
                                            <Pen className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">Add Signature</p>
                                            <p className="text-[10px] text-slate-500">Include your default digital signature</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setAddSignature(!addSignature)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${addSignature ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${addSignature ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex flex-col items-center">
                            <Button
                                onClick={handleGenerate}
                                isLoading={loading}
                                disabled={selectedOptions.length < 3 || sportsAchievements.some(a => !a.description || !a.month || !a.year)}
                                className={`w-full max-w-md py-5 text-lg shadow-2xl transition-all ${selectedOptions.length >= 3 && !sportsAchievements.some(a => !a.description || !a.month || !a.year) ? 'shadow-brand-500/40' : 'opacity-50 grayscale cursor-not-allowed'}`}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                                        Generating Letter...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-6 h-6 mr-3" />
                                        Generate Letter
                                    </>
                                )}
                            </Button>
                            <p className="text-xs text-slate-500 font-bold mt-4 uppercase tracking-[0.2em]">PDF will be rendered on official SLISR letterhead</p>
                        </div>
                    </div>

                    {showPreview && (
                        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                            <div className="bg-white dark:bg-[#070708] w-full max-w-5xl h-[90vh] rounded-[2.5rem] overflow-hidden border border-white/10 flex flex-col animate-scale-in">
                                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Letter Preview</h3>
                                        <p className="text-sm text-slate-500">Status: <span className="text-brand-400 font-bold uppercase tracking-widest text-xs ml-1">Generated</span></p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={handleDownloadPreview}
                                            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 border border-white/10"
                                        >
                                            <Download className="w-4 h-4" />
                                            Download
                                        </button>
                                        <button
                                            onClick={handleSendForApproval}
                                            disabled={isSendingApproval}
                                            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-xl shadow-brand-500/20"
                                        >
                                            {isSendingApproval ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                            Send for Approval
                                        </button>
                                        <button
                                            onClick={() => setShowPreview(false)}
                                            className="p-2 text-slate-400 hover:text-white transition-colors"
                                        >
                                            <Minus className="w-6 h-6 rotate-45" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 bg-slate-900 relative">
                                    <iframe src={generatedPdfUrl} className="w-full h-full border-none" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeTab === 'approvals' ? (
                /* Approvals Tracker Tab */
                <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden text-white min-h-[500px]">
                    <div className="p-8 border-b border-white/5 bg-white/[0.01]">
                        <h2 className="text-xl font-bold">Approval Tracker</h2>
                        <p className="text-sm text-slate-500">
                            Monitor the status of letters sent to the Principal
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-white/[0.02]">
                                <tr className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                                    <th className="px-8 py-5">Student Name</th>
                                    <th className="px-8 py-5">Letter Type</th>
                                    <th className="px-8 py-5 text-center">Date Sent</th>
                                    <th className="px-8 py-5 text-center">Status</th>
                                    <th className="px-8 py-5 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {loadingApprovals ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-20 text-center">
                                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500 opacity-50" />
                                        </td>
                                    </tr>
                                ) : approvalRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-20 text-center text-slate-500 italic">
                                            <Search className="w-12 h-12 mb-4 mx-auto opacity-10" />
                                            No approval requests found
                                        </td>
                                    </tr>
                                ) : (
                                    approvalRequests.map(req => (
                                        <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors font-medium">
                                            <td className="px-8 py-5 font-bold text-slate-900 dark:text-white">{req.studentName}</td>
                                            <td className="px-8 py-5 text-xs text-slate-500">Sports Recommendation</td>
                                            <td className="px-8 py-5 text-center text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</td>
                                            <td className="px-8 py-5 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${req.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                                    {req.status === 'Pending Approval' ? 'Sent for Approval' : req.status}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <button
                                                    onClick={() => window.open(req.finalPdfUrl || req.pdfUrl, '_blank')}
                                                    className="px-4 py-2 bg-slate-100 dark:bg-white/5 rounded-xl text-xs font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-600 hover:text-white transition-all inline-flex items-center gap-2"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    View PDF
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* History Tab Content */
                <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden text-white min-h-[500px]">
                    <div className="p-8 border-b border-white/5 bg-white/[0.01]">
                        <h2 className="text-xl font-bold">Sports Recommendation History</h2>
                        <p className="text-sm text-slate-500">
                            Tracking your previously generated sports recommendation letters
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-brand-600">
                                <tr className="text-white text-xs uppercase tracking-widest">
                                    <th className="px-8 py-4">Student Name</th>
                                    <th className="px-8 py-4 text-center">Date Generated</th>
                                    <th className="px-8 py-4 text-center">Status</th>
                                    <th className="px-8 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loadingHistory ? (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-20 text-center">
                                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500 opacity-50" />
                                        </td>
                                    </tr>
                                ) : historyRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-20 text-center text-slate-500 italic">
                                            <Search className="w-12 h-12 mb-4 mx-auto opacity-10" />
                                            No sports recommendations found in history
                                        </td>
                                    </tr>
                                ) : (
                                    historyRequests.map(req => (
                                        <tr key={req.id} className="hover:bg-white/[0.02] transition-colors font-medium">
                                            <td className="px-8 py-5 font-bold">{req.studentName}</td>
                                            <td className="px-8 py-5 text-center text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</td>
                                            <td className="px-8 py-5 text-center">
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${req.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                                    {req.status || 'Generated'}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <button
                                                    onClick={() => window.open(req.pdfUrl, '_blank')}
                                                    className="px-4 py-2 bg-brand-600 rounded-xl text-xs font-bold hover:bg-brand-500 transition-all inline-flex items-center gap-2 shadow-lg shadow-brand-500/20"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    View PDF
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SportsRecommendationPortal;
