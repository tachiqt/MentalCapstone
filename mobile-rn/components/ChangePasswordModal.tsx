import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError } from '../lib/api';
import { PasswordInput } from './PasswordInput';
import { BlurredModalBackdrop } from './ui/BlurredModalBackdrop';
import { SafeModalSheet } from './ui/SafeModalSheet';
import { Button } from './ui/Button';
import { alpha, colors, fonts, radii, spacing } from '../lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export function ChangePasswordModal({ visible, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCurrentPassword('');
    setPassword('');
    setConfirmation('');
    setError(null);
    setSaving(false);
  }, [visible]);

  const validate = (): string | null => {
    if (!currentPassword.trim()) return 'Enter your current password.';
    if (password.length < 8) return 'New password must be at least 8 characters.';
    if (!PASSWORD_RULE.test(password)) {
      return 'New password must include at least one letter and one number.';
    }
    if (password !== confirmation) return 'New password and confirmation do not match.';
    if (password === currentPassword) return 'Choose a password different from your current one.';
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api('/me/password', {
        method: 'PUT',
        body: {
          current_password: currentPassword,
          password,
          password_confirmation: confirmation,
        },
      });
      onClose();
      Alert.alert('Password updated', 'Your password was changed. Other devices were signed out.');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not update password.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.shell}>
        <BlurredModalBackdrop onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
        >
          <SafeModalSheet>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Change password</Text>
                <Text style={styles.subtitle}>
                  Use at least 8 characters with a letter and a number.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.close}
                onPress={onClose}
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Current password</Text>
              <PasswordInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Current password"
                autoComplete="password"
                textContentType="password"
                editable={!saving}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>New password</Text>
              <PasswordInput
                value={password}
                onChangeText={setPassword}
                placeholder="New password"
                autoComplete="password-new"
                textContentType="newPassword"
                editable={!saving}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirm new password</Text>
              <PasswordInput
                value={confirmation}
                onChangeText={setConfirmation}
                placeholder="Confirm new password"
                autoComplete="password-new"
                textContentType="newPassword"
                editable={!saving}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label={saving ? 'Updating…' : 'Update password'}
              icon="lock-closed-outline"
              loading={saving}
              onPress={handleSave}
            />
            <Button label="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
          </SafeModalSheet>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, justifyContent: 'flex-end' },
  root: { flex: 1, justifyContent: 'flex-end' },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: alpha.a16,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerCopy: { flex: 1, gap: 4 },
  title: { fontFamily: fonts.heading, fontSize: 20, color: colors.green900 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green50,
    borderWidth: 1,
    borderColor: colors.green100,
  },
  field: { gap: 6, marginBottom: spacing.sm },
  label: { fontFamily: fonts.headingSemi, fontSize: 13, color: colors.textSecondary },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
});
