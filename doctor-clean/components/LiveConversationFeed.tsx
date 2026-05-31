import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import type { ConversationTurn, MessageTranslation } from "@/lib/coordinationWorkspaceTypes";
import {
  langFlag,
  pickCachedTranslation,
  translateDoctorMessage,
} from "@/lib/doctorChatTranslationApi";
import { getDoctorPreferredLanguage } from "@/lib/doctorPreferredLanguage";

type BubbleStyleKey =
  | "bubblePatient"
  | "bubbleAi"
  | "bubbleHuman"
  | "bubbleDoctor"
  | "bubbleIntent"
  | "bubbleDraft"
  | "bubbleSystem";

type RoleMeta = {
  emoji: string;
  label: string;
  bubbleKey: BubbleStyleKey;
  labelColor: string;
  caption?: string;
};

const ROLE_META: Record<string, RoleMeta> = {
  patient: {
    emoji: "👤",
    label: "Hasta",
    bubbleKey: "bubblePatient",
    labelColor: "#1e40af",
  },
  ai: {
    emoji: "🤖",
    label: "AI Koordinatör",
    bubbleKey: "bubbleAi",
    labelColor: "#0369a1",
  },
  human: {
    emoji: "💬",
    label: "Klinik ekibi",
    bubbleKey: "bubbleHuman",
    labelColor: "#047857",
  },
  doctor: {
    emoji: "👨‍⚕️",
    label: "Doktor",
    bubbleKey: "bubbleDoctor",
    labelColor: "#7c2d12",
  },
  doctor_intent: {
    emoji: "👨‍⚕️",
    label: "Doktor rehberliği",
    bubbleKey: "bubbleIntent",
    labelColor: "#6b21a8",
    caption: "İç not — hastaya gönderilmez",
  },
  ai_draft: {
    emoji: "🤖",
    label: "AI taslağı",
    bubbleKey: "bubbleDraft",
    labelColor: "#4338ca",
    caption: "Onay bekliyor",
  },
  system: {
    emoji: "⚙️",
    label: "Sistem",
    bubbleKey: "bubbleSystem",
    labelColor: "#6b7280",
  },
};

function formatTime(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function metaForTurn(item: ConversationTurn): RoleMeta {
  if (item.kind === "system" || item.role === "system") {
    return ROLE_META.system;
  }
  return ROLE_META[item.role] || ROLE_META.system;
}

const NEAR_BOTTOM_PX = 96;

type Props = {
  turns: ConversationTurn[];
  patientName?: string;
  flex?: boolean;
  embedInParentScroll?: boolean;
  scrollKey?: string;
  bottomAnchorRef?: RefObject<View | null>;
  onEmbeddedContentChange?: () => void;
};

type TurnRowProps = {
  item: ConversationTurn;
  patientName?: string;
  doctorLang: string;
  translation?: MessageTranslation | null;
  translationVisible: boolean;
  translating: boolean;
  onOpenMenu: (item: ConversationTurn) => void;
};

function TurnRow({
  item,
  patientName,
  doctorLang,
  translation,
  translationVisible,
  translating,
  onOpenMenu,
}: TurnRowProps) {
  const meta = metaForTurn(item);
  const bubbleStyle = styles[meta.bubbleKey] as ViewStyle;
  const isSystem = item.kind === "system" || item.role === "system";
  const displayLabel = String(item.label || "").trim();
  const who =
    item.role === "patient" && patientName ? patientName : displayLabel || meta.label;

  return (
    <View style={[styles.turn, isSystem && styles.turnSystem]}>
      <View style={styles.turnHeader}>
        <Text style={[styles.who, { color: meta.labelColor }]}>
          {meta.emoji} {who}
          {item.at ? <Text style={styles.time}> · {formatTime(item.at)}</Text> : null}
        </Text>
        {!isSystem && String(item.text || "").trim() ? (
          <Pressable
            onPress={() => onOpenMenu(item)}
            hitSlop={8}
            style={styles.menuBtn}
            accessibilityLabel="Mesaj menüsü"
          >
            <Text style={styles.menuBtnText}>⋯</Text>
          </Pressable>
        ) : null}
      </View>
      {meta.caption ? <Text style={styles.caption}>{meta.caption}</Text> : null}
      {item.label && item.kind !== "system" ? (
        <Text style={styles.eventLabel}>{item.label}</Text>
      ) : null}
      <Pressable
        onLongPress={() => onOpenMenu(item)}
        delayLongPress={280}
        style={[styles.bubble, bubbleStyle, isSystem && styles.bubbleSystemOnly]}
      >
        <Text style={[styles.body, isSystem && styles.bodySystem]}>{item.text}</Text>
        {translationVisible && translation?.translatedText ? (
          <View style={styles.translationBlock}>
            <Text style={styles.translationLine}>
              {langFlag(translation.targetLanguage || doctorLang)}{" "}
              {translation.translatedText}
            </Text>
          </View>
        ) : null}
        {translating ? (
          <View style={styles.translatingRow}>
            <ActivityIndicator size="small" color="#64748b" />
            <Text style={styles.translatingText}>Çevriliyor…</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export function LiveConversationFeed({
  turns,
  patientName,
  flex,
  embedInParentScroll = false,
  scrollKey,
  bottomAnchorRef,
  onEmbeddedContentChange,
}: Props) {
  const listRef = useRef<FlatList<ConversationTurn>>(null);
  const userNearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const lastTurnIdRef = useRef<string | undefined>(undefined);

  const [doctorLang, setDoctorLang] = useState("tr");
  const [translationById, setTranslationById] = useState<Record<string, MessageTranslation>>({});
  const [visibleTranslationIds, setVisibleTranslationIds] = useState<Set<string>>(new Set());
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void getDoctorPreferredLanguage().then(setDoctorLang);
  }, []);

  useEffect(() => {
    if (!doctorLang || !turns.length) return;
    setTranslationById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const turn of turns) {
        if (next[turn.id]) continue;
        const cached = pickCachedTranslation(turn.translation, doctorLang);
        if (cached) {
          next[turn.id] = cached;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [turns, doctorLang]);

  const scrollListToLatest = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    userNearBottomRef.current = true;
    lastTurnIdRef.current = undefined;
  }, [scrollKey]);

  const onListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    userNearBottomRef.current =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM_PX;
  }, []);

  const toggleTranslationVisibility = useCallback((messageId: string, visible: boolean) => {
    setVisibleTranslationIds((prev) => {
      const next = new Set(prev);
      if (visible) next.add(messageId);
      else next.delete(messageId);
      return next;
    });
  }, []);

  const ensureTranslation = useCallback(
    async (item: ConversationTurn) => {
      const messageId = String(item.id || "").trim();
      if (!messageId) return null;

      const existing = translationById[messageId];
      if (existing?.translatedText) return existing;

      setTranslatingIds((prev) => new Set(prev).add(messageId));
      try {
        const lang = doctorLang || (await getDoctorPreferredLanguage());
        const res = await translateDoctorMessage(messageId, lang);
        const tr: MessageTranslation = {
          sourceLanguage: String(res.sourceLanguage || res.translation?.sourceLanguage || "auto"),
          targetLanguage: String(res.targetLanguage || res.translation?.targetLanguage || lang),
          translatedText: String(
            res.translatedText || res.translation?.translatedText || "",
          ).trim(),
          translatedAt: res.translation?.translatedAt,
        };
        if (!tr.translatedText) return null;
        setTranslationById((prev) => ({ ...prev, [messageId]: tr }));
        return tr;
      } catch {
        Alert.alert("Çeviri", "Mesaj çevrilemedi. Lütfen tekrar deneyin.");
        return null;
      } finally {
        setTranslatingIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      }
    },
    [doctorLang, translationById],
  );

  const openMessageMenu = useCallback(
    (item: ConversationTurn) => {
      const messageId = String(item.id || "").trim();
      const text = String(item.text || "").trim();
      if (!messageId || !text) return;

      const hasVisible = visibleTranslationIds.has(messageId);
      const hasTranslation = Boolean(translationById[messageId]?.translatedText);

      Alert.alert("", undefined, [
        {
          text: "📋 Copy",
          onPress: () => {
            void Clipboard.setStringAsync(text);
          },
        },
        {
          text: hasVisible ? "🌐 Hide Translation" : "🌐 Show Translation",
          onPress: () => {
            void (async () => {
              if (hasVisible) {
                toggleTranslationVisibility(messageId, false);
                return;
              }
              if (!hasTranslation) {
                const tr = await ensureTranslation(item);
                if (!tr) return;
              }
              toggleTranslationVisibility(messageId, true);
            })();
          },
        },
        { text: "İptal", style: "cancel" },
      ]);
    },
    [ensureTranslation, toggleTranslationVisibility, translationById, visibleTranslationIds],
  );

  useEffect(() => {
    if (embedInParentScroll) {
      if (turns.length > 0) onEmbeddedContentChange?.();
      return;
    }
    if (turns.length === 0) return;

    const lastId = turns[turns.length - 1]?.id;
    const isNewTail = lastId !== lastTurnIdRef.current;
    lastTurnIdRef.current = lastId;

    if (!initialScrollDoneRef.current) {
      const task = InteractionManager.runAfterInteractions(() => {
        scrollListToLatest(false);
        initialScrollDoneRef.current = true;
        userNearBottomRef.current = true;
      });
      return () => task.cancel();
    }

    if (isNewTail && userNearBottomRef.current) {
      scrollListToLatest(true);
    }
  }, [
    embedInParentScroll,
    turns,
    turns.length,
    turns[turns.length - 1]?.id,
    onEmbeddedContentChange,
    scrollListToLatest,
  ]);

  if (!turns.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Henüz mesaj yok</Text>
        <Text style={styles.emptyBody}>
          Hasta veya AI yanıtları burada görünür. Üstteki “Son hasta” özetinde metin varsa ↻ ile yenileyin.
        </Text>
      </View>
    );
  }

  const bottomAnchor = (
    <View ref={bottomAnchorRef} collapsable={false} style={styles.bottomAnchor} />
  );

  const renderTurn = (item: ConversationTurn) => (
    <TurnRow
      item={item}
      patientName={patientName}
      doctorLang={doctorLang}
      translation={translationById[item.id] || pickCachedTranslation(item.translation, doctorLang)}
      translationVisible={visibleTranslationIds.has(item.id)}
      translating={translatingIds.has(item.id)}
      onOpenMenu={openMessageMenu}
    />
  );

  if (embedInParentScroll) {
    return (
      <View style={[styles.list, styles.listEmbedded]}>
        {turns.map((item) => (
          <View key={item.id}>{renderTurn(item)}</View>
        ))}
        {bottomAnchor}
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={turns}
      keyExtractor={(item) => item.id}
      style={[styles.list, flex && styles.listFlex]}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => renderTurn(item)}
      onScroll={onListScroll}
      scrollEventThrottle={16}
      ListFooterComponent={bottomAnchor}
      onContentSizeChange={() => {
        if (!initialScrollDoneRef.current && turns.length > 0) {
          scrollListToLatest(false);
          initialScrollDoneRef.current = true;
          userNearBottomRef.current = true;
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 360 },
  listEmbedded: { maxHeight: undefined, paddingVertical: 8, gap: 14, paddingBottom: 16 },
  listFlex: { flex: 1, maxHeight: undefined },
  listContent: { paddingVertical: 8, gap: 14, paddingBottom: 16 },
  turn: { marginBottom: 2 },
  turnSystem: { marginVertical: 4 },
  turnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  who: { fontSize: 12, fontWeight: "700", marginBottom: 2, flex: 1 },
  time: { fontWeight: "400", color: "#9ca3af" },
  menuBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  menuBtnText: { fontSize: 16, lineHeight: 18, color: "#6b7280", fontWeight: "700" },
  caption: { fontSize: 10, color: "#9ca3af", marginBottom: 4, fontStyle: "italic" },
  eventLabel: { fontSize: 10, color: "#6b7280", marginBottom: 4, fontWeight: "600" },
  bubble: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  bubblePatient: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleAi: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleHuman: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleDoctor: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleIntent: {
    backgroundColor: "#faf5ff",
    borderColor: "#e9d5ff",
    borderStyle: "dashed",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleDraft: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
    borderStyle: "dashed",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleSystem: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  bubbleSystemOnly: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  body: { fontSize: 14, lineHeight: 21, color: "#111827" },
  bodySystem: { fontSize: 12, color: "#4b5563", textAlign: "center" },
  translationBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.35)",
  },
  translationLine: {
    fontSize: 13,
    lineHeight: 20,
    color: "#334155",
  },
  translatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  translatingText: { fontSize: 12, color: "#64748b" },
  empty: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flex: 1,
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 4 },
  emptyBody: { fontSize: 12, color: "#6b7280", textAlign: "center", lineHeight: 18 },
  bottomAnchor: { height: 1 },
});
