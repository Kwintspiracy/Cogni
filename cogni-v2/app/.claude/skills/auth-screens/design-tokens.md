# Design Tokens Reference

## Color Palette

```tsx
export const colors = {
  background: {
    primary: '#2C2F3A',    // Main screen background
    secondary: '#1F2129',  // Secondary surfaces
    tertiary: '#464B5D',   // Tertiary elements
  },
  text: {
    primary: '#EFEFF1',    // Main text (light on dark)
    secondary: '#9A9CAB',  // Subdued text (WCAG AA 4.5:1)
    muted: 'rgba(244, 244, 244, 0.4)',  // Placeholder text
    dark: '#1D1D1D',       // Text on light backgrounds
  },
  button: {
    primary: '#2C59FF',    // Main CTA blue
    danger: '#FA0439',     // Destructive actions
    secondary: '#2C2F3A',  // Secondary/ghost buttons
    dark: '#1D1D1D',       // Dark buttons (Apple sign-in, Create Account)
    white: '#F4F4F4',      // Light buttons (Google sign-in)
  },
  accent: {
    blue: '#518CFF',       // Links, back button
    red: '#FA0439',        // Errors
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.05)',  // Input borders
  },
  overlay: {
    modal: 'rgba(0, 0, 0, 0.7)',  // Modal backdrop
  },
  social: {
    googleBlue: '#4285F4',
    googleGreen: '#34A853',
    googleYellow: '#FBBC05',
    googleRed: '#EA4335',
  },
};
```

## Typography

```tsx
export const fontFamily = {
  primary: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto',
  secondary: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto',
};
```

## Common Measurements

| Token | Value | Usage |
|-------|-------|-------|
| Input padding | 16px vertical, 12px horizontal | All text inputs |
| Input border | 2px | Input field borders |
| Input border radius | 6px | Inputs and buttons |
| Button height | 48px | Primary and secondary buttons |
| Modal border radius | 32px | AppModal container |
| Content padding | 40px horizontal | Main content areas |
| Letter spacing | -0.41px | Most text elements |
| Section gap | 32px | Between major sections |
| Form gap | 24px | Between form groups |
| Input gap | 8px | Between input fields |
| Social button gap | 8px | Between Google/Apple buttons |

## AppModal Component

```tsx
interface AppModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'default' | 'error' | 'critical';  // Controls primary button color
  primaryAction?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
}
```

Modal styling:
- Overlay: black 70% opacity
- Container: white background (#EFEFF1), max-width 345px, border-radius 32px, padding 24px
- Title: dark text, 20px bold
- Message: dark text, 16px regular, line-height 21
- Buttons: 52px height, border-radius 26px (pill shape)
- Primary button: blue (#2C59FF) for default, red (#FA0439) for error/critical
- Secondary button: dark background (#1F2129)

## Icon Components

### EyeIcon / EyeSlashIcon
- Heroicons outline style (strokeWidth 1.5)
- Default size: 24px, used at 20px in auth forms
- Color: `colors.text.secondary` (#9A9CAB) in password fields

### GoogleIcon
- Official Google "G" logo with 4-color paths
- Default size: 15px

### AppleIcon
- Official Apple logo single path
- Default size: 16px
- Aspect ratio maintained via `(size * 13.02) / 16` width calculation
