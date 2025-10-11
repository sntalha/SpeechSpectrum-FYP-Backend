// import jwt from "jsonwebtoken";
// import Constants from "../constant.js";
// import { userModel } from "../models/user.schema.js";

// const authMiddleware = async (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];
  
//   if (!token) {
//     return res.status(401).json({ message: "Unauthorized" });
//   }
//   try {
//     const decode = jwt.verify(token,Constants.JWT_SECRET)
//     const user = await userModel.findById(decode?.id).select("-password")
//     if (!user) {
//       return res.status(401).json({ message: "User not found by token" });
//     }
//     req.user = user;
//     next();
//   } catch (error) {
//     res
//       .status(500)
//       .json({ message: "Internal Server Error", error: error.message });
//   }
// };

// const checkAdmin = async (req, res, next) => {
//   if (req.user.role !== "admin") {
//     return res.status(403).json({ message: "Access denied" });
//   }
//   next();
// }

// export {authMiddleware,checkAdmin}