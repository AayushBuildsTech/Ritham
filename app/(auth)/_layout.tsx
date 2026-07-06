import { Stack } from 'expo-router';
import { useColors } from '../../context/ThemeContext';

export default function AuthLayout() {
  const th = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: th.bg },
        animation: 'slide_from_right',
      }}
    />
  );
}
