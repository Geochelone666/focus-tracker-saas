const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Supabase's optional Node WebSocket import must use React Native's WebSocket,
// rather than bundling ws and Node core modules into an iOS/Android app.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws') return { type: 'sourceFile', filePath: require.resolve('./src/websocket.js') };
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
