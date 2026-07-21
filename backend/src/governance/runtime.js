function validateRuntime(env = process.env) {
  const secret = String(env.JWT_SECRET || '');
  if (secret.length < 32 || /replace|change|example|secret-key-2024|jwt-secret-2024/i.test(secret)) {
    throw new Error('JWT_SECRET must be a non-placeholder value of at least 32 characters.');
  }
  const mode = String(env.NODE_ENV || 'development');
  if (!['development', 'test', 'production'].includes(mode)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }
  if (mode === 'production') {
    const dbConfigured = env.DATABASE_URL ||
      (env.DB_HOST && env.DB_NAME && env.DB_USER && env.DB_PASSWORD) ||
      (env.POSTGRES_HOST && env.POSTGRES_DB && env.POSTGRES_USER && env.POSTGRES_PASSWORD);
    if (!dbConfigured) {
      throw new Error('Production database configuration is incomplete.');
    }
    const origins = String(env.CORS_ORIGINS || env.ALLOWED_ORIGINS || env.CLIENT_URL || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!origins.length || origins.includes('*')) {
      throw new Error('Production CORS origins must be an explicit allowlist.');
    }
    if (env.ALLOW_MOCK_PROVIDERS === 'true' ||
        env.ALLOW_DEMO_SEED === 'true' ||
        env.ENABLE_DEMO_TELEMETRY === 'true' ||
        env.ENABLE_LEGACY_SCHEMA_BOOTSTRAP === 'true' ||
        env.ENABLE_LEGACY_PROVIDER_ROUTES === 'true') {
      throw new Error('Demo providers and startup schema mutation are prohibited in production.');
    }
  }
  return true;
}

module.exports = { validateRuntime };
