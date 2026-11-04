import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The clinic is in Mangalore, so the tests run in Mangalore's timezone.
    //
    // This container is UTC, where local time and UTC are the same thing -
    // which means a date helper that wrongly used UTC passed every test here
    // and would have been wrong in the clinic every evening after 18:30 IST.
    // Found by mutation-testing localDateKey: the UTC version survived.
    //
    // The whole suite passes under this, so it costs nothing and every date
    // assertion in the app is now checked where the app is used.
    env: { TZ: "Asia/Kolkata" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
