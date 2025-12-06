
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  User as FirebaseUser,
  getAuth,
  sendPasswordResetEmail
} from '@firebase/auth';
import { doc, setDoc, getDoc } from '@firebase/firestore';
import { auth, db } from './firebaseConfig';
import { User, UserRole } from '../types';

// Re-export SDK members to act as a transparent proxy for other files
// Explicitly export members that might be shadowed by local imports or needed explicitly
export { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  getAuth, 
  sendPasswordResetEmail 
};

export * from '@firebase/auth';

// Map Firebase User to our App User
export const mapUser = async (fbUser: FirebaseUser): Promise<User | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
    if (userDoc.exists()) {
      return { id: fbUser.uid, ...userDoc.data() } as User;
    }
    return null;
  } catch (error) {
    console.error("Error mapping user:", error);
    throw error;
  }
};

export const registerUser = async (userData: User, password: string): Promise<User> => {
  const emailToRegister = userData.email;

  const userCredential = await createUserWithEmailAndPassword(auth, emailToRegister, password);
  
  // Save extra fields to Firestore
  const userPayload: any = {
    firstName: userData.firstName,
    lastName: userData.lastName,
    role: userData.role,
    phone: userData.phone || '',
    isActive: true,
    createdAt: new Date().toISOString(),
    email: emailToRegister
  };

  if (userData.role === UserRole.STUDENT) {
    userPayload.admissionNumber = userData.admissionNumber;
    userPayload.gender = userData.gender;
  } else if (userData.role === UserRole.STAFF) {
    userPayload.designation = userData.designation;
  }

  await setDoc(doc(db, 'users', userCredential.user.uid), userPayload);

  return { id: userCredential.user.uid, ...userPayload } as User;
};

export const loginUser = async (identifier: string, password: string, role: UserRole): Promise<User> => {
  const email = identifier;
  const SUPER_ADMIN_EMAIL = 'administration@slisr.org';
  
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    let appUser = await mapUser(userCredential.user);
    
    // Auto-recover Super Admin profile if missing in Firestore
    if (!appUser && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
        const adminData: any = {
           firstName: 'Super',
           lastName: 'Admin',
           role: UserRole.SUPER_ADMIN,
           email: email,
           isActive: true,
           createdAt: new Date().toISOString(),
           phone: ''
        };
        await setDoc(doc(db, 'users', userCredential.user.uid), adminData);
        appUser = { id: userCredential.user.uid, ...adminData } as User;
    }

    if (!appUser) {
        // Handle case where auth exists but DB doc is missing/unreadable
        await firebaseSignOut(auth);
        throw new Error('User profile not found in database.');
    }
    
    if (!appUser.isActive) throw new Error('Account deactivated');
    
    // Role mismatch check (Optional strictness)
    if (appUser.role !== role) {
       // Allow Super Admin to login as Admin
       if (!(role === UserRole.ADMIN && appUser.role === UserRole.SUPER_ADMIN)) {
         await firebaseSignOut(auth);
         throw new Error(`Unauthorized: This account is not registered as a ${role}`);
       }
    }

    return appUser;
  } catch (error: any) {
    throw error;
  }
};

export const logoutUser = async () => {
  await firebaseSignOut(auth);
};
