import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firestoreDatabaseId: string | undefined;
let projectId: string | undefined;

if (fs.existsSync(firebaseConfigPath)) {
  const config = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
  projectId = config.projectId;
  firestoreDatabaseId = config.firestoreDatabaseId;
}

// We MUST use the projectId from the config to ensure we target the correct Firebase project
const firebaseApp = initializeApp({
  projectId: projectId
});

// In Firebase Admin 13+, getFirestore() can take the app and databaseId
// If firestoreDatabaseId is provided, we use it.
const db = firestoreDatabaseId 
  ? getFirestore(firebaseApp, firestoreDatabaseId)
  : getFirestore(firebaseApp);

const auth = getAuth(firebaseApp);

// Helper to log audit actions
async function logAuditAction(req: express.Request, {
  adminUid,
  adminName,
  targetUid,
  targetName,
  action,
  changes
}: {
  adminUid: string;
  adminName: string;
  targetUid: string;
  targetName: string;
  action: string;
  changes: { field: string; oldValue: any; newValue: any; }[];
}) {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    
    // Get admin email for logging
    let adminEmail = 'unknown';
    if (adminUid !== 'system') {
      const adminDoc = await db.collection('users').doc(adminUid).get();
      adminEmail = adminDoc.data()?.email || 'unknown';
    }

    // Get target email for logging
    let targetEmail = 'unknown';
    const targetDoc = await db.collection('users').doc(targetUid).get();
    targetEmail = targetDoc.data()?.email || 'unknown';

    await db.collection('audit_logs').add({
      timestamp: new Date().toISOString(),
      adminUid,
      adminName,
      adminEmail,
      targetUid,
      targetName,
      targetEmail,
      action,
      changes,
      ip: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
    });
  } catch (error) {
    console.error("Error creating audit log:", error);
  }
}

// Vacation calculation logic for server-side
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function calculateTotalEarnedDays(entryDateStr: string): number {
  if (!entryDateStr) return 0;
  const entryDate = parseDate(entryDateStr);
  const now = new Date();
  
  let yearsOfService = now.getFullYear() - entryDate.getFullYear();
  const m = now.getMonth() - entryDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < entryDate.getDate())) {
    yearsOfService--;
  }

  let total = 0;
  for (let i = 1; i <= yearsOfService; i++) {
    if (i <= 5) {
      total += 15;
    } else {
      const additional = Math.min(i - 5, 15);
      total += 15 + additional;
    }
  }

  const lastAnniversary = new Date(entryDate);
  lastAnniversary.setFullYear(entryDate.getFullYear() + yearsOfService);
  const monthsSinceAnniversary = now.getMonth() - lastAnniversary.getMonth() + (12 * (now.getFullYear() - lastAnniversary.getFullYear()));
  
  const currentYearEntitlement = yearsOfService < 5 ? 15 : (15 + Math.min(yearsOfService - 4, 15));
  total += Math.floor(monthsSinceAnniversary * (currentYearEntitlement / 12));

  return total;
}

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    app.set('trust proxy', true); // Trust proxy to get real IP
    app.use(express.json());

    console.log("Starting server in mode:", process.env.NODE_ENV || "development");

    // Recalculate all balances endpoint
    app.post("/api/admin/recalculate-all", async (req, res) => {
      const { adminUid } = req.body;
      if (!adminUid) return res.status(400).json({ error: "Admin UID is required" });

      try {
        const adminDoc = await db.collection('users').doc(adminUid).get();
        const adminData = adminDoc.data();
        const isSuperAdmin = adminData?.email === 'nmrm01@gmail.com' || adminData?.email === 'asis.tthh@compufacil.com.ec';
        const isAdmin = adminData?.role === 'hr' || adminData?.role === 'gerencia' || isSuperAdmin;

        if (!isAdmin) return res.status(403).json({ error: "Unauthorized" });

        const usersSnap = await db.collection('users').get();
        const requestsSnap = await db.collection('requests').get();
        const allRequests = requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

        let updatedCount = 0;

        for (const userDoc of usersSnap.docs) {
          const userData = userDoc.data();
          if (!userData.entryDate) continue;

          const userRequests = allRequests.filter(r => r.userUid === userDoc.id);
          
          let used = 0;
          let pending = 0;
          
          userRequests.forEach(req => {
            if (req.type === 'vacation' && req.status !== 'rejected' && req.status !== 'cancelled') {
              const start = parseDate(req.startDate);
              const end = parseDate(req.endDate);
              const diffTime = Math.abs(end.getTime() - start.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
              
              if (req.status === 'approved') {
                used += diffDays;
              } else if (req.status.startsWith('pending_')) {
                pending += diffDays;
              }
            }
          });
          
          const annualDays = calculateTotalEarnedDays(userData.entryDate);
          
          const changes = [];
          if (userData.usedVacationDays !== used) changes.push({ field: 'usedVacationDays', oldValue: userData.usedVacationDays, newValue: used });
          if (userData.pendingVacationDays !== pending) changes.push({ field: 'pendingVacationDays', oldValue: userData.pendingVacationDays, newValue: pending });
          if (userData.totalVacationDays !== annualDays) changes.push({ field: 'totalVacationDays', oldValue: userData.totalVacationDays, newValue: annualDays });

          if (changes.length > 0) {
            await userDoc.ref.update({
              usedVacationDays: used,
              pendingVacationDays: pending,
              totalVacationDays: annualDays,
              updatedAt: new Date().toISOString()
            });

            await logAuditAction(req, {
              adminUid,
              adminName: adminData?.displayName || 'Admin',
              targetUid: userDoc.id,
              targetName: userData.displayName || 'Usuario',
              action: 'recalculate_balance',
              changes
            });
            updatedCount++;
          }
        }

        res.json({ success: true, updatedCount });
      } catch (error: any) {
        console.error("Error recalculating all:", error);
        res.status(500).json({ error: error.message });
      }
    });

  // API Route to delete Auth user
  app.post("/api/delete-user", async (req, res) => {
    const { uid, adminUid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "UID is required" });
    }

    try {
      // Get target user info for logging
      const targetDoc = await db.collection('users').doc(uid).get();
      const targetData = targetDoc.data();
      
      // Get admin info
      let adminName = 'Sistema';
      if (adminUid) {
        const adminDoc = await db.collection('users').doc(adminUid).get();
        adminName = adminDoc.data()?.displayName || 'Admin';
      }

      await auth.deleteUser(uid);
      
      // Log the action
      await logAuditAction(req, {
        adminUid: adminUid || 'system',
        adminName,
        targetUid: uid,
        targetName: targetData?.displayName || 'Usuario Desconocido',
        action: 'delete_user',
        changes: [{ field: 'status', oldValue: 'active', newValue: 'deleted' }]
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting auth user:", error);
      
      // If user doesn't exist in Auth, we still consider it a success
      if (error.code === 'auth/user-not-found') {
        return res.json({ success: true, message: "User not found in Auth" });
      }

      // If Identity Toolkit API is disabled, we log it but allow the process to continue
      // because we can still delete the user's data from Firestore.
      if (error.message && (error.message.includes('Identity Toolkit API') || error.code === 'auth/internal-error')) {
        console.warn("Identity Toolkit API is disabled or internal error. Skipping Auth deletion but continuing with Firestore cleanup.");
        return res.json({ 
          success: true, 
          warning: "La cuenta de acceso no pudo ser eliminada (API deshabilitada en Google Cloud), pero los datos del perfil han sido borrados de la base de datos." 
        });
      }

      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Update User Data with Logging
  app.post("/api/admin/update-user", async (req, res) => {
    const { adminUid, targetUid, updates } = req.body;
    
    if (!adminUid || !targetUid || !updates) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      console.log(`Attempting to update user ${targetUid} by admin ${adminUid}`);
      // Verify admin status
      console.log(`Fetching admin doc for ${adminUid}...`);
      const adminDoc = await db.collection('users').doc(adminUid).get();
      const adminData = adminDoc.data();
      
      const isSuperAdmin = adminData?.email === 'nmrm01@gmail.com' || adminData?.email === 'asis.tthh@compufacil.com.ec';
      const isAdmin = adminData?.role === 'hr' || adminData?.role === 'gerencia' || isSuperAdmin;

      if (!isAdmin) {
        console.warn(`Unauthorized update attempt by ${adminUid}`);
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Get current data for logging
      console.log(`Fetching target doc for ${targetUid}...`);
      const targetDoc = await db.collection('users').doc(targetUid).get();
      if (!targetDoc.exists) {
        console.warn(`Target user ${targetUid} not found`);
        return res.status(404).json({ error: "User not found" });
      }
      const oldData = targetDoc.data() as any;

      // Identify changes
      const changes: { field: string; oldValue: any; newValue: any; }[] = [];
      for (const key in updates) {
        if (JSON.stringify(oldData[key]) !== JSON.stringify(updates[key])) {
          changes.push({
            field: key,
            oldValue: oldData[key] === undefined ? null : oldData[key],
            newValue: updates[key]
          });
        }
      }

      if (changes.length > 0) {
        // Perform update
        console.log(`Updating user ${targetUid} with changes:`, changes);
        await db.collection('users').doc(targetUid).update({
          ...updates,
          updatedAt: new Date().toISOString()
        });

        // Log changes
        console.log(`Logging audit action for ${targetUid}...`);
        await logAuditAction(req, {
          adminUid,
          adminName: adminData?.displayName || 'Admin',
          targetUid,
          targetName: oldData.displayName || 'Usuario',
          action: 'update_user',
          changes
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Update User Password
  app.post("/api/admin/update-password", async (req, res) => {
    const { adminUid, targetUid, newPassword } = req.body;
    
    if (!adminUid || !targetUid || !newPassword) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Verify admin status in Firestore
      const adminDoc = await db.collection('users').doc(adminUid).get();
      const adminData = adminDoc.data();
      
      const isSuperAdmin = adminData?.email === 'nmrm01@gmail.com' || adminData?.email === 'asis.tthh@compufacil.com.ec';
      const isAdmin = adminData?.role === 'hr' || adminData?.role === 'gerencia' || isSuperAdmin;

      if (!isAdmin) {
        return res.status(403).json({ error: "Unauthorized: Only admins can change passwords" });
      }

      // Get target info
      const targetDoc = await db.collection('users').doc(targetUid).get();
      const targetData = targetDoc.data();

      // Update password via Auth
      await auth.updateUser(targetUid, {
        password: newPassword
      });

      // Log the action
      await logAuditAction(req, {
        adminUid,
        adminName: adminData?.displayName || 'Admin',
        targetUid,
        targetName: targetData?.displayName || 'Usuario',
        action: 'update_password',
        changes: [{ field: 'password', oldValue: '********', newValue: '********' }]
      });

      res.json({ success: true, message: "Contraseña actualizada correctamente" });
    } catch (error: any) {
      console.error("Error updating user password by admin:", error);
      
      if (error.message && (error.message.includes('Identity Toolkit API') || error.code === 'auth/internal-error')) {
        return res.status(500).json({ 
          error: "No se pudo actualizar la contraseña porque la API de Autenticación (Identity Toolkit) está deshabilitada en el proyecto de Google Cloud. Por favor, contacta al administrador para habilitarla." 
        });
      }

      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
    if (process.env.NODE_ENV === "production") {
      const distPath = path.resolve(__dirname, 'dist');
      console.log("Serving static files from:", distPath);
      if (!fs.existsSync(distPath)) {
        console.error("DIST DIRECTORY NOT FOUND at:", distPath);
      }
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
