import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bobx.ruzgarinizi',
  appName: 'Rüzgârın İzi',
  webDir: 'dist',
  backgroundColor: '#17221c',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#17221c',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
