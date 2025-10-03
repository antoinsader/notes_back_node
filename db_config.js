export const TABLES = {
  USERS: {
    name: "USERS",
    columns: [
      {
        field: "user_id",
        type: "INTEGER",
        primary: true,
        auto_increment: true,
      },
      {
        field: "user_code",
        type: "TEXT",
      },
    ],
  },
  NOTE_TYPES: {
    name: "NOTE_TYPES",
    columns: [
      {
        field: "note_type_id",
        type: "INTEGER",
        primary: true,
        auto_increment: true,
      },
      {
        field: "user_id",
        type: "INTEGER",
        foreign: "USERS.user_id",
      },
      {
        field: "note_type_title",
        type: "TEXT",
        encrypted: true,
        hash_col: "note_type_title_hash",
      },
      { field: "note_type_title_hash", type: "TEXT" },
    ],
    unique: ["user_id,note_type_title_hash"],
  },
  NOTES: {
    name: "NOTES",
    columns: [
      {
        field: "note_id",
        type: "INTEGER",
        primary: true,
        auto_increment: true,
      },
      {
        field: "user_id",
        type: "INTEGER",
        foreign: "USERS.user_id",
      },
      {
        field: "note_type_id",
        type: "INTEGER",
        foreign: "NOTE_TYPES.note_type_id",
      },
      {
        field: "content",
        type: "TEXT",
        encrypted: true,
        hash_col: "content_hash",
      },
      {
        field: "created_at",
        type: "DATETIME",
        default: "CURRENT_TIMESTAMP",
      },
      {
        field: "content_hash",
        type: "TEXT",
      },
    ],
    unique: ["user_id,note_type_id,content_hash"],
  },
};
