const router = require("express").Router();
const authMW = require("../middlewares/authMW");
const isAdmin = require("../middlewares/isAdminMW");

const {
  userRegister,
  userLogin,
  verifyOtp,
  getAllMembers,
  sendInvitation,
  acceptInvite,
  deleteMember,
  getProfile,
  forgotPassword,
  resetPassword,
  generateLoginOtp
} = require("../controllers/authController");

// Auth + Registration
router.post("/register", userRegister);
router.post("/verify-otp", verifyOtp);
router.post("/login", userLogin);
router.post("/generate-otp",generateLoginOtp)

// Forgot & Reset Password
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Profile
router.get("/profile", authMW, getProfile);

// Members (Tenant)
router.get("/members", authMW, getAllMembers);
router.delete("/members/delete", authMW, isAdmin, deleteMember);

// Invitations
router.post("/invite", authMW, isAdmin, sendInvitation);
router.post("/accept-invite", acceptInvite);

module.exports = router;
