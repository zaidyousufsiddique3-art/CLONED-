import React, { useState, useEffect, useRef } from 'react';
import {
    Folder,
    FileText,
    Upload,
    Plus,
    ChevronRight,
    Home,
    Download,
    Trash2,
    Loader2,
    FolderPlus
} from 'lucide-react';
import {
    ref,
    listAll,
    getDownloadURL,
    uploadBytes,
    deleteObject,
    StorageReference,
    getMetadata
} from 'firebase/storage';
import { storage } from '../firebase/firebaseConfig';

// Base path for all superadmin documents to keep them organized
const BASE_PATH = 'superadmin_documents/';

interface FileItem {
    name: string;
    isFolder: boolean;
    fullPath: string;
    size?: number;
    updatedAt?: string;
    ref: StorageReference;
}

const DocumentsPortal: React.FC = () => {
    const [currentPath, setCurrentPath] = useState(BASE_PATH);
    const [items, setItems] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Breadcrumbs logic
    // Remove trailing slash and split, but filter out empty strings
    const pathSegments = currentPath.replace(BASE_PATH, '').split('/').filter(Boolean);

    useEffect(() => {
        fetchItems();
    }, [currentPath]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const folderRef = ref(storage, currentPath);
            const res = await listAll(folderRef);

            const newItems: FileItem[] = [];

            // Process Folders (Prefixes)
            for (const folderRef of res.prefixes) {
                newItems.push({
                    name: folderRef.name,
                    isFolder: true,
                    fullPath: folderRef.fullPath,
                    ref: folderRef
                });
            }

            // Process Files
            for (const itemRef of res.items) {
                // Hide .keep files used for folder creation
                if (itemRef.name === '.keep') continue;

                let size = 0;
                let updatedAt = '';

                // Optimization: Fetch metadata for details (optional, might slow down listing if many files)
                // For efficiency in a list view, we often skip this or load it lazily. 
                // But for a good UX, let's try to get it, or minimal info.
                try {
                    const metadata = await getMetadata(itemRef);
                    size = metadata.size;
                    updatedAt = metadata.updated;
                } catch (e) {
                    console.error("Error fetching metadata", e);
                }

                newItems.push({
                    name: itemRef.name,
                    isFolder: false,
                    fullPath: itemRef.fullPath,
                    ref: itemRef,
                    size,
                    updatedAt
                });
            }

            setItems(newItems);
        } catch (error) {
            console.error("Error fetching documents:", error);
            // If path doesn't exist (fresh start), it's just empty.
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (path: string) => {
        // Ensure path ends with /
        const targetPath = path.endsWith('/') ? path : path + '/';
        setCurrentPath(targetPath);
    };

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;

        try {
            setUploading(true);
            // Replace forward slashes with unicode division slash to allow "slashes" in folder names
            const safeFolderName = newFolderName.trim().replace(/\//g, '\u2215');

            // Create a placeholder file to "create" the folder
            const folderPath = `${currentPath}${safeFolderName}/.keep`;
            const folderRef = ref(storage, folderPath);
            // Upload a hollow file
            await uploadBytes(folderRef, new Blob(['']));

            setNewFolderName('');
            setIsCreateFolderOpen(false);
            fetchItems(); // Refresh
        } catch (error) {
            console.error("Error creating folder:", error);
            alert("Failed to create folder.");
        } finally {
            setUploading(false);
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const filesToUpload: File[] = Array.from(e.target.files);
            setUploading(true);
            try {
                // Bulk upload
                await Promise.all(filesToUpload.map(async (file) => {
                    const fileRef = ref(storage, `${currentPath}${file.name}`);
                    await uploadBytes(fileRef, file);
                }));

                fetchItems();
            } catch (error) {
                console.error("Error uploading files:", error);
                alert("Failed to upload one or more files.");
            } finally {
                setUploading(false);
                // Reset input
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    const handleDownload = async (item: FileItem) => {
        try {
            const url = await getDownloadURL(item.ref);
            window.open(url, '_blank');
        } catch (error) {
            console.error("Error downloading file:", error);
            alert("Failed to download file.");
        }
    };

    const handleDelete = async (item: FileItem) => {
        if (!window.confirm(`Are you sure you want to delete "${item.name}"?`)) return;

        try {
            if (item.isFolder) {
                // Deleting a folder in Storage means deleting all contents recursively.
                // This is dangerous and potentially slow for large folders.
                // For this MVP, we might want to restrict deleting non-empty folders 
                // OR implement a recursive delete.

                // Let's implement a safe check: try list contents first.
                const res = await listAll(item.ref);
                if (res.items.length > 1 || res.prefixes.length > 0) {
                    // Note: > 1 because of .keep file potentially
                    alert("Cannot delete non-empty folder. Please delete contents first.");
                    return;
                }

                // Delete all items (likely just .keep)
                await Promise.all(res.items.map(r => deleteObject(r)));

            } else {
                await deleteObject(item.ref);
            }
            fetchItems();
        } catch (error) {
            console.error("Error deleting item:", error);
            alert("Failed to delete.");
        }
    };

    const formatSize = (bytes?: number) => {
        if (bytes === undefined) return '-';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Vault</h1>
                    <p className="text-slate-500 dark:text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">Institutional records and document repository.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsCreateFolderOpen(true)}
                        className="flex items-center px-5 py-2.5 bg-white dark:bg-[#070708] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-white/10 transition-all font-bold text-sm"
                    >
                        <FolderPlus className="w-4 h-4 mr-2 text-brand-500" />
                        New Vault Folder
                    </button>
                    <button
                        onClick={handleUploadClick}
                        disabled={uploading}
                        className="flex items-center px-5 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 font-bold text-sm"
                    >
                        {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        Deposit Files
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        multiple
                        className="hidden"
                    />
                </div>
            </div>

            {/* Create Folder Modal/Inline */}
            {isCreateFolderOpen && (
                <div className="bg-white dark:bg-[#070708] p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                    <Folder className="w-6 h-6 text-brand-500 fill-brand-500/10" />
                    <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Folder Identity (e.g., 2024 Records)"
                        className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white font-bold"
                        autoFocus
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleCreateFolder}
                            disabled={!newFolderName.trim() || uploading}
                            className="px-6 py-2.5 bg-brand-600 text-white text-sm font-black rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-all"
                        >
                            Establish
                        </button>
                        <button
                            onClick={() => { setIsCreateFolderOpen(false); setNewFolderName(''); }}
                            className="px-4 py-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-white text-sm font-bold"
                        >
                            Abort
                        </button>
                    </div>
                </div>
            )}

            {/* Breadcrumbs */}
            <div className="flex items-center overflow-x-auto whitespace-nowrap bg-white dark:bg-[#070708] backdrop-blur-md px-5 py-4 rounded-2xl border border-slate-200 dark:border-white/10 text-sm font-bold">
                <button
                    onClick={() => handleNavigate(BASE_PATH)}
                    className={`flex items-center hover:text-brand-500 transition-colors ${currentPath === BASE_PATH ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-500'}`}
                >
                    <Home className="w-4 h-4 mr-2" />
                    Archive Root
                </button>
                {pathSegments.map((segment, index) => {
                    // Construct path up to this segment
                    const path = BASE_PATH + pathSegments.slice(0, index + 1).join('/') + '/';
                    const isLast = index === pathSegments.length - 1;
                    return (
                        <React.Fragment key={path}>
                            <ChevronRight className="w-4 h-4 mx-3 text-slate-300 dark:text-slate-700" />
                            <button
                                onClick={() => handleNavigate(path)}
                                className={`hover:text-brand-500 transition-colors ${isLast ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-500'}`}
                                disabled={isLast}
                            >
                                {segment}
                            </button>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Content */}
            <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-[2rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden min-h-[500px]">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        < Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <FolderPlus className="w-12 h-12 mb-3 opacity-20" />
                        <p>This folder is empty</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700/50 dark:text-slate-300">
                                <tr>
                                    <th className="px-6 py-3">Name</th>
                                    <th className="px-6 py-3 w-32">Size</th>
                                    <th className="px-6 py-3 w-48">Date Modified</th>
                                    <th className="px-6 py-3 w-24 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {items.map((item) => (
                                    <tr key={item.fullPath} className="bg-white dark:bg-[#070708] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => item.isFolder ? handleNavigate(item.fullPath) : handleDownload(item)}
                                                className="flex items-center font-medium text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400"
                                            >
                                                {item.isFolder ? (
                                                    <Folder className="w-5 h-5 text-brand-500 mr-3 fill-brand-100 dark:fill-brand-900/20" />
                                                ) : (
                                                    <FileText className="w-5 h-5 text-slate-400 mr-3" />
                                                )}
                                                {item.name}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">{formatSize(item.size)}</td>
                                        <td className="px-6 py-4">{formatDate(item.updatedAt)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end space-x-2">
                                                {!item.isFolder && (
                                                    <button
                                                        onClick={() => handleDownload(item)}
                                                        className="p-1.5 text-slate-400 hover:text-brand-600 rounded-md hover:bg-brand-50 dark:hover:bg-slate-700 transition-colors"
                                                        title="Download"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(item)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentsPortal;
