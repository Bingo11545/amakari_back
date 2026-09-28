import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DB_DIR, 'db.json');

class Database {
  constructor() {
    this.data = {
      users: [],
      therapists: [],
      subAdmins: [],
      subAdminPermissions: [],
      therapyPackages: [],
      userPackages: [],
      appointments: [],
      sessions: [],
      payments: [],
      auditLogs: [],
      notifications: [],
      settings: {},
      reports: []
    };
    this.isLoaded = false;
    this.writeLock = Promise.resolve();
  }

  async init() {
    if (this.isLoaded) return;
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          this.data = {
            ...this.data,
            ...parsed
          };
          // Ensure all collections exist
          for (const key of Object.keys(this.data)) {
            if (!this.data[key]) {
              this.data[key] = Array.isArray(this.data[key]) ? [] : {};
            }
          }
        }
      } else {
        await this.persist();
      }
      this.isLoaded = true;
    } catch (err) {
      console.error('Error initializing database:', err);
      this.isLoaded = true;
    }
  }

  async persist() {
    this.writeLock = this.writeLock.then(async () => {
      try {
        if (!fs.existsSync(DB_DIR)) {
          fs.mkdirSync(DB_DIR, { recursive: true });
        }
        const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
        await fs.promises.writeFile(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
        try {
          await fs.promises.rename(tempFile, DB_FILE);
        } catch {
          await fs.promises.copyFile(tempFile, DB_FILE);
          await fs.promises.unlink(tempFile).catch(() => {});
        }
      } catch (err) {
        console.error('Error persisting database:', err);
      }
    });
    return this.writeLock;
  }

  getCollection(name) {
    if (!this.data[name]) {
      this.data[name] = [];
    }
    return this.data[name];
  }

  find(collectionName, filterFn = null) {
    const list = this.getCollection(collectionName);
    if (!filterFn) return [...list];
    return list.filter(filterFn);
  }

  findOne(collectionName, filterFn) {
    const list = this.getCollection(collectionName);
    return list.find(filterFn) || null;
  }

  findById(collectionName, id) {
    return this.findOne(collectionName, (item) => String(item.id) === String(id));
  }

  async insert(collectionName, item) {
    const list = this.getCollection(collectionName);
    const now = new Date().toISOString();
    const newItem = {
      id: item.id || `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      ...item
    };
    list.push(newItem);
    await this.persist();
    return newItem;
  }

  async update(collectionName, id, updates) {
    const list = this.getCollection(collectionName);
    const index = list.findIndex((item) => String(item.id) === String(id));
    if (index === -1) return null;

    const current = list[index];
    const updated = {
      ...current,
      ...updates,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    };
    list[index] = updated;
    await this.persist();
    return updated;
  }

  async delete(collectionName, id) {
    const list = this.getCollection(collectionName);
    const index = list.findIndex((item) => String(item.id) === String(id));
    if (index === -1) return false;

    list.splice(index, 1);
    await this.persist();
    return true;
  }

  async getSettings() {
    return this.data.settings || {};
  }

  async updateSettings(newSettings) {
    this.data.settings = {
      ...this.data.settings,
      ...newSettings,
      updatedAt: new Date().toISOString()
    };
    await this.persist();
    return this.data.settings;
  }
}

export const db = new Database();
