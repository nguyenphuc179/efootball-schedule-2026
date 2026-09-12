import { Injectable, effect, inject, signal, computed } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from '@angular/fire/auth';
import { Firestore, doc, docData, getDoc, setDoc, updateDoc } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, of, switchMap } from 'rxjs';
import { AppUser, UserRole, createDefaultAppUser } from '../../models/user.model';

/**
 * Central authentication + role resolution service.
 * - `firebaseUser()` mirrors Firebase Auth's current user (null = signed out / guest).
 * - `appUser()` mirrors the matching `users/{uid}` Firestore profile (role, favorites, etc).
 * - `isAdmin()` / `isSignedIn()` are convenience computed signals used by guards & templates.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  private firebaseUser$ = new Observable<User | null>((subscriber) =>
    onAuthStateChanged(this.auth, (user) => subscriber.next(user))
  );

  readonly firebaseUser = toSignal(this.firebaseUser$, { initialValue: undefined });

  private appUser$: Observable<AppUser | null> = this.firebaseUser$.pipe(
    switchMap((user) => {
      if (!user) return of(null);
      const ref = doc(this.firestore, `users/${user.uid}`);
      return docData(ref) as Observable<AppUser | null>;
    })
  );

  readonly appUser = toSignal(this.appUser$, { initialValue: undefined });

  readonly isAuthResolved = computed(() => this.firebaseUser() !== undefined);
  readonly isSignedIn = computed(() => !!this.firebaseUser());
  readonly isAdmin = computed(() => this.appUser()?.role === 'admin' && !this.appUser()?.disabled);
  readonly displayName = computed(
    () =>
      this.appUser()?.systemDisplayName?.trim() ||
      this.appUser()?.displayName ||
      this.firebaseUser()?.displayName ||
      'Guest'
  );

  constructor() {
    // If an admin disables this account (even mid-session), drop it immediately.
    effect(() => {
      if (this.firebaseUser() && this.appUser()?.disabled) {
        signOut(this.auth);
      }
    });
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(this.auth, provider);
    await this.ensureUserProfile(
      cred.user.uid,
      cred.user.email,
      cred.user.displayName,
      cred.user.photoURL
    );
    await this.enforceNotDisabled(cred.user.uid);
  }

  /** Signs out + throws a Firebase-style error when the profile is flagged `disabled`. */
  private async enforceNotDisabled(uid: string): Promise<void> {
    const snap = await getDoc(doc(this.firestore, `users/${uid}`));
    if (snap.exists() && snap.data()?.['disabled'] === true) {
      await signOut(this.auth);
      throw { code: 'auth/user-disabled', message: 'This account has been disabled.' };
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  /** Creates the Firestore profile document on first sign-in (idempotent). */
  private async ensureUserProfile(
    uid: string,
    email: string | null,
    displayName: string | null,
    photoURL: string | null
  ): Promise<void> {
    const ref = doc(this.firestore, `users/${uid}`);
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, createDefaultAppUser(uid, email, displayName, photoURL));
    }
  }

  /** Admin-only role change (also enforced server-side by firestore.rules). */
  async setUserRole(uid: string, role: UserRole): Promise<void> {
    await updateDoc(doc(this.firestore, `users/${uid}`), { role });
  }

  /** Admin-only lock-out toggle (also enforced server-side by firestore.rules). */
  async setUserDisabled(uid: string, disabled: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, `users/${uid}`), { disabled });
  }

  /**
   * Set (or clear, with `null`) the app-wide display-name override. The login `displayName` is
   * never touched. firestore.rules allow this for an admin editing anyone, or a user editing
   * their own profile (role/disabled stay frozen).
   */
  async setUserSystemDisplayName(uid: string, name: string | null): Promise<void> {
    const value = name?.trim() ? name.trim() : null;
    await updateDoc(doc(this.firestore, `users/${uid}`), { systemDisplayName: value });
  }

  async registerFcmToken(uid: string, token: string): Promise<void> {
    const ref = doc(this.firestore, `users/${uid}`);
    const snap = await getDoc(ref);
    const tokens: string[] = snap.data()?.['fcmTokens'] ?? [];
    if (!tokens.includes(token)) {
      await updateDoc(ref, { fcmTokens: [...tokens, token] });
    }
  }
}
