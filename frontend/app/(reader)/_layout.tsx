// Reader (client) stack. Guards the whole group by role.
import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/src/auth";

export default function ReaderLayout() {
  const { ready, user } = useAuth();
  if (!ready) return null;
  if (!user) return <Redirect href="/" />;
  if (user.disabled) return <Redirect href="/suspended" />;
  if (user.role !== "client") {
    const dest = user.role === "reporter" ? "/(reporter)/studio" : "/(admin)/dashboard";
    return <Redirect href={dest} />;
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
