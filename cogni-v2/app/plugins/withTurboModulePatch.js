const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin that patches RCTTurboModule.mm to fix the iOS 26 crash
 * in performVoidMethodInvocation when TurboModule void async methods throw
 * NSExceptions on background queues.
 *
 * See: https://github.com/facebook/react-native/issues/54859
 * See: https://github.com/reactwg/react-native-new-architecture/discussions/276
 */
function withTurboModulePatch(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosDir = config.modRequest.platformProjectRoot;

      // After prebuild, the RCTTurboModule.mm file is in the Pods directory
      const turboModulePath = findFile(
        path.join(iosDir, 'Pods'),
        'RCTTurboModule.mm'
      );

      if (!turboModulePath) {
        console.warn(
          '[withTurboModulePatch] Could not find RCTTurboModule.mm — skipping patch'
        );
        return config;
      }

      let source = fs.readFileSync(turboModulePath, 'utf-8');

      // Check if already patched
      if (source.includes('COGNI_TURBOMODULE_PATCH')) {
        console.log('[withTurboModulePatch] Already patched — skipping');
        return config;
      }

      // Patch: Replace the rethrow in performVoidMethodInvocation's @catch block
      // with a console error log instead of rethrowing (which crashes on iOS 26
      // because nothing catches the rethrown exception on the background queue).
      //
      // The original code does:
      //   @catch (NSException *exception) {
      //     throw convertNSExceptionToJSError(runtime, exception);
      //   }
      //
      // We replace it with safe error logging for void methods.
      const voidMethodPattern =
        /(performVoidMethodInvocation[\s\S]*?@catch\s*\(NSException\s*\*\s*exception\)\s*\{)\s*\n\s*throw\s+convertNSExceptionToJSError\s*\(\s*runtime\s*,\s*exception\s*\)\s*;/;

      if (voidMethodPattern.test(source)) {
        source = source.replace(
          voidMethodPattern,
          `$1
        // COGNI_TURBOMODULE_PATCH: Fixed for iOS 26 compatibility
        // Don't rethrow on background queue — nothing can catch it, causing SIGABRT
        // See: https://github.com/facebook/react-native/issues/54859
        NSLog(@"[TurboModule] NSException in void method: %@ — %@", exception.name, exception.reason);`
        );
        console.log('[withTurboModulePatch] Successfully patched RCTTurboModule.mm');
      } else {
        console.warn(
          '[withTurboModulePatch] Could not find the expected pattern in RCTTurboModule.mm — the file may have already been fixed in a newer React Native version'
        );
      }

      fs.writeFileSync(turboModulePath, source, 'utf-8');
      return config;
    },
  ]);
}

function findFile(dir, filename) {
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, filename);
      if (found) return found;
    } else if (entry.name === filename) {
      return fullPath;
    }
  }
  return null;
}

module.exports = withTurboModulePatch;
