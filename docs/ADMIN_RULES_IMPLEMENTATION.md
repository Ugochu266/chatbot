# Admin Configurable Safety Rules - Implementation Plan

## Overview

This document outlines the implementation plan for adding configurable safety rules to the SafeChat admin dashboard. This feature allows administrators to customize safety behavior without code changes, aligning with the paper's recommendations in Section 6.4.3 (Recommendations for Safety Implementation).

## Current State

### Hardcoded Safety Rules
| Component | Location | Current Behavior |
|-----------|----------|------------------|
| Input Sanitization | `server/services/sanitization.js` | 27 fixed regex patterns |
| Escalation Detection | `server/services/escalation.js` | Fixed keyword lists (crisis, legal, complaint, sentiment) |
| Content Moderation | `server/services/moderation.js` | Fixed category blocking with OpenAI API |
| RAG | `server/services/rag.js` | Keyword-based document retrieval |

### Goal
Make all safety rules configurable via the admin dashboard while maintaining performance and reliability.

---

## Implementation Phases

### Phase 1: Database Schema
**Estimated Effort: 2-3 hours**

#### 1.1 Create Migration for Rules Tables

```sql
-- Table: safety_rules
CREATE TABLE safety_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type VARCHAR(50) NOT NULL,  -- 'blocked_keyword', 'escalation_keyword', 'regex_pattern', 'moderation_threshold'
  category VARCHAR(50),             -- e.g., 'crisis', 'legal', 'hate', 'violence'
  value TEXT NOT NULL,              -- The keyword, pattern, or threshold value
  action VARCHAR(50) NOT NULL,      -- 'block', 'escalate', 'flag', 'warn'
  priority INTEGER DEFAULT 0,       -- Higher priority rules evaluated first
  enabled BOOLEAN DEFAULT true,
  description TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table: moderation_settings
CREATE TABLE moderation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) UNIQUE NOT NULL,  -- 'hate', 'violence', 'self-harm', etc.
  enabled BOOLEAN DEFAULT true,
  threshold DECIMAL(3,2) DEFAULT 0.70,   -- Score threshold (0.00 - 1.00)
  action VARCHAR(50) DEFAULT 'block',    -- 'block', 'flag', 'warn'
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table: escalation_settings
CREATE TABLE escalation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) UNIQUE NOT NULL,  -- 'crisis', 'legal', 'complaint', 'sentiment'
  enabled BOOLEAN DEFAULT true,
  keywords TEXT[],                        -- Array of trigger keywords
  response_template TEXT,                 -- Custom response for this escalation type
  notify_email VARCHAR(255),              -- Optional email notification
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table: system_settings
CREATE TABLE system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_safety_rules_type ON safety_rules(rule_type);
CREATE INDEX idx_safety_rules_enabled ON safety_rules(enabled);
CREATE INDEX idx_safety_rules_category ON safety_rules(category);
```

#### 1.2 Seed Default Rules
- [ ] Export current hardcoded patterns to seed data
- [ ] Create seed script for initial rules population
- [ ] Document default rule set

#### Tasks:
- [ ] Create migration file `server/db/migrations/002_safety_rules.sql`
- [ ] Create seed script `server/db/seeds/safety_rules_seed.js`
- [ ] Add database functions in `server/db/safetyRules.js`
- [ ] Test migration on development database

---

### Phase 2: Backend API Routes
**Estimated Effort: 3-4 hours**

#### 2.1 Safety Rules CRUD API

```
GET    /api/admin/rules                    - List all rules (with filters)
GET    /api/admin/rules/:id                - Get single rule
POST   /api/admin/rules                    - Create rule
PUT    /api/admin/rules/:id                - Update rule
DELETE /api/admin/rules/:id                - Delete rule
POST   /api/admin/rules/bulk               - Bulk import rules
GET    /api/admin/rules/export             - Export rules as JSON
```

#### 2.2 Moderation Settings API

```
GET    /api/admin/settings/moderation      - Get all moderation category settings
PUT    /api/admin/settings/moderation/:category - Update category settings
POST   /api/admin/settings/moderation/test - Test moderation with sample text
```

#### 2.3 Escalation Settings API

```
GET    /api/admin/settings/escalation      - Get all escalation settings
PUT    /api/admin/settings/escalation/:category - Update category settings
POST   /api/admin/settings/escalation/test - Test escalation detection
```

#### 2.4 System Settings API

```
GET    /api/admin/settings/system          - Get system settings
PUT    /api/admin/settings/system/:key     - Update system setting
```

#### Tasks:
- [ ] Create `server/routes/rules.js` for safety rules CRUD
- [ ] Create `server/routes/settings.js` for settings management
- [ ] Add validation middleware for rule creation
- [ ] Add bulk import/export functionality
- [ ] Add test endpoints for rule validation
- [ ] Register routes in `server/index.js`

---

### Phase 3: Backend Rule Engine Integration
**Estimated Effort: 4-5 hours**

#### 3.1 Rule Loading Service

Create `server/services/ruleEngine.js`:
- [ ] Load rules from database on startup
- [ ] Implement rule caching with TTL (e.g., 5 minutes)
- [ ] Add cache invalidation on rule updates
- [ ] Implement rule matching functions

```javascript
// Pseudo-code structure
class RuleEngine {
  constructor() {
    this.rulesCache = null;
    this.cacheExpiry = null;
  }
  
  async loadRules() { /* Load from DB, cache results */ }
  async getBlockedKeywords() { /* Return cached blocked keywords */ }
  async getEscalationKeywords(category) { /* Return by category */ }
  async getRegexPatterns() { /* Return compiled regex patterns */ }
  async getModerationThresholds() { /* Return threshold settings */ }
  invalidateCache() { /* Clear cache on rule update */ }
}
```

#### 3.2 Update Sanitization Service

Modify `server/services/sanitization.js`:
- [ ] Replace hardcoded patterns with rule engine lookup
- [ ] Add custom blocked keywords check
- [ ] Maintain fallback to defaults if DB unavailable
- [ ] Add logging for rule matches

#### 3.3 Update Escalation Service

Modify `server/services/escalation.js`:
- [ ] Replace hardcoded keywords with rule engine lookup
- [ ] Add custom escalation categories support
- [ ] Implement configurable response templates
- [ ] Add email notification support (optional)

#### 3.4 Update Moderation Service

Modify `server/services/moderation.js`:
- [ ] Replace fixed thresholds with configurable values
- [ ] Add category enable/disable support
- [ ] Implement configurable actions (block vs flag vs warn)
- [ ] Add logging for threshold decisions

#### 3.5 Graceful Degradation
- [ ] Implement fallback to hardcoded defaults if DB fails
- [ ] Add health check for rule engine
- [ ] Log warnings when using fallback rules

#### Tasks:
- [ ] Create `server/services/ruleEngine.js`
- [ ] Update `server/services/sanitization.js`
- [ ] Update `server/services/escalation.js`
- [ ] Update `server/services/moderation.js`
- [ ] Add unit tests for rule engine
- [ ] Test fallback behavior

---

### Phase 4: Admin Dashboard UI
**Estimated Effort: 5-6 hours**

#### 4.1 Rules Management Page

Create `client/src/admin/pages/RulesPage.jsx`:

**Features:**
- [ ] Table view of all rules with filtering and sorting
- [ ] Filter by rule type, category, enabled status
- [ ] Search rules by keyword/pattern
- [ ] Add/Edit rule dialog
- [ ] Delete confirmation
- [ ] Bulk enable/disable
- [ ] Import/Export functionality

**UI Components Needed:**
- [ ] RulesTable - Main table with pagination
- [ ] RuleDialog - Add/Edit form
- [ ] RuleFilters - Filter controls
- [ ] ImportExportButtons - Bulk operations

#### 4.2 Moderation Settings Page

Create `client/src/admin/pages/ModerationSettingsPage.jsx`:

**Features:**
- [ ] Card for each moderation category
- [ ] Toggle enable/disable per category
- [ ] Threshold slider (0.0 - 1.0)
- [ ] Action dropdown (block/flag/warn)
- [ ] Test panel - input text and see moderation result
- [ ] Save changes button

#### 4.3 Escalation Settings Page

Create `client/src/admin/pages/EscalationSettingsPage.jsx`:

**Features:**
- [ ] Tabs for each escalation category
- [ ] Keyword tag input (add/remove keywords)
- [ ] Custom response template editor
- [ ] Email notification toggle and input
- [ ] Test panel - input text and see escalation result
- [ ] Save changes button

#### 4.4 System Settings Page

Create `client/src/admin/pages/SystemSettingsPage.jsx`:

**Features:**
- [ ] Rate limiting settings
- [ ] Session timeout settings
- [ ] Default response settings
- [ ] Feature toggles (enable/disable safety layers)

#### 4.5 Update Navigation

- [ ] Add "Rules" to admin sidebar
- [ ] Add "Settings" submenu (Moderation, Escalation, System)
- [ ] Update routing in App.js

#### Tasks:
- [ ] Create `client/src/admin/pages/RulesPage.jsx`
- [ ] Create `client/src/admin/pages/ModerationSettingsPage.jsx`
- [ ] Create `client/src/admin/pages/EscalationSettingsPage.jsx`
- [ ] Create `client/src/admin/pages/SystemSettingsPage.jsx`
- [ ] Create `client/src/services/rulesService.js`
- [ ] Create `client/src/services/settingsService.js`
- [ ] Update `client/src/admin/components/AdminLayout.jsx`
- [ ] Update `client/src/App.js` with new routes
- [ ] Add Shadcn Slider component for thresholds
- [ ] Add Shadcn Switch component for toggles

---

### Phase 5: Testing & Validation
**Estimated Effort: 2-3 hours**

#### 5.1 Backend Testing
- [ ] Unit tests for rule engine
- [ ] Unit tests for updated safety services
- [ ] API integration tests for rules CRUD
- [ ] API integration tests for settings endpoints
- [ ] Test cache invalidation
- [ ] Test fallback behavior

#### 5.2 Frontend Testing
- [ ] Component tests for rules management
- [ ] Component tests for settings pages
- [ ] E2E test for adding a rule and seeing it applied
- [ ] E2E test for changing moderation threshold

#### 5.3 Integration Testing
- [ ] Test complete flow: add rule → rule applies to chat
- [ ] Test rule priority ordering
- [ ] Test bulk import/export
- [ ] Test with safety scenarios from paper

#### Tasks:
- [ ] Create test files in `server/__tests__/`
- [ ] Create test files in `client/src/__tests__/`
- [ ] Document test scenarios
- [ ] Run full test suite

---

### Phase 6: Documentation & Deployment
**Estimated Effort: 1-2 hours**

#### 6.1 Documentation
- [ ] Update README with new features
- [ ] Document API endpoints in API.md
- [ ] Create admin user guide for rules management
- [ ] Document default rules and their purposes

#### 6.2 Deployment
- [ ] Run database migration on production
- [ ] Run seed script for default rules
- [ ] Deploy backend changes
- [ ] Deploy frontend changes
- [ ] Verify all features work in production

#### Tasks:
- [ ] Create `docs/ADMIN_GUIDE.md`
- [ ] Update `docs/API.md`
- [ ] Create deployment checklist
- [ ] Update `schema.sql` with new tables

---

## Detailed Task Checklist

### Database (Phase 1)
- [ ] Create `server/db/migrations/002_safety_rules.sql`
- [ ] Create `server/db/safetyRules.js` with CRUD functions
- [ ] Create `server/db/settings.js` for settings management
- [ ] Create `server/db/seeds/safety_rules_seed.js`
- [ ] Update `schema.sql` with new tables
- [ ] Test migration locally

### Backend API (Phase 2)
- [ ] Create `server/routes/rules.js`
- [ ] Create `server/routes/settings.js`
- [ ] Add validation in `server/middleware/validator.js`
- [ ] Register routes in `server/index.js`
- [ ] Test all endpoints with Postman/curl

### Rule Engine (Phase 3)
- [ ] Create `server/services/ruleEngine.js`
- [ ] Update `server/services/sanitization.js` to use rule engine
- [ ] Update `server/services/escalation.js` to use rule engine
- [ ] Update `server/services/moderation.js` to use rule engine
- [ ] Add fallback defaults in each service
- [ ] Test with chat interactions

### Admin UI (Phase 4)
- [ ] Create `client/src/services/rulesService.js`
- [ ] Create `client/src/services/settingsService.js`
- [ ] Create `client/src/components/ui/slider.jsx` (Shadcn)
- [ ] Create `client/src/components/ui/switch.jsx` (Shadcn)
- [ ] Create `client/src/admin/pages/RulesPage.jsx`
- [ ] Create `client/src/admin/pages/ModerationSettingsPage.jsx`
- [ ] Create `client/src/admin/pages/EscalationSettingsPage.jsx`
- [ ] Create `client/src/admin/pages/SystemSettingsPage.jsx`
- [ ] Update `client/src/admin/components/AdminLayout.jsx`
- [ ] Update `client/src/admin/pages/index.js`
- [ ] Update `client/src/App.js` with new routes
- [ ] Test all UI flows

### Testing (Phase 5)
- [ ] Write backend unit tests
- [ ] Write API integration tests
- [ ] Write frontend component tests
- [ ] Manual testing with safety scenarios
- [ ] Performance testing with rule caching

### Documentation (Phase 6)
- [ ] Create `docs/ADMIN_GUIDE.md`
- [ ] Update project README
- [ ] Document API changes
- [ ] Create deployment checklist

---

## File Structure After Implementation

```
server/
├── db/
│   ├── migrations/
│   │   └── 002_safety_rules.sql      # NEW
│   ├── seeds/
│   │   └── safety_rules_seed.js      # NEW
│   ├── safetyRules.js                # NEW
│   └── settings.js                   # NEW
├── routes/
│   ├── rules.js                      # NEW
│   └── settings.js                   # NEW
├── services/
│   ├── ruleEngine.js                 # NEW
│   ├── sanitization.js               # MODIFIED
│   ├── escalation.js                 # MODIFIED
│   └── moderation.js                 # MODIFIED
└── index.js                          # MODIFIED

client/src/
├── services/
│   ├── rulesService.js               # NEW
│   └── settingsService.js            # NEW
├── components/ui/
│   ├── slider.jsx                    # NEW
│   └── switch.jsx                    # NEW
├── admin/
│   ├── pages/
│   │   ├── RulesPage.jsx             # NEW
│   │   ├── ModerationSettingsPage.jsx # NEW
│   │   ├── EscalationSettingsPage.jsx # NEW
│   │   ├── SystemSettingsPage.jsx    # NEW
│   │   └── index.js                  # MODIFIED
│   └── components/
│       └── AdminLayout.jsx           # MODIFIED
└── App.js                            # MODIFIED

docs/
├── ADMIN_GUIDE.md                    # NEW
└── ADMIN_RULES_IMPLEMENTATION.md     # THIS FILE
```

---

## Estimated Total Effort

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1 | 2-3 hours | Database schema and migrations |
| Phase 2 | 3-4 hours | Backend API routes |
| Phase 3 | 4-5 hours | Rule engine integration |
| Phase 4 | 5-6 hours | Admin dashboard UI |
| Phase 5 | 2-3 hours | Testing and validation |
| Phase 6 | 1-2 hours | Documentation and deployment |
| **Total** | **17-23 hours** | Full implementation |

---

## Priority Order

If time is limited, implement in this order:

1. **High Priority (MVP)**
   - Database schema for rules
   - Basic rules CRUD API
   - Rule engine with caching
   - Rules management page (UI)

2. **Medium Priority**
   - Moderation settings (thresholds)
   - Escalation keyword management
   - Test panels in UI

3. **Lower Priority**
   - Bulk import/export
   - Email notifications
   - System settings page
   - Advanced filtering/sorting

---

## Success Criteria

- [ ] Admin can add/edit/delete safety rules without code changes
- [ ] Admin can adjust moderation thresholds per category
- [ ] Admin can customize escalation keywords
- [ ] Rules apply to chat interactions within 5 minutes of creation
- [ ] System gracefully falls back to defaults if rule engine fails
- [ ] All existing safety functionality continues to work
- [ ] Build passes with no errors
- [ ] Paper's safety scenarios still pass with configurable rules

---

## Notes

- Keep backward compatibility with existing hardcoded rules as fallback
- Use database transactions for bulk operations
- Consider rate limiting rule changes to prevent abuse
- Log all rule changes for audit trail
- Cache rules aggressively to minimize database load
- Test thoroughly with the safety scenarios from the paper (Section 5.5)
