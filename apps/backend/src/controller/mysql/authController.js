import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import AdminUser from "../../model/mysql/AdminUser.js";
import AdminSession from "../../model/mysql/AdminSession.js";
import ResetCode from "../../model/mysql/ResetCode.js";
import UserManagementService from "../../service/UserManagementService.js";
import generateResetCode from "../../utils/generateResetCode.js";
import sendResetEmail from "../../utils/sendResetEmail.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/AppError.js";

/**
 * Standard API response formatter
 */
const formatResponse = (success, message, data = null, statusCode = 200) => {
  return {
    success,
    message,
    data,
    timestamp: new Date().toISOString(),
    statusCode,
  };
};

/**
 * Input validation helper
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

/**
 * Rate limiting helper (simple in-memory store - consider Redis for production)
 */
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

const checkRateLimit = (email) => {
  const attempts = loginAttempts.get(email) || { count: 0, lastAttempt: 0 };
  const now = Date.now();

  if (now - attempts.lastAttempt > LOCKOUT_DURATION) {
    attempts.count = 0;
  }

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }

  attempts.count++;
  attempts.lastAttempt = now;
  loginAttempts.set(email, attempts);
  return true;
};

const resetRateLimit = (email) => {
  loginAttempts.delete(email);
};

/**
 * Admin Login
 * POST /api/auth/login
 */
export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  console.log(email, password);

  // Input validation
  if (!email || !password) {
    return next(new AppError("Email and password are required", 400));
  }

  if (!validateEmail(email)) {
    return next(new AppError("Please provide a valid email address", 400));
  }

  // Check rate limiting
  if (!checkRateLimit(email)) {
    return next(
      new AppError(
        "Too many login attempts. Please try again in 15 minutes.",
        429,
      ),
    );
  }

  // Try to find admin user first
  const admin = await AdminUser.findOne({
    where: {
      email: email,
    },
  });

  if (admin) {
    // Admin login flow
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return next(new AppError("Invalid email or password", 401));
    }

    // Check if account is verified
    if (!admin.is_verify) {
      return next(
        new AppError(
          "Account not verified. Please verify your email first.",
          401,
        ),
      );
    }

    // Check for existing sessions and limit them
    await AdminSession.findAll({
      where: { admin_id: admin.id },
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        roleId: null, // Admin users don't have roleId in the current system
        type: "admin",
        iat: Math.floor(Date.now() / 1000),
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    // Create new session
    await AdminSession.create({
      admin_id: admin.id,
      token,
    });

    // Reset rate limit on successful login
    resetRateLimit(email);

    // Remove sensitive data from response and include tenants for admin convenience
    const allTenants = await UserManagementService.getAllTenants();
    const userData = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      roleId: null,
      userRole: {
        id: null,
        name: "admin",
        displayName: "Administrator",
        description: "System Administrator",
        isSystemRole: true,
      },
      is_verify: admin.is_verify,
      photo_profile: admin.photo_profile,
      created_at: admin.created_at,
      updated_at: admin.updated_at,
      tenants: allTenants,
    };

    return res.status(200).json(
      formatResponse(true, "Login successful", {
        token,
        user: userData,
        expiresIn: "24h",
      }),
    );
  }

  // Try to find regular user
  const user = await UserManagementService.getUserByEmail(email);

  if (user) {
    // User login flow
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return next(new AppError("Invalid email or password", 401));
    }

    // Check if user is active
    if (!user.isActive) {
      return next(new AppError("Account is deactivated", 401));
    }

    // Check if user has any tenant assignments
    if (
      !user.UserTenantAssignments ||
      user.UserTenantAssignments.length === 0
    ) {
      return next(
        new AppError(
          "No company assigned to this user. Please contact administrator.",
          403,
        ),
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.userRole?.name || user.role, // Use role name from userRole if available
        roleId: user.roleId,
        type: "user",
        assignedTenants: user.UserTenantAssignments.map((assignment) => ({
          tenantId: assignment.Tenant.tenant_id,
          tenantName: assignment.Tenant.seller_business_name,
          databaseName: assignment.Tenant.database_name,
          sellerNTNCNIC: assignment.Tenant.seller_ntn_cnic,
          sellerFullNTN: assignment.Tenant.seller_full_ntn,
          sellerProvince: assignment.Tenant.seller_province,
          sellerAddress: assignment.Tenant.seller_address,
          is_active: Boolean(assignment.Tenant.is_active),
          created_at: assignment.Tenant.created_at,
          sandboxTestToken:
            assignment.Tenant.sandboxTestToken ||
            assignment.Tenant.sandbox_test_token,
          sandboxProductionToken:
            assignment.Tenant.sandboxProductionToken ||
            assignment.Tenant.sandbox_production_token,
        })),
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    // Reset rate limit on successful login
    resetRateLimit(email);

    // Prepare user data for response (without password)
    const userData = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.userRole?.name || user.role, // Use role name from userRole if available
      roleId: user.roleId,
      userRole: user.userRole
        ? {
            id: user.userRole.id,
            name: user.userRole.name,
            displayName: user.userRole.displayName,
            description: user.userRole.description,
            isSystemRole: user.userRole.isSystemRole,
          }
        : null,
      assignedTenants: user.UserTenantAssignments.map((assignment) => ({
        tenantId: assignment.Tenant.tenant_id,
        tenantName: assignment.Tenant.seller_business_name,
        databaseName: assignment.Tenant.database_name,
        sellerNTNCNIC: assignment.Tenant.seller_ntn_cnic,
        sellerFullNTN: assignment.Tenant.seller_full_ntn,
        sellerProvince: assignment.Tenant.seller_province,
        sellerAddress: assignment.Tenant.seller_address,
        is_active: Boolean(assignment.Tenant.is_active),
        created_at: assignment.Tenant.created_at,
        sandboxTestToken:
          assignment.Tenant.sandboxTestToken ||
          assignment.Tenant.sandbox_test_token,
        sandboxProductionToken:
          assignment.Tenant.sandboxProductionToken ||
          assignment.Tenant.sandbox_production_token,
      })),
    };

    return res.status(200).json(
      formatResponse(true, "Login successful", {
        token,
        user: userData,
        expiresIn: "24h",
      }),
    );
  }

  // If neither admin nor user found
  return next(new AppError("Invalid email or password", 401));
});

/**
 * Admin Logout
 * GET /api/auth/logout
 */
export const logout = catchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return next(new AppError("No token provided", 401));
  }

  // Remove session from database
  const deletedCount = await AdminSession.destroy({
    where: { token },
  });

  if (deletedCount === 0) {
    return next(new AppError("Invalid or expired token", 401));
  }

  return res.status(200).json(formatResponse(true, "Logged out successfully"));
});

/**
 * Verify Token
 * GET /api/auth/verify-token
 */
export const verifyToken = catchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return next(new AppError("No token provided", 401));
  }

  // Verify JWT token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if it's a user token
    if (decoded.type === "user") {
      // For user tokens, get user data
      const user = await UserManagementService.getUserByEmail(decoded.email);
      if (!user) {
        return next(new AppError("User not found", 401));
      }

      return res.status(200).json(
        formatResponse(true, "Token is valid", {
          isValid: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            assignedTenants:
              user.UserTenantAssignments?.map((assignment) => ({
                tenantId: assignment.Tenant.tenant_id,
                tenantName: assignment.Tenant.seller_business_name,
                databaseName: assignment.Tenant.database_name,
              })) || [],
          },
        }),
      );
    } else {
      // For admin tokens, check session and get admin data
      const session = await AdminSession.findOne({
        where: { token },
      });

      if (!session) {
        return next(new AppError("Invalid or expired token", 401));
      }

      const admin = await AdminUser.findByPk(decoded.id);
      if (!admin) {
        return next(new AppError("User not found", 401));
      }

      return res.status(200).json(
        formatResponse(true, "Token is valid", {
          isValid: true,
          user: {
            id: admin.id,
            email: admin.email,
            role: admin.role,
            is_verify: admin.is_verify,
          },
        }),
      );
    }
  } catch (jwtError) {
    // Remove invalid session if it exists
    await AdminSession.destroy({ where: { token } });

    return next(new AppError("Invalid or expired token", 401));
  }
});

/**
 * Get Admin Profile
 * GET /api/auth/profile
 */
export const getProfile = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;

  const admin = await AdminUser.findByPk(adminId, {
    attributes: { exclude: ["password", "verify_token", "verify_code"] },
  });

  if (!admin) {
    return next(new AppError("User not found", 404));
  }

  return res
    .status(200)
    .json(
      formatResponse(true, "Profile retrieved successfully", { user: admin }),
    );
});

/**
 * Update Admin Profile
 * PUT /api/auth/profile
 */
export const updateProfile = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const { email, photo_profile } = req.body;

  // Input validation
  if (email && !validateEmail(email)) {
    return next(new AppError("Please provide a valid email address", 400));
  }

  const admin = await AdminUser.findByPk(adminId);
  if (!admin) {
    return next(new AppError("User not found", 404));
  }

  // Check if email is already taken by another user
  if (email && email !== admin.email) {
    const existingUser = await AdminUser.findOne({
      where: {
        email: email.toLowerCase().trim(),
        id: { [Op.ne]: adminId },
      },
    });

    if (existingUser) {
      return next(new AppError("Email is already taken", 400));
    }
  }

  // Update profile
  const updateData = {};
  if (email) updateData.email = email.toLowerCase().trim();
  if (photo_profile !== undefined) updateData.photo_profile = photo_profile;

  await admin.update(updateData);

  // Return updated profile without sensitive data
  const updatedAdmin = await AdminUser.findByPk(adminId, {
    attributes: { exclude: ["password", "verify_token", "verify_code"] },
  });

  return res.status(200).json(
    formatResponse(true, "Profile updated successfully", {
      user: updatedAdmin,
    }),
  );
});

/**
 * Change Password
 * PUT /api/auth/change-password
 */
export const changePassword = catchAsync(async (req, res, next) => {
  const adminId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  // Input validation
  if (!currentPassword || !newPassword) {
    return next(
      new AppError("Current password and new password are required", 400),
    );
  }

  if (!validatePassword(newPassword)) {
    return next(
      new AppError(
        "New password must be at least 8 characters long and contain uppercase, lowercase, and number",
        400,
      ),
    );
  }

  const admin = await AdminUser.findByPk(adminId);
  if (!admin) {
    return next(new AppError("User not found", 404));
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    admin.password,
  );
  if (!isCurrentPasswordValid) {
    return next(new AppError("Current password is incorrect", 401));
  }

  // Hash new password
  const hashedNewPassword = await bcrypt.hash(newPassword, 12);

  // Update password
  await admin.update({ password: hashedNewPassword });

  // Invalidate all existing sessions
  await AdminSession.destroy({ where: { admin_id: adminId } });

  return res
    .status(200)
    .json(
      formatResponse(
        true,
        "Password changed successfully. Please login again.",
      ),
    );
});

/**
 * Forgot Password
 * POST /api/auth/forgot-password
 */
export const forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  // Input validation
  if (!email) {
    return next(new AppError("Email is required", 400));
  }

  if (!validateEmail(email)) {
    return next(new AppError("Please provide a valid email address", 400));
  }

  // Find user
  const user = await AdminUser.findOne({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user) {
    // Don't reveal if email exists or not for security
    return res
      .status(200)
      .json(
        formatResponse(
          true,
          "If the email exists, a reset code has been sent.",
        ),
      );
  }

  // Generate reset code
  const code = generateResetCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Save or update reset code
  await ResetCode.upsert({
    email: email.toLowerCase().trim(),
    code,
    expires_at: expiresAt,
    is_used: false,
  });

  // Send email
  try {
    await sendResetEmail(email, code);
    console.log(`Reset code sent successfully to: ${email}`);
  } catch (emailError) {
    console.error("Email sending failed:", emailError);

    // Check if it's an authentication error
    if (emailError.code === "EAUTH") {
      return next(
        new AppError(
          "Email service configuration error. Please contact support.",
          500,
        ),
      );
    }

    // Check if it's a network/connection error
    if (emailError.code === "ECONNECTION" || emailError.code === "ETIMEDOUT") {
      return next(
        new AppError(
          "Email service temporarily unavailable. Please try again later.",
          500,
        ),
      );
    }

    return next(
      new AppError("Failed to send reset email. Please try again later.", 500),
    );
  }

  return res
    .status(200)
    .json(
      formatResponse(true, "If the email exists, a reset code has been sent."),
    );
});

/**
 * Verify Reset Code
 * POST /api/auth/verify-reset-code
 */
export const verifyResetCode = catchAsync(async (req, res, next) => {
  const { email, code } = req.body;

  // Input validation
  if (!email || !code) {
    return next(new AppError("Email and reset code are required", 400));
  }

  if (!validateEmail(email)) {
    return next(new AppError("Please provide a valid email address", 400));
  }

  // Find reset code
  const resetEntry = await ResetCode.findOne({
    where: {
      email: email.toLowerCase().trim(),
      code,
      is_used: false,
    },
  });

  if (!resetEntry) {
    return next(new AppError("Invalid reset code", 400));
  }

  // Check if code is expired
  if (new Date() > resetEntry.expires_at) {
    await resetEntry.update({ is_used: true });
    return next(new AppError("Reset code has expired", 400));
  }

  return res
    .status(200)
    .json(formatResponse(true, "Reset code verified successfully"));
});

/**
 * Reset Password
 * PUT /api/auth/reset-password
 */
export const resetPassword = catchAsync(async (req, res, next) => {
  const { email, code, newPassword } = req.body;

  // Input validation
  if (!email || !code || !newPassword) {
    return next(
      new AppError("Email, reset code, and new password are required", 400),
    );
  }

  if (!validateEmail(email)) {
    return next(new AppError("Please provide a valid email address", 400));
  }

  if (!validatePassword(newPassword)) {
    return next(
      new AppError(
        "Password must be at least 8 characters long and contain uppercase, lowercase, and number",
        400,
      ),
    );
  }

  // Find and verify reset code
  const resetEntry = await ResetCode.findOne({
    where: {
      email: email.toLowerCase().trim(),
      code,
      is_used: false,
    },
  });

  if (!resetEntry) {
    return next(new AppError("Invalid reset code", 400));
  }

  // Check if code is expired
  if (new Date() > resetEntry.expires_at) {
    await resetEntry.update({ is_used: true });
    return next(new AppError("Reset code has expired", 400));
  }

  // Find user
  const user = await AdminUser.findOne({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // Update password
  await user.update({ password: hashedPassword });

  // Mark reset code as used
  await resetEntry.update({ is_used: true });

  // Invalidate all existing sessions
  await AdminSession.destroy({ where: { admin_id: user.id } });

  return res
    .status(200)
    .json(
      formatResponse(
        true,
        "Password reset successfully. Please login with your new password.",
      ),
    );
});

/**
 * Refresh Token
 * POST /api/auth/refresh-token
 */
export const refreshToken = catchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return next(new AppError("No token provided", 401));
  }

  // Verify current token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (jwtError) {
    return next(new AppError("Invalid token", 401));
  }

  // Check if session exists
  const session = await AdminSession.findOne({
    where: { token },
  });

  if (!session) {
    return next(new AppError("Session not found", 401));
  }

  // Get user
  const admin = await AdminUser.findByPk(decoded.id);
  if (!admin) {
    return next(new AppError("User not found", 401));
  }

  // Generate new token
  const newToken = jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" },
  );

  // Update session with new token
  await session.update({ token: newToken });

  return res.status(200).json(
    formatResponse(true, "Token refreshed successfully", {
      token: newToken,
      expiresIn: "24h",
    }),
  );
});
