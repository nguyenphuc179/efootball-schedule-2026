import { Injectable, inject } from '@angular/core';
import {
  CollectionReference,
  DocumentData,
  Firestore,
  QueryConstraint,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  docData,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

/**
 * Generic typed CRUD helper over AngularFire/Firestore.
 * Feature services (TournamentService, TeamService, ...) compose this instead of
 * calling the Firestore SDK directly from components — keeps Firestore specifics
 * confined to the infrastructure layer.
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

  /** Exact document count matching the given constraints, server-computed via Firestore's count
   *  aggregation — cheap (billed as a small fixed read, not per matched document), but a one-shot
   *  snapshot, not a live listener (the JS SDK doesn't support `onSnapshot` on aggregate queries). */
  async count(path: string, ...constraints: QueryConstraint[]): Promise<number> {
    const snap = await getCountFromServer(query(this.collectionRef(path), ...constraints));
    return snap.data().count;
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

  /** Deletes every document matching the given constraints, batched (Firestore's write-batch cap
   *  is 500) — returns how many were deleted. Equality-only constraint combos need no composite
   *  index (no `orderBy` here, unlike a paginated list query). */
  async removeMatching(path: string, ...constraints: QueryConstraint[]): Promise<number> {
    const snap = await getDocs(query(this.collectionRef(path), ...constraints));
    const refs = snap.docs.map((d) => d.ref);
    for (let i = 0; i < refs.length; i += 450) {
      const batch = writeBatch(this.firestore);
      for (const ref of refs.slice(i, i + 450)) batch.delete(ref);
      await batch.commit();
    }
    return refs.length;
  }

  /** Deletes an explicit list of documents by id, batched (Firestore's write-batch cap is 500) —
   *  for a caller that already resolved which ids to delete by merging more than one query (e.g.
   *  matching on either of two fields), where a single `removeMatching` constraint set can't
   *  express "OR" and issuing it twice would double-count/double-delete any id both sides match. */
  async removeByIds(path: string, ids: string[]): Promise<number> {
    for (let i = 0; i < ids.length; i += 450) {
      const batch = writeBatch(this.firestore);
      for (const id of ids.slice(i, i + 450)) batch.delete(this.docRef(path, id));
      await batch.commit();
    }
    return ids.length;
  }

  docRef(path: string, id: string) {
    return doc(this.firestore, `${path}/${id}`);
  }
}
