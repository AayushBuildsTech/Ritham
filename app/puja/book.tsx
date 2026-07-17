import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Image, ActivityIndicator, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useActiveProfile } from '../../context/ProfileContext';
import { Icon } from '../../components/Icon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SacredDivider } from '../../components/SacredDivider';
import { SelectModal, Option } from '../../components/SelectModal';
import {
  getPuja, getTier, getAddOn, PUJA_ADDONS, DAKSHINA, GOTRAS, GOTRA_HELP, L, paiseTo, computePujaTotalPaise,
} from '../../config/pujas';
import { fetchPujaSlot } from '../../lib/pujaSlot';
import { purchasePuja } from '../../lib/paymentService';
import { track } from '../../lib/analytics';

type Step = 0 | 1 | 2; // Offerings, Sankalp, Pay

export default function PujaBookScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { active } = useActiveProfile();
  const { pujaId, tierId } = useLocalSearchParams<{ pujaId: string; tierId: string }>();
  const tr = (l: L) => (isHindi ? l.hi : l.en);

  const puja = getPuja(String(pujaId));
  const tier = getTier(String(tierId));
  const maxDevotees = tier?.maxDevotees ?? 1;
  const perDevoteeGotra = tier?.perDevoteeGotra ?? false;

  const [step, setStep] = useState<Step>(0);
  // Bhet + dakshina
  const [addOns, setAddOns] = useState<Set<string>>(new Set());
  const [dakshinaPaise, setDakshinaPaise] = useState(0);
  const [customDakshina, setCustomDakshina] = useState('');
  // Sankalp
  const [names, setNames] = useState<string[]>(() => {
    const arr = Array(maxDevotees).fill('');
    if (active?.name) arr[0] = active.name;
    return arr;
  });
  const [gotras, setGotras] = useState<string[]>(() => Array(perDevoteeGotra ? maxDevotees : 1).fill(''));
  const [gotraModalIndex, setGotraModalIndex] = useState<number | null>(null);
  const [helpVisible, setHelpVisible] = useState(false);
  const [wish, setWish] = useState('');
  // Contact
  const [phone, setPhone] = useState('');
  // pay
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { track('puja_book_started', { pujaId, tierId }); }, []);

  const addOnIds = useMemo(() => [...addOns], [addOns]);
  const total = computePujaTotalPaise(String(tierId), addOnIds, dakshinaPaise);

  if (!puja || !tier) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Puja" onBack={() => router.back()} />
        <Text style={styles.missing}>{isHindi ? 'पूजा नहीं मिली।' : 'Puja not found.'}</Text>
      </View>
    );
  }

  const toggleAddOn = (id: string) => {
    setAddOns((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filledIdx = names.map((n, i) => (n.trim() ? i : -1)).filter((i) => i >= 0);
  const filledNames = filledIdx.map((i) => names[i].trim());
  const gotraFor = (i: number) => (perDevoteeGotra ? gotras[i] : gotras[0]) || '';
  const gotrasOut = filledIdx.map((i) => gotraFor(i) || gotras[0] || '');

  const canProceedSankalp =
    filledNames.length >= 1 &&
    (perDevoteeGotra ? filledIdx.every((i) => !!gotras[i]) : !!gotras[0]);
  const canPay = phone.trim().length >= 8;

  const showGotraHelp = () => setHelpVisible(true);

  const goNext = () => {
    setError('');
    if (step === 1 && !canProceedSankalp) {
      setError(isHindi ? 'कृपया हर भक्त का नाम और गोत्र चुनें।' : 'Please enter each devotee’s name and select a gotra.');
      return;
    }
    setStep((s) => (Math.min(2, s + 1) as Step));
  };
  const goBack = () => {
    setError('');
    if (step === 0) { router.back(); return; }
    setStep((s) => (Math.max(0, s - 1) as Step));
  };

  const onPay = async () => {
    setError('');
    const s = await fetchPujaSlot();
    if (Date.now() >= new Date(s.bookingCloseISO).getTime()) {
      setError(isHindi ? 'इस स्लॉट की बुकिंग बंद हो गई है — नया स्लॉट जल्द।' : 'Bookings for this slot have closed — next slot opening soon.');
      return;
    }
    if (!canPay) { setError(isHindi ? 'कृपया वैध व्हाट्सएप नंबर दर्ज करें।' : 'Please enter a valid WhatsApp number.'); return; }
    setPaying(true);
    const res = await purchasePuja(
      {
        pujaId: String(pujaId),
        tierId: String(tierId),
        addOnIds,
        dakshinaPaise,
        profileId: active?.id ?? null,
        sankalp: { devoteeNames: filledNames, gotra: gotras[0], gotras: gotrasOut, wish: wish.trim() || undefined },
        delivery: { phone: phone.trim() },
      },
      { contact: phone.trim(), name: filledNames[0] },
    );
    setPaying(false);
    if (res.ok) {
      router.replace({ pathname: '/puja/confirmation' as any, params: { amount: String(total), tier: tr(tier.label) } });
      return;
    }
    if (res.error === 'cancelled') return; // user dismissed — stay put, no error
    setError(payErrorMsg(res.error, isHindi));
  };

  const STEP_LABELS = isHindi ? ['भेंट', 'संकल्प', 'भुगतान'] : ['Offerings', 'Sankalp', 'Pay'];

  return (
    <View style={styles.root}>
      <ScreenHeader title={STEP_LABELS[step]} onBack={goBack} />

      {/* progress — connected gold stepper (labels centred under each dot) */}
      <View style={styles.progress}>
        <View style={styles.progressRow}>
          <View style={[styles.progressLine, { left: `${100 / (2 * STEP_LABELS.length)}%`, right: `${100 / (2 * STEP_LABELS.length)}%` }]} pointerEvents="none" />
          <View
            style={[styles.progressLineFill, {
              left: `${100 / (2 * STEP_LABELS.length)}%`,
              width: `${(100 - 100 / STEP_LABELS.length) * (STEP_LABELS.length > 1 ? step / (STEP_LABELS.length - 1) : 0)}%`,
            }]}
            pointerEvents="none"
          />
          {STEP_LABELS.map((lbl, i) => (
            <View key={lbl} style={styles.progressItem}>
              <View style={[styles.progressDot, i <= step && styles.progressDotOn]}>
                {i < step ? <Icon name="check" size={13} color={th.goldContrast} />
                  : <Text style={[styles.progressNum, i <= step && styles.progressNumOn]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.progressLbl, i === step && styles.progressLblOn]}>{lbl}</Text>
            </View>
          ))}
        </View>
      </View>

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        {step === 0 && (
          <StepBhet
            styles={styles} th={th} tr={tr} isHindi={isHindi}
            addOns={addOns} toggleAddOn={toggleAddOn}
            dakshinaPaise={dakshinaPaise} setDakshinaPaise={setDakshinaPaise}
            customDakshina={customDakshina} setCustomDakshina={setCustomDakshina}
          />
        )}
        {step === 1 && (
          <StepSankalp
            styles={styles} th={th} isHindi={isHindi} maxDevotees={maxDevotees} perDevoteeGotra={perDevoteeGotra}
            names={names} setNames={setNames} gotras={gotras}
            openGotra={(idx: number) => setGotraModalIndex(idx)} showGotraHelp={showGotraHelp}
            wish={wish} setWish={setWish}
          />
        )}
        {step === 2 && (
          <StepPay
            styles={styles} th={th} tr={tr} isHindi={isHindi}
            phone={phone} setPhone={setPhone}
            tierLabel={tr(tier.label)} tierPaise={tier.price_paise}
            addOnIds={addOnIds} dakshinaPaise={dakshinaPaise} total={total}
            names={filledNames} gotrasOut={gotrasOut}
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </KeyboardAwareScrollView>

      {/* sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <View>
          <Text style={styles.footerLabel}>{isHindi ? 'कुल राशि' : 'Total'}</Text>
          <Text style={styles.footerTotal}>{paiseTo(total)}</Text>
        </View>
        {step < 2 ? (
          <Pressable style={styles.nextBtnWrap} onPress={goNext} android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
            <LinearGradient colors={Accents.gold.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nextBtn}>
              <Text style={styles.nextBtnText}>{isHindi ? 'आगे' : 'Next'}</Text>
              <Icon name="arrowRight" size={16} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable style={[styles.nextBtnWrap, paying && styles.nextBtnDisabled]} onPress={onPay} disabled={paying} android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
            <LinearGradient colors={Accents.gold.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nextBtn}>
              {paying ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.nextBtnText}>{isHindi ? `भुगतान ${paiseTo(total)}` : `Pay ${paiseTo(total)}`}</Text>}
            </LinearGradient>
          </Pressable>
        )}
      </View>

      <SelectModal
        visible={gotraModalIndex !== null}
        title={isHindi ? 'गोत्र चुनें' : 'Select Gotra'}
        searchable
        options={GOTRAS.map<Option>((g) => ({ label: g, value: g }))}
        selectedValue={gotraModalIndex !== null ? gotras[gotraModalIndex] : undefined}
        onSelect={(v) => {
          setGotras((prev) => { const n = [...prev]; if (gotraModalIndex !== null) n[gotraModalIndex] = v; return n; });
          setGotraModalIndex(null);
        }}
        onClose={() => setGotraModalIndex(null)}
      />

      {/* Themed "don't know your gotra" help sheet */}
      <Modal visible={helpVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setHelpVisible(false)}>
        <Pressable style={styles.helpBackdrop} onPress={() => setHelpVisible(false)}>
          <Pressable style={styles.helpCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.helpIconWrap}>
              <Icon name="info" size={22} color={th.gold} />
            </View>
            <Text style={styles.helpTitle}>{isHindi ? 'गोत्र नहीं पता?' : "Don't know your Gotra?"}</Text>
            <Text style={styles.helpBody}>{tr(GOTRA_HELP)}</Text>
            <Pressable
              style={styles.helpCta}
              onPress={() => setHelpVisible(false)}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            >
              <Text style={styles.helpCtaText}>{isHindi ? 'समझ गया' : 'Got it'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function payErrorMsg(code: string | undefined, isHindi: boolean): string {
  if (code === 'payment_failed') return isHindi ? 'भुगतान विफल रहा। कृपया पुनः प्रयास करें।' : 'Payment failed. Please try again.';
  return isHindi ? 'कुछ गड़बड़ हुई। कृपया पुनः प्रयास करें।' : 'Something went wrong. Please try again.';
}

/* ── Step 1: Bhet + dakshina ─────────────────────────────────────────────── */
function StepBhet({
  styles, th, tr, isHindi, addOns, toggleAddOn, dakshinaPaise, setDakshinaPaise, customDakshina, setCustomDakshina,
}: any) {
  return (
    <>
      <Text style={styles.stepIntro}>
        {isHindi
          ? 'अपनी पूजा के साथ अग्नि तीर्थम् पर ये पवित्र भेंट अर्पित करें (वैकल्पिक)।'
          : 'Add these sacred offerings at Agni Theertham along with your puja (optional).'}
      </Text>

      {PUJA_ADDONS.map((a: any) => {
        const on = addOns.has(a.id);
        return (
          <Pressable key={a.id} style={[styles.addonCard, on && styles.addonCardOn]} onPress={() => toggleAddOn(a.id)}>
            <View style={styles.addonImgTile}>
              <Image source={a.image} style={styles.addonImg} resizeMode="contain" />
            </View>
            <View style={styles.flex1}>
              <View style={styles.addonTitleRow}>
                <Text style={styles.addonTitle}>{tr(a.name)}</Text>
              </View>
              <View style={styles.addonTagRow}>
                <Text style={styles.addonTag}>{tr(a.tagLabel)}</Text>
              </View>
              <Text style={styles.addonDesc} numberOfLines={3}>{tr(a.description)}</Text>
              <View style={styles.addonFooter}>
                <Text style={styles.addonPrice}>{paiseTo(a.price_paise)}</Text>
                <View style={[styles.addBtn, on && styles.addBtnOn]}>
                  <Icon name={on ? 'check' : 'plus'} size={13} color={on ? th.goldContrast : th.gold} />
                  <Text style={[styles.addBtnText, on && styles.addBtnTextOn]}>
                    {on ? (isHindi ? 'जोड़ा' : 'Added') : (isHindi ? 'जोड़ें' : 'Add')}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        );
      })}

      {/* Dakshina */}
      <View style={styles.dakshinaCard}>
        <Text style={styles.dakshinaTitle}>{tr(DAKSHINA.title)} 🙏</Text>
        <Text style={styles.dakshinaDesc}>{tr(DAKSHINA.description)}</Text>
        <View style={styles.dakshinaRow}>
          {DAKSHINA.presets_rupees.map((r: number) => {
            const paise = r * 100;
            const on = dakshinaPaise === paise;
            return (
              <Pressable
                key={r}
                style={[styles.dakChip, on && styles.dakChipOn]}
                onPress={() => { setDakshinaPaise(on ? 0 : paise); setCustomDakshina(''); }}
              >
                <Text style={[styles.dakChipText, on && styles.dakChipTextOn]}>₹{r}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={styles.dakInput}
          placeholder={isHindi ? 'अपनी राशि दर्ज करें (₹)' : 'Add your own amount (₹)'}
          placeholderTextColor={th.textDim}
          keyboardType="number-pad"
          value={customDakshina}
          onChangeText={(t) => {
            const digits = t.replace(/[^0-9]/g, '');
            setCustomDakshina(digits);
            setDakshinaPaise(digits ? parseInt(digits, 10) * 100 : 0);
          }}
        />
      </View>
    </>
  );
}

/* ── Step 2: Sankalp ─────────────────────────────────────────────────────── */
function StepSankalp({
  styles, th, isHindi, maxDevotees, perDevoteeGotra, names, setNames, gotras, openGotra, showGotraHelp, wish, setWish,
}: any) {
  const GotraLabel = ({ withHelp }: { withHelp: boolean }) => (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{isHindi ? 'गोत्र *' : 'Gotra *'}</Text>
      {withHelp ? (
        <Pressable onPress={showGotraHelp} hitSlop={10} style={styles.helpBtn}>
          <Icon name="info" size={15} color={th.gold} />
          <Text style={styles.helpText}>{isHindi ? 'नहीं पता?' : "Don't know?"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
  const GotraPicker = ({ idx }: { idx: number }) => (
    <Pressable style={styles.input} onPress={() => openGotra(idx)}>
      <Text style={gotras[idx] ? styles.pickerVal : styles.pickerPlaceholder}>
        {gotras[idx] || (isHindi ? 'गोत्र चुनें' : 'Select gotra')}
      </Text>
      <Icon name="chevronDown" size={16} color={th.textDim} style={styles.pickerChev} />
    </Pressable>
  );

  return (
    <>
      <Text style={styles.stepIntro}>
        {isHindi
          ? `पूजा इन नाम और गोत्र में संपन्न होगी। ${maxDevotees > 1 ? `अधिकतम ${maxDevotees} सदस्य।` : ''}`
          : `The puja will be performed in these names & gotra.${maxDevotees > 1 ? ` Up to ${maxDevotees} members.` : ''}`}
      </Text>

      {Array.from({ length: maxDevotees }).map((_, i) => (
        <View key={i} style={styles.devoteeBlock}>
          <View style={styles.field}>
            <Text style={styles.label}>
              {isHindi ? `भक्त का नाम ${maxDevotees > 1 ? i + 1 : ''}` : `Devotee Name ${maxDevotees > 1 ? i + 1 : ''}`}
              {i === 0 ? ' *' : ''}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={isHindi ? 'पूरा नाम' : 'Full name'}
              placeholderTextColor={th.textDim}
              value={names[i] ?? ''}
              onChangeText={(t) => setNames((prev: string[]) => { const n = [...prev]; n[i] = t; return n; })}
            />
          </View>
          {perDevoteeGotra && (
            <View style={styles.field}>
              <GotraLabel withHelp={i === 0} />
              <GotraPicker idx={i} />
            </View>
          )}
        </View>
      ))}

      {!perDevoteeGotra && (
        <View style={styles.field}>
          <GotraLabel withHelp />
          <GotraPicker idx={0} />
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>{isHindi ? 'पूजा की कामना (वैकल्पिक)' : 'Your puja wish (optional)'}</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder={isHindi ? 'आप क्या प्रार्थना करना चाहते हैं?' : 'What would you like to pray for?'}
          placeholderTextColor={th.textDim}
          value={wish}
          onChangeText={setWish}
          multiline
        />
      </View>
    </>
  );
}

/* ── Step 3: Contact + itemized bill + pay ───────────────────────────────── */
function StepPay({
  styles, th, tr, isHindi, phone, setPhone, tierLabel, tierPaise, addOnIds, dakshinaPaise, total, names, gotrasOut,
}: any) {
  const lineItems: { label: string; value: number }[] = [
    { label: tierLabel, value: tierPaise },
    ...addOnIds.map((id: string) => {
      const a = getAddOn(id);
      return { label: a ? tr(a.name) : id, value: a ? a.price_paise : 0 };
    }),
  ];
  if (dakshinaPaise > 0) lineItems.push({ label: isHindi ? 'पंडित जी दक्षिणा' : 'Panditji Dakshina', value: dakshinaPaise });

  return (
    <>
      {/* Contact */}
      <View style={styles.field}>
        <Text style={styles.label}>{isHindi ? 'व्हाट्सएप नंबर *' : 'WhatsApp number *'}</Text>
        <TextInput
          style={styles.input}
          placeholder="+91"
          placeholderTextColor={th.textDim}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Text style={styles.hint}>
          {isHindi ? 'पूजा वीडियो और लाइव अपडेट इसी नंबर पर भेजे जाएंगे।' : 'Your puja video & live updates are sent to this number.'}
        </Text>
      </View>

      {/* Sankalp recap */}
      <SacredDivider label={isHindi ? 'संकल्प विवरण' : 'Sankalp Details'} style={styles.payDivider} />
      <View style={styles.reviewCard}>
        {names.map((nm: string, i: number) => (
          <Text key={i} style={styles.reviewLine}>
            <Text style={styles.reviewKey}>{nm}</Text>
            {gotrasOut[i] ? `  ·  ${isHindi ? 'गोत्र' : 'Gotra'}: ${gotrasOut[i]}` : ''}
          </Text>
        ))}
      </View>

      {/* Itemized bill */}
      <SacredDivider label={isHindi ? 'भुगतान विवरण' : 'Payment Summary'} style={styles.payDivider} />
      <View style={styles.billCard}>
        <View style={styles.billHeader}>
          <Icon name="temple" size={16} color={th.gold} />
          <Text style={styles.billHeaderText}>{isHindi ? 'पूजा बिल' : 'Puja Bill'}</Text>
        </View>
        {lineItems.map((r, i) => (
          <View key={i} style={styles.billRow}>
            <Text style={styles.billLabel} numberOfLines={2}>{r.label}</Text>
            <Text style={styles.billVal}>{paiseTo(r.value)}</Text>
          </View>
        ))}
        <View style={styles.billDivider} />
        <View style={styles.billRow}>
          <Text style={styles.billTotalLabel}>{isHindi ? 'कुल देय' : 'Total Payable'}</Text>
          <Text style={styles.billTotalVal}>{paiseTo(total)}</Text>
        </View>
        <Text style={styles.billNote}>{isHindi ? 'सभी करों सहित • एकमुश्त भुगतान' : 'Inclusive of all charges • One-time payment'}</Text>
      </View>

      <View style={styles.assuranceRow}>
        <Icon name="check" size={14} color={Accents.emerald.color} />
        <Text style={styles.assuranceText}>
          {isHindi
            ? 'यदि पूजा न हो या वीडियो न मिले — 100% रिफंड, बिना किसी सवाल।'
            : 'If the puja is not performed or the video is not delivered — 100% refund, no questions asked.'}
        </Text>
      </View>
    </>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  scroll: { flex: 1 },
  missing: { fontFamily: Fonts.body, color: th.textMuted, textAlign: 'center', marginTop: Spacing.xxl },
  flex1: { flex: 1 },

  progress: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: th.border, backgroundColor: th.surface,
  },
  progressRow: { flexDirection: 'row', position: 'relative' },
  progressLine: { position: 'absolute', top: 14, height: 2, backgroundColor: th.border },
  progressLineFill: { position: 'absolute', top: 14, height: 2, backgroundColor: th.gold },
  progressItem: { flex: 1, alignItems: 'center' },
  progressDot: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: th.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: th.surface, marginBottom: 6,
  },
  progressDotOn: { backgroundColor: th.goldSurface, borderColor: th.goldSurface },
  progressNum: { fontFamily: Fonts.bodySemibold, fontSize: 13, color: th.textDim },
  progressNumOn: { color: th.goldContrast },
  progressLbl: { fontFamily: Fonts.body, fontSize: 11, color: th.textDim, textAlign: 'center' },
  progressLblOn: { fontFamily: Fonts.bodySemibold, color: th.gold },

  stepIntro: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 21, marginBottom: Spacing.md },
  sectionEyebrow: {
    fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold,
    letterSpacing: 2, marginBottom: Spacing.sm, marginTop: Spacing.sm,
  },

  // add-on cards
  addonCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: th.surface,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: th.border,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  addonCardOn: { borderColor: th.gold, backgroundColor: th.goldFaint, ...Depth.glow },
  addonImgTile: {
    width: 104, height: 132, borderRadius: Radius.md, backgroundColor: th.surfaceSunken,
    borderWidth: 1, borderColor: th.border, alignItems: 'center', justifyContent: 'center',
    padding: 6, overflow: 'hidden',
  },
  addonImg: { width: '100%', height: '100%' },
  addonTitleRow: { flexDirection: 'row', alignItems: 'center' },
  addonTitle: { flex: 1, fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.text },
  addonTagRow: { flexDirection: 'row', marginTop: 3 },
  addonTag: {
    fontFamily: Fonts.bodySemibold, fontSize: 10, color: Accents.saffron.color,
    backgroundColor: Accents.saffron.faint, borderRadius: Radius.sm, paddingVertical: 2, paddingHorizontal: 6,
    overflow: 'hidden', letterSpacing: 0.3,
  },
  addonDesc: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted, lineHeight: 17, marginTop: 5 },
  addonFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  addonPrice: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.goldLight },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: th.gold,
    borderRadius: Radius.pill, paddingVertical: 5, paddingHorizontal: Spacing.md,
  },
  addBtnOn: { backgroundColor: th.goldSurface, borderColor: th.goldSurface },
  addBtnText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold },
  addBtnTextOn: { color: th.goldContrast },

  // dakshina
  dakshinaCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    padding: Spacing.md, marginTop: Spacing.sm, ...Depth.card,
  },
  dakshinaTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.lg, color: th.text },
  dakshinaDesc: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 20, marginTop: 4, marginBottom: Spacing.md },
  dakshinaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  dakChip: {
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm,
    paddingVertical: 8, paddingHorizontal: Spacing.md, backgroundColor: th.surfaceSunken,
  },
  dakChipOn: { backgroundColor: th.goldSurface, borderColor: th.goldSurface },
  dakChipText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.text },
  dakChipTextOn: { color: th.goldContrast },
  dakInput: {
    marginTop: Spacing.md, borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm,
    padding: Spacing.md, color: th.text, backgroundColor: th.surfaceSunken,
    fontFamily: Fonts.body, fontSize: Fonts.size.md,
  },

  // form fields
  devoteeBlock: {},
  field: { marginBottom: Spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.textMuted, marginBottom: 6 },
  helpBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  helpText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold },

  // themed gotra-help modal
  helpBackdrop: {
    flex: 1, backgroundColor: th.scrimBackdrop, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.lg,
  },
  helpCard: {
    width: '100%', backgroundColor: th.scrimSheet, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: th.border, padding: Spacing.lg, ...Depth.raised,
  },
  helpIconWrap: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: th.goldFaint,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  helpTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, marginBottom: Spacing.sm },
  helpBody: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, lineHeight: 22, marginBottom: Spacing.lg },
  helpCta: {
    backgroundColor: th.goldSurface, borderRadius: Radius.pill, paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  helpCtaText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: th.goldContrast },
  input: {
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm, padding: Spacing.md,
    color: th.text, backgroundColor: th.surfaceSunken, fontFamily: Fonts.body, fontSize: Fonts.size.md,
    justifyContent: 'center', minHeight: 50, flexDirection: 'row', alignItems: 'center',
  },
  textarea: { minHeight: 88, textAlignVertical: 'top', alignItems: 'flex-start' },
  hint: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, marginTop: 5 },
  pickerVal: { flex: 1, fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.text },
  pickerPlaceholder: { flex: 1, fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textDim },
  pickerChev: { marginLeft: Spacing.sm },

  // review + bill
  reviewCard: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  reviewLine: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted, lineHeight: 26 },
  reviewKey: { fontFamily: Fonts.bodySemibold, color: th.text },
  payDivider: { marginTop: Spacing.lg, marginBottom: Spacing.md },
  billCard: {
    backgroundColor: th.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.md, marginBottom: Spacing.md, ...Depth.card,
  },
  billHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingBottom: Spacing.sm, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: th.divider,
  },
  billHeaderText: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.md, color: th.text, letterSpacing: 0.3 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  billLabel: { flex: 1, fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, paddingRight: Spacing.md },
  billVal: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.text },
  billDivider: { height: 1, backgroundColor: th.divider, marginVertical: Spacing.sm },
  billTotalLabel: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.lg, color: th.text },
  billTotalVal: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.goldLight },
  billNote: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, marginTop: 4 },

  assuranceRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Accents.emerald.faint, borderRadius: Radius.sm, padding: Spacing.md,
  },
  assuranceText: { flex: 1, fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textMuted, lineHeight: 17 },

  error: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.error, marginTop: Spacing.md, textAlign: 'center' },

  // footer
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
    backgroundColor: th.surface, borderTopWidth: 1, borderTopColor: th.border,
  },
  footerLabel: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim },
  footerTotal: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text },
  nextBtnWrap: { borderRadius: Radius.pill, overflow: 'hidden', ...Depth.glow },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, minWidth: 150, justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.7 },
  nextBtnText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, color: '#FFFFFF' },
});
