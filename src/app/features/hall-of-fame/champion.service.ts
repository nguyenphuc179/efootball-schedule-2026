import { Injectable, inject } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { Champion, ChampionDraft } from '../../models/champion.model';

const PATH = 'champions';

@Injectable({ providedIn: 'root' })
export class ChampionService {
  private fs = inject(FirestoreBaseService);

  /** Public Hall of Fame — newest season first. */
  readonly all = toSignal(
    this.fs.streamCollection<Champion>(PATH, orderBy('season', 'desc')),
    { initialValue: [] as Champion[] }
  );

  create(draft: ChampionDraft): Promise<string> {
    return this.fs.add<ChampionDraft>(PATH, draft);
  }

  update(id: string, draft: Partial<ChampionDraft>): Promise<void> {
    return this.fs.update(PATH, id, draft);
  }

  remove(id: string): Promise<void> {
    return this.fs.remove(PATH, id);
  }
}
