import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.workflow.app",
  appName: "Workflow",
  webDir: "public",
  server: {
    // The APK is a thin wrapper around the Netlify app. Override this for a
    // preview build without changing the source or pointing at Cloudflare.
    url: process.env.CAPACITOR_APP_ORIGIN ?? "https://workflow-application.netlify.app",
    cleartext: false,
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      showSpinner: false,
    },
  },
};

export default config;
