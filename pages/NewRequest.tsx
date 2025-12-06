import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DocumentType, RequestStatus, DocRequest, Attachment } from '../types';
import { createRequest, generateRequestId } from '../firebase/requestService';
import { sendNotification } from '../firebase/notificationService';
import { getSuperAdmins } from '../firebase/userService';
import { uploadFile } from '../firebase/storage';
import { generateId } from '../services/mockDb';
import Button from '../components/Button';
import { ArrowLeft, Upload, File, X } from 'lucide-react';

// Subject options for IAS Results multi-select
const IAS_SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics',
  'Business Studies', 'Accounting', 'Computer Science', 'Psychology',
  'English Literature', 'History', 'Geography', 'Sociology', 'Art & Design'
];

const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'U'];

interface SubjectGrade {
  subject: string;
  grade: string;
}

interface FormData {
  // Common fields
  fullName: string;
  admissionNumber: string;
  uciNumber: string;
  grade: string;

  // Academic Report Card
  semester: string;
  nameOfClassTeacher: string;

  // Date fields
  expectedDateOfCollection: string;

  // Predicted Grades
  letterOfRequest: File | null;
  iasResults: SubjectGrade[];

  // Edexcel
  subjects: string;
  level: string;

  // Edexcel Exam Papers
  paymentReceipt: File | null;

  // Reference Letter
  yearOfExamAS: string;
  resultsCopy: File | null;
  requestLetterSignedByParents: File | null;

  // School Leaving Certificate
  schoolPrefect: string;
  roleHeld: string;
  yearOfSchoolAdmission: string;
  yearOfLeavingSchool: string;

  // Awards Ceremony
  subjectsOrActivities: string;
  numberOfCertificates: string;

  // Other
  documentName: string;
  optionalUpload: File | null;
}

const NewRequest: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [type, setType] = useState<DocumentType>(DocumentType.ACADEMIC_REPORT);
  const [loading, setLoading] = useState(false);

  // Initialize form data
  const [formData, setFormData] = useState<FormData>({
    fullName: user ? `${user.firstName} ${user.lastName}` : '',
    admissionNumber: user?.admissionNumber || '',
    uciNumber: '',
    grade: '',
    semester: 'Semester 1',
    nameOfClassTeacher: '',
    expectedDateOfCollection: '',
    letterOfRequest: null,
    iasResults: [],
    subjects: '',
    level: 'Edexcel IGCSE',
    paymentReceipt: null,
    yearOfExamAS: '',
    resultsCopy: null,
    requestLetterSignedByParents: null,
    schoolPrefect: 'No',
    roleHeld: '',
    yearOfSchoolAdmission: '',
    yearOfLeavingSchool: '',
    subjectsOrActivities: '',
    numberOfCertificates: '',
    documentName: '',
    optionalUpload: null,
  });

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (field: keyof FormData, file: File | null) => {
    setFormData(prev => ({ ...prev, [field]: file }));
  };

  const addIASSubject = () => {
    setFormData(prev => ({
      ...prev,
      iasResults: [...prev.iasResults, { subject: '', grade: 'A' }]
    }));
  };

  const updateIASSubject = (index: number, field: 'subject' | 'grade', value: string) => {
    const updated = [...formData.iasResults];
    updated[index][field] = value;
    setFormData(prev => ({ ...prev, iasResults: updated }));
  };

  const removeIASSubject = (index: number) => {
    const updated = formData.iasResults.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, iasResults: updated }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      const admissionNo = user.admissionNumber || 'UNKNOWN';
      const requestId = await generateRequestId(admissionNo);

      const attachments: Attachment[] = [];

      // Build detailed description based on form type
      let detailsText = `Document Type: ${type}\n\n`;

      switch (type) {
        case DocumentType.ACADEMIC_REPORT:
          detailsText += `Full Name: ${formData.fullName}\n`;
          detailsText += `Admission Number: ${formData.admissionNumber}\n`;
          detailsText += `Grade: ${formData.grade}\n`;
          detailsText += `Semester: ${formData.semester}\n`;
          detailsText += `Class Teacher: ${formData.nameOfClassTeacher}\n`;
          detailsText += `Expected Collection: ${formData.expectedDateOfCollection}\n`;
          break;

        case DocumentType.PREDICTED_GRADES:
          detailsText += `Full Name: ${formData.fullName}\n`;
          detailsText += `Admission Number: ${formData.admissionNumber}\n`;
          detailsText += `UCI Number: ${formData.uciNumber}\n`;
          detailsText += `Grade: ${formData.grade}\n`;
          detailsText += `Expected Collection: ${formData.expectedDateOfCollection}\n`;
          if (formData.iasResults.length > 0) {
            detailsText += `\nIAS Results:\n`;
            formData.iasResults.forEach(sr => {
              if (sr.subject) detailsText += `  - ${sr.subject}: ${sr.grade}\n`;
            });
          }
          // Upload Letter of Request
          if (formData.letterOfRequest) {
            const url = await uploadFile(formData.letterOfRequest, `requests/${requestId}/letter_of_request_${formData.letterOfRequest.name}`);
            attachments.push({
              id: generateId(),
              name: 'Letter of Request - ' + formData.letterOfRequest.name,
              type: formData.letterOfRequest.type,
              size: formData.letterOfRequest.size,
              dataUrl: url,
              uploadedBy: `${user.firstName} ${user.lastName}`,
              status: 'Pending',
              createdAt: new Date().toISOString()
            });
          }
          break;

        case DocumentType.EDEXCEL_CERTIFICATE:
          detailsText += `Full Name: ${formData.fullName}\n`;
          detailsText += `Admission Number: ${formData.admissionNumber}\n`;
          detailsText += `UCI Number: ${formData.uciNumber}\n`;
          detailsText += `Subject(s): ${formData.subjects}\n`;
          detailsText += `Level: ${formData.level}\n`;
          detailsText += `Expected Collection: ${formData.expectedDateOfCollection}\n`;
          break;

        case DocumentType.EDEXCEL_EXAM_PAPERS:
          detailsText += `Full Name: ${formData.fullName}\n`;
          detailsText += `Admission Number: ${formData.admissionNumber}\n`;
          detailsText += `UCI Number: ${formData.uciNumber}\n`;
          detailsText += `Subject(s): ${formData.subjects}\n`;
          detailsText += `Level: ${formData.level}\n`;
          // Upload Payment Receipt
          if (formData.paymentReceipt) {
            const url = await uploadFile(formData.paymentReceipt, `requests/${requestId}/payment_receipt_${formData.paymentReceipt.name}`);
            attachments.push({
              id: generateId(),
              name: 'Payment Receipt - ' + formData.paymentReceipt.name,
              type: formData.paymentReceipt.type,
              size: formData.paymentReceipt.size,
              dataUrl: url,
              uploadedBy: `${user.firstName} ${user.lastName}`,
              status: 'Pending',
              createdAt: new Date().toISOString()
            });
          }
          break;

        case DocumentType.REFERENCE_LETTER:
          detailsText += `Full Name: ${formData.fullName}\n`;
          detailsText += `UCI Number: ${formData.uciNumber}\n`;
          detailsText += `Year of Exam (AS Level): ${formData.yearOfExamAS}\n`;
          detailsText += `Admission Number: ${formData.admissionNumber}\n`;
          detailsText += `Class Teacher: ${formData.nameOfClassTeacher}\n`;
          // Upload Results Copy
          if (formData.resultsCopy) {
            const url = await uploadFile(formData.resultsCopy, `requests/${requestId}/results_copy_${formData.resultsCopy.name}`);
            attachments.push({
              id: generateId(),
              name: 'Results Copy - ' + formData.resultsCopy.name,
              type: formData.resultsCopy.type,
              size: formData.resultsCopy.size,
              dataUrl: url,
              uploadedBy: `${user.firstName} ${user.lastName}`,
              status: 'Pending',
              createdAt: new Date().toISOString()
            });
          }
          // Upload Request Letter Signed by Parents
          if (formData.requestLetterSignedByParents) {
            const url = await uploadFile(formData.requestLetterSignedByParents, `requests/${requestId}/request_letter_${formData.requestLetterSignedByParents.name}`);
            attachments.push({
              id: generateId(),
              name: 'Request Letter Signed by Parents - ' + formData.requestLetterSignedByParents.name,
              type: formData.requestLetterSignedByParents.type,
              size: formData.requestLetterSignedByParents.size,
              dataUrl: url,
              uploadedBy: `${user.firstName} ${user.lastName}`,
              status: 'Pending',
              createdAt: new Date().toISOString()
            });
          }
          break;

        case DocumentType.LEAVING_CERTIFICATE:
          detailsText += `Full Name: ${formData.fullName}\n`;
          detailsText += `Admission Number: ${formData.admissionNumber}\n`;
          detailsText += `Class Teacher: ${formData.nameOfClassTeacher}\n`;
          detailsText += `School Prefect: ${formData.schoolPrefect}\n`;
          if (formData.schoolPrefect === 'Yes') {
            detailsText += `Role Held: ${formData.roleHeld}\n`;
          }
          detailsText += `Year of School Admission: ${formData.yearOfSchoolAdmission}\n`;
          detailsText += `Year of Leaving School: ${formData.yearOfLeavingSchool}\n`;
          break;

        case DocumentType.AWARDS_CERTIFICATE:
          detailsText += `Full Name: ${formData.fullName}\n`;
          detailsText += `Admission Number: ${formData.admissionNumber}\n`;
          detailsText += `Class Teacher: ${formData.nameOfClassTeacher}\n`;
          detailsText += `Subject(s) or Activities: ${formData.subjectsOrActivities}\n`;
          detailsText += `Number of Certificates: ${formData.numberOfCertificates}\n`;
          break;

        case DocumentType.OTHER:
          detailsText += `Full Name: ${formData.fullName}\n`;
          detailsText += `Admission Number: ${formData.admissionNumber}\n`;
          detailsText += `Document Name: ${formData.documentName}\n`;
          detailsText += `Expected Collection: ${formData.expectedDateOfCollection}\n`;
          // Upload Optional File
          if (formData.optionalUpload) {
            const url = await uploadFile(formData.optionalUpload, `requests/${requestId}/optional_${formData.optionalUpload.name}`);
            attachments.push({
              id: generateId(),
              name: formData.optionalUpload.name,
              type: formData.optionalUpload.type,
              size: formData.optionalUpload.size,
              dataUrl: url,
              uploadedBy: `${user.firstName} ${user.lastName}`,
              status: 'Pending',
              createdAt: new Date().toISOString()
            });
          }
          break;
      }

      const newReq: DocRequest = {
        id: requestId,
        studentId: user.id,
        studentName: `${user.firstName} ${user.lastName}`,
        studentAdmissionNo: admissionNo,
        type: type,
        details: detailsText,
        status: RequestStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        comments: [],
        attachments: attachments
      };

      await createRequest(newReq);

      // Notify Super Admins
      const superAdmins = await getSuperAdmins();
      superAdmins.forEach(admin => {
        sendNotification(admin.id, `New request ${requestId} from ${newReq.studentName}`, `/requests/${requestId}`);
      });

      setLoading(false);
      navigate('/dashboard');
    } catch (error) {
      console.error("Error creating request", error);
      setLoading(false);
      alert("Failed to create request. Please try again.");
    }
  };

  // Render different fields based on document type
  const renderDynamicFields = () => {
    switch (type) {
      case DocumentType.ACADEMIC_REPORT:
        return (
          <>
            <FormInput label="Full Name" value={formData.fullName} onChange={(v) => handleInputChange('fullName', v)} required />
            <FormInput label="Admission Number" value={formData.admissionNumber} onChange={(v) => handleInputChange('admissionNumber', v)} required />
            <FormInput label="Grade" value={formData.grade} onChange={(v) => handleInputChange('grade', v)} required />
            <FormSelect label="Semester" value={formData.semester} onChange={(v) => handleInputChange('semester', v)} options={['Semester 1', 'Semester 2']} required />
            <FormInput label="Name of Class Teacher" value={formData.nameOfClassTeacher} onChange={(v) => handleInputChange('nameOfClassTeacher', v)} required />
            <FormDate label="Expected Date of Collection" value={formData.expectedDateOfCollection} onChange={(v) => handleInputChange('expectedDateOfCollection', v)} required />
          </>
        );

      case DocumentType.PREDICTED_GRADES:
        return (
          <>
            <FormInput label="Full Name" value={formData.fullName} onChange={(v) => handleInputChange('fullName', v)} required />
            <FormInput label="Admission Number" value={formData.admissionNumber} onChange={(v) => handleInputChange('admissionNumber', v)} required />
            <FormInput label="UCI Number" value={formData.uciNumber} onChange={(v) => handleInputChange('uciNumber', v)} required />
            <FormInput label="Grade" value={formData.grade} onChange={(v) => handleInputChange('grade', v)} required />
            <FormFileUpload label="Letter of Request" file={formData.letterOfRequest} onChange={(f) => handleFileChange('letterOfRequest', f)} accept=".pdf,.png" required />

            <div className="space-y-3">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">IAS Results</label>
              {formData.iasResults.map((sr, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <select
                    value={sr.subject}
                    onChange={(e) => updateIASSubject(idx, 'subject', e.target.value)}
                    className="flex-1 px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white"
                  >
                    <option value="">Select Subject</option>
                    {IAS_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select
                    value={sr.grade}
                    onChange={(e) => updateIASSubject(idx, 'grade', e.target.value)}
                    className="w-24 px-4 py-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white"
                  >
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <button type="button" onClick={() => removeIASSubject(idx)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addIASSubject} className="text-sm text-brand-500 hover:text-brand-600 font-semibold">+ Add Subject</button>
            </div>

            <FormDate label="Expected Date of Collection" value={formData.expectedDateOfCollection} onChange={(v) => handleInputChange('expectedDateOfCollection', v)} required />
          </>
        );

      case DocumentType.EDEXCEL_CERTIFICATE:
        return (
          <>
            <FormInput label="Full Name" value={formData.fullName} onChange={(v) => handleInputChange('fullName', v)} required />
            <FormInput label="Admission Number" value={formData.admissionNumber} onChange={(v) => handleInputChange('admissionNumber', v)} required />
            <FormInput label="UCI Number" value={formData.uciNumber} onChange={(v) => handleInputChange('uciNumber', v)} required />
            <FormInput label="Subject(s)" value={formData.subjects} onChange={(v) => handleInputChange('subjects', v)} required />
            <FormSelect label="Level" value={formData.level} onChange={(v) => handleInputChange('level', v)} options={['Edexcel IGCSE', 'Edexcel IAS', 'Edexcel IAL']} required />
            <FormDate label="Expected Date of Collection" value={formData.expectedDateOfCollection} onChange={(v) => handleInputChange('expectedDateOfCollection', v)} required />
          </>
        );

      case DocumentType.EDEXCEL_EXAM_PAPERS:
        return (
          <>
            <FormInput label="Full Name" value={formData.fullName} onChange={(v) => handleInputChange('fullName', v)} required />
            <FormInput label="Admission Number" value={formData.admissionNumber} onChange={(v) => handleInputChange('admissionNumber', v)} required />
            <FormInput label="UCI Number" value={formData.uciNumber} onChange={(v) => handleInputChange('uciNumber', v)} required />
            <FormInput label="Subject(s)" value={formData.subjects} onChange={(v) => handleInputChange('subjects', v)} required />
            <FormSelect label="Level" value={formData.level} onChange={(v) => handleInputChange('level', v)} options={['Edexcel IGCSE', 'Edexcel IAS', 'Edexcel IAL']} required />
            <FormFileUpload label="Payment Receipt" file={formData.paymentReceipt} onChange={(f) => handleFileChange('paymentReceipt', f)} accept=".pdf,.png" required />
          </>
        );

      case DocumentType.REFERENCE_LETTER:
        return (
          <>
            <FormInput label="Full Name" value={formData.fullName} onChange={(v) => handleInputChange('fullName', v)} required />
            <FormInput label="UCI Number" value={formData.uciNumber} onChange={(v) => handleInputChange('uciNumber', v)} required />
            <FormInput label="Year of Exam (AS Level)" value={formData.yearOfExamAS} onChange={(v) => handleInputChange('yearOfExamAS', v)} required placeholder="e.g., 2024" />
            <FormFileUpload label="Results Copy" file={formData.resultsCopy} onChange={(f) => handleFileChange('resultsCopy', f)} accept=".pdf,.png" required />
            <FormFileUpload label="Request Letter Signed by Parents" file={formData.requestLetterSignedByParents} onChange={(f) => handleFileChange('requestLetterSignedByParents', f)} accept=".pdf,.png" required />
            <FormInput label="Admission Number" value={formData.admissionNumber} onChange={(v) => handleInputChange('admissionNumber', v)} required />
            <FormInput label="Name of Class Teacher" value={formData.nameOfClassTeacher} onChange={(v) => handleInputChange('nameOfClassTeacher', v)} required />
          </>
        );

      case DocumentType.LEAVING_CERTIFICATE:
        return (
          <>
            <FormInput label="Full Name" value={formData.fullName} onChange={(v) => handleInputChange('fullName', v)} required />
            <FormInput label="Admission Number" value={formData.admissionNumber} onChange={(v) => handleInputChange('admissionNumber', v)} required />
            <FormInput label="Name of Class Teacher" value={formData.nameOfClassTeacher} onChange={(v) => handleInputChange('nameOfClassTeacher', v)} required />
            <FormSelect label="School Prefect?" value={formData.schoolPrefect} onChange={(v) => handleInputChange('schoolPrefect', v)} options={['Yes', 'No']} required />
            {formData.schoolPrefect === 'Yes' && (
              <FormInput label="Role Held" value={formData.roleHeld} onChange={(v) => handleInputChange('roleHeld', v)} required />
            )}
            <FormInput label="Year of School Admission" value={formData.yearOfSchoolAdmission} onChange={(v) => handleInputChange('yearOfSchoolAdmission', v)} required placeholder="e.g., 2018" />
            <FormInput label="Year of Leaving School" value={formData.yearOfLeavingSchool} onChange={(v) => handleInputChange('yearOfLeavingSchool', v)} required placeholder="e.g., 2024" />
          </>
        );

      case DocumentType.AWARDS_CERTIFICATE:
        return (
          <>
            <FormInput label="Full Name" value={formData.fullName} onChange={(v) => handleInputChange('fullName', v)} required />
            <FormInput label="Admission Number" value={formData.admissionNumber} onChange={(v) => handleInputChange('admissionNumber', v)} required />
            <FormInput label="Name of Class Teacher" value={formData.nameOfClassTeacher} onChange={(v) => handleInputChange('nameOfClassTeacher', v)} required />
            <FormInput label="Subject(s) or Activities" value={formData.subjectsOrActivities} onChange={(v) => handleInputChange('subjectsOrActivities', v)} required />
            <FormInput label="Number of Certificates Requested" value={formData.numberOfCertificates} onChange={(v) => handleInputChange('numberOfCertificates', v)} type="number" required />
          </>
        );

      case DocumentType.OTHER:
        return (
          <>
            <FormInput label="Full Name" value={formData.fullName} onChange={(v) => handleInputChange('fullName', v)} required />
            <FormInput label="Admission Number" value={formData.admissionNumber} onChange={(v) => handleInputChange('admissionNumber', v)} required />
            <FormInput label="Document Name" value={formData.documentName} onChange={(v) => handleInputChange('documentName', v)} required />
            <FormDate label="Expected Date of Collection" value={formData.expectedDateOfCollection} onChange={(v) => handleInputChange('expectedDateOfCollection', v)} required />
            <FormFileUpload label="Upload (Optional)" file={formData.optionalUpload} onChange={(f) => handleFileChange('optionalUpload', f)} accept=".pdf,.png" />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-8 transition-colors">
        <ArrowLeft className="w-5 h-5 mr-2" />
        Back to Dashboard
      </button>

      <div className="bg-white dark:bg-[#1e293b] rounded-3xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-slate-200 dark:border-slate-700 p-10 transition-colors">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">New Document Request</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm leading-relaxed">Please provide the details for the document you require. Our administrative team will review your request shortly.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">Document Type</label>
            <div className="relative">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DocumentType)}
                className="w-full px-6 py-4 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white appearance-none"
              >
                {Object.values(DocumentType).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-400">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
              </div>
            </div>
          </div>

          {renderDynamicFields()}

          <div className="pt-6 flex items-center justify-end space-x-4">
            <Button type="button" variant="ghost" onClick={() => navigate('/dashboard')}>Cancel</Button>
            <Button type="submit" isLoading={loading} className="shadow-lg shadow-brand-500/25">Submit Request</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Reusable form components
const FormInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}> = ({ label, value, onChange, required, type = 'text', placeholder }) => (
  <div className="space-y-3">
    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      className="w-full px-6 py-4 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white placeholder-slate-400"
    />
  </div>
);

const FormSelect: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  required?: boolean;
}> = ({ label, value, onChange, options, required }) => (
  <div className="space-y-3">
    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-6 py-4 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white appearance-none"
      >
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-400">
        <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
      </div>
    </div>
  </div>
);

const FormDate: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}> = ({ label, value, onChange, required }) => (
  <div className="space-y-3">
    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full px-6 py-4 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white"
    />
  </div>
);

const FormFileUpload: React.FC<{
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  required?: boolean;
}> = ({ label, file, onChange, accept, required }) => (
  <div className="space-y-3">
    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      {!file ? (
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl cursor-pointer hover:bg-slate-50 dark:hover:bg-[#0f172a]/50 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-8 h-8 text-slate-400 mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold">Click to upload</span> {accept && `(${accept.replace(/\./g, '').toUpperCase()})`}
            </p>
          </div>
          <input
            type="file"
            className="hidden"
            accept={accept}
            required={required}
            onChange={(e) => onChange(e.target.files?.[0] || null)}
          />
        </label>
      ) : (
        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-2xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white dark:bg-[#1e293b] rounded-lg border border-slate-200 dark:border-slate-700">
              <File className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{file.name}</p>
              <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button type="button" onClick={() => onChange(null)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  </div>
);

export default NewRequest;