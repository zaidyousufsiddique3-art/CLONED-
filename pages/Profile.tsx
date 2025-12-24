import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { Camera, User, Lock, Mail, Phone, Pen, Upload } from 'lucide-react';
import { fileToBase64 } from '../services/mockDb';
import { UserRole } from '../types';
import { PRINCIPAL_EMAIL, SPORTS_COORDINATOR_EMAIL } from '../constants';
import { uploadFile } from '../firebase/storage';
import { Loader2, CheckCircle2 } from 'lucide-react';

const compressImage = (file: File, maxWidth: number = 800): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas to Blob failed'));
        }, 'image/png');
      };
    };
    reader.onerror = (error) => reject(error);
  });
};

// Reusable Input Component (Local)
const InputGroup = ({ label, type = "text", value, onChange, icon: Icon, disabled = false }: any) => (
  <div className="space-y-2">
    <label className="block text-xs font-bold text-slate-500 dark:text-brand-300 uppercase tracking-wider ml-1">{label}</label>
    <div className="relative">
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400">
        <Icon className="w-5 h-5" />
      </div>
      <input
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full pl-12 pr-4 py-3 bg-white dark:bg-[#070708] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white placeholder-slate-400 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      />
    </div>
  </div>
);

const Profile: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [uploadState, setUploadState] = useState<{ field: string; status: 'idle' | 'uploading' | 'success' | 'error' }>({ field: '', status: 'idle' });

  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    password: user?.password || '',
    newPassword: '',
    confirmPassword: ''
  });

  if (!user) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadState({ field: 'photo', status: 'uploading' });
      try {
        const path = `profile_photos/${user.id}_${Date.now()}`;
        const url = await uploadFile(file, path);
        await updateUser({ ...user, profileImage: url });
        setUploadState({ field: 'photo', status: 'success' });
        setTimeout(() => setUploadState({ field: '', status: 'idle' }), 3000);
      } catch (err) {
        console.error("Failed to upload image", err);
        setUploadState({ field: 'photo', status: 'error' });
      }
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'image/png') {
        alert("Only PNG files are accepted for signatures.");
        return;
      }
      try {
        const compressedBlob = await compressImage(file);
        const path = `signatures/${user.id}_${Date.now()}.png`;
        const url = await uploadFile(compressedBlob, path);
        await updateUser({ ...user, signatureUrl: url });
        setUploadState({ field: 'signature', status: 'success' });
        setTimeout(() => setUploadState({ field: '', status: 'idle' }), 3000);
      } catch (err) {
        console.error("Failed to upload signature", err);
        setUploadState({ field: 'signature', status: 'error' });
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');

    // Simulate API call
    setTimeout(() => {
      let updatedUser = { ...user, firstName: formData.firstName, lastName: formData.lastName, phone: formData.phone };

      if (formData.newPassword) {
        if (formData.newPassword !== formData.confirmPassword) {
          alert("New passwords do not match");
          setLoading(false);
          return;
        }
        updatedUser.password = formData.newPassword;
      }

      updateUser(updatedUser);
      setLoading(false);
      setSuccessMsg('Profile updated successfully!');
      setFormData(prev => ({ ...prev, newPassword: '', confirmPassword: '' }));
    }, 1000);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white dark:bg-[#070708] rounded-3xl shadow-sm border border-slate-200 dark:border-white/10 p-8 md:p-12 relative overflow-hidden">

        <div className="flex flex-col md:flex-row gap-10">

          {/* Left Col: Photo */}
          <div className="flex flex-col items-center space-y-4">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full bg-slate-100 dark:bg-[#070708] overflow-hidden border-4 border-white dark:border-white/10 shadow-xl flex items-center justify-center relative">
                {uploadState.field === 'photo' && uploadState.status === 'uploading' ? (
                  <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                ) : user.profileImage ? (
                  <img src={user.profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-slate-400 dark:text-slate-500">
                    {user.firstName[0]}{user.lastName[0]}
                  </div>
                )}
                {uploadState.field === 'photo' && uploadState.status === 'success' && (
                  <div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-sm flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 animate-bounce" />
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 p-2 bg-brand-600 text-white rounded-full cursor-pointer hover:bg-brand-500 transition-colors shadow-lg">
                <Camera className="w-4 h-4" />
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">{user.firstName} {user.lastName}</h3>
              <p className="text-sm text-brand-600 dark:text-brand-400 font-medium">{user.role}</p>
              {user.role === UserRole.STUDENT && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Adm: {user.admissionNumber}</p>}
            </div>
          </div>

          {/* Right Col: Form */}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Edit Profile</h2>

            {successMsg && (
              <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-sm font-bold">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputGroup
                  label="First Name"
                  value={formData.firstName}
                  onChange={(e: any) => setFormData({ ...formData, firstName: e.target.value })}
                  icon={User}
                />
                <InputGroup
                  label="Last Name"
                  value={formData.lastName}
                  onChange={(e: any) => setFormData({ ...formData, lastName: e.target.value })}
                  icon={User}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputGroup
                  label="Email Address"
                  value={user.email}
                  disabled={true}
                  onChange={() => { }}
                  icon={Mail}
                />
                <InputGroup
                  label="Phone Number"
                  value={formData.phone}
                  onChange={(e: any) => setFormData({ ...formData, phone: e.target.value })}
                  icon={Phone}
                />
              </div>

              <div className="pt-6 border-t border-slate-200 dark:border-slate-700/50">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Change Password</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputGroup
                    label="New Password"
                    type="password"
                    value={formData.newPassword}
                    onChange={(e: any) => setFormData({ ...formData, newPassword: e.target.value })}
                    icon={Lock}
                  />
                  <InputGroup
                    label="Confirm Password"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e: any) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    icon={Lock}
                  />
                </div>
              </div>

              {/* Signature Section - Superadmin, Principal, Sports Coordinator, or Staff with Recommendation Access */}
              {(user.role === UserRole.SUPER_ADMIN ||
                user.email.toLowerCase() === PRINCIPAL_EMAIL.toLowerCase() ||
                user.email.toLowerCase() === SPORTS_COORDINATOR_EMAIL.toLowerCase() ||
                user.hasRecommendationAccess) && (
                  <div className="pt-8 mt-8 border-t border-slate-200 dark:border-slate-700/50">
                    <div className="flex items-center space-x-2 mb-4">
                      <Pen className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">🖊️ Default Signature</h3>
                    </div>

                    <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-6 border border-slate-100 dark:border-white/10 mb-6 relative">
                      {uploadState.field === 'signature' && uploadState.status === 'success' && (
                        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-xs font-bold animate-in fade-in slide-in-from-right-2">
                          <CheckCircle2 size={14} /> Signature Uploaded Successfully!
                        </div>
                      )}

                      <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="w-48 h-24 bg-white dark:bg-[#070708] rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden relative">
                          {uploadState.field === 'signature' && uploadState.status === 'uploading' ? (
                            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                          ) : user.signatureUrl ? (
                            <img src={user.signatureUrl} alt="Signature" className="max-w-full max-h-full object-contain" />
                          ) : (
                            <div className="text-center p-4">
                              <p className="text-xs text-slate-400">No signature uploaded</p>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 space-y-4 text-center md:text-left">
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">Update Signature Image</p>
                            <p className="text-xs text-slate-500">Only .png files are accepted for transparency.</p>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3">
                            <label className="flex-1">
                              <div className={`flex items-center justify-center px-4 py-2 text-white rounded-xl cursor-pointer transition-colors text-sm font-bold ${uploadState.field === 'signature' && uploadState.status === 'uploading' ? 'bg-slate-600 cursor-wait' : 'bg-brand-600 hover:bg-brand-700'}`}>
                                {uploadState.field === 'signature' && uploadState.status === 'uploading' ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4 mr-2" />
                                )}
                                {uploadState.field === 'signature' && uploadState.status === 'uploading' ? 'Uploading...' : 'Select PNG Signature'}
                              </div>
                              <input
                                type="file"
                                className="hidden"
                                accept="image/png"
                                disabled={uploadState.field === 'signature' && uploadState.status === 'uploading'}
                                onChange={handleSignatureUpload}
                              />
                            </label>
                            {user.signatureUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => updateUser({ ...user, signatureUrl: '' })}
                              >
                                Clear Signature
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stamp Section for Principal */}
                    {user.email.toLowerCase() === PRINCIPAL_EMAIL.toLowerCase() && (
                      <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-6 border border-slate-100 dark:border-white/10 relative">
                        {uploadState.field === 'stamp' && uploadState.status === 'success' && (
                          <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-xs font-bold animate-in fade-in slide-in-from-right-2">
                            <CheckCircle2 size={14} /> Stamp Uploaded Successfully!
                          </div>
                        )}

                        <div className="flex items-center space-x-2 mb-4">
                          <Camera className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">🏛️ Default Stamp</h3>
                        </div>

                        <div className="flex flex-col md:flex-row items-center gap-6">
                          <div className="w-32 h-32 bg-white dark:bg-[#070708] rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden p-2 relative">
                            {uploadState.field === 'stamp' && uploadState.status === 'uploading' ? (
                              <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                            ) : user.principalStampUrl ? (
                              <img src={user.principalStampUrl} alt="Official Stamp" className="max-w-full max-h-full object-contain" />
                            ) : (
                              <div className="text-center p-4">
                                <p className="text-xs text-slate-400">No stamp uploaded</p>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 space-y-4 text-center md:text-left">
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">Update Official Stamp</p>
                              <p className="text-xs text-slate-500">Only .png files are accepted for transparency.</p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                              <label className="flex-1">
                                <div className={`flex items-center justify-center px-4 py-2 text-white rounded-xl cursor-pointer transition-colors text-sm font-bold ${uploadState.field === 'stamp' && uploadState.status === 'uploading' ? 'bg-slate-600 cursor-wait' : 'bg-brand-600 hover:bg-brand-700'}`}>
                                  {uploadState.field === 'stamp' && uploadState.status === 'uploading' ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <Upload className="w-4 h-4 mr-2" />
                                  )}
                                  {uploadState.field === 'stamp' && uploadState.status === 'uploading' ? 'Uploading...' : 'Select PNG Stamp'}
                                </div>
                                <input
                                  type="file"
                                  className="hidden"
                                  accept="image/png"
                                  disabled={uploadState.field === 'stamp' && uploadState.status === 'uploading'}
                                  onChange={async (e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      const file = e.target.files[0];
                                      if (file.type !== 'image/png') {
                                        alert("Only PNG files are accepted for stamps.");
                                        return;
                                      }
                                      setUploadState({ field: 'stamp', status: 'uploading' });
                                      try {
                                        const compressedBlob = await compressImage(file);
                                        const path = `stamps/${user.id}_${Date.now()}.png`;
                                        const url = await uploadFile(compressedBlob, path);
                                        await updateUser({ ...user, principalStampUrl: url });
                                        setUploadState({ field: 'stamp', status: 'success' });
                                        setTimeout(() => setUploadState({ field: '', status: 'idle' }), 3000);
                                      } catch (err) {
                                        console.error("Failed to upload stamp", err);
                                        setUploadState({ field: 'stamp', status: 'error' });
                                      }
                                    }
                                  }}
                                />
                              </label>
                              {user.principalStampUrl && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  onClick={() => updateUser({ ...user, principalStampUrl: '' })}
                                >
                                  Clear Stamp
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              <div className="flex justify-end pt-4">
                <Button type="submit" isLoading={loading}>Save Changes</Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;