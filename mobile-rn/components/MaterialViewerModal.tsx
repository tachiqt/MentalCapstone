import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { alpha, colors, fonts, radii, spacing } from '../lib/theme';
import {
  LearningMaterial,
  getMaterialFileUrl,
  getMediaKind,
  getTypeMeta,
  getMediaKindLabel,
} from '../lib/materials';

type Props = {
  material: LearningMaterial | null;
  visible: boolean;
  onClose: () => void;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PREVIEW_HEIGHT = Math.min(SCREEN_HEIGHT * 0.48, 420);

// Signed/public GCS URLs carry query strings, so the src must be attribute-escaped.
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mediaHtml(url: string, kind: 'video' | 'audio'): string {
  const src = escapeAttr(url);

  if (kind === 'video') {
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>body{margin:0;background:#111827;display:flex;align-items:center;justify-content:center;min-height:100vh}
      video{width:100%;max-height:100vh;background:#000}</style></head>
      <body><video controls playsinline src="${src}"></video></body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>body{margin:0;background:#F5F7F9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;font-family:sans-serif}
    audio{width:100%}</style></head>
    <body><audio controls src="${src}"></audio></body></html>`;
}

/**
 * Android's WebView has no built-in PDF renderer and downloads the file instead of
 * showing it. Public GCS objects are reachable by Google's viewer, so route through
 * it there; iOS renders PDFs inline on its own.
 */
function pdfViewerUrl(url: string): string {
  if (Platform.OS !== 'android') return url;
  return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
}

export function MaterialViewerModal({ material, visible, onClose }: Props) {
  const fileUrl = material ? getMaterialFileUrl(material) : null;
  const kind = material ? getMediaKind(material) : 'none';
  const meta = material ? getTypeMeta(material.type) : getTypeMeta(null);

  const openExternal = async () => {
    if (!fileUrl) return;
    await WebBrowser.openBrowserAsync(fileUrl);
  };

  if (!material) return null;

  const renderPreview = () => {
    if (!fileUrl) {
      return (
        <View style={[styles.previewBox, { backgroundColor: meta.background }]}>
          <Ionicons name={meta.icon as any} size={56} color={meta.accent} />
          <Text style={styles.previewHint}>No file attached yet</Text>
          <Text style={styles.previewSubhint}>This resource has details only.</Text>
        </View>
      );
    }

    if (kind === 'image') {
      return <Image source={{ uri: fileUrl }} style={styles.imagePreview} resizeMode="contain" />;
    }

    if (kind === 'video' || kind === 'audio') {
      return (
        <View style={styles.webWrap}>
          <WebView
            source={{ html: mediaHtml(fileUrl, kind) }}
            originWhitelist={['*']}
            style={styles.webView}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
          />
        </View>
      );
    }

    if (kind === 'pdf') {
      return (
        <View style={styles.webWrap}>
          <WebView
            source={{ uri: pdfViewerUrl(fileUrl) }}
            style={styles.webView}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
          />
        </View>
      );
    }

    return (
      <View style={[styles.previewBox, { backgroundColor: meta.background }]}>
        <Ionicons name="document-outline" size={56} color={meta.accent} />
        <Text style={styles.previewHint}>{getMediaKindLabel(kind)} file</Text>
        <Button label="Open file" onPress={openExternal} style={styles.openBtn} />
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.topMeta}>
            <Badge label={meta.label} tone="neutral" />
            {fileUrl ? <Badge label={getMediaKindLabel(kind)} tone="accent" /> : null}
          </View>
          {fileUrl ? (
            <TouchableOpacity style={styles.externalBtn} onPress={openExternal}>
              <Ionicons name="open-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.externalSpacer} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
          <View style={styles.viewer}>{renderPreview()}</View>
          <View style={styles.details}>
            <Text style={styles.title}>{material.title}</Text>
            {material.description ? <Text style={styles.description}>{material.description}</Text> : null}
            {material.uploader?.name ? (
              <Text style={styles.meta}>Uploaded by {material.uploader.name}</Text>
            ) : null}
            {material.tags && material.tags.length > 0 ? (
              <View style={styles.tags}>
                {material.tags.map((tag) => (
                  <Badge key={tag} label={tag} tone="neutral" />
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: alpha.a08,
    backgroundColor: colors.surface,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topMeta: { flexDirection: 'row', gap: 8, flex: 1, justifyContent: 'center' },
  externalBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  externalSpacer: { width: 40 },
  scroll: { paddingBottom: spacing.xxxl },
  viewer: { minHeight: PREVIEW_HEIGHT, backgroundColor: '#111827', justifyContent: 'center' },
  previewBox: {
    minHeight: PREVIEW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  previewHint: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.text },
  previewSubhint: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  imagePreview: { width: SCREEN_WIDTH, height: PREVIEW_HEIGHT },
  webWrap: { height: PREVIEW_HEIGHT, backgroundColor: colors.surface },
  webView: { flex: 1, backgroundColor: colors.surface },
  webLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  openBtn: { marginTop: spacing.sm, minWidth: 160 },
  details: { padding: spacing.lg, gap: spacing.sm },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.green900 },
  description: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
});
