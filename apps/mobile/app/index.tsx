import { Redirect } from "expo-router";
import { useSession } from "../src/providers";
export default function Index() {
  const { status } = useSession();
  return <Redirect href={status === "signedIn" ? "/(tabs)" : "/login"} />;
}
