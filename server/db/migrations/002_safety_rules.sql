-- Migration: 002_safety_rules.sql
-- Description: Add configurable safety rules tables
-- Date: 2024

-- ============================================
-- Table: safety_rules
-- Stores custom safety rules (blocked keywords, regex patterns, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS safety_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type VARCHAR(50) NOT NULL,
  category VARCHAR(50),
  value TEXT NOT NULL,
  action VARCHAR(50) NOT NULL DEFAULT 'block',
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  description TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rule types:
-- 'blocked_keyword' - Words/phrases to block
-- 'escalation_keyword' - Words that trigger escalation
-- 'regex_pattern' - Custom regex for input sanitization
-- 'allowed_topic' - Topics the chatbot can discuss

-- Actions:
-- 'block' - Block the message entirely
-- 'escalate' - Escalate to human
-- 'flag' - Flag for review but allow
-- 'warn' - Show warning but allow

-- ============================================
-- Table: moderation_settings
-- Configurable thresholds for OpenAI moderation categories
-- ============================================
CREATE TABLE IF NOT EXISTS moderation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  threshold DECIMAL(4,3) DEFAULT 0.700,
  action VARCHAR(50) DEFAULT 'block',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories match OpenAI Moderation API:
-- 'hate', 'hate/threatening', 'harassment', 'harassment/threatening',
-- 'self-harm', 'self-harm/intent', 'self-harm/instructions',
-- 'sexual', 'sexual/minors', 'violence', 'violence/graphic'

-- ============================================
-- Table: escalation_settings
-- Configurable escalation categories with keywords
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  keywords TEXT[] DEFAULT '{}',
  response_template TEXT,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories: 'crisis', 'legal', 'complaint', 'sentiment', 'custom'

-- ============================================
-- Table: system_settings
-- Global system configuration
-- ============================================
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_safety_rules_type ON safety_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_safety_rules_enabled ON safety_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_safety_rules_category ON safety_rules(category);
CREATE INDEX IF NOT EXISTS idx_safety_rules_type_enabled ON safety_rules(rule_type, enabled);
CREATE INDEX IF NOT EXISTS idx_moderation_settings_enabled ON moderation_settings(enabled);
CREATE INDEX IF NOT EXISTS idx_escalation_settings_enabled ON escalation_settings(enabled);

-- ============================================
-- Trigger for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
DROP TRIGGER IF EXISTS update_safety_rules_updated_at ON safety_rules;
CREATE TRIGGER update_safety_rules_updated_at
  BEFORE UPDATE ON safety_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_moderation_settings_updated_at ON moderation_settings;
CREATE TRIGGER update_moderation_settings_updated_at
  BEFORE UPDATE ON moderation_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_escalation_settings_updated_at ON escalation_settings;
CREATE TRIGGER update_escalation_settings_updated_at
  BEFORE UPDATE ON escalation_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
