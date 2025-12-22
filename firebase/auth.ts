
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
  const email = identifier.trim();
  const SUPER_ADMIN_EMAIL = 'administration@slisr.org'.toLowerCase();
  const PRINCIPAL_EMAIL = 'principal@slisr.org'.toLowerCase();
  const SPORTS_COORDINATOR_EMAIL = 'Chandana.kulathunga@slisr.org'.toLowerCase();

  try {
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } catch (authError: any) {
      // Check for hardcoded accounts
      const isSportsCoordinator = email.toLowerCase() === SPORTS_COORDINATOR_EMAIL && password === 'Chandana@123';
      const isPrincipal = email.toLowerCase() === PRINCIPAL_EMAIL && password === 'Rukshan@123';

      if (isSportsCoordinator) {
        try {
          // Attempt to register if not exists
          await registerUser({
            firstName: 'Chandana',
            lastName: 'Kulathunga',
            email: email.toLowerCase(),
            role: UserRole.STAFF,
            designation: 'Sports Coordinator',
            isActive: true,
            createdAt: new Date().toISOString()
          } as any, password);
        } catch (regError) {
          console.warn("Sports Coordinator auto-registration skipped or failed:", regError);
        }
        // Final attempt to sign in
        userCredential = await signInWithEmailAndPassword(auth, email, password);

      } else if (isPrincipal) {
        try {
          // Attempt to register Principal if not exists
          await registerUser({
            firstName: 'Rukshan',
            lastName: 'Razak',
            email: email.toLowerCase(),
            role: UserRole.ADMIN, // Restricted to Admin role
            isActive: true,
            createdAt: new Date().toISOString()
          } as any, password);
        } catch (regError) {
          console.warn("Principal auto-registration skipped or failed:", regError);
        }
        // Final attempt to sign in
        userCredential = await signInWithEmailAndPassword(auth, email, password);

      } else {
        throw authError;
      }
    }

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

    // Auto-recover Principal profile
    if (!appUser && email.toLowerCase() === PRINCIPAL_EMAIL) {
      const principalData: any = {
        firstName: 'Rukshan',
        lastName: 'Razak',
        role: UserRole.ADMIN,
        email: email,
        isActive: true,
        createdAt: new Date().toISOString(),
        phone: ''
      };
      await setDoc(doc(db, 'users', userCredential.user.uid), principalData);
      appUser = { id: userCredential.user.uid, ...principalData } as User;
    }

    // Auto-recover Sports Coordinator profile
    if (!appUser && email.toLowerCase() === SPORTS_COORDINATOR_EMAIL.toLowerCase()) {
      const sportsCoordData: any = {
        firstName: 'Chandana',
        lastName: 'Kulathunga',
        role: UserRole.STAFF,
        designation: 'Sports Coordinator',
        email: email,
        isActive: true,
        createdAt: new Date().toISOString(),
        phone: ''
      };
      await setDoc(doc(db, 'users', userCredential.user.uid), sportsCoordData);
      appUser = { id: userCredential.user.uid, ...sportsCoordData } as User;
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
