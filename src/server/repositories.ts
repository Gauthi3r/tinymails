import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { normalizeEmail } from "../domain/email";
import type { Account, AppSettings, Campaign, ContactList, Lead, Template } from "../domain/types";
import { JsonStore } from "./json-store";

interface Identified {
  id: string;
}

export class CollectionRepository<T extends Identified> {
  private readonly queue = new SerialQueue();

  constructor(private readonly store: JsonStore<T[]>) {}

  async list(): Promise<T[]> {
    return this.store.read();
  }

  async get(id: string): Promise<T | null> {
    return (await this.store.read()).find((item) => item.id === id) ?? null;
  }

  async save(record: T): Promise<void> {
    await this.queue.run(async () => {
      const records = await this.store.read();
      const index = records.findIndex((item) => item.id === record.id);
      if (index === -1) records.push(record);
      else records[index] = record;
      await this.store.write(records);
    });
  }

  async replaceAll(records: T[]): Promise<void> {
    await this.queue.run(() => this.store.write(records));
  }

  async createFromSnapshot<R>(
    create: (records: T[]) => { record: T; result: R },
  ): Promise<R> {
    return this.queue.run(async () => {
      const records = await this.store.read();
      const created = create(structuredClone(records));
      records.push(created.record);
      await this.store.write(records);
      return structuredClone(created.result);
    });
  }

  async findOrCreate(
    find: (record: T) => boolean,
    create: () => T,
  ): Promise<T> {
    return this.queue.run(async () => {
      const records = await this.store.read();
      const existing = records.find(find);
      if (existing) return structuredClone(existing);
      const record = create();
      records.push(record);
      await this.store.write(records);
      return structuredClone(record);
    });
  }

  async update(id: string, update: (record: T) => T): Promise<T | null> {
    return this.queue.run(async () => {
      const records = await this.store.read();
      const index = records.findIndex((item) => item.id === id);
      if (index === -1) return null;
      const updated = update(structuredClone(records[index]));
      records[index] = updated;
      await this.store.write(records);
      return structuredClone(updated);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.queue.run(async () => {
      const records = await this.store.read();
      const remaining = records.filter((item) => item.id !== id);
      if (remaining.length === records.length) return false;
      await this.store.write(remaining);
      return true;
    });
  }
}

export class LeadRepository {
  private readonly queue = new SerialQueue();

  constructor(
    private readonly store: JsonStore<StoredLead[]>,
    private readonly lists: CollectionRepository<ContactList>,
    private readonly clock: () => Date,
  ) {}

  list(): Promise<Lead[]> {
    return this.queue.run(async () => structuredClone(await this.readAndMigrate()));
  }

  saveAll(leads: Lead[]): Promise<void> {
    return this.queue.run(() => this.store.write(leads));
  }

  update(update: (leads: Lead[]) => Lead[]): Promise<Lead[]> {
    return this.queue.run(async () => {
      const leads = update(await this.readAndMigrate());
      await this.store.write(leads);
      return structuredClone(leads);
    });
  }

  private async readAndMigrate(): Promise<Lead[]> {
    const stored = await this.store.read();
    const needsMigration = stored.some((lead) => !Array.isArray(lead.listIds) || "source" in lead);
    if (!needsMigration) return stored as Lead[];

    const lists = await this.lists.list();
    const listsByName = new Map(lists.map((list) => [normalizedListName(list.name), list]));
    const now = this.clock().toISOString();
    const migrated: Lead[] = [];

    for (const storedLead of stored) {
      let listIds = Array.isArray(storedLead.listIds)
        ? storedLead.listIds.filter((id): id is string => typeof id === "string")
        : [];
      if (listIds.length === 0) {
        const name = typeof storedLead.source === "string" && storedLead.source.trim()
          ? storedLead.source.trim()
          : "Imported contacts";
        const key = normalizedListName(name);
        let list = listsByName.get(key);
        if (!list) {
          list = { id: randomUUID(), name, createdAt: now, updatedAt: now };
          await this.lists.save(list);
          listsByName.set(key, list);
        }
        listIds = [list.id];
      }
      migrated.push({
        email: storedLead.email,
        listIds: [...new Set(listIds)],
        addedAt: storedLead.addedAt,
        ...(storedLead.firstName ? { firstName: storedLead.firstName } : {}),
        ...(storedLead.company ? { company: storedLead.company } : {}),
      });
    }

    await this.store.write(migrated);
    return migrated;
  }
}

interface StoredLead {
  email: string;
  firstName?: string;
  company?: string;
  source?: string;
  listIds?: string[];
  addedAt: string;
}

function normalizedListName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export class SuppressionListRepository {
  private readonly queue = new SerialQueue();

  constructor(private readonly path: string) {}

  async list(): Promise<string[]> {
    try {
      return (await readFile(this.path, "utf8"))
        .split(/\r?\n/)
        .map((email) => normalizeEmail(email))
        .filter((email): email is string => Boolean(email));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async has(email: string): Promise<boolean> {
    const normalized = normalizeEmail(email);
    return normalized ? (await this.list()).includes(normalized) : false;
  }

  async add(emails: string[]): Promise<string[]> {
    return this.queue.run(async () => {
      const combined = new Set(await this.list());
      for (const email of emails) {
        const normalized = normalizeEmail(email);
        if (normalized) combined.add(normalized);
      }
      const values = [...combined].sort();
      await this.write(values);
      return values;
    });
  }

  private async write(emails: string[]): Promise<void> {
    const directory = dirname(this.path);
    const temporaryPath = join(directory, `${basename(this.path)}.${process.pid}.${randomUUID()}.tmp`);
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, emails.length > 0 ? `${emails.join("\n")}\n` : "", {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.path);
  }
}

const DEFAULT_SETTINGS: AppSettings = { agentsCanStart: false };

export class SettingsRepository {
  private readonly queue = new SerialQueue();

  constructor(private readonly store: JsonStore<Partial<AppSettings>>) {}

  async read(): Promise<AppSettings> {
    const stored = await this.store.read();
    return { agentsCanStart: stored.agentsCanStart === true };
  }

  update(changes: Partial<AppSettings>): Promise<AppSettings> {
    return this.queue.run(async () => {
      const settings = { ...(await this.read()), ...changes };
      await this.store.write(settings);
      return settings;
    });
  }
}

class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export interface Repositories {
  accounts: CollectionRepository<Account>;
  campaigns: CollectionRepository<Campaign>;
  leads: LeadRepository;
  lists: CollectionRepository<ContactList>;
  templates: CollectionRepository<Template>;
  suppression: SuppressionListRepository;
  settings: SettingsRepository;
}

export function createRepositories(
  dataDir: string,
  clock: () => Date = () => new Date(),
): Repositories {
  const lists = new CollectionRepository(
    new JsonStore<ContactList[]>(join(dataDir, "lists.json"), []),
  );
  return {
    accounts: new CollectionRepository(new JsonStore(join(dataDir, "accounts.json"), [])),
    campaigns: new CollectionRepository(new JsonStore(join(dataDir, "campaigns.json"), [])),
    leads: new LeadRepository(new JsonStore(join(dataDir, "leads.json"), []), lists, clock),
    lists,
    templates: new CollectionRepository(new JsonStore(join(dataDir, "templates.json"), [])),
    suppression: new SuppressionListRepository(join(dataDir, "suppression.txt")),
    settings: new SettingsRepository(new JsonStore(join(dataDir, "settings.json"), DEFAULT_SETTINGS)),
  };
}
