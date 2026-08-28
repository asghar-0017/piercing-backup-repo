import * as React from "react";
import { styled, useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import CssBaseline from "@mui/material/CssBaseline";
import MuiAppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import { IoIosCreate } from "react-icons/io";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { IoLogOut } from "react-icons/io5";
import InboxIcon from "@mui/icons-material/MoveToInbox";
import { BsFileTextFill } from "react-icons/bs";
import { FaWallet } from "react-icons/fa";
import MailIcon from "@mui/icons-material/Mail";
import CreateInvoice from "../pages/createInvoiceForm";
import { RiHome2Fill } from "react-icons/ri";
import {
  href,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import YourInvoices from "../pages/YourInvoices";
import LogoutIcon from "@mui/icons-material/Logout";
import {
  Button,
  Chip,
  Avatar,
  Menu,
  MenuItem,
  ListItemAvatar,
  Collapse,
} from "@mui/material";
import { useAuth } from "../Context/AuthProvider";
import { useTenantSelection } from "../Context/TenantSelectionProvider";
import { FaBusinessTime } from "react-icons/fa6";
import { FaUsers } from "react-icons/fa";
import { FaChartBar } from "react-icons/fa";
import { FaClipboardList } from "react-icons/fa";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import Footer from "./Footer";
import PasswordUpdateMenuMount from "./PasswordUpdateMenuMount";
import ProfileMenuMount from "./ProfileMenuMount";
import PermissionGate from "./PermissionGate";
import { usePermissions } from "../hooks/usePermissions";
// import productionForm  from "../pages/productionForm"

const drawerWidth = 240;

const Main = styled("main", { shouldForwardProp: (prop) => prop !== "open" })(
  ({ theme }) => ({
    flexGrow: 1,
    padding: theme.spacing(3),
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    marginLeft: `-${drawerWidth}px`,
    variants: [
      {
        props: ({ open }) => open,
        style: {
          transition: theme.transitions.create("margin", {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
          }),
          marginLeft: 0,
        },
      },
    ],
  })
);

const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== "open",
})(({ theme }) => ({
  backgroundColor: "#2A69B0",
  color: "white",
  transition: theme.transitions.create(["margin", "width"], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  variants: [
    {
      props: ({ open }) => open,
      style: {
        width: `calc(100% - ${drawerWidth}px)`,
        marginLeft: `${drawerWidth}px`,
        transition: theme.transitions.create(["margin", "width"], {
          easing: theme.transitions.easing.easeOut,
          duration: theme.transitions.duration.enteringScreen,
        }),
      },
    },
  ],
}));

const DrawerHeader = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  padding: theme.spacing(0, 1),
  // necessary for content to be below app bar
  ...theme.mixins.toolbar,
  justifyContent: "flex-end",
}));

export default function Sidebar({ onLogout }) {
  const theme = useTheme();
  const [open, setOpen] = React.useState(true); // Set to true for permanently open
  const { user } = useAuth();
  const { selectedTenant, isTenantSelected } = useTenantSelection();
  const { hasPermission, isAdmin } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: <RiHome2Fill />, permission: "dashboard.view" },
    { name: "Create Invoice", href: "/create-invoice", icon: <IoIosCreate />, permission: "invoice.create" },
    { name: "Invoice List", href: "/your-invoices", icon: <BsFileTextFill />, permission: "invoice.view" },
    { name: "Buyers", href: "/buyers", icon: <FaWallet />, permission: "buyer.view" },
    { name: "Products", href: "/products", icon: <InboxIcon />, permission: "product.view" },
    { name: "User Management", href: "/user-management", icon: <FaUsers />, permission: "read_user" },
    { name: "Audit Management", href: "/audit-management", icon: <FaClipboardList />, permission: "audit.view" },
    { 
      name: "Reports", 
      icon: <FaChartBar />, 
      hasSubmenu: true,
      permission: "report.view",
      submenu: [
        { name: "Sales Tax Summary", href: "/sales-report", icon: <FaChartBar />, permission: "report.view" }
      ]
    },
    { name: "logout" },
  ];

  // Custom function to check if a navigation item should be shown
  const shouldShowNavItem = (item) => {
    // If no permission required, always show
    if (!item.permission) return true;
    
    // Check if user has the required permission
    const hasRequiredPermission = hasPermission(item.permission);
    
    // Admin users should see all menu items
    if (isAdmin()) {
      return hasRequiredPermission;
    }
    
    // Removed special logic that was hiding menu items when users have report access
    // Users should have access to both individual features AND reports if they have the permissions
    
    // For all other items, use normal permission check
    return hasRequiredPermission;
  };

  // Add navigation items for users with multiple company assignments
  // For admin users: show if they have access to multiple companies (they have access to all)
  // For regular users: show if they have multiple companies assigned
  const shouldShowCompanySelection = () => {
    // Debug: Log user data in sidebar
    console.log("Sidebar: Current user:", user);
    console.log("Sidebar: User role:", user?.role);
    console.log("Sidebar: User type:", user?.type);
    console.log("Sidebar: Assigned tenants:", user?.assignedTenants);
    console.log("Sidebar: Number of assigned tenants:", user?.assignedTenants?.length || 0);

    if (isAdmin()) {
      // Admin users have access to all companies, so always show the option
      // The TenantManagement page will fetch all companies for admin users
      console.log("Sidebar: Admin user detected - showing Select Company");
      return true;
    } else {
      // Regular users: show only if they have multiple companies assigned
      const hasMultipleCompanies = Boolean(
        user?.assignedTenants &&
        Array.isArray(user.assignedTenants) &&
        user.assignedTenants.length > 1
      );
      console.log("Sidebar: Regular user - has multiple companies:", hasMultipleCompanies);
      return hasMultipleCompanies;
    }
  };

  if (shouldShowCompanySelection()) {
    // User with multiple company access - show tenant selection without permission check
    navItems.unshift({
      name: "Select Company",
      href: "/tenant-management",
      icon: <FaBusinessTime />
    });
  }

  // Removed drawer open/close handlers since sidebar is permanently open
  const handleLogoutClick = () => {
    onLogout();
    navigate("/"); // return to login screen
  };

  const [anchorEl, setAnchorEl] = React.useState(null);
  const [passwordModalOpen, setPasswordModalOpen] = React.useState(false);
  const [profileModalOpen, setProfileModalOpen] = React.useState(false);
  const [reportsOpen, setReportsOpen] = React.useState(false);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => setAnchorEl(null);

  const handleReportsToggle = () => {
    setReportsOpen(!reportsOpen);
  };

  const handleOpenPasswordModal = () => {
    setPasswordModalOpen(true);
    handleMenuClose();
  };

  const handleOpenProfileModal = () => {
    setProfileModalOpen(true);
    handleMenuClose();
  };

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppBar position="fixed" open={open}>
        <Toolbar>
          {/* Removed menu button since sidebar is permanently open */}
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{ fontFamily: '"Kumbh Sans", sans-serif', fontWeight: 700 }}
          >
            FBR Invoices
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={handleMenuOpen} color="inherit">
            <Avatar
              sx={{ width: 32, height: 32 }}
              src={user?.photo_profile || undefined}
            >
              {user?.email ? user.email.charAt(0).toUpperCase() : "U"}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            transformOrigin={{ horizontal: "right", vertical: "top" }}
            anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
          >
            <MenuItem disabled>
              <ListItemAvatar>
                <Avatar src={user?.photo_profile || undefined} />
              </ListItemAvatar>
              <Typography variant="body2">{user?.email}</Typography>
            </MenuItem>
            <Divider />
            {user?.role === "admin" && (
              <MenuItem onClick={handleOpenProfileModal}>Update Profile</MenuItem>
            )}
            <MenuItem onClick={handleOpenPasswordModal}>Change Password</MenuItem>
            <MenuItem onClick={handleLogoutClick}>Logout</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
        variant="persistent"
        anchor="left"
        open={open}
      >
        <DrawerHeader>
          {/* Logo at the top of sidebar */}
          {/* <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: "100%",
              padding: "16px",
            }}
          >
            <img
              src="/images/Pakprogressive.png"
              alt="Pak Progressive"
              style={{
                // maxWidth: "100%",
                width: "2500px",
                height: "100%",
                maxHeight: "60px",
                objectFit: "cover",
              }}
            />
          </Box> */}
        </DrawerHeader>
        <List>
          {navItems.map((item, index) => {
            const isLogout = item.name.toLowerCase() === "logout";
            const hasSubmenu = item.hasSubmenu;

            return isLogout ? (
              <ListItem key={item.name} disablePadding onClick={onLogout}>
                <ListItemButton
                  sx={{
                    borderRadius: "8px",
                    margin: "4px 8px",
                    "&:hover": {
                      backgroundColor: "#2A69B0",
                      "& .MuiListItemIcon-root": {
                        color: "white",
                      },
                      "& .MuiTypography-root": {
                        color: "white",
                      },
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: "black" }}>
                    <IoLogOut style={{ fontSize: 24 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Logout"
                    sx={{
                      "& .MuiTypography-root": {
                        color: "black",
                        fontWeight: 700,
                        fontFamily: '"Kumbh Sans", sans-serif !important',
                      },
                    }}
                    style={{ fontFamily: '"Kumbh Sans", sans-serif' }}
                  />
                </ListItemButton>
              </ListItem>
            ) : hasSubmenu ? (
              shouldShowNavItem(item) ? (
                <React.Fragment key={item.name}>
                  <ListItem disablePadding>
                    <ListItemButton
                      onClick={handleReportsToggle}
                      sx={{
                        borderRadius: "8px",
                        margin: "4px 8px",
                        backgroundColor: "transparent",
                        "&:hover": {
                          backgroundColor: "#2A69B0",
                          "& .MuiListItemIcon-root": {
                            color: "white",
                          },
                          "& .MuiTypography-root": {
                            color: "white",
                          },
                        },
                      }}
                    >
                      <ListItemIcon sx={{ color: "black" }}>
                        {item.icon ? (
                          React.cloneElement(item.icon, {
                            style: { fontSize: 24 },
                          })
                        ) : (
                          <InboxIcon sx={{ fontSize: 24 }} />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.name}
                        sx={{
                          "& .MuiTypography-root": {
                            color: "black",
                            fontWeight: 700,
                            fontFamily: '"Kumbh Sans", sans-serif !important',
                          },
                        }}
                        style={{ fontFamily: '"Kumbh Sans", sans-serif' }}
                      />
                      {reportsOpen ? <ExpandLess /> : <ExpandMore />}
                    </ListItemButton>
                  </ListItem>
                  <Collapse in={reportsOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      {item.submenu.map((subItem) => (
                        <PermissionGate key={subItem.name} permission={subItem.permission} hide adminOverride={true}>
                          <NavLink
                            to={subItem.href}
                            style={{ textDecoration: "none", color: "inherit" }}
                          >
                            <ListItem disablePadding>
                              <ListItemButton
                                sx={{
                                  borderRadius: "8px",
                                  margin: "4px 8px 4px 32px",
                                  backgroundColor:
                                    location.pathname === subItem.href
                                      ? "#2A69B0"
                                      : "transparent",
                                  "&:hover": {
                                    backgroundColor: "#2A69B0",
                                    "& .MuiListItemIcon-root": {
                                      color: "white",
                                    },
                                    "& .MuiTypography-root": {
                                      color: "white",
                                    },
                                  },
                                }}
                              >
                                <ListItemIcon
                                  sx={{
                                    color:
                                      location.pathname === subItem.href ? "white" : "black",
                                  }}
                                >
                                  {subItem.icon ? (
                                    React.cloneElement(subItem.icon, {
                                      style: { fontSize: 20 },
                                    })
                                  ) : (
                                    <InboxIcon sx={{ fontSize: 20 }} />
                                  )}
                                </ListItemIcon>
                                <ListItemText
                                  primary={subItem.name}
                                  sx={{
                                    "& .MuiTypography-root": {
                                      color:
                                        location.pathname === subItem.href ? "white" : "black",
                                      fontWeight: 600,
                                      fontFamily: '"Kumbh Sans", sans-serif !important',
                                      fontSize: '0.75rem',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    },
                                  }}
                                  style={{ fontFamily: '"Kumbh Sans", sans-serif' }}
                                />
                              </ListItemButton>
                            </ListItem>
                          </NavLink>
                        </PermissionGate>
                      ))}
                    </List>
                  </Collapse>
                </React.Fragment>
              ) : null
            ) : (
              shouldShowNavItem(item) ? (
                <NavLink
                  key={item.name}
                  to={item.href}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <ListItem disablePadding>
                    <ListItemButton
                      sx={{
                        borderRadius: "8px",
                        margin: "4px 8px",
                        backgroundColor:
                          location.pathname === item.href
                            ? "#2A69B0"
                            : "transparent",
                        "&:hover": {
                          backgroundColor: "#2A69B0",
                          "& .MuiListItemIcon-root": {
                            color: "white",
                          },
                          "& .MuiTypography-root": {
                            color: "white",
                          },
                        },
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          color:
                            location.pathname === item.href ? "white" : "black",
                        }}
                      >
                        {item.icon ? (
                          React.cloneElement(item.icon, {
                            style: { fontSize: 24 },
                          })
                        ) : index % 2 === 0 ? (
                          <InboxIcon sx={{ fontSize: 24 }} />
                        ) : (
                          <MailIcon sx={{ fontSize: 24 }} />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.name}
                        sx={{
                          "& .MuiTypography-root": {
                            color:
                              location.pathname === item.href ? "white" : "black",
                            fontWeight: 700,
                            fontFamily: '"Kumbh Sans", sans-serif !important',
                          },
                        }}
                        style={{ fontFamily: '"Kumbh Sans", sans-serif' }}
                      />
                    </ListItemButton>
                  </ListItem>
                </NavLink>
              ) : null
            );
          })}
        </List>

        <Divider />
      </Drawer>

      <Main open={open}>
        <DrawerHeader />
        <Outlet />
        <Footer />
        {/* Password Update Modal */}
        <PasswordUpdateMenuMount open={passwordModalOpen} setOpen={setPasswordModalOpen} />
        {/* Profile Update Modal - Only for Admin */}
        {user?.role === "admin" && (
          <ProfileMenuMount open={profileModalOpen} setOpen={setProfileModalOpen} />
        )}
      </Main>
    </Box>
  );
}
