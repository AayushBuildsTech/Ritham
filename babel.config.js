module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required by react-native-reanimated v4 (pulled in by
    // react-native-keyboard-controller). MUST be the last plugin.
    plugins: ['react-native-worklets/plugin'],
  };
};
