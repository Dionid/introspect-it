import { exportTableDataToTs, tableToTS } from "./typescript";
import { Postgres } from "./pg-client";
import { format } from "prettier";
import { SQL as sql } from "sql-template-strings";

const JSONHeader = `
export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [member: string]: JSONValue };
export type JSONArray = Array<JSONValue>;

`;

const linterDisableHeader = `/* tslint:disable */
/* eslint-disable */\n`;

const header = (includesJSON: boolean): string => (includesJSON ? JSONHeader : "");

function pretty(code: string): string {
  return format(code, {
    parser: "typescript",
    semi: true,
    singleQuote: false,
    printWidth: 120
  });
}

export async function inferTable(
  connectionString: string,
  table: string,
  ignoreColumns: string[] = [],
  toCamelCase = false,
  useQuotes = false
): Promise<string> {
  const db = new Postgres(connectionString);
  const code = tableToTS(table, await db.table(table), ignoreColumns, toCamelCase, useQuotes);
  const fullCode = `
    ${header(code.includes("JSONValue"))}
    ${linterDisableHeader}
    export const SchemaName = "${db.schema()}" as const
    ${code}
  `;
  return pretty(fullCode);
}

export async function inferSchema(
  connectionString: string,
  ignoreTables: string[] = [],
  ignoreColumns: string[] = [],
  toCamelCase = false,
  useQuotes = false
): Promise<string> {
  const db = new Postgres(connectionString);
  const tables = await db.allTables();
  const interfaces = tables
    .sort((a, b) => a.name.localeCompare(b.name))
    // .filter(table => !ignoreTables.includes(table.name))
    .filter(table => {
      return !ignoreTables.some(pattern => {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        return regex.test(table.name);
      });
    })
    .map(table => tableToTS(table.name, table.table, ignoreColumns, toCamelCase, useQuotes));
  const code = [header(interfaces.some(i => i.includes("JSONValue"))), ...interfaces].join("\n");
  return pretty(`
  ${linterDisableHeader}
  export const SchemaName = "${db.schema()}" as const
  ${code}`);
}

export async function exportTable(
  connectionString: string,
  table: string,
  ignoreColumns: string[] = [],
  primaryKey = "id"
): Promise<string> {
  const db = new Postgres(connectionString);

  const code = exportTableDataToTs(table, await db.query(sql`SELECT * FROM `.append(table)), ignoreColumns, primaryKey);
  const fullCode = `
    ${header(code.includes("JSONValue"))}
    ${linterDisableHeader}
    ${code}
  `;
  return pretty(fullCode);
}
