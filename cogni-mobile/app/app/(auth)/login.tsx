import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, StatusBar, Platform, KeyboardAvoidingView, ScrollView,
  Modal, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useAuthStore } from '@/stores/auth.store';

// ─── Icon Components ──────────────────────────────────────────────────────────

const GoogleIcon = ({ size = 15 }: { size?: number }) => (
  <Svg width={size} height={size + 1} viewBox="0 0 24 24">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </Svg>
);

const AppleIcon = ({ size = 16, color = '#EFEFF1' }: { size?: number; color?: string }) => (
  <Svg width={(size * 13.02) / 16} height={size} viewBox="0 0 14 17">
    <Path
      d="M13.0217 13.0312C12.7867 13.6006 12.4983 14.1233 12.1571 14.6001C11.6845 15.2595 11.2927 15.7163 10.984 15.9702C10.5058 16.3949 9.99463 16.6127 9.44912 16.6257C9.05577 16.6257 8.57824 16.5104 8.01967 16.2768C7.45949 16.0441 6.94343 15.9287 6.46996 15.9287C5.97365 15.9287 5.44285 16.0441 4.87652 16.2768C4.30946 16.5104 3.85466 16.6322 3.50964 16.6449C2.98644 16.6693 2.46293 16.4451 1.93869 15.9702C1.60561 15.6944 1.19643 15.2215 0.711841 14.5515C0.191772 13.8351 -0.238879 13.0054 -0.580148 12.0617C-0.945361 11.0412 -1.12836 10.0528 -1.12836 9.09613C-1.12836 7.99992 -0.890548 7.05212 -0.414282 6.25465C0.00919588 5.53911 0.565239 4.97586 1.25627 4.5638C1.94729 4.15173 2.69452 3.94188 3.49991 3.92896C3.91817 3.92896 4.46368 4.06149 5.13892 4.32291C5.81247 4.58502 6.24453 4.71755 6.43338 4.71755C6.57302 4.71755 7.05363 4.56312 7.87337 4.25502C8.64823 3.97016 9.29897 3.85112 9.82788 3.89499C11.2171 4.00771 12.2574 4.55826 12.9447 5.55013C11.7059 6.31172 11.0931 7.38117 11.1059 8.7543C11.1179 9.83398 11.5101 10.7398 12.28 11.4679C12.6192 11.7902 12.9992 12.042 13.4234 12.2241C13.2979 12.5138 13.1656 12.7911 13.0217 13.0312ZM9.92146 0.340287C9.92146 1.18591 9.61256 1.97636 8.99656 2.70845C8.25375 3.57972 7.35301 4.08318 6.37593 4.00328C6.36289 3.90411 6.35539 3.79987 6.35539 3.69038C6.35539 2.87913 6.70967 2.01201 7.33824 1.29961C7.65199 0.938994 8.05365 0.641058 8.54289 0.405807C9.03106 0.173963 9.49428 0.0455933 9.93164 0.0215454C9.9447 0.128123 9.92146 0.234678 9.92146 0.340287Z"
      fill={color}
      transform="translate(1.12836, 0)"
    />
  </Svg>
);

const EyeIcon = ({ size = 20, color = '#9A9CAB' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <Path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </Svg>
);

const EyeSlashIcon = ({ size = 20, color = '#9A9CAB' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3.98 8.223A10.477 10.477 0 001.934 12.222a1.012 1.012 0 000 .639C3.423 16.49 7.36 19.5 12 19.5c1.658 0 3.222-.39 4.61-1.088M6.228 6.228A10.45 10.45 0 0112 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639a10.523 10.523 0 01-4.191 5.455" />
    <Path d="M6.228 6.228L3 3M6.228 6.228l3.237 3.237M17.772 17.772L21 21M17.772 17.772l-3.237-3.237M14.535 14.535A3.001 3.001 0 019.465 9.465M14.535 14.535l-5.07-5.07" />
  </Svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Login() {
  const router = useRouter();

  const session = useAuthStore((state) => state.session);
  const signInWithEmail = useAuthStore((state) => state.signIn);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const signInWithApple = useAuthStore((state) => state.signInWithApple);
  const resetPasswordForEmail = useAuthStore((state) => state.resetPasswordForEmail);
  const resendConfirmationEmail = useAuthStore((state) => state.resendConfirmationEmail);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');

  const hasNavigated = useRef(false);

  useEffect(() => {
    if (session && !session.user.is_anonymous && !hasNavigated.current) {
      hasNavigated.current = true;
      router.replace('/(tabs)/feed');
    }
  }, [session]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      const isCancel =
        err.code === 'SIGN_IN_CANCELLED' || err.message?.toLowerCase().includes('cancel');
      if (!isCancel) {
        setError(err.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (!signInWithApple) return;
    setError('');
    setLoading(true);
    try {
      await signInWithApple();
    } catch (err: any) {
      const isCancel =
        err.code === 'SIGN_IN_CANCELLED' || err.message?.toLowerCase().includes('cancel');
      if (!isCancel) {
        setError(err.message || 'Apple sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetPasswordForEmail) return;
    if (!email.trim()) {
      setError('Enter your email address above, then tap Forgot Password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPasswordForEmail(email.trim());
      setModalTitle('Check your inbox');
      setModalMessage('A password reset link has been sent to ' + email.trim());
      setModalVisible(true);
    } catch (err: any) {
      setError(err.message || 'Could not send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!resendConfirmationEmail) return;
    setLoading(true);
    try {
      await resendConfirmationEmail(email.trim());
      setError('Confirmation email resent. Check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Could not resend confirmation email.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* ── Confirmation Modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
        accessibilityViewIsModal
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalContainer} onPress={() => {}}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Text style={styles.modalMessage}>{modalMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setModalVisible(false)}
              accessibilityLabel="Dismiss"
              accessibilityRole="button"
            >
              <Text style={styles.modalButtonText}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        accessibilityLabel="Go back"
        accessibilityRole="button"
        accessibilityHint="Returns to the previous screen"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.backButtonText}>{'← Back'}</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Main Content ── */}
          <View style={styles.mainContent}>

            {/* Header */}
            <View style={styles.headerSection}>
              <Text style={styles.headerTitle}>Sign in</Text>
              <Text style={styles.headerSubtitle}>Welcome back to COGNI</Text>
            </View>

            {/* Form */}
            <View style={styles.formSection}>
              <View style={styles.formGroup}>
                <View style={styles.inputGroup}>
                  {/* Email */}
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="rgba(244,244,244,0.4)"
                    value={email}
                    onChangeText={(text) => { setEmail(text); setError(''); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!loading}
                    accessibilityLabel="Email address"
                    accessibilityHint="Enter your email address"
                  />

                  {/* Password */}
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Password"
                      placeholderTextColor="rgba(244,244,244,0.4)"
                      value={password}
                      onChangeText={(text) => { setPassword(text); setError(''); }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleSignIn}
                      editable={!loading}
                      accessibilityLabel="Password"
                      accessibilityHint="Enter your password"
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                      accessibilityRole="button"
                      accessibilityHint={showPassword ? 'Hides password characters' : 'Shows password characters'}
                      accessibilityState={{ selected: showPassword }}
                    >
                      {showPassword
                        ? <EyeSlashIcon size={20} color="#9A9CAB" />
                        : <EyeIcon size={20} color="#9A9CAB" />
                      }
                    </TouchableOpacity>
                  </View>

                  {/* Inline error */}
                  {error !== '' && (
                    <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                      {error}
                      {error.toLowerCase().includes('verify') && resendConfirmationEmail && (
                        <>
                          {'  '}
                          <Text
                            style={styles.resendLink}
                            onPress={handleResendEmail}
                            accessibilityRole="link"
                            accessibilityLabel="Resend confirmation email"
                          >
                            Resend
                          </Text>
                        </>
                      )}
                    </Text>
                  )}
                </View>

                {/* Sign In Button */}
                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleSignIn}
                  disabled={loading}
                  activeOpacity={0.8}
                  accessibilityLabel="Sign in"
                  accessibilityRole="button"
                  accessibilityHint="Signs you in with your email and password"
                  accessibilityState={{ disabled: loading }}
                >
                  {loading
                    ? <ActivityIndicator color="#EFEFF1" size="small" />
                    : <Text style={styles.primaryButtonText}>Sign In</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>

            {/* Alternatively */}
            <Text style={styles.alternativelyText}>Alternatively</Text>

            {/* Social Buttons */}
            <View style={styles.socialButtonsGroup}>
              {/* Google */}
              <TouchableOpacity
                style={[styles.googleButton, loading && styles.primaryButtonDisabled]}
                onPress={handleGoogleSignIn}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityLabel="Continue with Google"
                accessibilityRole="button"
                accessibilityHint="Signs you in using your Google account"
                accessibilityState={{ disabled: loading }}
              >
                <GoogleIcon size={15} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>

              {/* Apple — only shown if method exists on store */}
              {signInWithApple && (
                <TouchableOpacity
                  style={[styles.appleButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleAppleSignIn}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityLabel="Continue with Apple"
                  accessibilityRole="button"
                  accessibilityHint="Signs you in using your Apple ID"
                  accessibilityState={{ disabled: loading }}
                >
                  <AppleIcon size={16} color="#EFEFF1" />
                  <Text style={styles.appleButtonText}>Continue with Apple</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Bottom Section ── */}
          <View style={styles.bottomSection}>
            <View style={styles.bottomContent}>
              {/* Create Account */}
              <TouchableOpacity
                style={[styles.createAccountButton, loading && styles.primaryButtonDisabled]}
                onPress={() => router.push('/(auth)/signup')}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityLabel="Create account"
                accessibilityRole="button"
                accessibilityHint="Opens the account registration screen"
                accessibilityState={{ disabled: loading }}
              >
                <Text style={styles.createAccountButtonText}>Create Account</Text>
              </TouchableOpacity>

              {/* Forgot Password */}
              {resetPasswordForEmail && (
                <TouchableOpacity
                  style={styles.forgotPasswordButton}
                  onPress={handleForgotPassword}
                  disabled={loading}
                  activeOpacity={0.7}
                  accessibilityLabel="Forgot password"
                  accessibilityRole="button"
                  accessibilityHint="Sends a password reset link to your email"
                  accessibilityState={{ disabled: loading }}
                >
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2C2F3A' },
  backButton: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 20, left: 16, zIndex: 10, paddingVertical: 8, paddingHorizontal: 8 },
  backButtonText: { color: '#518CFF', fontSize: 17, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto' },
  loadingContainer: { flex: 1, backgroundColor: '#2C2F3A', alignItems: 'center', justifyContent: 'center' },
  keyboardAvoid: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  mainContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 32, paddingHorizontal: 40, paddingTop: 58 },
  headerSection: { width: '100%', justifyContent: 'center', gap: 6 },
  headerTitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 32, fontWeight: '700', color: '#EFEFF1', letterSpacing: -0.41, lineHeight: 38, textAlign: 'left' },
  headerSubtitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 16, fontWeight: '400', color: '#9A9CAB', letterSpacing: -0.41, lineHeight: 16, textAlign: 'left' },
  formSection: { width: '100%', alignItems: 'center', gap: 24 },
  formGroup: { width: '100%', gap: 16 },
  inputGroup: { width: '100%', gap: 8 },
  input: { width: '100%', borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'transparent', paddingVertical: 16, paddingHorizontal: 12, fontSize: 14, fontWeight: '500', color: '#EFEFF1', fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', lineHeight: 16 },
  errorText: { color: '#FA0439', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', marginTop: -10 },
  resendLink: { color: '#518CFF', fontSize: 12, textDecorationLine: 'underline' },
  primaryButton: { width: '100%', height: 48, backgroundColor: '#2C59FF', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 14, fontWeight: '600', color: '#EFEFF1', letterSpacing: -0.41 },
  alternativelyText: { width: '100%', fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto', fontSize: 14, fontWeight: '500', color: '#EFEFF1', letterSpacing: -0.41, textAlign: 'center' },
  socialButtonsGroup: { width: '100%', gap: 8 },
  googleButton: { width: '100%', backgroundColor: '#F4F4F4', borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  googleButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 14, fontWeight: '600', color: '#1D1D1D', letterSpacing: -0.41, textAlign: 'center' },
  appleButton: { width: '100%', backgroundColor: '#1D1D1D', borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  appleButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 14, fontWeight: '600', color: '#EFEFF1', letterSpacing: -0.41 },
  bottomSection: { paddingHorizontal: 40, paddingTop: 24, paddingBottom: 40, alignItems: 'center', gap: 16 },
  bottomContent: { width: '100%', alignItems: 'center', gap: 16 },
  createAccountButton: { width: '100%', height: 48, backgroundColor: '#1D1D1D', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  createAccountButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto', fontSize: 14, fontWeight: '500', color: '#EFEFF1', letterSpacing: -0.41 },
  forgotPasswordButton: { backgroundColor: '#2C2F3A', borderRadius: 4, paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  forgotPasswordText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto', fontSize: 13, fontWeight: '300', color: '#EFEFF1', letterSpacing: -0.41, lineHeight: 14 },
  passwordContainer: { width: '100%', flexDirection: 'row', alignItems: 'center' },
  passwordInput: { paddingRight: 40 },
  eyeIcon: { position: 'absolute', right: 12 },
  // Modal styles (matching AppModal spec from skill)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalContainer: { backgroundColor: '#EFEFF1', width: '100%', maxWidth: 345, borderRadius: 32, padding: 24, gap: 12 },
  modalTitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 20, fontWeight: '700', color: '#1D1D1D', letterSpacing: -0.41 },
  modalMessage: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 16, fontWeight: '400', color: '#1D1D1D', lineHeight: 21, letterSpacing: -0.41 },
  modalButton: { height: 52, backgroundColor: '#2C59FF', borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  modalButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 15, fontWeight: '600', color: '#EFEFF1', letterSpacing: -0.41 },
});
