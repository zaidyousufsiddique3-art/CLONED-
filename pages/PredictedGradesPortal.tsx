
import React, { useState, useEffect } from 'react';
import {
    Folder,
    User,
    FileText,
    Search,
    Loader2,
    ChevronRight,
    AlertCircle
} from 'lucide-react';
import { ref, listAll, getDownloadURL, getBytes } from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';
import { extractDataFromFile, StudentResult } from '../services/extractionService';

const BASE_PATH = 'superadmin_documents/';

interface StudentFile {
    id: string; // usually path
    fileName: string;
    fileRef: any;
    extractedData?: StudentResult;
}

const PredictedGradesPortal: React.FC = () => {
    const [folders, setFolders] = useState<string[]>([]);
    const [selectedFolder, setSelectedFolder] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0); // 0 to 100
    const [students, setStudents] = useState<StudentFile[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [loadingFolders, setLoadingFolders] = useState(true);

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
        if (!folderName) return;

        scanFolder(folderName);
    };

    const scanFolder = async (folderName: string) => {
        setScanning(true);
        setScanProgress(0);
        try {
            const folderRef = ref(storage, `${BASE_PATH}${folderName}/`);
            const res = await listAll(folderRef);

            const totalFiles = res.items.length;
            if (totalFiles === 0) {
                setScanning(false);
                return;
            }

            const foundStudents: StudentFile[] = [];
            let processed = 0;

            // We process files to extract names.
            // Limit concurrency to avoid browser freeze? Or just sequential for simplicity and progress update?
            // Sequential is safer for heavy tasks like OCR.

            // Filter out .keep files
            const fileItems = res.items.filter(i => i.name !== '.keep');

            for (const itemRef of fileItems) {
                try {
                    // Download file blob
                    const url = await getDownloadURL(itemRef);
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const file = new File([blob], itemRef.name, { type: blob.type });

                    // Extract
                    const data = await extractDataFromFile(file);

                    if (data.candidateName && data.candidateName !== 'Unknown Candidate') {
                        foundStudents.push({
                            id: itemRef.fullPath,
                            fileName: itemRef.name,
                            fileRef: itemRef,
                            extractedData: data
                        });
                    }
                } catch (err) {
                    console.error(`Error processing file ${itemRef.name}:`, err);
                }

                processed++;
                setScanProgress(Math.round((processed / fileItems.length) * 100));
            }

            setStudents(foundStudents);

        } catch (error) {
            console.error("Error scanning folder:", error);
            alert("Error scanning folder contents.");
        } finally {
            setScanning(false);
        }
    };

    const getSelectedStudentData = () => {
        return students.find(s => s.id === selectedStudentId)?.extractedData;
    };

    const data = getSelectedStudentData();

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Predicted Grades Analysis</h1>
                <p className="text-slate-500 dark:text-slate-400">Analyze historical result data for student predictions.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Selection Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Step 1: Folder Selection */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
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
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl appearance-none focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white transition-shadow"
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
                    <div className={`bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-opacity duration-300 ${!selectedFolder ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                        <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
                            2. Select Student
                        </h3>

                        {scanning ? (
                            <div className="text-center py-8">
                                <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto mb-2" />
                                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Scanning Documents...</p>
                                <p className="text-xs text-slate-400 mb-4">{scanProgress}% Complete</p>
                                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                                    <div className="bg-brand-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
                                </div>
                            </div>
                        ) : students.length > 0 ? (
                            <div className="relative">
                                <select
                                    value={selectedStudentId}
                                    onChange={(e) => setSelectedStudentId(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl appearance-none focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white transition-shadow"
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
                </div>

                {/* Data Preview Area */}
                <div className="lg:col-span-2">
                    {data ? (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden animate-scale-in">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-8 py-6 text-white">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-2xl font-bold">{data.candidateName}</h2>
                                        <p className="text-brand-100 font-medium mt-1">UCI: {data.uci}</p>
                                    </div>
                                    <div className="text-right bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                                        <p className="text-xs text-brand-100 uppercase tracking-widest mb-1">Date of Birth</p>
                                        <p className="font-mono font-bold text-lg">{data.dob}</p>
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
                                            {data.grades.length > 0 ? (
                                                data.grades.map((grade, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                                                        <td className="px-6 py-4 text-sm font-mono text-slate-500 dark:text-slate-400">{grade.code}</td>
                                                        <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{grade.subject}</td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-bold ${grade.grade.startsWith('A') ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                                    grade.grade.startsWith('B') ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                                        grade.grade.startsWith('U') ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                                }`}>
                                                                {grade.grade}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">No grades detected in this document.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 min-h-[400px]">
                            <Search className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-lg font-medium">Select a student to view analysis</p>
                            <p className="text-sm opacity-60">Result preview will appear here</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PredictedGradesPortal;
