import { userModel } from "../models/user.schema.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Constants from "../constant.js";
import sendMail from "../utils/send-mail.js";

export default class User {
  static async createUser(req, res) {
    try {
      const { name, email, password, role = "user" } = req.body;
      if (!name || !email || !password) {
        return res
          .status(400)
          .json({ message: "All fields are required", status: false });
      }
      const existingUser = await userModel.findOne({ email });
      if (existingUser) {
        return res
          .status(400)
          .json({ message: "User already exists", status: false });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const newUser = new userModel({
        name,
        email,
        password: hashedPassword,
        role,
      });
      await newUser.save();
      const payload = { id: newUser?._id, role: newUser?.role };
      const token = jwt.sign(payload, Constants.JWT_SECRET, {
        expiresIn: "1y",
      });
      newUser.token = token;
      await newUser.save();
      res
        .status(201)
        .json({
          message: "User created successfully",
          user: newUser,
          token,
          status: true,
        });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error creating user", error: error.message });
    }
  }
  static async loginUser(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email and password are required", status: false });
      }
      const user = await userModel.findOne({ email });
      if (!user) {
        return res
          .status(400)
          .json({ message: "User not found with this email", status: false });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res
          .status(400)
          .json({ message: "Invalid credentials", status: false });
      }
      const payload = { id: user._id, role: user.role };
      const token = jwt.sign(payload, Constants.JWT_SECRET, {
        expiresIn: "1y",
      });
      user.token = token;
      await user.save();
      res.status(200).json({
        message: "Login successful",
        user,
        token,
        status: true,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error logging in", error: error.message });
    }
  }
  static async forgetPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) {
        return res
          .status(400)
          .json({ message: "Email is required", status: false });
      }
      const user = await userModel.findOne({ email });
      if (!user) {
        return res
          .status(400)
          .json({ message: "User not found with this email", status: false });
      }
      const otp = Math.floor(Math.random()*900000 + 100000).toString();
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
      const responseMail = await sendMail({
        email: [email],
        subject: "E-Mart Password Reset OTP",
        htmlTemplate: `<h1>E-Mart Password Reset OTP</h1><p>Your OTP for password reset is <strong>${otp}</strong>. It is valid for 2 minutes.</p>`,
      });
      if(!responseMail){
        res
        .status(500)
        .json({ message: "Failed to send OTP. Try again later.", error: error.message })
      }
      user.otp= {
        value: otp,
        expiresAt: expiresAt,
        isVerified: false,
      };
      await user.save();
      res.status(200).json({
        message: "OTP sent to your email",
        status: true,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error processing request", error: error.message });
    }
  }
  static async verifyOtp(req, res) {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        return res
          .status(400)
          .json({ message: "Email and OTP are required", status: false });
      }
      const user = await userModel.findOne({ email });
      if (!user) {
        return res
          .status(400)
          .json({ message: "User not found with this email", status: false });
      }
      if (user.otp.value !== otp.toString() || user.otp.expiresAt < new Date()) {
        return res
          .status(400)
          .json({ message: "Invalid or expired OTP", status: false });
      }
      user.otp.isVerified = true;
      await user.save();
      res.status(200).json({
        message: "OTP verified successfully",
        status: true,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error verifying OTP", error: error.message });
    }
  }
  static async resetPassword(req, res) {
    try {
      const { email, newPassword } = req.body;
      if (!email || !newPassword) {
        return res
          .status(400)
          .json({ message: "Email and new password are required", status: false });
      }
      const user = await userModel.findOne({ email });
      if (!user) {
        return res
          .status(400)
          .json({ message: "User not found with this email", status: false });
      }
      if (!user.otp.isVerified) {
        return res
          .status(400)
          .json({ message: "OTP not verified", status: false });
      }
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      user.otp = { value: "", expiresAt: Date.now(), isVerified: false };
      const payload = { id: user._id, role: user.role };
      const token = jwt.sign(payload, Constants.JWT_SECRET, { expiresIn: "1h" });
       user.token = token;
      await user.save();
      res.status(200).json({
        message: "Password reset successfully",
        status: true,
        data: user
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error resetting password", error: error.message });
    }
  }
}
