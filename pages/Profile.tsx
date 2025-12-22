import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { Camera, User, Lock, Mail, Phone, Pen, Upload } from 'lucide-react';
import { fileToBase64 } from '../services/mockDb';
import { UserRole } from '../types';

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
      try {
        const base64 = await fileToBase64(file);
        updateUser({ ...user, profileImage: base64 });
      } catch (err) {
        console.error("Failed to upload image", err);
      }
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'image/png') {
        alert("Only PNG files are accepted for signatures to ensure transparency.");
        return;
      }
      try {
        const base64 = await fileToBase64(file);
        updateUser({ ...user, signatureUrl: base64 });
      } catch (err) {
        console.error("Failed to upload signature", err);
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
              <div className="w-32 h-32 rounded-full bg-slate-100 dark:bg-[#070708] overflow-hidden border-4 border-white dark:border-white/10 shadow-xl">
                {user.profileImage ? (
                  <img src={user.profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-slate-400 dark:text-slate-500">
                    {user.firstName[0]}{user.lastName[0]}
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

              {/* Signature Section - Superadmin Only */}
              {user.role === UserRole.SUPER_ADMIN && (
                <div className="pt-8 mt-8 border-t border-slate-200 dark:border-slate-700/50">
                  <div className="flex items-center space-x-2 mb-4">
                    <Pen className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">🖊️ Default Signature</h3>
                  </div>

                  <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-6 border border-slate-100 dark:border-white/10">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                      <div className="w-48 h-24 bg-white dark:bg-[#070708] rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden">
                        {user.signatureUrl ? (
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
                            <div className="flex items-center justify-center px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl cursor-pointer transition-colors text-sm font-bold">
                              <Upload className="w-4 h-4 mr-2" />
                              Select PNG Signature
                            </div>
                            <input
                              type="file"
                              className="hidden"
                              accept="image/png"
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