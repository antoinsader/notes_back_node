import express from "express";

import {
  get_from_db,
  insert_to_db,
  delete_from_db,
  update_db,
  logger,
} from "../db.js";
import { TABLES } from "../db_config.js";
const router = express.Router();

const TABLE_NAME = TABLES.NOTE_TYPES.name;

router.post("/get_all", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const rows = await get_from_db({
      table: TABLE_NAME,
      columns: ["note_type_id", "note_type_title"],
      where: {
        user_id,
      },
    });

    res.json(rows);
  } catch (err) {
    logger.error("Error in /notes_types/get_all: ", {
      error: err.message,
      stack: err.stack,
    });
    res.status(501).json({ msg: "Error getting data" });
  }
});

router.post("/insert", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const body = {
      note_type_title: req.body.note_type_title,
      user_id,
    };

    const inserted = await insert_to_db({
      table: TABLE_NAME,
      data: body,
    });

    res.json(inserted);
  } catch (err) {
    logger.error("Error in /notes_types/insert: ", {
      error: err.message,
      stack: err.stack,
    });
    res.status(501).json({ msg: "Error inserting" });
  }
});

router.post("/update", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const body = {
      note_type_title: req.body.note_type_title,
    };

    const updated = await update_db({
      table: TABLE_NAME,
      data: body,
      where: {
        note_type_id: req.body.note_type_id,
      },
    });

    res.json(updated);
  } catch (err) {
    logger.error("Error in /notes_types/update: ", {
      error: err.message,
      stack: err.stack,
    });
    res.status(501).json({ msg: "Error updating" });
  }
});

router.post("/delete", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const deleted = await delete_from_db({
      table: TABLE_NAME,
      where: {
        note_type_id: req.body.note_type_id,
        user_id,
      },
    });

    res.json(deleted);
  } catch (err) {
    logger.error("Error in /notes_types/delete: ", {
      error: err.message,
      stack: err.stack,
    });
    res.status(501).json({ msg: "Error deleting" });
  }
});

export default router;
