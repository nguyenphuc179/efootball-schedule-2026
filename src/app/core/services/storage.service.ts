import { Injectable, inject } from '@angular/core';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';

/** Handles image resize (client-side, via canvas) + Firebase Storage upload. */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private storage = inject(Storage);

  /** Resizes to a max dimension of 1600px (keeps aspect ratio) before upload to save bandwidth/storage. */
  private async resizeImage(file: File, maxDimension = 1600): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    return new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? file), 'image/webp', 0.85);
    });
  }

  async uploadImage(path: string, file: File): Promise<string> {
    const resized = await this.resizeImage(file).catch(() => file);
    const storageRef = ref(this.storage, path);
    await uploadBytes(storageRef, resized, { contentType: 'image/webp' });
    return getDownloadURL(storageRef);
  }

  uploadTournamentBanner(tournamentId: string, file: File): Promise<string> {
    return this.uploadImage(`tournaments/${tournamentId}/banner.webp`, file);
  }

  uploadTeamLogo(teamId: string, file: File): Promise<string> {
    return this.uploadImage(`teams/${teamId}/logo.webp`, file);
  }

  uploadUserAvatar(uid: string, file: File): Promise<string> {
    return this.uploadImage(`users/${uid}/avatar.webp`, file);
  }
}
