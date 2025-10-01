import "dotenv/config";
import sqlite3 from "sqlite3";
import winston from "winston";

import { DB_NAME, IV_LENGTH, KEY_LENGTH, PROD } from "./config.js";
import { TABLES } from "./db_config.js";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

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
  const decrypted_val = decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");

  return decrypted_val;
};

const validate_tbl = (table, columns = []) => {
  const table_def = TABLES[table];
  if (!table_def) throw new Error(`Table ${table} is not registered`);

  if (columns.length > 0) {
    const validCols = table_def.columns.map((c) => c.field);
    columns.forEach((col) => {
      if (!validCols.includes(col) && col != "*") {
        throw new Error(`Invalid column ${col} for table: ${table}`);
      }
    });
  }
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

export const get_from_db = async ({ table, columns = ["*"], where = {} }) => {
  return new Promise(async (resolve, reject) => {
    validate_tbl(table, [...columns, ...Object.keys(where)]);

    const encrypted_cols = TABLES[table].columns
      .filter((ele) => ele.encrypted)
      .map((ele) => ele.field);

    const values = Object.entries(where).map(([key, val]) =>
      encrypted_cols.includes(key) ? encrypt_value(val) : val
    );

    let query = `SELECT ${columns.join(", ")} FROM ${table}  `;

    if (Object.entries(where).length > 0) {
      const conditions = Object.keys(where)
        .map((condition_key) => `${condition_key} = ? `)
        .join(" AND ");
      query += ` WHERE ${conditions}`;
    }    
    


    db.all(query, values, (err, rows) => {
      if (err) {
        return reject(err);
      }
      const encrypt_table_cols = TABLES[table].columns
        .filter((col) => columns.includes(col.field))
        .filter((col) => col.encrypted)
        .map((col) => col.field);

      encrypt_table_cols.forEach((col) => {
        rows = rows.map((r) => ({ ...r, [col]: decrypt_value(r[col]) }));
      });
      resolve(rows);
    });
  });
};
export const exists_in_db = async ({ table, where = {} }) => {
  return new Promise(async (resolve, reject) => {
    validate_tbl(table, Object.keys(where));

    let query = `SELECT 1 FROM ${table}  `;

    const encrypted_cols = TABLES[table].columns
      .filter((ele) => ele.encrypted)
      .map((ele) => ele.field);
    const values = Object.entries(where).map(([key, val]) =>
      encrypted_cols.includes(key) ? encrypt_value(val) : val
    );



    if (Object.entries(where).length > 0) {
      const conditions = Object.keys(where)
        .map((condition_key) => {
          return ` ${condition_key}= ? `;
        })
        .join(" AND ");
      query += ` WHERE ${conditions} `;
    }


    db.all(query, values, (err, rows) => {
      if (err) {
        return reject(err);
      }
      if (rows && rows.length > 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};

export const insert_to_db = async ({ table, data }) => {
  return new Promise((resolve, reject) => {
    validate_tbl(table, Object.keys(data));

    const data_to_enter = { ...data };

    const encrypt_table_col_fields = TABLES[table].columns
      .filter((col) => col.encrypted)
      .map((col) => col.field);

    encrypt_table_col_fields.forEach((col_field) => {
      data_to_enter[col_field] = encrypt_value(data_to_enter[col_field]);
    });
    const keys = Object.keys(data_to_enter);
    const values = Object.values(data_to_enter);
    const placeholders = keys.map(() => "?").join(", ");
    const query = `INSERT INTO ${table} (${keys.join(
      ","
    )}) VALUES (${placeholders})`;
    console.log("query: " , query);

    db.run(query, values, function (err) {
      if (err) {
        return reject(err);
      }
      resolve({ lastId: this.lastID, changes: this.changes });
    });
  });
};

export const update_db = async ({ table, data, where = {} }) => {
  return new Promise((resolve, reject) => {
    if (Object.keys(where).length == 0) {
      return reject(new Error("Update requires where clause"));
    }

    validate_tbl(table, [...Object.keys(data), ...Object.keys(where)]);

    const encrypt_table_col_fields = TABLES[table].columns
      .filter((col) => col.encrypted)
      .map((col) => col.field);

    const data_to_enter = { ...data };

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
      console.log("conditions: " , conditions)
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
