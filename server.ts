import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
if (fs.existsSync(firebaseConfigPath)) {
  const config = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
  admin.initializeApp({
    projectId: config.projectId,
  });
} else {
  admin.initializeApp();
}

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    app.use(express.json());

    console.log("Starting server in mode:", process.env.NODE_ENV || "development");

  // API Route to delete Auth user
  app.post("/api/delete-user", async (req, res) => {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "UID is required" });
    }

    try {
      await admin.auth().deleteUser(uid);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting auth user:", error);
      
      // If user doesn't exist in Auth, we still consider it a success
      if (error.code === 'auth/user-not-found') {
        return res.json({ success: true, message: "User not found in Auth" });
      }

      // If Identity Toolkit API is disabled, we log it but allow the process to continue
      // because we can still delete the user's data from Firestore.
      if (error.message && error.message.includes('Identity Toolkit API')) {
        console.warn("Identity Toolkit API is disabled. Skipping Auth deletion but continuing with Firestore cleanup.");
        return res.json({ 
          success: true, 
          warning: "La cuenta de acceso no pudo ser eliminada (API deshabilitada), pero los datos del perfil han sido borrados." 
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
