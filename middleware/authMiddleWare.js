import "dotenv/config";
import jwt from "jsonwebtoken";
const SECRET_KEY = process.env.JWT_SECRET;

export const authMiddleware = (req, res, next) => {
    const authHeader = req.header("Authorization");
    if (!authHeader) return res.status(401).json({ msg: "No token, auth denied" });
  
    // 'Bearer <token>'
    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ msg: "No token, auth denied" });
  
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      req.user = decoded; // { user_id, user_code, etc. }
      next();
    } catch (err) {
      res.status(401).json({ msg: "Token invalid" });
    }
  };
  