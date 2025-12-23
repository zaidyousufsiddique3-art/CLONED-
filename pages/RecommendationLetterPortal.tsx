import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, query, where, onSnapshot, orderBy } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { uploadFile } from '../firebase/storage';
import { DocumentType, UserRole, GeneratedDocument } from '../types';
import Button from '../components/Button';
import { FileText, Send, CheckCircle2, AlertCircle, Loader2, Pen, Clock, Download, Search, Eye } from 'lucide-react';

const APPRECIATIVE_OPTIONS = [
    { id: '1', title: 'Academic Strength', text: '[First Name] consistently demonstrated strong subject knowledge and the ability to clearly articulate academic concepts beyond the expected level for [his/her] grade.' },
    { id: '2', title: 'Classroom Engagement', text: '[First Name] was an active and thoughtful participant in class discussions, regularly contributing meaningful insights.' },
    { id: '3', title: 'Teamwork & Support', text: '[First Name] worked well with peers, offering support and collaborating effectively in group settings.' },
    { id: '4', title: 'Character & Respect', text: '[First Name] displayed a respectful attitude and positive conduct, valuing differing opinions.' },
    { id: '5', title: 'Discipline & Focus', text: '[First Name] approached academic responsibilities with discipline, focus, and maturity.' },
    { id: '7', title: 'Overall Potential', text: '[First Name] possesses the motivation and character required to succeed in higher education.' },
];

const RecommendationLetterPortal: React.FC = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        gender: 'Male',
        grade: '',
        refereeName: '',
        refereeDesignation: '',
        refereeEmail: '',
        country: '',
        additionalInfo: ''
    });
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
    const [addSignature, setAddSignature] = useState(false);
    const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate');
    const [historyRequests, setHistoryRequests] = useState<GeneratedDocument[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    useEffect(() => {
        if (!user) return;

        const coll = collection(db, 'generated_documents');
        let q;

        if (user.role === UserRole.SUPER_ADMIN) {
            q = query(coll, where('documentType', '==', DocumentType.REFERENCE_LETTER));
        } else {
            q = query(coll, where('documentType', '==', DocumentType.REFERENCE_LETTER), where('generatedById', '==', user.id));
        }

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GeneratedDocument));
                // Sort in memory to avoid index requirement
                setHistoryRequests(docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
                setLoadingHistory(false);
            },
            (error) => {
                console.error("History fetch error:", error);
                setLoadingHistory(false);
            }
        );

        return () => unsubscribe();
    }, [user]);

    if (user?.role !== UserRole.SUPER_ADMIN && !user?.hasRecommendationAccess) {
        return <div className="p-10 text-center text-red-500 font-bold">Access Denied</div>;
    }

    const handleOptionToggle = (id: string) => {
        if (selectedOptions.includes(id)) {
            setSelectedOptions(selectedOptions.filter(o => o !== id));
        } else {
            if (selectedOptions.length < 3) {
                setSelectedOptions([...selectedOptions, id]);
            }
        }
    };

    const handleGenerate = async () => {
        if (selectedOptions.length !== 3) {
            alert("Please select exactly 3 appreciative options.");
            return;
        }

        const requiredFields = ['firstName', 'lastName', 'grade', 'refereeName', 'refereeDesignation', 'refereeEmail', 'country'];
        for (const field of requiredFields) {
            if (!(formData as any)[field]) {
                alert(`Please fill in the ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`);
                return;
            }
        }

        setLoading(true);
        try {
            // Map selected options to their full text
            const selectedTextOptions = selectedOptions.map(id => {
                const opt = APPRECIATIVE_OPTIONS.find(o => o.id === id);
                return opt ? opt.text : '';
            });

            const response = await fetch('/api/generate-recommendation-letter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    selectedOptions: selectedTextOptions,
                    signatureUrl: addSignature ? user.signatureUrl : undefined
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate PDF');
            }

            const blob = await response.blob();

            // 1. Upload to Storage for history
            const fileName = `recommendations/${Date.now()}_${formData.firstName}_${formData.lastName}.pdf`.replace(/\s+/g, '_');
            const pdfUrl = await uploadFile(blob, fileName);

            // 2. Save history record
            const historyDoc: Omit<GeneratedDocument, 'id'> = {
                studentName: `${formData.firstName} ${formData.lastName}`,
                documentType: DocumentType.REFERENCE_LETTER,
                pdfUrl: pdfUrl,
                generatedById: user.id,
                generatedByName: `${user.firstName} ${user.lastName}`,
                refereeName: formData.refereeName,
                createdAt: new Date().toISOString()
            };
            await addDoc(collection(db, 'generated_documents'), historyDoc);

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Recommendation Letter - ${formData.firstName} ${formData.lastName}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            alert("Letter generated and saved to history.");
        } catch (error: any) {
            console.error(error);
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
            {/* Tab Navigation */}
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
                            <h2 className="text-3xl font-black tracking-tight">Recommendation Letter Generator</h2>
                            <p className="text-brand-100 font-medium">Generate professional reference letters on official letterhead.</p>
                        </div>
                        <FileText className="w-12 h-12 opacity-20" />
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

                        {/* Referee Information */}
                        <section className="space-y-6">
                            <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-white/5 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Referee Information</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Name of Referee</label>
                                    <input
                                        type="text"
                                        value={formData.refereeName}
                                        onChange={e => setFormData({ ...formData, refereeName: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                        placeholder="e.g. Mr. Ruxshan Razak"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Designation</label>
                                    <input
                                        type="text"
                                        value={formData.refereeDesignation}
                                        onChange={e => setFormData({ ...formData, refereeDesignation: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                        placeholder="e.g. Principal"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Email of Referee</label>
                                    <input
                                        type="email"
                                        value={formData.refereeEmail}
                                        onChange={e => setFormData({ ...formData, refereeEmail: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                        placeholder="e.g. principal@slisr.com"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Destination */}
                        <section className="space-y-6">
                            <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-white/5 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Destination</h3>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Country</label>
                                <input
                                    type="text"
                                    value={formData.country}
                                    onChange={e => setFormData({ ...formData, country: e.target.value })}
                                    className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white"
                                    placeholder="e.g. United Kingdom"
                                />
                            </div>
                        </section>

                        {/* Appreciative Statements */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">Appreciative Statements</h3>
                                </div>
                                <span className={`text-xs font-black px-3 py-1 rounded-full ${selectedOptions.length === 3 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                    {selectedOptions.length} / 3 Selected
                                </span>
                            </div>

                            <p className="text-sm text-slate-500 font-medium">Select exactly 3 options below to be included as paragraphs in the letter.</p>

                            <div className="grid grid-cols-1 gap-4">
                                {APPRECIATIVE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => handleOptionToggle(opt.id)}
                                        className={`text-left p-6 rounded-2xl border transition-all duration-300 group flex items-start space-x-4 ${selectedOptions.includes(opt.id)
                                            ? 'bg-brand-50/50 dark:bg-brand-500/10 border-brand-500 ring-1 ring-brand-500'
                                            : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/5 hover:border-brand-500/50'
                                            }`}
                                    >
                                        <div className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selectedOptions.includes(opt.id)
                                            ? 'bg-brand-500 border-brand-500 text-white'
                                            : 'border-slate-300 dark:border-slate-600 group-hover:border-brand-500'
                                            }`}>
                                            {selectedOptions.includes(opt.id) && <CheckCircle2 className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-white mb-1">{opt.title}</p>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 italic">"{opt.text.replace(/\[First Name\]/g, formData.firstName || 'Student').replace(/\[his\/her\]/g, formData.gender === 'Female' ? 'her' : 'his')}"</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Additional Information */}
                        <section className="space-y-6">
                            <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-white/5 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                                    <AlertCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Additional Information (Optional)</h3>
                            </div>

                            <textarea
                                value={formData.additionalInfo}
                                onChange={e => setFormData({ ...formData, additionalInfo: e.target.value })}
                                className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none transition-all font-bold text-slate-900 dark:text-white min-h-[120px]"
                                placeholder="Add any extra notes to be included in the letter. Leave empty to omit."
                            />
                        </section>

                        {/* Signature Toggle */}
                        {(user?.role === UserRole.SUPER_ADMIN || user?.hasRecommendationAccess) && (
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
                                        onClick={() => {
                                            if (!user.signatureUrl) {
                                                alert("Please upload a default signature in your profile first.");
                                                return;
                                            }
                                            setAddSignature(!addSignature);
                                        }}
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
                                disabled={selectedOptions.length !== 3}
                                className={`w-full max-w-md py-5 text-lg shadow-2xl transition-all ${selectedOptions.length === 3 ? 'shadow-brand-500/40' : 'opacity-50 grayscale cursor-not-allowed'}`}
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
                        <h2 className="text-xl font-bold">Recommendation Letter History</h2>
                        <p className="text-sm text-slate-500">
                            {user.role === UserRole.SUPER_ADMIN ? 'All generated letters across the institution' : 'Tracking your previously generated recommendation letters'}
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-brand-600">
                                <tr className="text-white text-xs uppercase tracking-widest">
                                    <th className="px-8 py-4">Student Name</th>
                                    <th className="px-8 py-4">Referee Name</th>
                                    <th className="px-8 py-4 text-center">Date Generated</th>
                                    {user.role === UserRole.SUPER_ADMIN && <th className="px-8 py-4">Generated By</th>}
                                    <th className="px-8 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loadingHistory ? (
                                    <tr>
                                        <td colSpan={user.role === UserRole.SUPER_ADMIN ? 5 : 4} className="px-8 py-20 text-center">
                                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500 opacity-50" />
                                        </td>
                                    </tr>
                                ) : historyRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={user.role === UserRole.SUPER_ADMIN ? 5 : 4} className="px-8 py-20 text-center text-slate-500 italic">
                                            <Search className="w-12 h-12 mb-4 mx-auto opacity-10" />
                                            No recommendation letters found in history
                                        </td>
                                    </tr>
                                ) : (
                                    historyRequests.map(req => (
                                        <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-8 py-5 font-bold">{req.studentName}</td>
                                            <td className="px-8 py-5 text-sm text-slate-400">{req.refereeName}</td>
                                            <td className="px-8 py-5 text-center text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</td>
                                            {user.role === UserRole.SUPER_ADMIN && <td className="px-8 py-5 text-xs text-slate-400 font-medium">{req.generatedByName}</td>}
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

export default RecommendationLetterPortal;
