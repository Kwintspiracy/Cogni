import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, StatusBar, Platform, KeyboardAvoidingView, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useAuthStore } from '@/stores/auth.store';

// ─── Icon Components ──────────────────────────────────────────────────────────

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

const BackIcon = ({ size = 24, color = '#EFEFF1' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SignUp() {
  const router = useRouter();
  const signUp = useAuthStore((state) => state.signUp);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSignUp = async () => {
    setError('');
    setSuccess('');

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await signUp(email.trim(), password);
      setSuccess('Check your email to confirm your account');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backButtonRow}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <BackIcon size={24} color="#EFEFF1" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>

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
              <Text style={styles.headerTitle}>Create Account</Text>
              <Text style={styles.headerSubtitle}>Join the Cortex</Text>
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
                    onChangeText={(text) => { setEmail(text); setError(''); setSuccess(''); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!loading}
                  />

                  {/* Password */}
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Password"
                      placeholderTextColor="rgba(244,244,244,0.4)"
                      value={password}
                      onChangeText={(text) => { setPassword(text); setError(''); setSuccess(''); }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      editable={!loading}
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {showPassword
                        ? <EyeSlashIcon size={20} color="#9A9CAB" />
                        : <EyeIcon size={20} color="#9A9CAB" />
                      }
                    </TouchableOpacity>
                  </View>

                  {/* Confirm Password */}
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="Confirm Password"
                      placeholderTextColor="rgba(244,244,244,0.4)"
                      value={confirmPassword}
                      onChangeText={(text) => { setConfirmPassword(text); setError(''); setSuccess(''); }}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleSignUp}
                      editable={!loading}
                    />
                    <TouchableOpacity
                      style={styles.eyeIcon}
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {showConfirmPassword
                        ? <EyeSlashIcon size={20} color="#9A9CAB" />
                        : <EyeIcon size={20} color="#9A9CAB" />
                      }
                    </TouchableOpacity>
                  </View>

                  {/* Inline error */}
                  {error !== '' && (
                    <Text style={styles.errorText}>{error}</Text>
                  )}

                  {/* Inline success */}
                  {success !== '' && (
                    <Text style={styles.successText}>{success}</Text>
                  )}
                </View>

                {/* Sign Up Button */}
                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleSignUp}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading
                    ? <ActivityIndicator color="#EFEFF1" size="small" />
                    : <Text style={styles.primaryButtonText}>Sign Up</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>

          </View>

          {/* Bottom spacer */}
          <View style={styles.spacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2C2F3A' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: '#EFEFF1', fontSize: 17, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto' },
  keyboardAvoid: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  mainContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 32, paddingHorizontal: 40, paddingTop: 110 },
  headerSection: { width: '100%', justifyContent: 'center', gap: 6 },
  headerTitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 32, fontWeight: '700', color: '#EFEFF1', letterSpacing: -0.41, lineHeight: 38, textAlign: 'left' },
  headerSubtitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 16, fontWeight: '400', color: '#9A9CAB', letterSpacing: -0.41, lineHeight: 16, textAlign: 'left' },
  formSection: { width: '100%', alignItems: 'center', gap: 24 },
  formGroup: { width: '100%', gap: 24 },
  inputGroup: { width: '100%', gap: 8 },
  input: { width: '100%', borderRadius: 6, borderWidth: 2, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'transparent', paddingVertical: 16, paddingHorizontal: 12, fontSize: 14, fontWeight: '500', color: '#EFEFF1', fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', lineHeight: 16 },
  errorText: { color: '#FA0439', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', marginTop: -10 },
  successText: { color: '#34A853', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', marginTop: -10 },
  primaryButton: { width: '100%', height: 48, backgroundColor: '#2C59FF', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 14, fontWeight: '600', color: '#EFEFF1', letterSpacing: -0.41 },
  spacer: { height: 100 },
  passwordContainer: { width: '100%', flexDirection: 'row', alignItems: 'center' },
  passwordInput: { paddingRight: 40 },
  eyeIcon: { position: 'absolute', right: 12 },
});
