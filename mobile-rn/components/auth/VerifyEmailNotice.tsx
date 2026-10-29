import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { BlurredModalBackdrop } from '../ui/BlurredModalBackdrop';
import { colors, fonts, radii, shadows, spacing } from '../../lib/theme';

type Props = {
  visible: boolean;
  email: string;
  onClose: () => void;
};

type Status = { tone: 'idle' | 'sent' | 'error'; message: string };

/**
 * Shown when someone whose Head Doctor already invited them tries to sign in
 * before opening the verification link. The invite mail went out when the
 * account was created, so the only thing left to offer is another copy of it.
 */
export function VerifyEmailNotice({ visible, email, onClose }: Props) {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<Status>({ tone: 'idle', message: '' });

  const address = email.trim();

  const resend = async () => {
    setSending(true);
    setStatus({ tone: 'idle', message: '' });
    try {
      const result = await api<{ message?: string; mail_sent?: boolean }>(
        '/auth/resend-verification',
        { method: 'POST', body: { email: address } }
      );
      if (result?.mail_sent === true) {
        setStatus({
          tone: 'sent',
          message:
            result.message ||
            'Sent. Check your inbox, and your spam folder if it is not there.',
        });
      } else {
        setStatus({
          tone: 'error',
          message:
            result?.message ||
            'We could not send the email. Contact your Head Doctor to verify your account email or share a new verification link.',
        });
      }
    } catch (e: any) {
      setStatus({
        tone: 'error',
        message:
          e?.status === 429
            ? 'Too many requests. Wait a minute before asking for another link.'
            : e?.message || 'Could not resend the link. Try again in a moment.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setStatus({ tone: 'idle', message: '' });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.shell}>
        <BlurredModalBackdrop onPress={handleClose} />
        <View style={styles.backdrop} pointerEvents="box-none">
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.close}
            onPress={handleClose}
            accessibilityLabel="Close"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Ionicons name="mail-unread-outline" size={26} color={colors.green800} />
          </View>

          <Text style={styles.title}>Verify your email</Text>

          <Text style={styles.body}>We already sent a verification link to</Text>
          <Text style={styles.email}>{email}</Text>
          <Text style={styles.body}>
            Open that link to activate your account, then sign in again.
          </Text>

          {status.message ? (
            <View
              style={[
                styles.status,
                status.tone === 'sent' ? styles.statusOk : styles.statusError,
              ]}
            >
              <Ionicons
                name={status.tone === 'sent' ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={status.tone === 'sent' ? colors.green800 : colors.danger}
              />
              <Text
                style={[
                  styles.statusText,
                  status.tone === 'sent' ? styles.statusTextOk : styles.statusTextError,
                ]}
              >
                {status.message}
              </Text>
            </View>
          ) : null}

          <Button
            label={status.tone === 'sent' ? 'Send again' : 'Resend link'}
            onPress={resend}
            loading={sending}
            icon="paper-plane-outline"
            style={styles.action}
          />
        </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: 'rgba(8, 36, 34, 0.55)' },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 1,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.md,
  },
  close: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 1 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.green50,
    borderWidth: 1,
    borderColor: colors.green100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 19,
    color: colors.green900,
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  email: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.green800,
    textAlign: 'center',
    marginVertical: spacing.xs,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  statusOk: { backgroundColor: colors.green50, borderColor: colors.green100 },
  statusError: { backgroundColor: 'rgba(180, 35, 24, 0.06)', borderColor: 'rgba(180, 35, 24, 0.22)' },
  statusText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  statusTextOk: { color: colors.green800 },
  statusTextError: { color: colors.danger },
  action: { alignSelf: 'stretch', marginTop: spacing.lg },
});
