import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import {
  Check,
  Lightbulb,
  MessageCircle,
  Pencil,
  Target,
} from 'lucide-react-native';
import { colors, designFonts, radius, spacing, typography, useAppAppearance } from '@/theme';

type GuidedActionTone = 'topic' | 'review' | 'share' | 'success' | 'needs';

const PANEL_BORDER_ACCENT_WIDTH = 3;
const PANEL_ICON_SIZE = 17;
const PANEL_ICON_STROKE_WIDTH = 2.4;
const PANEL_BUTTON_MIN_HEIGHT = spacing['3xl'] + spacing.sm;
const PANEL_ICON_TOP_ALIGNMENT_OFFSET = 1;
const PANEL_EYEBROW_LETTER_SPACING = 0.8;

interface GuidedActionButton {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}

export interface GuidedActionPanelProps {
  tone: GuidedActionTone;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  primaryAction?: GuidedActionButton;
  secondaryAction?: GuidedActionButton;
  compact?: boolean;
  compactActionLayout?: 'auto' | 'inline' | 'stacked';
  pressable?: boolean;
  testID?: string;
}

function ToneIcon({ tone, color }: { tone: GuidedActionTone; color: string }) {
  const iconProps = { color, size: PANEL_ICON_SIZE, strokeWidth: PANEL_ICON_STROKE_WIDTH };
  switch (tone) {
    case 'topic':
      return <Target {...iconProps} />;
    case 'review':
      return <MessageCircle {...iconProps} />;
    case 'share':
      return <Lightbulb {...iconProps} />;
    case 'success':
      return <Check {...iconProps} />;
    case 'needs':
      return <Pencil {...iconProps} />;
    default:
      return <Target {...iconProps} />;
  }
}

function getCompactButtonWidth(label: string): number {
  return Math.min(190, Math.max(76, label.length * 7 + 28));
}

export function GuidedActionPanel({
  tone,
  eyebrow,
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  compact = false,
  compactActionLayout = 'auto',
  pressable = false,
  testID,
}: GuidedActionPanelProps) {
  const { palette } = useAppAppearance();
  const accent = tone === 'success' ? palette.success : palette.accent;
  const actions = [secondaryAction, primaryAction].filter(Boolean) as GuidedActionButton[];
  const [panelWidth, setPanelWidth] = useState(0);
  const showPressableRow = pressable && !!primaryAction && !secondaryAction;
  const shouldRenderSubtitle = Boolean(subtitle) && !(compact && showPressableRow);
  const centerSingleLinePressable = showPressableRow && compact && !eyebrow && !shouldRenderSubtitle;
  const compactInlineActions =
    !showPressableRow &&
    compact &&
    actions.length > 0 &&
    compactActionLayout !== 'stacked' &&
    (compactActionLayout === 'inline' || panelWidth >= 390);
  const containerStyle: ViewStyle[] = [
    styles.container,
    ...(compact ? [styles.containerCompact] : []),
    { borderLeftColor: accent, backgroundColor: palette.bg, borderTopColor: palette.border },
  ];

  const content = (
    <>
      <View style={[styles.iconWrap, centerSingleLinePressable && styles.iconWrapCentered]}>
        <View style={[styles.icon, compact && styles.iconCompact, { backgroundColor: palette.chipBg }]}>
          <ToneIcon tone={tone} color={accent} />
        </View>
      </View>
      <View style={[
        styles.body,
        compactInlineActions && styles.bodyCompactWithAction,
        centerSingleLinePressable && styles.bodySingleLinePressable,
      ]}>
        <View style={styles.textBlock}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, compact && styles.eyebrowCompact, { color: accent }]}>{eyebrow}</Text>
          ) : null}
          <Text style={[styles.title, compact && styles.titleCompact, { color: palette.text }]}>{title}</Text>
          {shouldRenderSubtitle ? <Text style={[styles.subtitle, compact && styles.subtitleCompact, { color: palette.textMuted }]}>{subtitle}</Text> : null}
        </View>
        {!showPressableRow && actions.length > 0 ? (
          <View style={[
            styles.actions,
            compact && styles.actionsCompact,
            compactInlineActions && styles.actionsCompactInline,
            compact && !compactInlineActions && styles.actionsCompactStacked,
            actions.length === 1 && (!compact || compactInlineActions) && styles.actionsSingle,
          ]}>
            {actions.map((action) => {
              const isPrimary = action === primaryAction;
              return (
                <TouchableOpacity
                  key={action.label}
                  style={[
                    styles.button,
                    isPrimary
                      ? [styles.primaryButton, { backgroundColor: accent, borderColor: accent }]
                      : [styles.secondaryButton, { backgroundColor: palette.bgElev, borderColor: palette.border }],
                    compact && styles.buttonCompact,
                    compact && { minWidth: getCompactButtonWidth(action.label) },
                    action.disabled && styles.buttonDisabled,
                  ]}
                  onPress={action.onPress}
                  disabled={action.disabled || action.loading}
                  activeOpacity={0.75}
                  testID={action.testID}
                >
                  {action.loading ? (
                    <ActivityIndicator size="small" color={isPrimary ? '#fffaf0' : accent} />
                  ) : (
                    <Text style={[
                      styles.buttonText,
                      compact && styles.buttonTextCompact,
                      isPrimary ? [styles.primaryButtonText, { color: '#fffaf0' }] : [styles.secondaryButtonText, { color: accent }],
                    ]}>
                      {action.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
    </>
  );

  if (showPressableRow) {
    return (
      <TouchableOpacity
        style={containerStyle}
        testID={primaryAction.testID ?? testID}
        onLayout={(event) => setPanelWidth(event.nativeEvent.layout.width)}
        onPress={primaryAction.onPress}
        disabled={primaryAction.disabled || primaryAction.loading}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={primaryAction.label}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={containerStyle}
      testID={testID}
      onLayout={(event) => setPanelWidth(event.nativeEvent.layout.width)}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderLeftWidth: PANEL_BORDER_ACCENT_WIDTH,
  },
  containerCompact: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  iconWrap: {
    paddingTop: PANEL_ICON_TOP_ALIGNMENT_OFFSET,
  },
  iconWrapCentered: {
    paddingTop: 0,
    justifyContent: 'center',
  },
  icon: {
    width: spacing['3xl'],
    height: spacing['3xl'],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.userBg,
  },
  iconCompact: {
    width: spacing['2xl'],
    height: spacing['2xl'],
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  bodyCompactWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  bodySingleLinePressable: {
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: PANEL_EYEBROW_LETTER_SPACING,
    marginBottom: spacing.xs,
    fontFamily: designFonts.mono,
  },
  eyebrowCompact: {
    marginBottom: 2,
  },
  title: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    lineHeight: spacing.xl,
    color: colors.textPrimary,
    fontFamily: designFonts.sans,
  },
  titleCompact: {
    fontSize: typography.fontSize.base,
    lineHeight: spacing.lg,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: typography.fontSize.base,
    lineHeight: spacing.xl,
    color: colors.textSecondary,
    fontFamily: designFonts.sans,
  },
  subtitleCompact: {
    fontSize: typography.fontSize.sm,
    lineHeight: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionsCompact: {
    marginTop: spacing.sm,
  },
  actionsCompactInline: {
    marginTop: 0,
    flexShrink: 0,
  },
  actionsCompactStacked: {
    justifyContent: 'center',
  },
  actionsSingle: {
    justifyContent: 'flex-end',
  },
  button: {
    flex: 1,
    minHeight: PANEL_BUTTON_MIN_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonCompact: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: spacing['2xl'],
    minWidth: 72,
    paddingHorizontal: spacing.lg,
  },
  primaryButton: {},
  secondaryButton: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    fontFamily: designFonts.sans,
  },
  buttonTextCompact: {
    fontSize: typography.fontSize.sm,
    flexShrink: 0,
  },
  primaryButtonText: {
    color: colors.textOnAccent,
  },
  secondaryButtonText: {},
});

export default GuidedActionPanel;
