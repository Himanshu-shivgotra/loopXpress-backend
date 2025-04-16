import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import Admin from "../models/adminModel.js";
import nodemailer from "nodemailer";
import crypto from "crypto";
import bcrypt from "bcryptjs"
import authenticate from "../middleware/authenticate.js"; 

const router = express.Router();

// Signup route
router.post("/submit-form", async (req, res) => {
  try {
    const user = new User(req.body);
    console.log(req.body)
    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error saving user data:", error);
    res.status(500).json({ message: "Error saving user data" });
  }
});


// Login route
router.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check in the User collection
    let user = await User.findOne({ "personalDetails.email": email }).select(
      "+personalDetails.password"
    );

    // If not found in User collection, check in the Admin collection
    if (!user) {
      const admin = await Admin.findOne({ email }).select("+password");

      if (!admin) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      // Compare the provided password with the stored hashed password for admin
      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      // Generate a JWT token for admin
      const token = jwt.sign(
        { id: admin._id, email: admin.email, role: "admin" },
        process.env.JWT_SECRET || "your_jwt_secret",
        { expiresIn: "7d" }
      );

      // Return the response for admin
      return res.json({
        message: "Admin login successful",
        token,
        admin: {
          id: admin._id,
          email: admin.email,
          name: admin.name,
          role: "admin",
        },
      });
    }

    const isMatch = await bcrypt.compare(password, user.personalDetails.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate a JWT token for user
    const token = jwt.sign(
      { id: user._id, email: user.personalDetails.email, role: "user" },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "7d" }
    );

    // Return the response for user
    res.json({
      message: "User login successful",
      token,
      user: {
        id: user._id,
        email: user.personalDetails.email,
        fullName: user.personalDetails.fullName,
        role: "seller",
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// Protected user info route
router.get("/user-info", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "-personalDetails.password"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching user info:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update perssonal info route
router.put("/update-personal-info", authenticate, async (req, res) => {
  try {
    const { personalDetails, businessDetails } = req.body;

    // Update using findByIdAndUpdate to avoid triggering save middleware
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          "personalDetails.fullName": personalDetails.fullName,
          "personalDetails.email": personalDetails.email,
          "personalDetails.phoneNumber": personalDetails.phoneNumber,
          "personalDetails.address": personalDetails.address,
        },
      },
      { new: true, runValidators: true }
    ).select("-personalDetails.password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(updatedUser);
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// Update password route
router.put("/update-password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: "Both current and new passwords are required." });
  }

  try {
    const user = await User.findById(req.user.id).select(
      "+personalDetails.password"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await user.isValidPassword(
      currentPassword,
      user.personalDetails.password
    );
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });
    }

    user.personalDetails.password = newPassword; // Update the password directly
    await user.save();

    res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Server error" });
  }
});



//forgot password
 router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ "personalDetails.email": email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Generate a reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() +  3600000; 

    await user.save();

    // Send email with the reset link
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      secure: false,
      tls: {
        rejectUnauthorized: false,
      },
    });

    const resetLink = `${process.env.WEB_URL}/auth/reset-password/${resetToken}`;

    const mailOptions = {
      to: user.personalDetails.email,
      from: process.env.EMAIL_USER, 
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #4A90E2;">Password Reset Request</h2>
          <p>Hello ${user.personalDetails.name || "User"},</p>
          <p>We received a request to reset your password. If you did not make this request, please ignore this email.</p>
          <p>To reset your password, click the link below:</p>
          <p><a href="${resetLink}" style="background-color: #4A90E2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
          <p>This link will expire in <strong>1 hours</strong>. If you need a new link, you can request another password reset on our website.</p>
          <p>If you have any questions or need further assistance, please contact our support team.</p>
          <p>Best regards,</p>
          <p><strong>Loop International Trade and exports</strong></p>
          <p><em>This is an automated message, please do not reply directly to this email.</em></p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res
      .status(200)
      .json({ message: "Password reset link sent to your email." });
  } catch (error) {
    console.error("Error in forgot-password route:", error);
    res
      .status(500)
      .json({ message: "An error occurred. Please try again later." });
  }
});

// Reset password route
router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }

    user.personalDetails.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    res.status(200).json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Error resetting password:", error);
    res
      .status(500)
      .json({ message: "An error occurred. Please try again later." });
  }
});

// Verify reset token route
router.get("/reset-password/:token", async (req, res) => {
  const { token } = req.params;

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }

    res.status(200).json({ message: "Token is valid" });
  } catch (error) {
    console.error("Error verifying reset token:", error);
    res
      .status(500)
      .json({ message: "An error occurred. Please try again later." });
  }
});

export default router;
