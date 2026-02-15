import SftpClient from 'ssh2-sftp-client';

const UPLOADS_DIR = 'jam-uploads';
const META_FILENAME = '.uploads-meta.json';
const CLEANUP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class SftpUploader {
  constructor() {
    this.basePath = process.env.PIKAPODS_MUSIC_PATH || '/music';
    this.uploadsPath = `${this.basePath}/${UPLOADS_DIR}`;
    this.metaPath = `${this.uploadsPath}/${META_FILENAME}`;
  }

  /**
   * Create a new SFTP connection. Caller must call sftp.end() when done.
   */
  async connect() {
    const sftp = new SftpClient();
    await sftp.connect({
      host: process.env.PIKAPODS_SFTP_HOST,
      port: parseInt(process.env.PIKAPODS_SFTP_PORT || '22', 10),
      username: process.env.PIKAPODS_SFTP_USER,
      password: process.env.PIKAPODS_SFTP_PASS,
    });
    return sftp;
  }

  /**
   * Check if SFTP is configured (env vars present).
   */
  isConfigured() {
    return !!(
      process.env.PIKAPODS_SFTP_HOST &&
      process.env.PIKAPODS_SFTP_USER &&
      process.env.PIKAPODS_SFTP_PASS
    );
  }

  /**
   * Ensure the uploads directory and user subdirectory exist.
   */
  async ensureUserDir(sftp, username) {
    const userDir = `${this.uploadsPath}/${username}`;
    await sftp.mkdir(userDir, true); // recursive
    return userDir;
  }

  /**
   * Upload a readable stream to SFTP. Returns the remote path.
   * Handles duplicate filenames by appending numeric suffix.
   */
  async upload(readableStream, username, filename) {
    const sftp = await this.connect();
    try {
      const userDir = await this.ensureUserDir(sftp, username);
      const remotePath = await this.resolveUniquePath(sftp, userDir, filename);
      const finalFilename = remotePath.split('/').pop();

      await sftp.put(readableStream, remotePath);

      // Update metadata
      const meta = await this.readMeta(sftp);
      const metaKey = `${username}/${finalFilename}`;
      meta[metaKey] = {
        uploadedAt: new Date().toISOString(),
        permanent: false,
        size: null, // will be set after upload completes if available
      };
      await this.writeMeta(sftp, meta);

      return { remotePath, metaKey, filename: finalFilename };
    } finally {
      await sftp.end();
    }
  }

  /**
   * Resolve a unique filename by appending (1), (2), etc. if file exists.
   */
  async resolveUniquePath(sftp, dir, filename) {
    const target = `${dir}/${filename}`;
    const exists = await sftp.exists(target);
    if (!exists) return target;

    const dotIdx = filename.lastIndexOf('.');
    const name = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
    const ext = dotIdx > 0 ? filename.substring(dotIdx) : '';

    for (let i = 1; i <= 99; i++) {
      const candidate = `${dir}/${name} (${i})${ext}`;
      if (!(await sftp.exists(candidate))) {
        return candidate;
      }
    }
    throw new Error('Too many duplicate filenames');
  }

  /**
   * Read the metadata JSON from SFTP. Returns empty object if not found.
   */
  async readMeta(sftp) {
    try {
      const exists = await sftp.exists(this.metaPath);
      if (!exists) return {};
      const data = await sftp.get(this.metaPath);
      return JSON.parse(data.toString());
    } catch {
      return {};
    }
  }

  /**
   * Write the metadata JSON to SFTP.
   */
  async writeMeta(sftp, meta) {
    const data = Buffer.from(JSON.stringify(meta, null, 2));
    await sftp.put(data, this.metaPath);
  }

  /**
   * List uploads for a specific user (from metadata).
   */
  async listUserUploads(username) {
    const sftp = await this.connect();
    try {
      const meta = await this.readMeta(sftp);
      const prefix = `${username}/`;
      const uploads = [];

      for (const [key, info] of Object.entries(meta)) {
        if (key.startsWith(prefix)) {
          uploads.push({
            filename: key.substring(prefix.length),
            ...info,
          });
        }
      }

      return uploads;
    } finally {
      await sftp.end();
    }
  }

  /**
   * List all uploads (admin). Returns full metadata.
   */
  async listAllUploads() {
    const sftp = await this.connect();
    try {
      const meta = await this.readMeta(sftp);
      const uploads = [];

      for (const [key, info] of Object.entries(meta)) {
        const [username, ...filenameParts] = key.split('/');
        uploads.push({
          username,
          filename: filenameParts.join('/'),
          key,
          ...info,
        });
      }

      return uploads;
    } finally {
      await sftp.end();
    }
  }

  /**
   * Toggle the permanent flag for a user's own upload.
   * Returns the updated permanent status.
   */
  async togglePermanent(username, filename) {
    const sftp = await this.connect();
    try {
      const meta = await this.readMeta(sftp);
      const metaKey = `${username}/${filename}`;

      if (!meta[metaKey]) {
        throw new Error('Upload not found');
      }

      meta[metaKey].permanent = !meta[metaKey].permanent;
      await this.writeMeta(sftp, meta);

      return meta[metaKey].permanent;
    } finally {
      await sftp.end();
    }
  }

  /**
   * Set the permanent flag explicitly (admin override).
   */
  async setPermanent(username, filename, permanent) {
    const sftp = await this.connect();
    try {
      const meta = await this.readMeta(sftp);
      const metaKey = `${username}/${filename}`;

      if (!meta[metaKey]) {
        throw new Error('Upload not found');
      }

      meta[metaKey].permanent = permanent;
      await this.writeMeta(sftp, meta);

      return permanent;
    } finally {
      await sftp.end();
    }
  }

  /**
   * Delete a specific upload (file + metadata entry).
   */
  async deleteUpload(username, filename) {
    const sftp = await this.connect();
    try {
      const remotePath = `${this.uploadsPath}/${username}/${filename}`;

      // Delete the file (ignore if already gone)
      try {
        await sftp.delete(remotePath);
      } catch {
        // File may already be deleted
      }

      // Remove from metadata
      const meta = await this.readMeta(sftp);
      const metaKey = `${username}/${filename}`;
      delete meta[metaKey];
      await this.writeMeta(sftp, meta);
    } finally {
      await sftp.end();
    }
  }

  /**
   * Count how many permanent uploads a user has.
   */
  async countPermanent(username) {
    const sftp = await this.connect();
    try {
      const meta = await this.readMeta(sftp);
      const prefix = `${username}/`;
      let count = 0;

      for (const [key, info] of Object.entries(meta)) {
        if (key.startsWith(prefix) && info.permanent) {
          count++;
        }
      }

      return count;
    } finally {
      await sftp.end();
    }
  }

  /**
   * Clean up expired uploads (non-permanent, older than 30 days).
   * Returns list of deleted keys.
   */
  async cleanupExpired() {
    if (!this.isConfigured()) {
      return [];
    }

    const sftp = await this.connect();
    try {
      const meta = await this.readMeta(sftp);
      const now = Date.now();
      const deleted = [];

      for (const [key, info] of Object.entries(meta)) {
        if (info.permanent) continue;

        const age = now - new Date(info.uploadedAt).getTime();
        if (age > CLEANUP_MAX_AGE_MS) {
          const remotePath = `${this.uploadsPath}/${key}`;
          try {
            await sftp.delete(remotePath);
          } catch {
            // File may already be gone
          }
          delete meta[key];
          deleted.push(key);
        }
      }

      if (deleted.length > 0) {
        await this.writeMeta(sftp, meta);
        console.log(`Upload cleanup: deleted ${deleted.length} expired files: ${deleted.join(', ')}`);
      }

      return deleted;
    } finally {
      await sftp.end();
    }
  }
}
