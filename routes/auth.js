import express from "express";
import jwt from "jsonwebtoken";

import { exists_in_db, get_from_db, insert_to_db, logger } from "../db.js";
import { TABLES } from "../db_config.js";
import { randomBytes } from "crypto";
const router = express.Router();
const jwt_secret = process.env.JWT_SECRET;

router.post("/login", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      logger.warn("Login attempt without code", { ip: req.ip });
      return res.status(501).json({ msg: "Code is required" });
    }

    const rows = await get_from_db({
      table: TABLES.USERS.name,
      columns: ["user_id"],
      where: {
        user_code: code,
      },
    });

    if (!rows || rows.length != 1) {
      logger.warn("Invalid login attempt", { ip: req.ip, code: code });

      return res.status(501).json({ msg: "User do not exists" });
    }

    const token = jwt.sign(rows[0], jwt_secret, { expiresIn: "1d" });
    logger.info("User logged in successfully", {
      userId: rows[0].user_id,
      ip: req.ip,
    });
    res.json({ token });
  } catch (err) {
    logger.error("Error in /login: ", { error: err.message, stack: err.stack });
    res.status(501).json({ msg: "Error logging in" });
  }
});

router.post("/new_code", async (req, res) => {
  try {
    let num_tries = 0;
    let new_code, exists;
    do {
      new_code = randomBytes(3).toString("hex");

      exists = await exists_in_db({
        table: TABLES.USERS.name,
        where: {
          user_code: new_code,
        },
      });
      num_tries++;
      if (num_tries > 20) {
        logger.warn("Registering code failed because exists 20 times", {
          last_code: new_code,
        });
        return res
          .status(501)
          .json({ msg: "Something is wrong, please try again" });
      }
    } while (exists);

    const result = await insert_to_db({
      table: TABLES.USERS.name,
      data: {
        user_code: new_code,
      },
    });

    const user_id = result.lastId;
    const user = {
      user_id,
      user_code: new_code,
    };

    const token = jwt.sign(user, jwt_secret, { expiresIn: "1d" });
    logger.info("User registered in successfully", {
      new_code,
      ip: req.ip,
    });
    res.json({ code: new_code, token });
  } catch (err) {
    logger.error("Error in /new_code: ", {
      error: err.message,
      stack: err.stack,
    });
    res.status(501).json({ msg: "Error generating code" });
  }
});

export default router;
