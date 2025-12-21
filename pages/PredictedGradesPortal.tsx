
import React, { useState, useEffect } from 'react';
import {
    Folder,
    User,
    FileText,
    Search,
    Loader2,
    ChevronRight,
    AlertCircle,
    TrendingUp,
    Download,
    X
} from 'lucide-react';
import { ref, listAll, getDownloadURL, getBytes } from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';
// GLOBAL LOGIC ENFORCEMENT: Extraction is strictly routed via /api/extract-student-results to ensure consistency.
// Do not use client-side extraction logic.
import { StudentResult } from '../services/extractionService';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import jsPDF from 'jspdf';

const BASE_PATH = 'superadmin_documents/';

interface StudentFile {
    id: string; // usually path
    fileName: string;
    fileRef: any;
    extractedData?: StudentResult;
}

const PredictedGradesPortal: React.FC = () => {
    const { user } = useAuth();
    const [folders, setFolders] = useState<string[]>([]);
    const [selectedFolder, setSelectedFolder] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0); // 0 to 100
    const [students, setStudents] = useState<StudentFile[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [loadingFolders, setLoadingFolders] = useState(true);
    const [debugMode, setDebugMode] = useState(false);
    const [stats, setStats] = useState({ scanned: 0, extracted: 0, lastFile: '' });
    const [showPredicted, setShowPredicted] = useState(false);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [iasSession, setIasSession] = useState('');
    const [ialSession, setIalSession] = useState('');
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [gender, setGender] = useState<'male' | 'female'>('male');

    useEffect(() => {
        fetchFolders();
    }, []);

    const fetchFolders = async () => {
        try {
            const rootRef = ref(storage, BASE_PATH);
            const res = await listAll(rootRef);
            // We assume direct subfolders in BASE_PATH are the "Exam Years"
            // Note: DocumentsPortal.tsx allows nested folders, but the prompt says 
            // "Dynamically populate with the names of all top-level folders"
            setFolders(res.prefixes.map(p => p.name));
        } catch (error) {
            console.error("Error fetching folders:", error);
        } finally {
            setLoadingFolders(false);
        }
    };

    const handleFolderChange = async (folderName: string) => {
        setSelectedFolder(folderName);
        setStudents([]);
        setSelectedStudentId('');
        setShowPredicted(false);
        if (!folderName) return;

        scanFolder(folderName);
    };

    const handleStudentChange = (id: string) => {
        setSelectedStudentId(id);
        setShowPredicted(false);
    };

    const scanFolder = async (folderName: string) => {
        setScanning(true);
        setScanProgress(0);

        // FATAL CHECK verification
        console.log("[FATAL CHECK] Storage bucket in use:", storage.app.options.storageBucket);

        try {
            const folderRef = ref(storage, `${BASE_PATH}${folderName}/`);
            console.log('[DEBUG] Scanning folder:', folderRef.fullPath);

            // Helper to recursively list all files
            const listAllFilesRecursively = async (ref: any): Promise<any[]> => {
                const res = await listAll(ref);
                let files = [...res.items];
                for (const prefix of res.prefixes) {
                    files = files.concat(await listAllFilesRecursively(prefix));
                }
                return files;
            };

            const allFileItems = await listAllFilesRecursively(folderRef);
            console.log('[DEBUG] Files discovered recursively:', allFileItems.map(f => f.fullPath));

            const totalFiles = allFileItems.length;
            if (totalFiles === 0) {
                console.error('[FATAL] Recursive scan found ZERO files. Path is wrong or function not executing.');
                setScanning(false);
                return;
            }

            const foundStudents: StudentFile[] = [];
            let processed = 0;

            // Filter out .keep files
            const fileItems = allFileItems.filter(i => i.name !== '.keep');

            for (const itemRef of fileItems) {
                try {
                    // Download file blob
                    // Call Server-Side API to bypass CORS
                    console.log(`[DEBUG] Requesting server-side extraction for: ${itemRef.fullPath}`);
                    const response = await fetch('/api/extract-student-results', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath: itemRef.fullPath })
                    });

                    if (!response.ok) {
                        console.error(`[API Error] ${response.status} ${response.statusText}`);
                        continue;
                    }

                    const apiData = await response.json();

                    // 1. CONFIRM API RESPONSE AT CALL SITE
                    console.log("[DEBUG] RAW API RESPONSE:", apiData);

                    const results = apiData.students || [];

                    if (results && results.length > 0) {
                        results.forEach((data, idx) => {
                            // Filter valid candidates unless in DEBUG mode
                            if (debugMode || (data.candidateName && data.candidateName !== 'Unknown Candidate')) {
                                foundStudents.push({
                                    id: `${itemRef.fullPath}_${idx}`,
                                    fileName: itemRef.name,
                                    fileRef: itemRef,
                                    extractedData: data
                                });
                            }
                        });
                    }

                    setStats(prev => ({
                        ...prev,
                        scanned: processed + 1,
                        extracted: foundStudents.length,
                        lastFile: itemRef.name
                    }));

                } catch (err) {
                    console.error(`Error processing file ${itemRef.name}:`, err);
                }

                processed++;
                setScanProgress(Math.round((processed / fileItems.length) * 100));
            }

            // In debug mode, we might want to see raw counts
            console.log(`Scan Complete. Found ${foundStudents.length} candidates.`);

            // 3. VERIFY API RESPONSE SHAPE AT SET STATE TIME
            console.log("[DEBUG] SETTING students:", foundStudents);
            setStudents(foundStudents);

        } catch (error) {
            console.error("Error scanning folder:", error);
            alert("Error scanning folder contents.");
        } finally {
            setScanning(false);
        }
    };

    // 4. HARD FAIL IF RESULTS IS WRONG TYPE
    const selectedStudent = React.useMemo(() => {
        const file = students.find(s => s.id === selectedStudentId);
        return file?.extractedData;
    }, [students, selectedStudentId]);

    // 2. CONFIRM STATE IS SET CORRECTLY
    useEffect(() => {
        console.log("[DEBUG] students state updated:", students);
    }, [students]);

    // 5. FINAL ACCEPTANCE LOGS
    console.log("[DEBUG] FINAL RENDER CHECK:", selectedStudent, selectedStudent?.results);

    if (selectedStudent && !Array.isArray(selectedStudent.results)) {
        throw new Error("results is not an array");
    }

    const calculatePredictedGrade = (actualGrade: string): string => {
        // Clean grade (remove parenthesis like '(a)') and whitespace
        // Keep A* as is
        const clean = actualGrade.split(/[(\s]/)[0].toUpperCase();

        switch (clean) {
            case 'A*': return 'A*';
            case 'A': return 'A*';
            case 'B': return 'A';
            case 'C': return 'B';
            case 'D': return 'C';
            case 'E': return 'D';
            case 'U': return 'E';
            default: return clean; // Fallback to original if not in map
        }
    };

    // Format student name: "LASTNAME: FIRSTNAME" -> "FIRSTNAME LASTNAME"
    const formatStudentName = (name: string): string => {
        if (!name) return '';
        // Remove semicolons
        let cleaned = name.replace(/;/g, '');
        // Check for colon separator
        if (cleaned.includes(':')) {
            const parts = cleaned.split(':');
            const before = parts[0].trim();
            const after = parts[1]?.trim() || '';
            return `${after} ${before}`.trim();
        }
        return cleaned.trim();
    };

    // Format date with ordinal suffix (e.g., "6th September 2020")
    const formatDateWithOrdinal = (date: Date): string => {
        const day = date.getDate();
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        let suffix = 'th';
        if (day === 1 || day === 21 || day === 31) suffix = 'st';
        else if (day === 2 || day === 22) suffix = 'nd';
        else if (day === 3 || day === 23) suffix = 'rd';

        return `${day}${suffix} ${month} ${year}`;
    };

    const generatePDF = async () => {
        if (!selectedStudent || !iasSession || !ialSession) return;

        setGeneratingPdf(true);

        try {
            const results = selectedStudent.results || [];

            // Map results to the strict payload
            const payload: any = {
                STUDENT_FULL_NAME: formatStudentName(selectedStudent.candidateName),
                UCI_NUMBER: selectedStudent.uci,
                DOCUMENT_ISSUE_DATE: formatDateWithOrdinal(new Date()),
                IAS_SESSION_MONTH_YEAR: iasSession,
                IAL_SESSION_MONTH_YEAR: ialSession,
                GENDER: gender,
            };

            // Populate Original and Predicted Grades (Max 4)
            results.slice(0, 4).forEach((r, idx) => {
                const i = idx + 1;
                payload[`ORIGINAL_SUBJECT_${i}`] = r.subject.toUpperCase();
                payload[`ORIGINAL_GRADE_${i}`] = `${r.grade} (${r.grade.toLowerCase()})`;

                const predicted = calculatePredictedGrade(r.grade);
                payload[`PREDICTED_SUBJECT_${i}`] = r.subject.toUpperCase();
                payload[`PREDICTED_GRADE_${i}`] = `${predicted} (${predicted.toLowerCase()})`;
            });

            const response = await fetch('/api/generate-expected-grade-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Server error');
            }

            // Trigger Download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Expected_Grade_Sheet_${formatStudentName(selectedStudent.candidateName).replace(/\s+/g, '_')}_${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setShowPdfModal(false);
            setIasSession('');
            setIalSession('');
            setGender('male');

        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF. Please check server logs.');
        } finally {
            setGeneratingPdf(false);
        }
    };


    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center space-x-2">
                <input
                    type="checkbox"
                    id="debugMode"
                    checked={debugMode}
                    onChange={e => setDebugMode(e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="debugMode" className="text-xs text-slate-400 cursor-pointer">Enable Debug Mode (Show raw extracted data)</label>
            </div>
            {debugMode && (
                <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded text-xs font-mono text-slate-600 dark:text-slate-400">
                    <p>Scanned Files: {stats.scanned}</p>
                    <p>Candidates Extracted: {stats.extracted}</p>
                    <p>Last File: {stats.lastFile}</p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Selection Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Step 1: Folder Selection */}
                    <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl p-6 rounded-[2rem] shadow-xl border border-slate-200 dark:border-white/10">
                        <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
                            1. Select Exam Session
                        </h3>
                        {loadingFolders ? (
                            <div className="flex items-center text-slate-500">
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading folders...
                            </div>
                        ) : (
                            <div className="relative">
                                <select
                                    value={selectedFolder}
                                    onChange={(e) => handleFolderChange(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-white/10 rounded-xl appearance-none focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white transition-all font-bold"
                                >
                                    <option value="">Select Folder...</option>
                                    {folders.map(f => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                                <Folder className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                            </div>
                        )}
                    </div>

                    {/* Step 2: Student Selection */}
                    <div className={`bg-white dark:bg-[#070708] backdrop-blur-3xl p-6 rounded-[2rem] shadow-xl border border-slate-200 dark:border-white/10 transition-opacity duration-300 ${!selectedFolder ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                        <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
                            2. Select Student
                        </h3>

                        {scanning ? (
                            <div className="text-center py-8">
                                <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto mb-2" />
                                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Analyzing Documents with AI...</p>
                                <p className="text-xs text-slate-400 mb-4">{scanProgress}% Complete</p>
                                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                                    <div className="bg-brand-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
                                </div>
                            </div>
                        ) : students.length > 0 ? (
                            <div className="relative">
                                <select
                                    value={selectedStudentId}
                                    onChange={(e) => handleStudentChange(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-white/10 rounded-xl appearance-none focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white transition-all font-bold"
                                >
                                    <option value="">Select Student...</option>
                                    {students.map(s => (
                                        <option key={s.id} value={s.id}>{s.extractedData?.candidateName}</option>
                                    ))}
                                </select>
                                <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                                <p className="text-xs text-slate-500 mt-2 text-center">Found {students.length} candidates</p>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-400">
                                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No candidates found in this folder.</p>
                            </div>
                        )}
                    </div>

                    {/* Step 3: View Predicted Results (Super Admin Only) */}
                    {user?.role === UserRole.SUPER_ADMIN && (
                        <div className={`p-8 bg-[#070708] rounded-[2rem] shadow-2xl border border-white/10 transition-all duration-300 ${!selectedStudentId ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-2">
                                    <TrendingUp className="w-8 h-8 text-brand-500" />
                                </div>
                                <div>
                                    <h3 className="text-white font-black text-xl tracking-tight">Intelligence Engine</h3>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Forecast archival document projection</p>
                                </div>
                                <button
                                    onClick={() => setShowPredicted(true)}
                                    className="w-full py-4 px-4 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center border border-white/10"
                                >
                                    Activate Prediction
                                </button>
                                <button
                                    onClick={() => setShowPdfModal(true)}
                                    disabled={!showPredicted}
                                    className="w-full py-4 px-4 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all border border-white/5 flex items-center justify-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    Generate Output
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Data Preview Area */}
                <div className="lg:col-span-2 space-y-6">
                    {selectedStudent ? (
                        <>
                            <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-scale-in">
                                {/* Header */}
                                <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-8 py-6 text-white">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-2xl font-bold">{selectedStudent.candidateName}</h2>
                                            <p className="text-brand-100 font-medium mt-1">UCI: {selectedStudent.uci}</p>
                                        </div>
                                        <div className="text-right bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                                            <p className="text-xs text-brand-100 uppercase tracking-widest mb-1">Date of Birth</p>
                                            <p className="font-mono font-bold text-lg">{selectedStudent.dob}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Grades Table */}
                                <div className="p-8">
                                    <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-6 flex items-center">
                                        <FileText className="w-4 h-4 mr-2" />
                                        Examination Results
                                    </h4>

                                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-50 dark:bg-slate-900/50">
                                                <tr>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">Code</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">Subject</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 text-right">Grade</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                                {(selectedStudent.results || []).map((r) => (
                                                    <tr key={`${r.code}-${r.subject}`}>
                                                        <td className="px-6 py-4 text-sm font-mono text-slate-500 dark:text-slate-400">{r.code}</td>
                                                        <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{r.subject}</td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-bold ${r.grade.startsWith('A') ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                                r.grade.startsWith('B') ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                                    r.grade.startsWith('U') ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                                }`}>
                                                                {r.grade}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(!selectedStudent.results || selectedStudent.results.length === 0) && (
                                                    <tr>
                                                        <td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">No grades detected.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Predicted Results Table */}
                            {showPredicted && user?.role === UserRole.SUPER_ADMIN && (
                                <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-in slide-in-from-bottom-4">
                                    <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-8 py-6 text-white">
                                        <h3 className="text-lg font-bold flex items-center">
                                            <TrendingUp className="w-5 h-5 mr-2 text-white" />
                                            Predicted Results
                                        </h3>
                                        <p className="text-sm text-brand-100 mt-1">Generated based on Pearson grade progression logic.</p>
                                    </div>
                                    <div className="p-8">
                                        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-slate-50 dark:bg-slate-900/50">
                                                    <tr>
                                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">Subject</th>
                                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 text-right">Predicted Grade</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                                    {(selectedStudent.results || []).map((r) => {
                                                        const predicted = calculatePredictedGrade(r.grade);
                                                        return (
                                                            <tr key={`${r.code}-${r.subject}-pred`}>
                                                                <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{r.subject}</td>
                                                                <td className="px-6 py-4 text-right">
                                                                    <span className={`inline-flex items-center justify-center px-4 py-1.5 rounded-full text-sm font-bold shadow-sm ${predicted.startsWith('A') ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' :
                                                                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                                        }`}>
                                                                        {predicted}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-white dark:bg-[#070708] rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 min-h-[400px]">
                            <Search className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-lg font-medium">Select a student to view analysis</p>
                            <p className="text-sm opacity-60">Result preview will appear here</p>
                        </div>
                    )}
                </div>
            </div>

            {/* PDF Generation Modal */}
            {showPdfModal && user?.role === UserRole.SUPER_ADMIN && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 border border-white/10">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Download className="w-5 h-5 text-brand-600" />
                                Generate PDF Letter
                            </h3>
                            <button
                                onClick={() => setShowPdfModal(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    IAS Session Month and Year
                                </label>
                                <input
                                    type="text"
                                    value={iasSession}
                                    onChange={(e) => setIasSession(e.target.value)}
                                    placeholder="e.g., May/June 2020"
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white transition-shadow"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    IAL Session Month and Year
                                </label>
                                <input
                                    type="text"
                                    value={ialSession}
                                    onChange={(e) => setIalSession(e.target.value)}
                                    placeholder="e.g., May/June 2021"
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white transition-shadow"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Gender
                                </label>
                                <select
                                    value={gender}
                                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white transition-shadow"
                                >
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex gap-3">
                            <button
                                onClick={() => setShowPdfModal(false)}
                                className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={generatePDF}
                                disabled={!iasSession || !ialSession || generatingPdf}
                                className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                {generatingPdf ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-4 h-4" />
                                        Submit & Download
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PredictedGradesPortal;
