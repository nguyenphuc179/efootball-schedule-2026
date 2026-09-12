import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { ManagerImage } from '../../models/manager-image.model';

const PATH = 'managerImages';

/** Stable doc id for a manager name (Firestore ids can't contain "/"). */
export function managerSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[/\s]+/g, '-').replace(/-+/g, '-') || 'unknown';
}

@Injectable({ providedIn: 'root' })
export class ManagerImageService {
  private fs = inject(FirestoreBaseService);
  private activityLog = inject(ActivityLogService);

  private all = toSignal(this.fs.streamCollection<ManagerImage>(PATH), {
    initialValue: [] as ManagerImage[],
  });

  /** manager name -> image URL */
  readonly byManager = computed(() => {
    const map = new Map<string, string>();
    for (const m of this.all()) {
      if (m.manager && m.imageUrl) map.set(m.manager, m.imageUrl);
    }
    return map;
  });

  async set(manager: string, imageUrl: string): Promise<void> {
    await this.fs.set(PATH, managerSlug(manager), { manager: manager.trim(), imageUrl: imageUrl.trim() }, true);
    await this.activityLog.log('manager_image_set', `Đã cập nhật ảnh đại diện cho manager "${manager.trim()}"`);
  }

  async remove(manager: string): Promise<void> {
    await this.fs.remove(PATH, managerSlug(manager));
    await this.activityLog.log('manager_image_remove', `Đã xoá ảnh đại diện của manager "${manager.trim()}"`);
  }
}
