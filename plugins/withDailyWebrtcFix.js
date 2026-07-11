const { withProjectBuildGradle } = require('@expo/config-plugins');

// @daily-co/react-native-webrtc (pulled in by the Vapi voice-call SDK) depends on
// AndroidUSBCamera:libausbc, whose transitive `libuvc:3.3.3` fails to build on
// JitPack (its NDK build is broken upstream). `libuvc` is only the JNI used to open
// an EXTERNAL USB camera — never touched in an audio-only voice call — while the
// classes our build compiles against live in `libausbc` itself. So we exclude just
// the `libuvc` module: libausbc stays (WebRTC still compiles), and the unresolvable
// artifact is dropped. Applied at the root so it covers every subproject.
module.exports = function withDailyWebrtcFix(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes("module: 'libuvc'")) return cfg;
    cfg.modResults.contents += `
// @daily-co/react-native-webrtc pulls AndroidUSBCamera:libausbc, whose sibling
// modules (libuvc/libnative/libutils/libuvccommon) fail to build on JitPack. Only
// libausbc (which the code compiles against) is published; exclude the broken
// siblings. The UVC runtime path is disabled via a patch (isSupported -> false), so
// these native libs are never loaded on audio-only voice calls.
allprojects {
    configurations.all {
        exclude group: 'com.github.jiangdongguo.AndroidUSBCamera', module: 'libuvc'
        exclude group: 'com.github.jiangdongguo.AndroidUSBCamera', module: 'libnative'
        exclude group: 'com.github.jiangdongguo.AndroidUSBCamera', module: 'libutils'
        exclude group: 'com.github.jiangdongguo.AndroidUSBCamera', module: 'libuvccommon'
    }
}
`;
    return cfg;
  });
};
