const Tenant = require("../models/Tenant");
const User = require("../models/user.model");
const bcrypt = require('bcryptjs');
require('dotenv').config();
const sendInviteEmail = require('../utils/sendInviteEmail');
const sendTenantCreatedEmail = require('../utils/sendTenantCreatedEmail');
const sendOtp = require('../utils/sendOTP');
const jwt = require('jsonwebtoken');
const Invite = require("../models/invite");
const crypto = require('crypto');
const mongoose = require('mongoose');

exports.userRegister = async (req, res) => {
    try {
        const { name, email, password, role, tenantName, tenantId } = req.body;

        // Base required fields
        if (!name || !email || !password || !role) {
            return res.status(400).json({
                message: "Name, email, password, and role are required",
            });
        }

        const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=<>?{}[\]~])[A-Za-z\d!@#$%^&*()_\-+=<>?{}[\]~]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                message: "Password must be at least 8 characters long and include at least one uppercase letter, one number, and one special character.",
            });
        }

        // Role-specific required fields
        if (role === 'admin' && !tenantName) {
            return res.status(400).json({
                message: "Tenant name is required for admin",
            });
        }

        if (role === 'member' && !tenantId) {
            return res.status(400).json({
                message: "Tenant ID is required for member",
            });
        }

        // Normalize email
        const normalizedEmail = email.trim().toLowerCase();

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Check if user already exists
        let user = await User.findOne({ email: normalizedEmail });

        if (user) {
            console.log("User found:", user);
            console.log("Current Date: ", new Date());
            console.log("OTP Expires At: ", user.otpExpires);

            // Parse otpExpires to ensure it's a Date object
            const otpExpiryDate = new Date(user.otpExpires);

            // If the user is unverified and OTP has expired, delete the user
            if (!user.isVerified && new Date() > otpExpiryDate) {
                console.log("Deleting unverified user", normalizedEmail);
                const deleteResult = await User.deleteOne({ email: normalizedEmail });
                console.log("Delete result:", deleteResult);

                // Re-query after deletion
                user = await User.findOne({ email: normalizedEmail });
                if (!user) {
                    console.log("User deleted successfully, no user found.");
                } else {
                    console.log("User still found after deletion", user);
                }
            }

            // If the user still exists or is already verified
            if (user) {
                console.log("User with this email already present");
                return res.status(400).json({
                    message: "User present with this email",
                });
            }
        }

        // Validate tenantId for member role
        if (role === 'member') {
            const tenantExists = await Tenant.findById(tenantId);
            if (!tenantExists) {
                return res.status(400).json({
                    message: "Invalid tenant ID",
                });
            }
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Send OTP via email
        await sendOtp(normalizedEmail, otp);

        // Save the new user with OTP
        const newUser = new User({
            name,
            email: normalizedEmail,
            password: hashedPassword,
            role,
            tenantName: tenantName || undefined,
            tenantId: tenantId || undefined,
            otp,
            otpExpires,
        });

        await newUser.save();
        console.log("Saved user:", newUser); // Debug log

        return res.status(200).json({
            message: "OTP sent successfully to your email",
            userId: newUser._id,
            role: newUser.role,
            tenantName: newUser.tenantName || undefined,
            tenantId: newUser.tenantId || undefined
        });

    } catch (error) {
        console.error("Registration Error:", error);
        return res.status(500).json({
            message: "Internal Server Error",
        });
    }
};

exports.verifyOtp = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { email, otp, type, tenantName } = req.body;

        if (!email || !otp || !type) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Email, OTP, and type are required" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const normalizedType = type.toLowerCase().trim();
        if (!['register', 'login', 'forgotpassword'].includes(normalizedType)) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Invalid type value" });
        }

        const user = await User.findOne({ email: normalizedEmail }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ message: "User not found" });
        }

        console.log("Entered OTP:", otp, typeof otp);
        console.log("User DB OTP:", user.otp, typeof user.otp);
        console.log("Current Time:", new Date(Date.now()));
        console.log("OTP Expires At:", user.otpExpires);
        console.log("Is OTP Expired?", user.otpExpires ? new Date(user.otpExpires) < new Date(Date.now()) : "otpExpires is null/undefined");

        if (!user.otp || !user.otpExpires) {
            await session.abortTransaction();
            return res.status(400).json({ 
                message: "No valid OTP found. Please request a new OTP.",
                otpExists: !!user.otp,
                otpExpiresExists: !!user.otpExpires
            });
        }

        if (
            String(user.otp) === String(otp) &&
            user.otpExpires &&
            user.otpExpires > Date.now()
        ) {
            user.otp = undefined;
            user.otpExpires = undefined;

            if (normalizedType === "register") {
                user.isVerified = true;
                if (user.role === "admin") {
                    if (!tenantName) {
                        await session.abortTransaction();
                        return res.status(400).json({ message: "Tenant name required for admin" });
                    }
                    const tenant = await Tenant.create({ name: tenantName, adminEmails: [normalizedEmail] }, { session });
                    await sendTenantCreatedEmail(normalizedEmail, tenant._id, tenant.name);
                    user.tenantId = tenant._id;
                    user.tenantName = tenant.name;
                } else {
                    const tenant = await Tenant.findById(user.tenantId).session(session);
                    if (!tenant) {
                        await session.abortTransaction();
                        return res.status(400).json({ message: "Invalid tenant ID" });
                    }
                    user.tenantName = tenant.name;
                }
            }

            await user.save({ session });

            await session.commitTransaction();

            if (normalizedType === "login" || normalizedType === "register") {
                const token = jwt.sign(
                    { id: user._id, role: user.role, tenantId: user.tenantId },
                    process.env.SECRET,
                    { expiresIn: "7d" }
                );

                return res.status(200).json({
                    message: `${normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)} successful`,
                    token,
                    user: {
                        id: user._id,
                        email: user.email,
                        role: user.role,
                        tenantId: user.tenantId,
                        name: user.name,
                        tenantName: user.tenantName,
                    },
                });
            }

            if (normalizedType === "forgotpassword") {
                return res.status(200).json({
                    message: "OTP verified successfully. You can now reset password.",
                });
            }
        }

        await session.abortTransaction();
        return res.status(400).json({ 
            message: "Invalid or expired OTP",
            otpMatch: String(user.otp) === String(otp),
            isOtpExpired: user.otpExpires ? new Date(user.otpExpires) < new Date(Date.now()) : "otpExpires is null/undefined",
            otpExists: !!user.otp,
            otpExpiresExists: !!user.otpExpires
        });

    } catch (err) {
        await session.abortTransaction();
        console.error("verifyOtp Error:", err);
        return res.status(500).json({ message: "Server error" });
    } finally {
        session.endSession();
    }
};

exports.resendOtp = async (req, res) => {
    try {
        const { email, type } = req.body;
        if (!email || !type) {
            return res.status(400).json({ message: "Email and type are required" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const normalizedType = type.toLowerCase().trim();
        if (!['register', 'login', 'forgotpassword'].includes(normalizedType)) {
            return res.status(400).json({ message: "Invalid type value" });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(404).json({ message: "User not found" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();

        await sendOtp(normalizedEmail, otp);

        return res.status(200).json({ message: "New OTP sent to email" });
    } catch (err) {
        console.error("resendOtp Error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

exports.userLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required to login",
            });
        }

        const emailNormalized = email.trim().toLowerCase();
        const user = await User.findOne({ email: emailNormalized });

        if (!user || !user.isVerified) {
            return res.status(404).json({ message: 'User not found or not verified' });
        }

        if (!user.password) {
            return res.status(400).json({ message: 'Password not set for this user' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid password' });
        }

        const token = jwt.sign(
            { id: user._id, tenantId: user.tenantId, role: user.role },
            process.env.SECRET,
            { expiresIn: '7d' }
        );

        return res.status(200).json({
            email: user.email,
            token,
            role: user.role,
            tenantId: user.tenantId,
            name: user.name,
            tenantName: user.tenantName
        });
    } catch (err) {
        console.error('Login Error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

exports.generateLoginOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(404).json({ message: "User not found" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();
        await sendOtp(normalizedEmail, otp);

        return res.status(200).json({
            message: "OTP generated successfully for login",
        });
    } catch (err) {
        console.error("Error generating OTP:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.getAllMembers = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized Access" });
        }

        const currentUserRole = req.user.role;
        const members = await User.find({
            tenantId: req.user.tenantId,
            _id: { $ne: req.user._id },
            isVerified: {$ne: false}
        });

        if (members.length === 0) {
            return res.status(404).json({ message: "No members found" });
        }

        const result = members.map((member) => {
            const joinedInIST = new Date(member.createdAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                hour12: false,
            });

            return {
                name: member.name,
                email: currentUserRole === "admin" ? member.email : undefined,
                joinedIn: joinedInIST || "Unknown",
                role: member.role,
            };
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error('getAllMembers Error:', error);
        return res.status(500).json({
            message: "Internal Server Error",
        });
    }
};

exports.sendInvitation = async (req, res) => {
    try {
        const currentUser = req.user;

        if (!currentUser || !currentUser._id) {
            return res.status(401).json({ message: 'Unauthorized: User not authenticated' });
        }
        if (currentUser.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can send invites' });
        }

        const { email, role } = req.body;

        if (!email || !role) {
            return res.status(400).json({ message: 'Email and role are required' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const now = new Date();

        const existingInvite = await Invite.findOne({
            email: normalizedEmail,
            tenantId: currentUser.tenantId,
            expiresAt: { $gt: now },
            used: false
        });

        if (existingInvite) {
            return res.status(400).json({ message: 'Invite already sent to this email' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const invite = await Invite.create({
            email: normalizedEmail,
            token,
            tenantId: currentUser.tenantId,
            tenantName: currentUser.tenantName,
            role,
            expiresAt,
            invitedBy: currentUser._id,
        });

        await sendInviteEmail(normalizedEmail, token, currentUser.tenantId, currentUser.tenantName);

        return res.status(200).json({ message: 'Invite sent successfully', inviteToken: token });

    } catch (error) {
        console.error('sendInvitation Error:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

exports.acceptInvite = async (req, res) => {
    try {
        const { name, token, email, password } = req.body;

        if (!name || !token || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const invite = await Invite.findOne({ token });

        if (!invite) {
            return res.status(400).json({ message: 'Invalid or missing invite token' });
        }

        if (invite.used) {
            return res.status(400).json({ message: 'Invite has already been used' });
        }

        if (invite.expiresAt < Date.now()) {
            return res.status(400).json({ message: 'Invite has expired' });
        }

        if (invite.email.toLowerCase() !== normalizedEmail) {
            return res.status(400).json({ message: 'Email does not match the invite' });
        }

        const existingUser = await User.findOne({
            email: normalizedEmail,
            tenantId: invite.tenantId
        });

        if (existingUser) {
            return res.status(400).json({ message: 'User already exists in this tenant' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name,
            email: normalizedEmail,
            password: hashedPassword,
            tenantId: invite.tenantId,
            tenantName: invite.tenantName,
            role: invite.role || 'member',
            isVerified: true
        });

        invite.used = true;
        await invite.save();

        return res.status(201).json({
            message: 'User created successfully via invite',
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                tenantId: newUser.tenantId,
                role: newUser.role,
                tenantName: newUser.tenantName
            }
        });

    } catch (err) {
        console.error('acceptInvite Error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

exports.deleteMember = async (req, res) => {
    try {
        const currentUserRole = req.user?.role;
        const tenantId = req.user?.tenantId;

        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant ID not found in user context' });
        }

        const { name, email } = req.body;

        if (!name && !email) {
            return res.status(400).json({ message: 'Name or email is required to identify the member' });
        }

        const query = { role: 'member', tenantId };

        if (name) query.name = name.trim();
        if (email) query.email = email.toLowerCase().trim();

        const member = await User.findOne(query);

        if (!member) {
            return res.status(404).json({ message: 'Member not found with the provided name or email in your tenant' });
        }

        await User.deleteOne({ _id: member._id });

        return res.status(200).json({
            message: 'Member deleted successfully',
            deletedMember: { name: member.name, email: member.email },
        });

    } catch (error) {
        console.error('deleteMember Error:', error);
        return res.status(500).json({
            message: 'Internal Server Error',
        });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const authHeader = req.headers["authorization"];
        if (!authHeader) {
            return res.status(401).json({ message: "Authorization header is missing" });
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.SECRET);
        console.log("Decoded JWT:", decoded);

        if (!decoded.id) {
            return res.status(400).json({ message: "Invalid token: missing user ID" });
        }

        if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const user = await User.findById(decoded.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({
            success: true,
            user
        });

    } catch (error) {
        console.error("Profile Error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(404).json({ message: "User not found" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();

        await sendOtp(normalizedEmail, otp);

        return res.status(200).json({ message: "OTP sent to email" });

    } catch (err) {
        console.error("forgotPassword Error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ message: "Email and new password are required" });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.otp || user.otpExpires) {
            return res.status(400).json({ message: "Please verify OTP first" });
        }

        const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=<>?{}[\]~])[A-Za-z\d!@#$%^&*()_\-+=<>?{}[\]~]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                message: "Password must be at least 8 characters long and include at least one uppercase letter, one number, and one special character.",
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;

        await user.save();

        return res.status(200).json({ message: "Password reset successfully" });

    } catch (err) {
        console.error("resetPassword Error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
