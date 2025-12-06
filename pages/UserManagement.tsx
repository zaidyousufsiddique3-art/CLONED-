
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, UserRole } from '../types';
import { getAllUsers, deleteUser, updateUserProfile } from '../firebase/userService';
import { sendPasswordResetEmail } from '../firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import Button from '../components/Button';
import { Plus, Edit2, Trash2, X, Key, Save } from 'lucide-react';
import { doc, setDoc } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { getAuth, createUserWithEmailAndPassword } from '@firebase/auth';
import { initializeApp } from '@firebase/app';

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'STUDENT' | 'STAFF' | 'ADMIN'>('STUDENT');

  // Create Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createData, setCreateData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: activeTab === 'STUDENT' ? UserRole.STUDENT : activeTab === 'STAFF' ? UserRole.STAFF : UserRole.ADMIN,
    admissionNumber: '',
    phone: '',
    gender: 'Male',
    designation: ''
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [updatingUser, setUpdatingUser] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers || []);
      setLoading(false);
    } catch (e: any) {
      console.error("Failed to load users", e);
      setError("Failed to load users. Please check permissions.");
      setLoading(false);
    }
  };

  const handleCreateOpen = () => {
    setCreateData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      role: activeTab === 'STUDENT' ? UserRole.STUDENT : activeTab === 'STAFF' ? UserRole.STAFF : UserRole.ADMIN,
      admissionNumber: '',
      phone: '',
      gender: 'Male',
      designation: ''
    });
    setIsCreateModalOpen(true);
  };

  const handleEditOpen = (user: User) => {
    setEditingUser(user);
    setEditFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || '',
      admissionNumber: user.admissionNumber || '',
      gender: user.gender || 'Male',
      designation: user.designation || ''
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Are you sure you want to delete this user? This will remove their profile from the database immediately.")) return;

    try {
      await deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      alert("User profile deleted from database.\n\nNOTE: To prevent this user from logging in again, you must also disable or delete their account in the Firebase Authentication console.");
    } catch (err) {
      console.error("Delete user failed", err);
      alert("Failed to delete user.");
    }
  };

  const handleSendPasswordReset = async () => {
    if (!editingUser) return;
    try {
      await sendPasswordResetEmail(auth, editingUser.email);
      alert(`Password reset email sent to ${editingUser.email}`);
    } catch (err: any) {
      alert("Failed to send reset email: " + err.message);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setUpdatingUser(true);
    try {
      await updateUserProfile(editingUser.id, editFormData);

      // Update local state
      setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...editFormData } : u));

      alert("User profile updated successfully.");
      setIsEditModalOpen(false);
    } catch (err: any) {
      alert("Failed to update user: " + err.message);
    } finally {
      setUpdatingUser(false);
    }
  };

  const getEnv = (key: string, fallback: string) => {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
    return fallback;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    let secondaryApp;
    try {
      const config = {
        apiKey: getEnv("VITE_FIREBASE_API_KEY", "AIzaSyDtg8K2jDziwOi6aFfsP9Wb47tPQypL658"),
        authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN", "slisr-updated.firebaseapp.com"),
        projectId: getEnv("VITE_FIREBASE_PROJECT_ID", "slisr-updated"),
        storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET", "slisr-updated.firebasestorage.app"),
        messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "910243919222"),
        appId: getEnv("VITE_FIREBASE_APP_ID", "1:910243919222:web:a7beeb14a764c777563657"),
      };
      secondaryApp = initializeApp(config, "SecondaryApp");
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, createData.email, createData.password);
      const uid = userCredential.user.uid;

      const userPayload: any = {
        firstName: createData.firstName,
        lastName: createData.lastName,
        role: createData.role,
        phone: createData.phone || '',
        email: createData.email,
        isActive: true,
        createdAt: new Date().toISOString()
      };

      if (createData.role === UserRole.STUDENT) {
        userPayload.admissionNumber = createData.admissionNumber;
        userPayload.gender = createData.gender;
      } else {
        userPayload.designation = createData.designation;
      }

      await setDoc(doc(db, 'users', uid), userPayload);
      alert("Account created successfully!");
      setIsCreateModalOpen(false);
      loadData();

    } catch (err: any) {
      alert("Failed to create user: " + err.message);
    } finally {
      setCreatingUser(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (activeTab === 'ADMIN') return u.role === UserRole.ADMIN || u.role === UserRole.SUPER_ADMIN;
    return u.role === activeTab;
  });

  if (currentUser?.role !== UserRole.SUPER_ADMIN) return <div className="p-10 text-center text-red-500">Access Denied</div>;
  if (loading) return <div className="p-10 text-center text-slate-500">Loading users...</div>;
  if (error) return <div className="p-10 text-center text-red-500">{error}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">User Management</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Manage system access and roles</p>
        </div>
        <div className="flex space-x-2 bg-white dark:bg-[#1e293b] p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          {(['STUDENT', 'STAFF', 'ADMIN'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab ? 'bg-brand-600 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-white'}`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}s
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <Button onClick={handleCreateOpen} className="shadow-lg shadow-brand-500/20">
          <Plus className="w-5 h-5 mr-2" />
          Add {activeTab.charAt(0) + activeTab.slice(1).toLowerCase()}
        </Button>
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700/50 overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-5 font-semibold">Name</th>
                {activeTab === 'STUDENT' && <th className="px-6 py-5 font-semibold">Admission No</th>}
                <th className="px-6 py-5 font-semibold">Email</th>
                <th className="px-6 py-5 font-semibold">Phone</th>
                {activeTab === 'STUDENT' && <th className="px-6 py-5 font-semibold">Gender</th>}
                {activeTab === 'STAFF' && <th className="px-6 py-5 font-semibold">Designation</th>}
                <th className="px-6 py-5 font-semibold">Role</th>
                <th className="px-6 py-5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{u.firstName} {u.lastName}</div>
                  </td>
                  {activeTab === 'STUDENT' && (
                    <td className="px-6 py-5 text-sm font-medium text-brand-600 dark:text-brand-400">{u.admissionNumber}</td>
                  )}
                  <td className="px-6 py-5 text-sm text-slate-600 dark:text-slate-300">{u.email}</td>
                  <td className="px-6 py-5 text-sm text-slate-500">{u.phone || '-'}</td>
                  {activeTab === 'STUDENT' && <td className="px-6 py-5 text-sm text-slate-500">{u.gender}</td>}
                  {activeTab === 'STAFF' && <td className="px-6 py-5 text-sm text-slate-500">{u.designation}</td>}
                  <td className="px-6 py-5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold ${u.role === UserRole.SUPER_ADMIN ? 'bg-purple-100 text-purple-600' :
                        u.role === UserRole.ADMIN ? 'bg-indigo-100 text-indigo-600' :
                          u.role === UserRole.STAFF ? 'bg-brand-100 text-brand-600' :
                            'bg-slate-100 text-slate-600'
                      }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right flex justify-end space-x-2">
                    <button onClick={() => handleEditOpen(u)} className="p-2 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {u.role !== UserRole.SUPER_ADMIN && (
                      <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl max-w-2xl w-full p-8 animate-fade-in border border-slate-200 dark:border-slate-600 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">Create New {activeTab}</h3>
            <form onSubmit={handleCreateSubmit} className="space-y-5">

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">First Name</label>
                  <input required value={createData.firstName} onChange={e => setCreateData({ ...createData, firstName: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Last Name</label>
                  <input required value={createData.lastName} onChange={e => setCreateData({ ...createData, lastName: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Email</label>
                  <input type="email" required value={createData.email} onChange={e => setCreateData({ ...createData, email: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Phone</label>
                  <input type="tel" value={createData.phone} onChange={e => setCreateData({ ...createData, phone: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
              </div>

              {activeTab === 'STUDENT' && (
                <div className="grid grid-cols-2 gap-5 animate-fade-in">
                  <div>
                    <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Admission Number</label>
                    <input required value={createData.admissionNumber} onChange={e => setCreateData({ ...createData, admissionNumber: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Gender</label>
                    <select value={createData.gender} onChange={e => setCreateData({ ...createData, gender: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white">
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>
              )}

              {activeTab === 'STAFF' && (
                <div className="animate-fade-in">
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Designation</label>
                  <input value={createData.designation} onChange={e => setCreateData({ ...createData, designation: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Password</label>
                <input type="password" required value={createData.password} onChange={e => setCreateData({ ...createData, password: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
              </div>

              <div className="flex justify-end space-x-3 mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
                <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
                <Button type="submit" isLoading={creatingUser}>Create User</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl max-w-2xl w-full p-8 animate-fade-in border border-slate-200 dark:border-slate-600 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Edit User Profile</h3>
              <button onClick={() => setIsEditModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-5">

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">First Name</label>
                  <input required value={editFormData.firstName} onChange={e => setEditFormData({ ...editFormData, firstName: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Last Name</label>
                  <input required value={editFormData.lastName} onChange={e => setEditFormData({ ...editFormData, lastName: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Email</label>
                  <input type="email" required value={editFormData.email} onChange={e => setEditFormData({ ...editFormData, email: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Phone</label>
                  <input type="tel" value={editFormData.phone} onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
              </div>

              {editingUser.role === UserRole.STUDENT && (
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Admission Number</label>
                    <input required value={editFormData.admissionNumber} onChange={e => setEditFormData({ ...editFormData, admissionNumber: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Gender</label>
                    <select value={editFormData.gender} onChange={e => setEditFormData({ ...editFormData, gender: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white">
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                </div>
              )}

              {editingUser.role === UserRole.STAFF && (
                <div>
                  <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-1">Designation</label>
                  <input value={editFormData.designation} onChange={e => setEditFormData({ ...editFormData, designation: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white" />
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 ml-1 mb-2">Password Management</label>
                <button
                  type="button"
                  onClick={handleSendPasswordReset}
                  className="flex items-center text-sm font-bold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/30 dark:text-brand-400 px-4 py-3 rounded-xl transition-colors w-full justify-center"
                >
                  <Key className="w-4 h-4 mr-2" />
                  Send Password Reset Email
                </button>
                <p className="text-xs text-slate-400 mt-2 text-center">User will receive a link to securely reset their password.</p>
              </div>

              <div className="flex justify-end space-x-3 mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
                <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                <Button type="submit" isLoading={updatingUser} className="flex items-center"><Save className="w-4 h-4 mr-2" /> Save Changes</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
