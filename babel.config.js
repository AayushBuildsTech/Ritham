module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required by react-native-reanimated v4 (pulled in by
    // react-native-keyboard-controller). MUST be the last plugin.
    plugins: ['react-native-worklets/plugin'],
    // Strip all console.* calls from RELEASE builds so no debug logs (or any
    // value passed to them) reach logcat in production. Dev keeps them.
    env: {
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  };
};
