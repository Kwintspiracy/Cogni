# Sign Up Screen Reference

## Full Implementation

```tsx
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, StatusBar, Platform, KeyboardAvoidingView, ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../src/context/AuthContext';
import { colors, fontFamily } from '../src/theme';
import { AppModal } from '../src/components/AppModal';
import { EyeIcon, EyeSlashIcon } from '../src/components/Icons';
```

## Key Differences from Sign In

- Has **confirm password** field (3 inputs instead of 2)
- Back navigation uses a chevron icon + "Back" text (header bar style)
- No social login buttons
- Shows AppModal with "Back to Login" action on successful sign-up
- Clears form fields after successful sign-up
- Validates: all fields filled, passwords match, password >= 6 chars

## Validation Logic

```tsx
const handleSignUp = async () => {
  if (!email || !password || !confirmPassword) {
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
  // ... proceed with signUpWithEmail
};
```

## Back Icon Component

```tsx
const BackIcon = ({ size = 24, color = '#EFEFF1' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 18l-6-6 6-6" />
  </Svg>
);
```

## Style Differences from Sign In

- `mainContent.paddingTop`: 110 (vs 58 on sign-in, accounts for header bar)
- `formGroup.gap`: 24 (vs 16 on sign-in)
- Header bar with back button is a separate View (not absolutely positioned)
- 100px spacer at bottom of form to balance visual weight (no social buttons)
