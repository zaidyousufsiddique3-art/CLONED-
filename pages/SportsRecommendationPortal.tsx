import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, query, where, onSnapshot, orderBy } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { uploadFile } from '../firebase/storage';
import { DocumentType, UserRole, GeneratedDocument } from '../types';
import Button from '../components/Button';
import { FileText, Send, CheckCircle2, AlertCircle, Loader2, Pen, Clock, Download, Search, Plus, Minus, Trophy } from 'lucide-react';

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

    const [generatedAppreciative, setGeneratedAppreciative] = useState('');
    const [isEditingStatement, setIsEditingStatement] = useState(false);
    const [addSignature, setAddSignature] = useState(false);
    const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
    const [historyRequests, setHistoryRequests] = useState<GeneratedDocument[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        if (!user || activeTab !== 'history') return;
        setLoadingHistory(true);

        const coll = collection(db, 'generated_documents');
        // We use a specific document type for sports recommendation or just filter by referee email if needed
        // But the requirement says "documentType: REFERENCE_LETTER" in the existing one.
        // Let's stick to REFERENCE_LETTER but maybe we can add a metadata flag or just rely on the referee role.
        // For now, I'll use REFERENCE_LETTER and show them in history.
        const q = query(
            coll,
            where('documentType', '==', DocumentType.REFERENCE_LETTER),
            where('generatedById', '==', user.id),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GeneratedDocument));
                setHistoryRequests(docs);
                setLoadingHistory(false);
            },
            (error) => {
                console.error("History fetch error:", error);
                setLoadingHistory(false);
            }
        );

        return () => unsubscribe();
    }, [user, activeTab]);

    // Logic for auto-generating appreciative statement
    useEffect(() => {
        generateStatement();
    }, [sportsAchievements, formData.firstName, formData.gender]);

    const generateStatement = () => {
        if (sportsAchievements.length === 0 || !sportsAchievements[0].description) {
            setGeneratedAppreciative('');
            return;
        }

        const count = sportsAchievements.filter(a => a.description.trim()).length;
        if (count === 0) {
            setGeneratedAppreciative('');
            return;
        }

        const isFemale = formData.gender === 'Female';
        const name = formData.firstName || 'The student';
        const pronoun = isFemale ? 'she' : 'he';
        const possessive = isFemale ? 'her' : 'his';

        // Rule 1: Tone based on count
        let toneIntro = "";
        if (count === 1) {
            toneIntro = `${name} has demonstrated focused excellence in sports, specifically through ${possessive} achievement as `;
        } else if (count >= 2 && count <= 3) {
            toneIntro = `${name} is a well-rounded sports contributor who has consistently excelled across multiple disciplines, notably as `;
        } else {
            toneIntro = `${name} is a highly accomplished athlete with significant leadership experience, having achieved numerous milestones including `;
        }

        // Rule 2: Keyword Mapping
        const descriptions = sportsAchievements.map(a => a.description.toLowerCase());
        const hasLeadership = descriptions.some(d => d.includes('captain') || d.includes('leader'));
        const hasCompetition = descriptions.some(d => d.includes('winner') || d.includes('champion') || d.includes('tournament') || d.includes('league'));
        const hasHighLevel = descriptions.some(d => d.includes('national') || d.includes('inter-school'));

        let achievementHighlights = sportsAchievements
            .filter(a => a.description.trim())
            .map(a => a.description)
            .join(', and ');

        let statement = toneIntro + achievementHighlights + ". ";

        let extraTraits = [];
        if (hasLeadership) extraTraits.push("leadership");
        if (hasCompetition) extraTraits.push("competitive excellence");
        if (hasHighLevel) extraTraits.push("high-level exposure and commitment");

        let characterTrait = "";
        if (extraTraits.length > 0) {
            const traitsText = extraTraits.length > 1
                ? extraTraits.slice(0, -1).join(', ') + ' and ' + extraTraits.slice(-1)
                : extraTraits[0];
            characterTrait = `${name}'s success reflects not only ${possessive} athletic ability but also ${possessive} discipline, ${traitsText}. `;
        } else {
            characterTrait = `${possessive.charAt(0).toUpperCase() + possessive.slice(1)} consistent involvement demonstrates a deep passion for sports and a commendable level of discipline. `;
        }

        statement += characterTrait;
        setGeneratedAppreciative(statement);
    };

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

            // 1. Upload to Storage
            const fileName = `sports_recommendations/${Date.now()}_${formData.firstName}_${formData.lastName}.pdf`.replace(/\s+/g, '_');
            const pdfUrl = await uploadFile(blob, fileName);

            // 2. Save history record
            const historyDoc: any = {
                studentName: `${formData.firstName} ${formData.lastName}`,
                documentType: DocumentType.REFERENCE_LETTER,
                pdfUrl: pdfUrl,
                generatedById: user!.id,
                generatedByName: `${user!.firstName} ${user!.lastName}`,
                refereeName: formData.refereeName,
                sportsAchievements: validAchievements,
                appreciativeStatement: generatedAppreciative,
                createdAt: new Date().toISOString()
            };
            await addDoc(collection(db, 'generated_documents'), historyDoc);

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Sports Recommendation - ${formData.firstName} ${formData.lastName}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            alert("Sports recommendation letter generated and saved to history.");
        } catch (error: any) {
            console.error(error);
            alert(error.message);
        } finally {
            setLoading(false);
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
                                This statement is auto-generated based on the achievements and tone rules.
                            </p>

                            <div className="relative">
                                {isEditingStatement ? (
                                    <textarea
                                        value={generatedAppreciative}
                                        onChange={e => setGeneratedAppreciative(e.target.value)}
                                        className="w-full px-6 py-6 bg-white dark:bg-white/5 border-2 border-brand-500/20 rounded-3xl focus:ring-4 focus:ring-brand-500/10 outline-none transition-all font-medium text-slate-900 dark:text-white min-h-[160px] leading-relaxed shadow-inner"
                                    />
                                ) : (
                                    <div className="p-8 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-3xl">
                                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                                            {generatedAppreciative || <span className="text-slate-400">Enter achievements above to see the generated statement...</span>}
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
                                disabled={!generatedAppreciative || sportsAchievements.some(a => !a.description || !a.month || !a.year)}
                                className={`w-full max-w-md py-5 text-lg shadow-2xl transition-all ${generatedAppreciative && !sportsAchievements.some(a => !a.description || !a.month || !a.year) ? 'shadow-brand-500/40' : 'opacity-50 grayscale cursor-not-allowed'}`}
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
                                    <th className="px-8 py-4">Referee Name</th>
                                    <th className="px-8 py-4 text-center">Date Generated</th>
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
                                            <td className="px-8 py-5 text-sm text-slate-400">{req.refereeName}</td>
                                            <td className="px-8 py-5 text-center text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</td>
                                            <td className="px-8 py-5 text-right">
                                                <button
                                                    onClick={() => {
                                                        const a = document.createElement('a');
                                                        a.href = req.pdfUrl;
                                                        a.download = `Sports_Recommendation_${req.studentName.replace(/\s+/g, '_')}.pdf`;
                                                        a.click();
                                                    }}
                                                    className="px-4 py-2 bg-brand-600 rounded-xl text-xs font-bold hover:bg-brand-500 transition-all inline-flex items-center gap-2 shadow-lg shadow-brand-500/20"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                    Download PDF
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
