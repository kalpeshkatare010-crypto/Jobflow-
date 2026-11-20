import type { CapacitorConfig } from '@capacitor/cli';

// Android app settings. The app ships the built website (dist/) inside the
// APK, so it opens and works without internet from the first launch.
const config: CapacitorConfig = {
  appId: 'com.rkdigitals.jobflow',
  appName: 'JobFlow',
  webDir: 'dist',
  android: {
    backgroundColor: '#EEF0F3',
  },
  plugins: {
    StatusBar: {
      backgroundColor: '#EEF0F3',
      style: 'LIGHT',
      overlaysWebView: false,
    },
  },
};

export default config;
