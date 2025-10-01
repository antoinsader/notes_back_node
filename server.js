import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { API_PORT, FRONT_URI, KEY_LENGTH } from "./config.js";
import { exec_async, init_db } from "./db.js";
import authRoutes from "./routes/auth.js";
import notesTypeRoute from "./routes/notesType.js";
import noteRoutes from "./routes/notes.js";
import { authMiddleware } from "./middleware/authMiddleWare.js";

dotenv.config();

const app = express();
// app.use(
//   cors({
//     origin: FRONT_URI,
//     methods: ["GET", "POST", "DELETE", "PUT"],
//   })
// );
app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/note_type", authMiddleware, notesTypeRoute);
app.use("/notes", authMiddleware, noteRoutes);

const init_api = async () => {
  const secretKey = process.env.ENCRYPTION_KEY;
  if (!secretKey || secretKey.length != KEY_LENGTH) {
    return console.error("Secret key is not specified or not 32 length");
  }
  const jwt = process.env.JWT_SECRET;
  if (!jwt) {
    return console.error("JWT is required to be set in .env");
  }
  try {
    const init_query = init_db();
    await exec_async(init_query);
    app.listen(API_PORT, async () => {
      console.log(`API and DB are ready, listening at port: ${API_PORT}`);
    });
  } catch (ex) {
    console.error("Error loading db: ", ex);
  }
};

init_api();
