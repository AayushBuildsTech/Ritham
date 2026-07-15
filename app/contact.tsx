import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Fonts, Spacing, Radius, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { CONTACT_EMAIL } from '../constants/legal';

export default function Contact() {
  const th = useColors();
  const styles = makeStyles(th);
  const { isHindi } = useLanguage();
  const router = useRouter();

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const canSend = message.trim().length > 0;

  const send = async () => {
    if (!canSend) return;
    const subj = subject.trim() || (isHindi ? 'रिदम — सहायता' : 'Ritham — Support');
    const body = message.trim() + (name.trim() ? `\n\n— ${name.trim()}` : '');
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        isHindi ? 'ईमेल ऐप नहीं मिला' : 'No email app found',
        (isHindi ? 'कृपया हमें यहाँ ईमेल करें: ' : 'Please email us at ') + CONTACT_EMAIL,
      );
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={isHindi ? 'संपर्क करें' : 'Contact us'} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            {isHindi
              ? 'कोई प्रश्न, समस्या या सुझाव? नीचे संदेश लिखें — हम जल्द ही उत्तर देंगे।'
              : 'A question, an issue, or feedback? Write to us below and we’ll get back to you.'}
          </Text>

          <Text style={styles.label}>{isHindi ? 'आपका नाम' : 'Your name'} <Text style={styles.optional}>{isHindi ? '(वैकल्पिक)' : '(optional)'}</Text></Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={isHindi ? 'नाम' : 'Name'}
            placeholderTextColor={th.textDim}
            returnKeyType="next"
          />

          <Text style={styles.label}>{isHindi ? 'विषय' : 'Subject'} <Text style={styles.optional}>{isHindi ? '(वैकल्पिक)' : '(optional)'}</Text></Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder={isHindi ? 'यह किस बारे में है?' : 'What’s it about?'}
            placeholderTextColor={th.textDim}
            returnKeyType="next"
          />

          <Text style={styles.label}>{isHindi ? 'संदेश' : 'Message'}</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={message}
            onChangeText={setMessage}
            placeholder={isHindi ? 'हमें बताएं…' : 'Tell us more…'}
            placeholderTextColor={th.textDim}
            multiline
            textAlignVertical="top"
          />

          <Pressable
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!canSend}
            android_ripple={{ color: th.goldDeep }}
          >
            <Text style={styles.sendText}>{isHindi ? 'संदेश भेजें' : 'Send message'}</Text>
            <Icon name="send" size={16} color={th.goldContrast} />
          </Pressable>

          <View style={styles.noteRow}>
            <Icon name="info" size={13} color={th.textDim} />
            <Text style={styles.note}>
              {isHindi
                ? 'भेजने पर आपका ईमेल ऐप खुलेगा ताकि आप संदेश की पुष्टि करके भेज सकें।'
                : 'Sending opens your email app so you can review and send the message.'}
            </Text>
          </View>

          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  intro: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted, lineHeight: 22, marginBottom: Spacing.lg },
  label: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.text, marginBottom: Spacing.xs, marginTop: Spacing.md },
  optional: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim },
  input: {
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm, padding: Spacing.md,
    fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.text, backgroundColor: th.surfaceSunken,
  },
  textarea: { height: 150 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: th.goldSurface, borderRadius: Radius.sm, paddingVertical: 15, marginTop: Spacing.xl,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.3 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: Spacing.md, justifyContent: 'center' },
  note: { flex: 1, fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, lineHeight: 17 },
});
