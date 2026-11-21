import type { CapacitorConfig } from '@capacitor/cli';

// Android app settings. The app ships the built website (dist/) inside the
// APK, so it opens and works without internet from the first launch.
const config: CapacitorConfig = {
  appId: 'com.rkdigitals.jobflow',
  appName: 'JobFlow',
  webDir: 'dist',
  android: {
    backgroundColor: '#F5F5F4',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_jobflow',
      iconColor: '#F2D24B',
    },
    StatusBar: {
      backgroundColor: '#F5F5F4',
      style: 'LIGHT',
      overlaysWebView: false,
    },
  },
};

export default config;
