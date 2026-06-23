import bcrypt from "bcryptjs";
import {
  User,
  Tenant,
  UserTenantAssignment,
  AdminUser,
  Role,
} from "../model/mysql/associations.js";
import { masterSequelize } from "../config/mysql.js";

class UserManagementService {
  // Create a new user
  async createUser(userData, createdByAdminId) {
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        phone,
        roleId,
        isActive,
      } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        throw new Error("User with this email already exists");
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await User.create({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        roleId,
        createdBy: createdByAdminId,
        isActive: isActive !== undefined ? isActive : true, // Use provided status or default to true
        isVerified: true, // Auto-verify users created by admin
      });

      return user;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  // Assign user to tenant
  async assignUserToTenant(userId, tenantId, assignedByAdminId) {
    try {
      // Check if assignment already exists
      const existingAssignment = await UserTenantAssignment.findOne({
        where: { userId, tenantId },
      });

      if (existingAssignment) {
        if (existingAssignment.isActive) {
          throw new Error("User is already assigned to this tenant");
        } else {
          // Reactivate existing assignment
          existingAssignment.isActive = true;
          existingAssignment.assignedBy = assignedByAdminId;
          existingAssignment.assignedAt = new Date();
          await existingAssignment.save();
          return existingAssignment;
        }
      }

      // Create new assignment
      const assignment = await UserTenantAssignment.create({
        userId,
        tenantId,
        assignedBy: assignedByAdminId,
        isActive: true,
      });

      return assignment;
    } catch (error) {
      console.error("Error assigning user to tenant:", error);
      throw error;
    }
  }

  // Remove user from tenant
  async removeUserFromTenant(userId, tenantId) {
    try {
      const assignment = await UserTenantAssignment.findOne({
        where: { userId, tenantId, isActive: true },
      });

      if (!assignment) {
        throw new Error("User is not assigned to this tenant");
      }

      assignment.isActive = false;
      await assignment.save();
      return assignment;
    } catch (error) {
      console.error("Error removing user from tenant:", error);
      throw error;
    }
  }

  // Remove all tenant assignments for a user
  async removeAllUserTenantAssignments(userId) {
    try {
      await UserTenantAssignment.update(
        { isActive: false },
        { where: { userId, isActive: true } }
      );
      return true;
    } catch (error) {
      console.error("Error removing all user tenant assignments:", error);
      throw error;
    }
  }

  // Get all users with their tenant assignments
  async getAllUsers() {
    try {
      const users = await User.findAll({
        // Remove the isActive filter to show all users (both active and blocked)
        include: [
          {
            model: UserTenantAssignment,
            where: { isActive: true },
            required: false,
            include: [
              {
                model: Tenant,
                attributes: [
                  "id",
                  "tenant_id",
                  "seller_business_name",
                  "seller_ntn_cnic",
                ],
              },
            ],
          },
          {
            model: AdminUser,
            as: "CreatedBy",
            attributes: ["id", "email"],
            required: false,
          },
          {
            model: Role,
            as: "userRole",
            attributes: ["id", "name", "description"],
          },
        ],
        order: [["created_at", "DESC"]],
      });

      return users;
    } catch (error) {
      console.error("Error fetching users:", error);
      throw error;
    }
  }

  // Get user by ID with tenant assignments
  async getUserById(userId) {
    try {
      const user = await User.findOne({
        where: { id: userId }, // Remove isActive filter to get user regardless of status
        include: [
          {
            model: UserTenantAssignment,
            where: { isActive: true },
            required: false,
            include: [
              {
                model: Tenant,
                attributes: [
                  "id",
                  "tenant_id",
                  "seller_business_name",
                  "seller_ntn_cnic",
                  "seller_full_ntn",
                  "seller_province",
                  "seller_address",
                  "database_name",
                  "is_active",
                  "created_at",
                  "sandboxTestToken",
                  "sandboxProductionToken",
                  "telNo",
                  "mobNo",
                  "strn",
                  "email",
                ],
              },
            ],
          },
          {
            model: Role,
            as: "userRole",
            attributes: ["id", "name", "description"],
          },
        ],
      });

      return user;
    } catch (error) {
      console.error("Error fetching user:", error);
      throw error;
    }
  }

  // Get user by email with tenant assignments and role
  async getUserByEmail(email) {
    try {
      const user = await User.findOne({
        where: { email, isActive: true },
        include: [
          {
            model: UserTenantAssignment,
            where: { isActive: true },
            required: false,
            include: [
              {
                model: Tenant,
                attributes: [
                  "id",
                  "tenant_id",
                  "seller_business_name",
                  "seller_ntn_cnic",
                  "seller_full_ntn",
                  "seller_province",
                  "seller_address",
                  "database_name",
                  "is_active",
                  "created_at",
                  "sandboxTestToken",
                  "sandboxProductionToken",
                  "telNo",
                  "mobNo",
                  "strn",
                  "email",
                ],
              },
            ],
          },
          {
            model: Role,
            as: "userRole",
            attributes: ["id", "name", "displayName", "description", "isSystemRole"],
          },
        ],
      });

      return user;
    } catch (error) {
      console.error("Error fetching user by email:", error);
      throw error;
    }
  }

  // Update user
  async updateUser(userId, updateData) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Hash password if provided
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 12);
      }

      await user.update(updateData);
      return user;
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  }

  // Delete user (soft delete by setting isActive to false)
  async deleteUser(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Deactivate user
      await user.update({ isActive: false });

      // Deactivate all tenant assignments
      await UserTenantAssignment.update(
        { isActive: false },
        { where: { userId } }
      );

      return user;
    } catch (error) {
      console.error("Error deleting user:", error);
      throw error;
    }
  }

  // Update tenant details
  async updateTenant(tenantId, updateData) {
    try {
      const tenant = await Tenant.findByPk(tenantId);

      if (!tenant) {
        throw new Error("Tenant not found");
      }

      // Update only allowed fields
      const allowedFields = [
        "seller_business_name",
        "seller_province",
        "seller_address",
        "seller_full_ntn",
        "telNo",
        "mobNo",
        "strn",
        "email",
      ];

      const updateFields = {};
      allowedFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      });

      // Map camelCase/snake_case to model fields
      if (updateData.sellerBusinessName !== undefined) {
        updateFields.seller_business_name = updateData.sellerBusinessName;
      }
      if (updateData.sellerProvince !== undefined) {
        updateFields.seller_province = updateData.sellerProvince;
      }
      if (updateData.sellerAddress !== undefined) {
        updateFields.seller_address = updateData.sellerAddress;
      }
      if (updateData.sellerFullNTN !== undefined) {
        updateFields.seller_full_ntn = updateData.sellerFullNTN;
      }
      if (updateData.telNo !== undefined) {
        updateFields.telNo = updateData.telNo;
      }
      if (updateData.tel_no !== undefined) {
        updateFields.telNo = updateData.tel_no;
      }
      if (updateData.mobNo !== undefined) {
        updateFields.mobNo = updateData.mobNo;
      }
      if (updateData.mob_no !== undefined) {
        updateFields.mobNo = updateData.mob_no;
      }
      if (updateData.strn !== undefined) {
        updateFields.strn = updateData.strn;
      }
      if (updateData.email !== undefined) {
        updateFields.email = updateData.email;
      }

      await tenant.update(updateFields);

      // Return updated tenant with mapped fields
      return {
        id: tenant.id,
        tenant_id: tenant.tenant_id,
        sellerNTNCNIC: tenant.seller_ntn_cnic,
        sellerFullNTN: tenant.seller_full_ntn,
        sellerBusinessName: tenant.seller_business_name,
        sellerProvince: tenant.seller_province,
        sellerAddress: tenant.seller_address,
        telNo: tenant.telNo,
        mobNo: tenant.mobNo,
        strn: tenant.strn,
        email: tenant.email,
        database_name: tenant.database_name,
        sandboxTestToken: tenant.sandbox_test_token,
        sandboxProductionToken: tenant.sandbox_production_token,
        is_active: Boolean(tenant.is_active), // Convert MySQL boolean to JavaScript boolean
        created_at: tenant.created_at,
      };
    } catch (error) {
      console.error("Error updating tenant:", error);
      throw error;
    }
  }

  // Get all tenants for assignment
  async getAllTenants() {
    try {
      const tenants = await Tenant.findAll({
        where: { is_active: true },
        attributes: [
          "id",
          "tenant_id",
          "seller_ntn_cnic",
          "seller_full_ntn",
          "seller_business_name",
          "seller_province",
          "seller_address",
          "database_name",
          "is_active",
          "created_at",
          "sandbox_test_token",
          "sandbox_production_token",
          "tel_no",
          "mob_no",
          "strn",
          "email",
        ],
        order: [["seller_business_name", "ASC"]],
        raw: true,
      });

      // Map the data and convert boolean values
      const mappedTenants = tenants.map((tenant) => ({
        id: tenant.id,
        tenant_id: tenant.tenant_id,
        sellerNTNCNIC: tenant.seller_ntn_cnic,
        sellerFullNTN: tenant.seller_full_ntn,
        sellerBusinessName: tenant.seller_business_name,
        sellerProvince: tenant.seller_province,
        sellerAddress: tenant.seller_address,
        telNo: tenant.tel_no,
        mobNo: tenant.mob_no,
        strn: tenant.strn,
        email: tenant.email,
        is_active: Boolean(tenant.is_active), // Convert MySQL boolean to JavaScript boolean
        database_name: tenant.database_name,
        created_at: tenant.created_at,
        sandboxTestToken: tenant.sandbox_test_token,
        sandboxProductionToken: tenant.sandbox_production_token,
      }));

      return mappedTenants;
    } catch (error) {
      console.error("Error fetching tenants:", error);
      throw error;
    }
  }

  // Get users assigned to a specific tenant
  async getUsersByTenant(tenantId) {
    try {
      const assignments = await UserTenantAssignment.findAll({
        where: { tenantId, isActive: true },
        include: [
          {
            model: User,
            // Remove isActive filter to show all users (both active and blocked)
            attributes: [
              "id",
              "email",
              "firstName",
              "lastName",
              "phone",
              "role",
              "isActive",
            ],
          },
        ],
      });

      return assignments.map((assignment) => assignment.User);
    } catch (error) {
      console.error("Error fetching users by tenant:", error);
      throw error;
    }
  }
}

export default new UserManagementService();