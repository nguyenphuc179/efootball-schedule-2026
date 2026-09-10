import { Injectable, inject } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { AppUser } from '../../models/user.model';

/**
 * Reads the `users` collection for the admin Members panel. Listing the whole collection is
 * gated to admins by firestore.rules (`allow list: if isAdmin()`); role changes go through
 * `AuthService.setUserRole()`.
 */
@Injectable({ providedIn: 'root' })
export class MemberService {
  private fs = inject(FirestoreBaseService);

  streamMembers() {
    return this.fs.streamCollection<AppUser>('users', orderBy('createdDate', 'desc'));
  }
}
