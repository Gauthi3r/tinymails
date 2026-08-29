import { normalizeEmail } from "./email";
import type { ContactInput } from "./types";

export interface CsvRow {
  line: number;
  values: string[];
}

export interface CsvTable {
  headers: string[];
  rows: CsvRow[];
}

export interface LeadColumnMapping {
  email?: number;
  firstName?: number;
  company?: number;
}

export interface ReviewedLeadRow {
  line: number;
  status: "valid" | "invalid" | "duplicate";
  contact?: ContactInput;
  issue?: string;
}

export interface LeadCsvReview {
  rows: ReviewedLeadRow[];
  contacts: ContactInput[];
  counts: { total: number; valid: number; invalid: number; duplicate: number };
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^\uFEFF/, "");
  const parsed: CsvRow[] = [];
  let values: string[] = [];
  let field = "";
  let fieldState: "unquoted" | "quoted" | "after-quote" = "unquoted";
  let line = 1;
  let rowLine = 1;

  const finishRow = () => {
    values.push(field);
    if (values.some((value) => value.trim() !== "")) parsed.push({ line: rowLine, values });
    values = [];
    field = "";
    fieldState = "unquoted";
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (fieldState === "quoted" && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (fieldState === "quoted") {
        fieldState = "after-quote";
      } else if (fieldState === "unquoted" && field.length === 0) {
        fieldState = "quoted";
      } else {
        throw invalidQuotedField(line);
      }
      continue;
    }
    if (character === "," && fieldState !== "quoted") {
      values.push(field);
      field = "";
      fieldState = "unquoted";
      continue;
    }
    if ((character === "\n" || character === "\r") && fieldState !== "quoted") {
      finishRow();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      line += 1;
      rowLine = line;
      continue;
    }
    if (fieldState === "after-quote") throw invalidQuotedField(line);
    if (character === "\n") line += 1;
    field += character;
  }

  if (fieldState === "quoted") throw new CsvParseError("The CSV ends inside a quoted field.");
  finishRow();
  const header = parsed.shift();
  if (!header || header.values.every((value) => !value.trim())) {
    throw new CsvParseError("The CSV needs a header row.");
  }
  return {
    headers: header.values.map((value) => value.trim()),
    rows: parsed,
  };
}

function invalidQuotedField(line: number): CsvParseError {
  return new CsvParseError(`The CSV has an invalid quoted field on line ${line}.`);
}

export function defaultLeadMapping(headers: string[]): LeadColumnMapping {
  const normalized = headers.map(normalizeHeader);
  return {
    ...mappedIndex(normalized, ["email", "emailaddress", "emailaddr"], "email"),
    ...mappedIndex(normalized, ["firstname", "givenname"], "firstName"),
    ...mappedIndex(normalized, ["company", "companyname", "organization", "organisation"], "company"),
  };
}

export function reviewLeadCsv(table: CsvTable, mapping: LeadColumnMapping): LeadCsvReview {
  if (mapping.email === undefined) {
    throw new CsvParseError("Choose the column that contains email addresses.");
  }
  const seen = new Set<string>();
  const rows: ReviewedLeadRow[] = [];
  const contacts: ContactInput[] = [];

  for (const row of table.rows) {
    const sourceEmail = row.values[mapping.email] ?? "";
    const email = normalizeEmail(sourceEmail);
    if (!email) {
      rows.push({ line: row.line, status: "invalid", issue: "Invalid email address" });
      continue;
    }
    if (seen.has(email)) {
      rows.push({ line: row.line, status: "duplicate", issue: "Duplicate in this file" });
      continue;
    }
    seen.add(email);
    const firstName = mappedValue(row, mapping.firstName);
    const company = mappedValue(row, mapping.company);
    const contact: ContactInput = {
      email,
      ...(firstName ? { firstName } : {}),
      ...(company ? { company } : {}),
    };
    contacts.push(contact);
    rows.push({ line: row.line, status: "valid", contact });
  }

  return {
    rows,
    contacts,
    counts: {
      total: rows.length,
      valid: contacts.length,
      invalid: rows.filter((row) => row.status === "invalid").length,
      duplicate: rows.filter((row) => row.status === "duplicate").length,
    },
  };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mappedIndex(
  normalizedHeaders: string[],
  names: string[],
  field: keyof LeadColumnMapping,
): Partial<LeadColumnMapping> {
  const index = normalizedHeaders.findIndex((header) => names.includes(header));
  return index === -1 ? {} : { [field]: index };
}

function mappedValue(row: CsvRow, index?: number): string | undefined {
  if (index === undefined) return undefined;
  return row.values[index]?.trim() || undefined;
}
