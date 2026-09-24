for (const key of ["EXPO_PUBLIC_DATABASE_URL", "EXPO_PUBLIC_OPENAI_API_KEY", "EXPO_PUBLIC_SENDGRID_API_KEY", "EXPO_PUBLIC_JWT_ACCESS_SECRET"]) {
  if (process.env[key]) throw new Error(`${key} must never be bundled into MARKOS mobile.`);
}
