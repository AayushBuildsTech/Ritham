import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { uploadFloorplan, generateVastu, reportCredits } from '../lib/reportService';
import { purchasePack } from '../lib/paymentService';
import { track } from '../lib/analytics';
import { REPORT_PRICES, paiseTo } from '../config/pricing';
import { Colors, Fonts, Spacing } from '../constants/theme';

const DIRECTIONS = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
const SHAPES = ['Regular (square / rectangle)', 'Irregular'];
const CONCERNS = ['General well-being', 'Career', 'Finances', 'Relationships', 'Health'];

export default function VastuIntake() {
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
        <ActivityIndicator color={Colors.gold} size="large" />
        <Text style={styles.genTitle}>Preparing your Vaastu report…</Text>
        <Text style={styles.genSub}>Analysing your floor plan and directions. This can take up to a minute.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.title}>Vaastu Report</Text>
        <View style={{ width: 48 }} />
      </View>

      <Text style={styles.lead}>Tell us about your home and upload the floor plan. Your consultancy is generated from these.</Text>

      {/* Floor plan */}
      <Text style={styles.label}>Floor plan *</Text>
      <TouchableOpacity style={styles.upload} onPress={pickFloorplan}>
        {image ? (
          <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />
        ) : (
          <>
            <Text style={styles.uploadIcon}>🗺️</Text>
            <Text style={styles.uploadText}>Tap to upload your floor plan</Text>
            <Text style={styles.uploadHint}>A clear photo or scan works best</Text>
          </>
        )}
      </TouchableOpacity>
      {image ? <TouchableOpacity onPress={pickFloorplan}><Text style={styles.changeLink}>Change image</Text></TouchableOpacity> : null}

      {/* Owner / home name */}
      <Text style={styles.label}>Home / owner name</Text>
      <TextInput
        style={styles.input} placeholder="e.g. Sharma Residence" placeholderTextColor={Colors.textDim}
        value={name} onChangeText={setName}
      />

      <ChipField label="Facing direction *" options={DIRECTIONS} value={facing} onChange={setFacing} />
      <ChipField label="Plot / house shape" options={SHAPES} value={shape} onChange={setShape} />
      <ChipField label="Kitchen location" options={DIRECTIONS} value={kitchen} onChange={setKitchen} />
      <ChipField label="Master bedroom" options={DIRECTIONS} value={masterBedroom} onChange={setMasterBedroom} />
      <ChipField label="Pooja room" options={DIRECTIONS} value={pooja} onChange={setPooja} />
      <ChipField label="Toilets" options={DIRECTIONS} value={toilets} onChange={setToilets} />
      <ChipField label="Focus of the reading" options={CONCERNS} value={concern} onChange={setConcern} />

      <TouchableOpacity style={[styles.generateBtn, busy && styles.btnDisabled]} onPress={generate} disabled={busy}>
        {busy
          ? <ActivityIndicator color={Colors.bg} />
          : <Text style={styles.generateText}>Continue · {paiseTo(REPORT_PRICES.vastu.price_paise)}</Text>}
      </TouchableOpacity>
      <Text style={styles.note}>You’ll pay only after your details are ready. One report per purchase.</Text>
    </ScrollView>
  );
}

function ChipField({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={{ marginTop: Spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const active = value === o;
          return (
            <TouchableOpacity
              key={o}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(active ? '' : o)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{o}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingTop: 52, paddingBottom: Spacing.xxl },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  genTitle: { fontSize: Fonts.size.lg, color: Colors.text, fontWeight: '700', textAlign: 'center', marginTop: Spacing.md },
  genSub: { fontSize: Fonts.size.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  back: { color: Colors.goldLight, fontSize: Fonts.size.md, width: 48 },
  title: { color: Colors.text, fontSize: Fonts.size.lg, fontWeight: '700' },
  lead: { color: Colors.textMuted, fontSize: Fonts.size.sm, lineHeight: 20, marginBottom: Spacing.lg },

  label: { color: Colors.goldLight, fontSize: Fonts.size.sm, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.xs },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: Spacing.md,
    color: Colors.text, backgroundColor: Colors.bgMid, fontSize: Fonts.size.md,
  },

  upload: {
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: 14,
    backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.xl, minHeight: 160, overflow: 'hidden',
  },
  uploadIcon: { fontSize: 40, marginBottom: Spacing.sm },
  uploadText: { color: Colors.text, fontSize: Fonts.size.md, fontWeight: '600' },
  uploadHint: { color: Colors.textDim, fontSize: Fonts.size.xs, marginTop: 4 },
  preview: { width: '100%', height: 220, borderRadius: 10 },
  changeLink: { color: Colors.goldLight, fontSize: Fonts.size.sm, marginTop: Spacing.sm, alignSelf: 'center' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 20, backgroundColor: Colors.bgMid,
    paddingVertical: 8, paddingHorizontal: Spacing.md,
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipText: { color: Colors.textMuted, fontSize: Fonts.size.sm, fontWeight: '600' },
  chipTextActive: { color: Colors.bg },

  generateBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: Spacing.md,
    alignItems: 'center', marginTop: Spacing.xl,
  },
  generateText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  note: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm },
});
