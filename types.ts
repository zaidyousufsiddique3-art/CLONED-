
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  STUDENT = 'STUDENT',
}

export enum RequestStatus {
  PENDING = 'Pending',
  ASSIGNED = 'Assigned',
  IN_PROGRESS = 'In-Progress',
  ACTION_NEEDED = 'Action Needed', // For rejected docs needing staff attention
  COMPLETED = 'Completed',
  PENDING_ACTION = 'Pending Action',
  APPLICATION_RECEIVED = 'Application Received',
}

export enum DocumentType {
  PREDICTED_GRADES = 'Predicted Grades',
  EDEXCEL_CERTIFICATE = 'Edexcel Certificate',
  EDEXCEL_EXAM_PAPERS = 'Edexcel Exam Papers',
  ACADEMIC_REPORT = 'Academic Report Card',
  REFERENCE_LETTER = 'Reference Letter',
  LEAVING_CERTIFICATE = 'School Leaving Certificate',
  AWARDS_CERTIFICATE = 'Awards Ceremony Certificate',
  SPORTS_CAPTAIN = 'Sports Captain Application',
  OTHER = 'Other',
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  admissionNumber?: string; // Students only
  dateOfBirth?: string; // Students only
  gender?: string;
  phone?: string;
  designation?: string; // Staff only
  isActive: boolean;
  password?: string; // In a real app, this would be hashed. Storing plain for demo localStorage.
  profileImage?: string; // Base64 or URL
  createdAt: string;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  isInternal: boolean; // If true, only visible to Staff/Admin
  isDirectMessage?: boolean;
}

export type AttachmentStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string; // Base64 simulation
  uploadedBy: string;
  status: AttachmentStatus;
  createdAt: string;
}

export interface DocRequest {
  id: string;
  studentId: string;
  studentName: string;
  studentAdmissionNo: string;
  type: DocumentType;
  details: string; // Extra details provided by student
  status: RequestStatus;
  expectedCompletionDate?: string; // New field for Super Admin to set
  assignedToId?: string; // Staff/Admin ID
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
  attachments: Attachment[]; // Uploaded by student or staff (final docs)
  hiddenFromUsers?: string[]; // Array of user IDs who have "deleted" this request from their view
  dashboardHidden?: boolean; // If true, hidden from Super Admin dashboard recent view
}

export interface PasswordResetRequest {
  id: string;
  role: UserRole;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  admissionNumber?: string;
  gender?: string;
  designation?: string;
  status: 'Pending' | 'Assigned' | 'In-Progress' | 'Completed';
  assignedToId?: string;
  assignedToName?: string;
  createdAt: string;
  hiddenFromUsers?: string[];
  dashboardHidden?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Analytics {
  totalRequests: number;
  pendingRequests: number;
  completedRequests: number;
  rejectedRequests: number;
}

export interface SportsCaptainApplication {
  id: string;
  studentId: string;
  studentName: string;
  studentAdmissionNo: string;
  studentGender: string;
  cvUrl?: string;
  cvName?: string;
  intentUrl?: string;
  intentName?: string;
  actionPlanUrl?: string;
  actionPlanName?: string;
  supportingCertificates: Attachment[];
  status: 'Pending' | 'Under Review' | 'Accepted' | 'Declined';
  createdAt: string;
  updatedAt: string;
}
