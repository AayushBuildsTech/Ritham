import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Image, Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { uploadFloorplan, generateVastu, reportCredits } from '../lib/reportService';
import { purchasePack } from '../lib/paymentService';
import { track } from '../lib/analytics';
import { REPORT_PRICES, paiseTo } from '../config/pricing';
import { Colors, Fonts, Spacing, Radius, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

const DIRECTIONS = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
const SHAPES = ['Regular (square / rectangle)', 'Irregular'];
const CONCERNS = ['General well-being', 'Career', 'Finances', 'Relationships', 'Health'];

export default function VastuIntake() {
  const th = useColors();
  const styles = makeStyles(th);
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [facing, setFacing] = useState('');
  const [shape, setShape] = useState('');
  const [kitchen, setKitchen] = useState('');
  const [masterBedroom, setMasterBedroom] = useState('');
  const [pooja, setPooja] = useState('');
  const [toilets, setToilets] = useState('');
  const [concern, setConcern] = useState('General well-being');

  const [image, setImage] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [busy, setBusy] = useState(false);      // validating / payment step
  const [generating, setGenerating] = useState(false); // report generation

  useEffect(() => { track('report_started', { type: 'vastu' }); }, []);

  async function pickFloorplan() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to upload your floor plan.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const a = res.assets[0];
    setImage({ uri: a.uri, base64: a.base64!, mimeType: a.mimeType ?? 'image/jpeg' });
  }

  async function generate() {
    if (!user || busy || generating) return;
    if (!facing) { Alert.alert('Almost there', 'Please select which direction your home faces.'); return; }
    if (!image) { Alert.alert('Floor plan needed', 'Please upload a photo of your floor plan.'); return; }

    // fill-first, pay-at-end: only charge if there isn't already an unused credit
    setBusy(true);
    const credits = await reportCredits('vastu');
    if (credits < 1) {
      const pay = await purchasePack('report', 'vastu', { contact: user.phone ?? '' });
      if (!pay.ok) {
        setBusy(false);
        if (pay.error !== 'cancelled') {
          Alert.alert('Payment not completed', 'Something went wrong. Please try again in a moment.');
        }
        return;
      }
      track('report_purchased', { type: 'vastu' });
    }

    const up = await uploadFloorplan(user.id, image.base64, image.mimeType);
    if (up.error || !up.path) {
      setBusy(false);
      Alert.alert('Upload failed', 'We couldn’t upload your floor plan. Please try again.');
      return;
    }

    setBusy(false);
    setGenerating(true);
    const answers: Record<string, string> = {
      name: name.trim() || 'Your Home',
      facing, shape, kitchen, master_bedroom: masterBedroom, pooja, toilets, concern,
    };
    const res = await generateVastu(answers, up.path);
    setGenerating(false);

    if (res.report_id) {
      track('report_generated', { type: 'vastu' });
      router.replace({ pathname: '/report-view', params: { id: res.report_id } });
      return;
    }
    if (res.error === 'needs_purchase') {
      Alert.alert('Purchase needed', 'Your report credit wasn’t found. Please try again from Reports.');
      return;
    }
    Alert.alert('Generation failed', 'We couldn’t generate your report just now. Please try again in a moment.');
  }

  if (generating) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={th.gold} size="large" />
        <Text style={styles.genTitle}>Preparing your Vaastu report…</Text>
        <Text style={styles.genSub}>Analysing your floor plan and directions. This can take up to a minute.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Vaastu Report" onBack={() => router.back()} />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>Tell us about your home and upload the floor plan. Your consultancy is generated from these.</Text>

        {/* Floor plan */}
        <Text style={styles.label}>FLOOR PLAN *</Text>
        <Pressable style={styles.upload} onPress={pickFloorplan} android_ripple={{ color: th.goldFaint }}>
          {image ? (
            <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <>
              <Icon name="camera" size={32} color={th.gold} />
              <Text style={styles.uploadText}>Tap to upload your floor plan</Text>
              <Text style={styles.uploadHint}>A clear photo or scan works best</Text>
            </>
          )}
        </Pressable>
        {image ? <Pressable onPress={pickFloorplan}><Text style={styles.changeLink}>Change image</Text></Pressable> : null}

        {/* Owner / home name */}
        <Text style={styles.label}>HOME / OWNER NAME</Text>
        <TextInput
          style={styles.input} placeholder="e.g. Sharma Residence" placeholderTextColor={th.textDim}
          value={name} onChangeText={setName}
        />

        <ChipField label="FACING DIRECTION *" options={DIRECTIONS} value={facing} onChange={setFacing} />
        <ChipField label="PLOT / HOUSE SHAPE" options={SHAPES} value={shape} onChange={setShape} />
        <ChipField label="KITCHEN LOCATION" options={DIRECTIONS} value={kitchen} onChange={setKitchen} />
        <ChipField label="MASTER BEDROOM" options={DIRECTIONS} value={masterBedroom} onChange={setMasterBedroom} />
        <ChipField label="POOJA ROOM" options={DIRECTIONS} value={pooja} onChange={setPooja} />
        <ChipField label="TOILETS" options={DIRECTIONS} value={toilets} onChange={setToilets} />
        <ChipField label="FOCUS OF THE READING" options={CONCERNS} value={concern} onChange={setConcern} />

        <Pressable style={[styles.generateBtn, busy && styles.btnDisabled]} onPress={generate} disabled={busy} android_ripple={{ color: th.goldDeep }}>
          {busy
            ? <ActivityIndicator color={th.goldContrast} />
            : <Text style={styles.generateText}>Continue · {paiseTo(REPORT_PRICES.vastu.price_paise)}</Text>}
        </Pressable>
        <Text style={styles.note}>You’ll pay only after your details are ready. One report per purchase.</Text>
        <View style={{ height: Spacing.xxl }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

function ChipField({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  const th = useColors();
  const styles = makeStyles(th);
  return (
    <View style={{ marginTop: Spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const active = value === o;
          return (
            <Pressable
              key={o}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(active ? '' : o)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  center: { flex: 1, backgroundColor: th.canvas, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  genTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, textAlign: 'center', marginTop: Spacing.md },
  genSub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, textAlign: 'center', lineHeight: 20 },

  lead: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, lineHeight: 20, marginTop: Spacing.xs, marginBottom: Spacing.lg },

  label: { fontFamily: Fonts.bodySemibold, color: th.textMuted, fontSize: Fonts.size.xs, letterSpacing: 1.5, marginBottom: Spacing.sm, marginTop: Spacing.xs },
  input: {
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm, padding: Spacing.md,
    color: th.text, backgroundColor: th.surfaceSunken, fontFamily: Fonts.body, fontSize: Fonts.size.md,
  },

  upload: {
    borderWidth: 1, borderColor: th.borderStrong, borderStyle: 'dashed', borderRadius: Radius.md,
    backgroundColor: th.surface, alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.xl, minHeight: 160, overflow: 'hidden', gap: 6,
  },
  uploadText: { fontFamily: Fonts.bodySemibold, color: th.text, fontSize: Fonts.size.md, marginTop: 6 },
  uploadHint: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs },
  preview: { width: '100%', height: 220, borderRadius: Radius.sm },
  changeLink: { fontFamily: Fonts.bodyMedium, color: th.goldLight, fontSize: Fonts.size.sm, marginTop: Spacing.sm, alignSelf: 'center' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.pill, backgroundColor: th.surfaceSunken,
    paddingVertical: 8, paddingHorizontal: Spacing.md,
  },
  chipActive: { backgroundColor: th.gold, borderColor: th.gold },
  chipText: { fontFamily: Fonts.bodyMedium, color: th.textMuted, fontSize: Fonts.size.sm },
  chipTextActive: { fontFamily: Fonts.bodySemibold, color: th.goldContrast },

  generateBtn: {
    backgroundColor: th.gold, borderRadius: Radius.sm, paddingVertical: 15,
    alignItems: 'center', marginTop: Spacing.xl,
  },
  generateText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.6 },
  note: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm },
});
