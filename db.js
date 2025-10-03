import "dotenv/config";
import sqlite3 from "sqlite3";
import winston from "winston";

import { DB_NAME, IV_LENGTH, KEY_LENGTH, PROD } from "./config.js";
import { TABLES } from "./db_config.js";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";


const db_verbose = sqlite3.verbose();
const secretKey = process.env.ENCRYPTION_KEY;

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});
if (PROD) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

export const db = new db_verbose.Database(DB_NAME, (err) => {
  if (err) {
    return console.error("Error connecting db: ", err);
  }
});

const getKey = (secret) => {
  const keyBuf = Buffer.alloc(KEY_LENGTH);
  Buffer.from(secret).copy(keyBuf);
  return keyBuf;
};

// Encrypt text using AES-256-CBC
const encrypt_value = (text) => {
  const iv = randomBytes(IV_LENGTH); // 16-byte IV
  const key = getKey(secretKey);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = cipher.update(text, "utf8", "hex") + cipher.final("hex");
  const value = `${iv.toString("hex")}:${encrypted}`;
  return value;
};

const decrypt_value = (data) => {
  const [ivHex, encrypted] = data.split(":");
  if (!ivHex || !encrypted) throw new Error("Invalid encrypted data");
  const iv = Buffer.from(ivHex, "hex");
  const key = getKey(secretKey);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted_val =
    decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");

  return decrypted_val;
};

const validate_tbl = (table, columns = []) => {
  const table_def = TABLES[table];
  if (!table_def) throw new Error(`Table ${table} is not registered`);

  const valid_fields = TABLES[table].columns.map(c => c.field);
  columns.forEach((col) => {
    if (col == "*") return;
    if (col.includes(".")) {
      const [selected_tbl, selected_field] = col.split(".");
      const valid_foreignTables = TABLES[table].columns
        .filter((c) => c.foreign)
        .map((c) => c.foreign.split(".")[0]);
      if (!valid_foreignTables.includes(selected_tbl)) {
        throw new Error(`Invalid table ${selected_tbl} for table: ${table}`);
      }
      if (
        !TABLES[selected_tbl].columns
          .map((c) => c.field)
          .includes(selected_field)
      ) {
        throw new Error(`Invalid field ${selected_field} for table: ${table}`);
      }
    } else if (!valid_fields.includes(col)) {
      throw new Error(`Invalid column ${col} for table: ${table}`);
    }
  });
};

export const init_db = () => {
  const sql = [];

  for (const key in TABLES) {
    const table = TABLES[key];

    let cols_queries = [];
    let fks_queries = [];

    table.columns.forEach((col) => {
      let col_query = `${col.field} ${col.type}`;
      if (col.primary) col_query += " PRIMARY KEY ";
      if (col.auto_increment) col_query += " AUTOINCREMENT ";
      if (col.default) col_query += ` DEFAULT ${col.default} `;
      cols_queries.push(col_query);

      if (col.foreign) {
        const [f_tbl, f_col] = col.foreign.split(".");
        fks_queries.push(
          ` FOREIGN KEY (${col.field}) REFERENCES ${f_tbl}(${f_col}) ON DELETE CASCADE `
        );
      }
    });

    const defs = [...cols_queries, ...fks_queries].join(", \n");
    const table_query = `CREATE TABLE IF NOT EXISTS ${table.name} ( ${defs} )  `;
    sql.push(table_query);
  }
  return sql.join("; ");
};

export const exec_async = async (query) => {
  return new Promise((resolve, reject) => {
    db.exec(query, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
};

const encrypt_where = (table, where) => {
  const enc_cols = TABLES[table].columns
    .filter((c) => c.encrypted)
    .map((c) => c.field);
  return Object.entries(where).map(([w_k, w_v]) =>
    enc_cols.includes(w_k) ? encrypt_value(w_v) : w_v
  );
};

const decrypt_rows = (table, columns, rows) => {
  const enc_cols = TABLES[table].columns
    .filter((col) => col.encrypted)
    .map((c) => c.field);
  return rows.map((row) => {
    const new_row = { ...row };
    columns.forEach((col) => {
      if (col.includes(".")) {
        const [tbl, field] = col.split(".");
        const c = TABLES[tbl].columns.find(
          (cc) => cc.field == field && cc.encrypted
        );
        if (c && new_row[field]) new_row[field] = decrypt_value(new_row[field]);
      } else if (enc_cols.includes(col) && new_row[col]) {
        new_row[col] = decrypt_value(new_row[col]);
      }
    });
    return new_row;
  });
};

export const get_from_db = async ({
  table,
  columns,
  where = {},
  not_validate,
}) => {
  return new Promise(async (resolve, reject) => {
    if (!not_validate) validate_tbl(table, [...columns, ...Object.keys(where)]);

    const base_cols = columns.filter((col) => !col.includes("."));
    const joined_cols = columns.filter((col) => col.includes("."));

    const joins = joined_cols
      .map((col) => {
        const [tbl, field] = col.split(".");
        const fk = TABLES[tbl].columns.find((c) => c.primary).field;
        return ` LEFT JOIN ${tbl} ON ${table}.${fk} = ${tbl}.${fk} `;
      })
      .join(" ");

    const all_cols = [
      ...base_cols.map((col) => `${table}.${col}`),
      ...joined_cols,
    ];
    let query = `SELECT ${all_cols.join(", ")} FROM ${table} ${joins}  `;

    const where_values = encrypt_where(table, where);
    if (Object.entries(where).length > 0) {
      const conditions = Object.keys(where)
        .map((condition_key) => `${table}.${condition_key} = ? `)
        .join(" AND ");
      query += ` WHERE ${conditions}`;
    }

    db.all(query, where_values, (err, rows) => {
      if (err) {
        console.warn("Query with error: ", query);
        console.error("error in get_From_db: ", err);
        return reject(err);
      }
      resolve(decrypt_rows(table, columns, rows));
    });
  });
};
export const exists_in_db = async ({ table, where = {} }) => {
  return new Promise(async (resolve, reject) => {
    validate_tbl(table, Object.keys(where));

    let query = `SELECT 1 FROM ${table}  `;

    const values = encrypt_where(table, where);

    if (Object.entries(where).length > 0) {
      const conditions = Object.keys(where)
        .map((condition_key) => {
          return ` ${condition_key}= ? `;
        })
        .join(" AND ");
      query += ` WHERE ${conditions} `;
    }

    db.get(query, values, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(!!rows);
    });
  });
};
const hash_value = (text) => createHash("sha256").update(text).digest("hex");
export const insert_to_db = async ({ table, data }) => {
  return new Promise(async (resolve, reject) => {
    try {
      validate_tbl(table, Object.keys(data));
      const data_to_enter = { ...data };

      const hsh_cols = TABLES[table].columns.filter(c => c.hash_col ).map(col => [col.field, col.hash_col]);
      hsh_cols.forEach(([col_field,hsh_col]) => {
        data_to_enter[hsh_col] = hash_value(data_to_enter[col_field])
      })


      if (TABLES[table].unique) {
        for (const unique of TABLES[table].unique) {
          const keys = unique.split(",");
          const where = {};
          keys.forEach((k) => (where[k] = data_to_enter[k]));
          const exists = await exists_in_db({ table, where });
          if (exists) {
            throw new Error(`Values of ${unique} cannot be duplicated`);
          }
        }
      }

      const encrypt_table_col_fields = TABLES[table].columns
        .filter((col) => col.encrypted)
        .map((col) => col.field);

      encrypt_table_col_fields.forEach((col_field) => {
        if (data_to_enter[col_field])
          data_to_enter[col_field] = encrypt_value(data_to_enter[col_field]);
      });

      const keys = Object.keys(data_to_enter);
      const placeholders = keys.map(() => "?").join(", ");

      const values = Object.values(data_to_enter);
      const query = `INSERT INTO ${table} (${keys.join(
        ","
      )}) VALUES (${placeholders})`;
      console.log("inserting: " , values);
      console.log("query: " , query);
      db.run(query, values, function (err) {
        if (err) {
          return reject(err);
        }
        resolve({ lastId: this.lastID, changes: this.changes });
      });
    } catch (ex) {
      reject(ex);
    }
  });
};

export const update_db = async ({ table, data, where = {} }) => {
  return new Promise(async (resolve, reject) => {
    if (Object.keys(where).length == 0) {
      return reject(new Error("Update requires where clause"));
    }

    validate_tbl(table, [...Object.keys(data), ...Object.keys(where)]);
    const data_to_enter = { ...data };

    const hsh_cols = TABLES[table].columns.filter(c => c.hash_col ).map(col => [col.field, col.hash_col]);
    hsh_cols.forEach(([col_field,hsh_col]) => {
      data_to_enter[hsh_col] = hash_value(data_to_enter[col_field])
    })


    if (TABLES[table].unique) {
      for (const unique of TABLES[table].unique) {
        const keys = unique.split(",");
        const where = {};
        keys.forEach((k) => (where[k] = data_to_enter[k]));
        const exists = await exists_in_db({ table, where });
        if (exists) {
          throw new Error(`Values of ${unique} cannot be duplicated`);
        }
      }
    }

    const encrypt_table_col_fields = TABLES[table].columns
      .filter((col) => col.encrypted)
      .map((col) => col.field);

    encrypt_table_col_fields.forEach((col_field) => {
      if (data_to_enter[col_field]) {
        data_to_enter[col_field] = encrypt_value(data_to_enter[col_field]);
      }
    });

    const set_keys = Object.keys(data_to_enter)
      .map((key) => `${key} = ?`)
      .join(" , ");
    const set_values = Object.values(data_to_enter);

    const where_keys = Object.keys(where)
      .map((key) => `${key} = ?`)
      .join(" AND ");

    const where_values = Object.entries(where).map(([key, val]) =>
      encrypt_table_col_fields.includes(key) ? encrypt_value(val) : val
    );

    const query = `UPDATE  ${table} SET ${set_keys} WHERE ${where_keys}`;
    const values = [...set_values, ...where_values];

    db.run(query, values, function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ changes: this.changes });
    });
  });
};

export const delete_from_db = async ({ table, where = {} }) => {
  return new Promise((resolve, reject) => {
    if (Object.keys(where).length == 0) {
      return reject(new Error("Delete requires where clause"));
    }
    validate_tbl(table, [...Object.keys(where)]);

    const conditions = Object.keys(where)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = Object.values(where);
    const query = `DELETE FROM ${table} where ${conditions}`;

    db.run(query, values, function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ changes: this.changes });
    });
  });
};

export default db;
