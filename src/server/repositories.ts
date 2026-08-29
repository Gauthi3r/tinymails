import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { normalizeEmail } from "../domain/email";
import type { Account, Campaign, Lead, Reply, Template } from "../domain/types";
import { JsonStore } from "./json-store";

interface Identified {
  id: string;
}

export class CollectionRepository<T extends Identified> {
  constructor(private readonly store: JsonStore<T[]>) {}

  async list(): Promise<T[]> {
    return this.store.read();
  }

  async get(id: string): Promise<T | null> {
    return (await this.store.read()).find((item) => item.id === id) ?? null;
  }

  async save(record: T): Promise<void> {
    const records = await this.store.read();
    const index = records.findIndex((item) => item.id === record.id);
    if (index === -1) records.push(record);
    else records[index] = record;
    await this.store.write(records);
  }

  async replaceAll(records: T[]): Promise<void> {
    await this.store.write(records);
  }
}

export class LeadRepository {
  constructor(private readonly store: JsonStore<Lead[]>) {}

  list(): Promise<Lead[]> {
    return this.store.read();
  }

  saveAll(leads: Lead[]): Promise<void> {
    return this.store.write(leads);
  }
}

export class SuppressionListRepository {
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
    const combined = new Set(await this.list());
    for (const email of emails) {
      const normalized = normalizeEmail(email);
      if (normalized) combined.add(normalized);
    }
    const values = [...combined].sort();
    await this.write(values);
    return values;
  }

  private async write(emails: string[]): Promise<void> {
    const directory = dirname(this.path);
    const temporaryPath = join(directory, `${basename(this.path)}.${process.pid}.tmp`);
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, emails.length > 0 ? `${emails.join("\n")}\n` : "", {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.path);
  }
}

export interface Repositories {
  accounts: CollectionRepository<Account>;
  campaigns: CollectionRepository<Campaign>;
  leads: LeadRepository;
  templates: CollectionRepository<Template>;
  replies: CollectionRepository<Reply>;
  suppression: SuppressionListRepository;
}

export function createRepositories(dataDir: string): Repositories {
  return {
    accounts: new CollectionRepository(new JsonStore(join(dataDir, "accounts.json"), [])),
    campaigns: new CollectionRepository(new JsonStore(join(dataDir, "campaigns.json"), [])),
    leads: new LeadRepository(new JsonStore(join(dataDir, "leads.json"), [])),
    templates: new CollectionRepository(new JsonStore(join(dataDir, "templates.json"), [])),
    replies: new CollectionRepository(new JsonStore(join(dataDir, "replies.json"), [])),
    suppression: new SuppressionListRepository(join(dataDir, "suppression.txt")),
  };
}
