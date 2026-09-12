import { Injectable, inject } from '@angular/core';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  QueryConstraint,
  QueryDocumentSnapshot,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  startAfter,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface PagedResult<T> {
  items: T[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Generic typed CRUD + pagination helper over AngularFire/Firestore.
 * Feature services (TournamentService, TeamService, ...) compose this instead of
 * calling the Firestore SDK directly from components — keeps Firestore specifics
 * (converters, query cursors) confined to the infrastructure layer.
 */
@Injectable({ providedIn: 'root' })
export class FirestoreBaseService {
  private firestore = inject(Firestore);

  collectionRef<T = DocumentData>(path: string): CollectionReference<T> {
    return collection(this.firestore, path) as CollectionReference<T>;
  }

  /** Realtime stream of an entire (usually small/bounded) collection, e.g. standings rows. */
  streamCollection<T>(path: string, ...constraints: QueryConstraint[]): Observable<T[]> {
    const q = query(this.collectionRef<DocumentData>(path), ...constraints);
    return collectionData(q, { idField: 'id' }) as unknown as Observable<T[]>;
  }

  /** Realtime stream of a single document. */
  streamDoc<T>(path: string): Observable<T | undefined> {
    return docData(doc(this.firestore, path), { idField: 'id' }) as unknown as Observable<T | undefined>;
  }

  /** One-off fetch of a single document by full path (e.g. `tournaments/abc123`). */
  async getById<T>(path: string): Promise<T | undefined> {
    const snap = await getDoc(doc(this.firestore, path));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : undefined;
  }

  async getOnce<T>(path: string, ...constraints: QueryConstraint[]): Promise<T[]> {
    const q = query(this.collectionRef<T>(path), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  }

  async getPaged<T>(
    path: string,
    pageSize: number,
    cursor: QueryDocumentSnapshot<DocumentData> | null,
    ...constraints: QueryConstraint[]
  ): Promise<PagedResult<T>> {
    const clauses = cursor
      ? [...constraints, startAfter(cursor), limit(pageSize)]
      : [...constraints, limit(pageSize)];
    const q = query(this.collectionRef(path), ...clauses);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
    const lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return { items, lastDoc, hasMore: snap.docs.length === pageSize };
  }

  /** `createdDate` is a plain client-clock epoch-millis number (not `serverTimestamp()`) because
   *  every model in this app types it `number` and does direct arithmetic on it (e.g. "time ago"
   *  labels) — a Firestore `Timestamp`'s `valueOf()` is a sortable padded string, not millis, and
   *  silently produces nonsense when coerced to a number in that arithmetic. */
  async add<T extends object>(path: string, data: T): Promise<string> {
    const ref = await addDoc(this.collectionRef(path), {
      ...data,
      createdDate: Date.now(),
    } as DocumentData);
    return ref.id;
  }

  async set<T extends object>(path: string, id: string, data: T, merge = false): Promise<void> {
    await setDoc(doc(this.firestore, `${path}/${id}`), data as DocumentData, { merge });
  }

  async update(path: string, id: string, data: Partial<DocumentData>): Promise<void> {
    await updateDoc(doc(this.firestore, `${path}/${id}`), data);
  }

  async remove(path: string, id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${path}/${id}`));
  }

  docRef(path: string, id: string) {
    return doc(this.firestore, `${path}/${id}`);
  }
}
