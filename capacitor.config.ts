import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cloudshare.app',
  appName: 'Cloud Share',
  webDir: 'public',
  server: {
    androidScheme: 'https'
  }
};

export default config;
