# Cloud Share - Build Instructions

This document provides step-by-step instructions to build and export the Cloud Share application for Android (APK) and Windows (EXE).

## 1. Prerequisites

### For All Platforms:
- **Node.js**: Install the latest LTS version from [nodejs.org](https://nodejs.org/).
- **Git**: (Optional) For version control.

### For Android (APK):
- **Android Studio**: Install from [developer.android.com](https://developer.android.com/studio).
- **Android SDK**: Install API 33 (Android 13) or higher via Android Studio SDK Manager.
- **Java Development Kit (JDK)**: JDK 17 is recommended.
- **Capacitor CLI**: Installed via `npm install`.

### For Windows (EXE):
- **Windows OS**: Required for building Windows executables.

---

## 2. Setup

1. **Install Dependencies**:
   Open your terminal in the project root and run:
   ```powershell
   npm install
   ```

2. **Initialize Capacitor** (if not already done):
   ```powershell
   npm run cap:init
   ```

---

## 3. Building for Windows (EXE)

To generate a standalone Windows executable:

1. **Build the Electron App**:
   ```powershell
   npm run electron-build
   ```
2. **Output**: The `.exe` file will be located in the `dist/` directory.
   - `Cloud Share Setup.exe`: Full installer.
   - `Cloud Share Portable.exe`: No installation required.

---

## 4. Building for Android (APK)

### Step 1: Sync Web Assets
```powershell
npm run android:sync
```

### Step 2: Open in Android Studio
```powershell
npm run android:open
```

### Step 3: Build Signed APK
1. In Android Studio, go to **Build** > **Generate Signed Bundle / APK...**
2. Select **APK** and click **Next**.
3. Create a new **Key store path** or use an existing one.
4. Fill in the credentials and click **Next**.
5. Select **release** build variant.
6. Check **V1 (Jar Signature)** and **V2 (Full APK Signature)**.
7. Click **Finish**.

**Alternatively, for a quick debug APK**:
```powershell
npm run build:apk
```
The APK will be in `android/app/build/outputs/apk/release/app-release-unsigned.apk`.

---

## 5. Technology Stack
- **Backend**: Node.js, Express.js (File sharing logic)
- **Frontend**: HTML5, Tailwind CSS, JavaScript (Modern UI)
- **Mobile**: Capacitor (Cross-platform bridge)
- **Desktop**: Electron (Native wrapper for Windows)

---

## 6. Features
- **Cross-Platform**: Works on Android and Windows.
- **Responsive UI**: Glassmorphism design with Tailwind CSS.
- **Local Network Sharing**: Share files over Wi-Fi without internet.
- **Security**: Optional password protection for your shared files.
- **Performance**: High-speed transfers within local networks.
