// AppRouter.js
import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
// Alternative import for production if server routing doesn't work:
// import { HashRouter as BrowserRouter, Route, Routes } from "react-router-dom";
import Sidebar from "../component/Sidebar";
import Login from "../pages/login";
import TenantLogin from "../pages/TenantLogin";
import { AuthProvider, useAuth } from "../Context/AuthProvider"; // <-- useAuth import karein
import { TenantProvider } from "../Context/TenantProvider";
import { TenantSelectionProvider } from "../Context/TenantSelectionProvider";
import ProtectedRoute from "../Context/ProtectedRoute";
import PermissionRoute from "../component/PermissionRoute";
import CreateInvoice from "../pages/createInvoiceForm";
import TenantDashboard from "../component/TenantDashboard";
import YourInvoices from "../pages/YourInvoices";
import EmailVerification from "../pages/EmailVerification";
import OTP from "../pages/OTP";
import ResetPassword from "../pages/ResetPassword";
import ForgotPassword from "../pages/ForgotPassword";
import RegisterUser from "../pages/RegisterUser";
import { RegisteredUsers } from "../pages/RegisteredUsers";
import Buyers from "../pages/Buyers";
import Products from "../pages/Products";
import TenantManagement from "../pages/TenantManagement";
import UserManagement from "../pages/UserManagement";
import SalesReport from "../pages/SalesReport";
import AuditManagement from "../pages/AuditManagement";
import RoleBasedRedirect from "../component/RoleBasedRedirect";

// import ProductionForm from "../pages/productionForm"

const SidebarWithLogout = () => {
  const { logout } = useAuth();
  return <Sidebar onLogout={logout} />;
};

const AppRouter = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <TenantSelectionProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/tenant-login" element={<TenantLogin />} />
              <Route
                path="/email-verification"
                element={<EmailVerification />}
              />
              <Route path="/otp" element={<OTP />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <SidebarWithLogout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<RoleBasedRedirect />} />
                <Route 
                  path="dashboard" 
                  element={
                    <PermissionRoute permission="dashboard.view">
                      <TenantDashboard />
                    </PermissionRoute>
                  } 
                />
                <Route 
                  path="create-invoice" 
                  element={
                    <PermissionRoute permission="invoice.create">
                      <CreateInvoice />
                    </PermissionRoute>
                  } 
                />
                <Route 
                  path="your-invoices" 
                  element={
                    <PermissionRoute permission="invoice.view">
                      <YourInvoices />
                    </PermissionRoute>
                  } 
                />
                <Route 
                  path="register-buyer" 
                  element={
                    <PermissionRoute permission="buyer.create">
                      <RegisterUser />
                    </PermissionRoute>
                  } 
                />
                <Route 
                  path="registered-users" 
                  element={
                    <PermissionRoute permission="buyer.view">
                      <RegisteredUsers />
                    </PermissionRoute>
                  } 
                />
                <Route 
                  path="buyers" 
                  element={
                    <PermissionRoute permission="buyer.view">
                      <Buyers />
                    </PermissionRoute>
                  } 
                />
                <Route 
                  path="products" 
                  element={
                    <PermissionRoute permission="product.view">
                      <Products />
                    </PermissionRoute>
                  } 
                />
                <Route 
                  path="sales-report" 
                  element={
                    <PermissionRoute permission="report.view" adminOverride={false}>
                      <SalesReport />
                    </PermissionRoute>
                  } 
                />
                <Route
                  path="tenant-management"
                  element={<TenantManagement />}
                />
                <Route 
                  path="user-management" 
                  element={
                    <PermissionRoute permission="read_user" adminOverride={true}>
                      <UserManagement />
                    </PermissionRoute>
                  } 
                />
                <Route 
                  path="audit-management" 
                  element={
                    <PermissionRoute permission="audit.view" adminOverride={true}>
                      <AuditManagement />
                    </PermissionRoute>
                  } 
                />
              </Route>
            </Routes>
          </TenantSelectionProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default AppRouter;
