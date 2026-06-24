import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { onSnapshot, doc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getUserProfile, handleFirestoreError, OperationType } from '../services/firebaseService';
import { UserProfile } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Слушаем изменения профиля в реальном времени (публичный и приватный)
        const publicDocRef = doc(db, 'users', firebaseUser.uid);
        const privateDocRef = doc(db, 'users', firebaseUser.uid, 'private', 'data');

        let publicData: any = null;
        let privateData: any = null;

        const updateMergedProfile = () => {
          if (publicData) {
            setProfile({
              ...publicData,
              ...(privateData || { email: firebaseUser.email || '', balance: 100 })
            } as UserProfile);
          } else {
            setProfile(null);
          }
        };

        const unsubPublic = onSnapshot(publicDocRef, (docSnap) => {
          publicData = docSnap.exists() ? docSnap.data() : null;
          updateMergedProfile();
          setLoading(false);
        }, (error) => {
          if (!auth.currentUser) return;
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          setLoading(false);
        });

        const unsubPrivate = onSnapshot(privateDocRef, (docSnap) => {
          privateData = docSnap.exists() ? docSnap.data() : null;
          updateMergedProfile();
        }, (error) => {
          // Private data might not exist yet if profile creation is in progress
          console.warn("Private data listener error:", error);
        });

        unsubscribeProfile = () => {
          unsubPublic();
          unsubPrivate();
        };
      } else {
        if (unsubscribeProfile) unsubscribeProfile();
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return { user, profile, loading, setProfile };
}
