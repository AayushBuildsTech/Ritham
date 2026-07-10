import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, Animated, Easing, FlatList,
  Dimensions, ImageSourcePropType, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { Icon, IconName } from './Icon';

// Auto-playing feature carousel. Each slide keeps the original "Got a question?"
// promo look (violet→magenta gradient, badge + title + sub + white CTA pill, a
// blended photo on the right) but the deck cycles through every feature. Slides
// auto-advance, loop, pause while dragging, and neighbours peek + scale. The hero
// image gently floats for a living, premium feel. Pure RN Animated — no extra deps.

export interface CarouselSlide {
  key: string;
  icon: IconName;
  badge: string;
  title: string;
  sub: string;
  cta: string;
  image?: ImageSourcePropType; // depicting photo (transparent). Falls back to an icon hero.
  imageBottom?: boolean;       // anchor to the bottom (people) vs centered (objects)
  still?: boolean;             // disable the floating animation (e.g. the astrologer)
  onPress: () => void;
}

const SCREEN_W = Dimensions.get('window').width;
const SIDE = Spacing.lg;        // page inset
const PEEK = 22;                // how much of the next card shows
const GAP = 14;
const CARD_W = SCREEN_W - SIDE * 2 - PEEK;
const STRIDE = CARD_W + GAP;
const AUTO_MS = 4200;

export function FeatureCarousel({ slides }: { slides: CarouselSlide[] }) {
  const th = useColors();
  const styles = makeStyles(th);
  const listRef = useRef<FlatList<CarouselSlide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(0);
  const [, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  const start = () => {
    stop();
    timer.current = setInterval(() => {
      const next = (indexRef.current + 1) % slides.length;
      listRef.current?.scrollToOffset({ offset: next * STRIDE, animated: true });
      indexRef.current = next;
      setActive(next);
    }, AUTO_MS);
  };

  useEffect(() => { start(); return stop; }, [slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }, // scrollX also drives dot WIDTH (a layout prop) → JS driver
  );
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / STRIDE);
    indexRef.current = i;
    setActive(i);
    start(); // resume autoplay after a manual swipe
  };

  return (
    <View>
      <Animated.FlatList
        ref={listRef as any}
        data={slides}
        keyExtractor={(s) => s.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={STRIDE}
        snapToAlignment="start"
        disableIntervalMomentum
        contentContainerStyle={{ paddingLeft: SIDE, paddingRight: SIDE + PEEK }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={stop}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item, index }) => {
          const inputRange = [(index - 1) * STRIDE, index * STRIDE, (index + 1) * STRIDE];
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.93, 1, 0.93], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.65, 1, 0.65], extrapolate: 'clamp' });
          return (
            <Animated.View style={{ width: CARD_W, marginRight: GAP, transform: [{ scale }], opacity }}>
              <Slide slide={item} styles={styles} />
            </Animated.View>
          );
        }}
      />

      {/* pagination dots */}
      <View style={styles.dots}>
        {slides.map((s, i) => {
          const inputRange = [(i - 1) * STRIDE, i * STRIDE, (i + 1) * STRIDE];
          const w = scrollX.interpolate({ inputRange, outputRange: [6, 22, 6], extrapolate: 'clamp' });
          const o = scrollX.interpolate({ inputRange, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
          return <Animated.View key={s.key} style={[styles.dot, { width: w, opacity: o }]} />;
        })}
      </View>
    </View>
  );
}

function Slide({ slide, styles }: { slide: CarouselSlide; styles: ReturnType<typeof makeStyles> }) {
  // gentle floating bob on the hero art (skipped when the slide is marked `still`)
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (slide.still) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: -7, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [slide.still]); // eslint-disable-line react-hooks/exhaustive-deps
  const floatY = slide.still ? [] : [{ translateY: float }];

  return (
    <Pressable onPress={slide.onPress} android_ripple={{ color: 'rgba(255,255,255,0.12)' }} style={styles.wrap}>
      <LinearGradient
        colors={['#FF3D9A', '#7B2CBF']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {slide.image ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.imgBox,
                slide.imageBottom ? styles.imgBoxBottom : styles.imgBoxCenter,
                { transform: floatY },
              ]}
            >
              <Image source={slide.image} style={slide.imageBottom ? styles.imgTall : styles.img} />
            </Animated.View>
            <LinearGradient
              colors={['#C51E86', 'rgba(150,40,180,0.35)', 'transparent']}
              locations={[0, 0.52, 1]}
              start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0 }}
              style={styles.fade}
              pointerEvents="none"
            />
          </>
        ) : (
          <Animated.View style={[styles.iconHero, { transform: floatY }]} pointerEvents="none">
            <View style={styles.iconOrb}>
              <Icon name={slide.icon} size={58} color="#FFFFFF" />
            </View>
          </Animated.View>
        )}

        <View style={styles.textCol}>
          <View style={styles.badge}><Text style={styles.badgeText}>{slide.badge}</Text></View>
          <Text style={styles.h} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{slide.title}</Text>
          <Text style={styles.sub} numberOfLines={2}>{slide.sub}</Text>
          <View style={styles.btn}>
            <Text style={styles.btnText}>{slide.cta}</Text>
            <Icon name="arrowRight" size={15} color="#7B2CBF" />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  wrap: { borderRadius: Radius.xl, overflow: 'hidden', ...Depth.card },
  card: { flexDirection: 'row', alignItems: 'center', minHeight: 184, paddingLeft: Spacing.lg, position: 'relative' },

  textCol: { flex: 1, paddingVertical: Spacing.md, paddingRight: 118, zIndex: 2 },
  badge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: Radius.pill, paddingVertical: 3, paddingHorizontal: 10, marginBottom: 8,
  },
  badgeText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: '#FFFFFF', letterSpacing: 1.2 },
  h: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: '#FFFFFF' },
  sub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF', borderRadius: Radius.pill, paddingVertical: 9, paddingHorizontal: 16, marginTop: Spacing.md,
  },
  btnText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.sm, color: '#7B2CBF' },

  // blended hero art (right) — handles any aspect via contain
  imgBox: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 172, alignItems: 'center' },
  imgBoxCenter: { justifyContent: 'center' },
  imgBoxBottom: { justifyContent: 'flex-end' },
  img: { width: '100%', height: '86%', resizeMode: 'contain' },
  imgTall: { width: '100%', height: '100%', resizeMode: 'contain' },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },

  // icon fallback when a slide has no photo
  iconHero: { position: 'absolute', right: 12, top: 0, bottom: 0, width: 150, alignItems: 'center', justifyContent: 'center' },
  iconOrb: {
    width: 116, height: 116, borderRadius: 58,
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },

  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: Spacing.md },
  dot: { height: 6, borderRadius: 3, backgroundColor: th.gold },
});
